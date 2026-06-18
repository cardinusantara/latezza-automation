const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'fardhan123',
  database: process.env.DB_NAME || 'latezzacake',
};

// Create a new pool
const pool = new Pool(dbConfig);

// Settings Cache
const settingsCache = new Map();

/**
 * Initialize Database Tables
 */
async function initDb() {
  const client = await pool.connect();
  try {
    // 1. Customers Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        phone_number VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        status VARCHAR(20) DEFAULT 'lead',
        notes TEXT,
        needs_follow_up BOOLEAN DEFAULT FALSE,
        follow_up_reason VARCHAR(255),
        last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        contact_phone VARCHAR(20),
        ai_enabled BOOLEAN DEFAULT TRUE,
        needs_admin BOOLEAN DEFAULT FALSE
      );
    `);

    // Perform database migrations (add columns if they don't exist)
    await client.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20);
    `);
    await client.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT TRUE;
    `);
    await client.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS needs_admin BOOLEAN DEFAULT FALSE;
    `);
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS embedding JSONB;
    `);

    // 2. Chat Histories Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_histories (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(50) REFERENCES customers(phone_number) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL, -- 'user' or 'model'
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Products Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        product_name VARCHAR(255) UNIQUE NOT NULL,
        price NUMERIC DEFAULT 0,
        description TEXT DEFAULT '',
        image_url TEXT DEFAULT '',
        shopee_link TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Settings Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for optimization
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_histories_phone ON chat_histories(phone_number);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);`);

    console.log('✅ PostgreSQL database tables initialized successfully.');
    
    // Load settings from database
    await loadAllSettings();

    // Backfill missing embeddings
    await backfillProductEmbeddings();
  } catch (err) {
    console.error('❌ Failed to initialize database tables:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Load all settings into memory cache
 */
async function loadAllSettings() {
  try {
    const res = await pool.query('SELECT key, value FROM settings');
    settingsCache.clear();
    res.rows.forEach(row => {
      settingsCache.set(row.key, row.value);
    });
    console.log(`✅ Loaded ${res.rows.length} settings into memory cache.`);
  } catch (err) {
    console.error('❌ Failed to load settings from DB:', err.message);
  }
}

/**
 * Retrieve setting value
 */
async function getSetting(key, defaultValue = null) {
  if (settingsCache.has(key)) {
    return settingsCache.get(key);
  }
  try {
    const res = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (res.rows.length > 0) {
      settingsCache.set(key, res.rows[0].value);
      return res.rows[0].value;
    }
  } catch (err) {
    console.error(`Error querying setting "${key}":`, err.message);
  }
  return defaultValue;
}

/**
 * Save or update setting value
 */
async function setSetting(key, value) {
  const cleanValue = value === null || value === undefined ? null : String(value);
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) 
     VALUES ($1, $2, NOW()) 
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, cleanValue]
  );
  if (cleanValue === null) {
    settingsCache.delete(key);
  } else {
    settingsCache.set(key, cleanValue);
  }
}

/**
 * Get customer details
 */
async function getCustomer(phoneNumber) {
  const res = await pool.query(
    'SELECT * FROM customers WHERE phone_number = $1',
    [phoneNumber]
  );
  return res.rows[0] || null;
}

/**
 * Create or update customer record
 */
async function createOrUpdateCustomer(phoneNumber, name, updates = {}) {
  const existing = await getCustomer(phoneNumber);
  
  if (!existing) {
    const res = await pool.query(
      `INSERT INTO customers (phone_number, name, status, notes, needs_follow_up, follow_up_reason, contact_phone, ai_enabled, needs_admin, last_interaction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        phoneNumber,
        name || 'Customer',
        updates.status || 'lead',
        updates.notes || '',
        updates.needs_follow_up || false,
        updates.follow_up_reason || null,
        updates.contact_phone || null,
        updates.ai_enabled !== undefined ? updates.ai_enabled : true,
        updates.needs_admin !== undefined ? updates.needs_admin : false
      ]
    );
    return res.rows[0];
  } else {
    // Update existing customer fields that are passed
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined && name !== null) {
      fields.push(`name = $${idx++}`);
      values.push(name);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(updates.notes);
    }
    if (updates.needs_follow_up !== undefined) {
      fields.push(`needs_follow_up = $${idx++}`);
      values.push(updates.needs_follow_up);
    }
    if (updates.follow_up_reason !== undefined) {
      fields.push(`follow_up_reason = $${idx++}`);
      values.push(updates.follow_up_reason);
    }
    if (updates.contact_phone !== undefined) {
      fields.push(`contact_phone = $${idx++}`);
      values.push(updates.contact_phone);
    }
    if (updates.ai_enabled !== undefined) {
      fields.push(`ai_enabled = $${idx++}`);
      values.push(updates.ai_enabled);
    }
    if (updates.needs_admin !== undefined) {
      fields.push(`needs_admin = $${idx++}`);
      values.push(updates.needs_admin);
    }

    // Always update last interaction
    fields.push(`last_interaction = NOW()`);

    values.push(phoneNumber);
    const query = `UPDATE customers SET ${fields.join(', ')} WHERE phone_number = $${idx} RETURNING *`;
    const res = await pool.query(query, values);
    return res.rows[0];
  }
}

/**
 * Save chat message to database
 */
async function saveChatMessage(phoneNumber, role, content) {
  await pool.query(
    'INSERT INTO chat_histories (phone_number, role, content, timestamp) VALUES ($1, $2, $3, NOW())',
    [phoneNumber, role, content]
  );
}

/**
 * Retrieve chat history for a customer
 */
async function getChatHistory(phoneNumber, limit = 10) {
  const res = await pool.query(
    'SELECT role, content FROM chat_histories WHERE phone_number = $1 ORDER BY timestamp DESC LIMIT $2',
    [phoneNumber, limit]
  );
  // Return in chronological order
  return res.rows.reverse();
}

/**
 * Search products by keyword (fallback)
 */
async function searchProductsFallback(queryStr) {
  const formattedQuery = `%${queryStr}%`;
  const res = await pool.query(
    `SELECT product_name, price, description, image_url, shopee_link 
     FROM products 
     WHERE product_name ILIKE $1 OR description ILIKE $1 
     LIMIT 5`,
    [formattedQuery]
  );
  return res.rows;
}

/**
 * Search products by semantic similarity, falling back to ILIKE if key/model fails
 */
async function searchProducts(queryStr) {
  const apiKey = await getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ Gemini API key is missing. Falling back to ILIKE search.');
    return await searchProductsFallback(queryStr);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-2' });
    const embedResult = await embeddingModel.embedContent(queryStr);
    const queryVector = embedResult.embedding?.values;

    if (!queryVector || !Array.isArray(queryVector)) {
      throw new Error('Invalid query embedding structure returned from Gemini.');
    }

    const res = await pool.query(
      'SELECT product_name, price, description, image_url, shopee_link, embedding FROM products'
    );
    const products = res.rows;
    const scoredProducts = [];

    // Cosine similarity helper
    function cosineSimilarity(vecA, vecB) {
      let dotProduct = 0.0;
      let normA = 0.0;
      let normB = 0.0;
      for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
      }
      if (normA === 0 || normB === 0) return 0;
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    for (const product of products) {
      let productVector = product.embedding;
      if (typeof productVector === 'string') {
        try {
          productVector = JSON.parse(productVector);
        } catch (e) {}
      }

      if (!productVector || !Array.isArray(productVector)) {
        continue;
      }

      const similarity = cosineSimilarity(queryVector, productVector);
      scoredProducts.push({
        product_name: product.product_name,
        price: product.price,
        description: product.description,
        image_url: product.image_url,
        shopee_link: product.shopee_link,
        similarity
      });
    }

    // Sort by similarity descending
    scoredProducts.sort((a, b) => b.similarity - a.similarity);

    // Apply a similarity threshold and slice to top 5
    const threshold = 0.35;
    const matches = scoredProducts.filter(p => p.similarity >= threshold).slice(0, 5);

    if (matches.length === 0) {
      console.log(`Semantic search found 0 results above threshold ${threshold} for: "${queryStr}". Falling back to ILIKE.`);
      return await searchProductsFallback(queryStr);
    }

    console.log(`Semantic search found ${matches.length} matches for: "${queryStr}". Best: ${matches[0].product_name} (${matches[0].similarity.toFixed(4)})`);
    return matches;
  } catch (err) {
    console.error('❌ Semantic search failed:', err.message);
    return await searchProductsFallback(queryStr);
  }
}

/**
 * Upsert product into catalog
 */
async function upsertProduct(productName, price, description, imageUrl, shopeeLink) {
  const query = `
    INSERT INTO products (product_name, price, description, image_url, shopee_link)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (product_name) DO UPDATE 
    SET price = EXCLUDED.price,
        description = EXCLUDED.description,
        image_url = EXCLUDED.image_url,
        shopee_link = CASE 
          WHEN products.shopee_link = '' OR products.shopee_link IS NULL THEN EXCLUDED.shopee_link
          ELSE products.shopee_link 
        END
    RETURNING *;
  `;
  const res = await pool.query(query, [productName, price, description, imageUrl, shopeeLink]);
  return res.rows[0];
}

/**
 * Retrieve customers that need follow up
 */
async function getCustomersForFollowUp(hoursAgo = 24, ignoreThreshold = false) {
  let query = `SELECT * FROM customers WHERE needs_follow_up = TRUE AND status != 'opt_out'`;
  const params = [];
  
  if (!ignoreThreshold) {
    query += ` AND last_interaction <= NOW() - INTERVAL '1 hour' * $1`;
    params.push(hoursAgo);
  }
  
  const res = await pool.query(query, params);
  return res.rows;
}

/**
 * Utility to generate embedding using text-embedding-004 model
 */
async function generateEmbedding(apiKey, name, description) {
  const text = `${name}. ${description || ''}`.trim();
  if (!text) return null;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-2' });
    const result = await model.embedContent(text);
    return result.embedding?.values || null;
  } catch (err) {
    console.error(`Failed to generate embedding for "${name}":`, err.message);
    return null;
  }
}

/**
 * Automatically generates embeddings for products that do not have them
 */
async function backfillProductEmbeddings() {
  const apiKey = await getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ Gemini API key is missing. Skipping product embeddings backfill.');
    return;
  }

  try {
    const res = await pool.query('SELECT id, product_name, description FROM products WHERE embedding IS NULL');
    const products = res.rows;
    if (products.length === 0) {
      console.log('✅ All products have precompiled embeddings. No backfill needed.');
      return;
    }

    console.log(`⏳ Backfilling embeddings for ${products.length} products...`);
    for (const product of products) {
      const embedding = await generateEmbedding(apiKey, product.product_name, product.description);
      if (embedding) {
        await pool.query('UPDATE products SET embedding = $1 WHERE id = $2', [JSON.stringify(embedding), product.id]);
        console.log(`  - Embed compiled for product: ${product.product_name}`);
      }
    }
    console.log('✅ Embeddings backfill completed.');
  } catch (err) {
    console.error('❌ Failed to run product embeddings backfill:', err.message);
  }
}

module.exports = {
  pool,
  initDb,
  loadAllSettings,
  getSetting,
  setSetting,
  getCustomer,
  createOrUpdateCustomer,
  saveChatMessage,
  getChatHistory,
  searchProducts,
  upsertProduct,
  getCustomersForFollowUp,
  generateEmbedding,
  backfillProductEmbeddings
};
