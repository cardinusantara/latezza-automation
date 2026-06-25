const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number.parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : 'fardhan123'), // Development fallback
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
    // 1. WhatsApp Sessions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(50),
        status VARCHAR(20) DEFAULT 'disconnected', -- 'disconnected', 'connecting', 'connected', 'qr_received'
        qr_code TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default session if it doesn't exist
    await client.query(`
      INSERT INTO whatsapp_sessions (id, name, status)
      VALUES ('default', 'Default Agent', 'disconnected')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. Customers Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        phone_number VARCHAR(50),
        session_id VARCHAR(50) DEFAULT 'default' REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
        name VARCHAR(100),
        status VARCHAR(20) DEFAULT 'lead',
        notes TEXT,
        needs_follow_up BOOLEAN DEFAULT FALSE,
        follow_up_reason VARCHAR(255),
        last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        contact_phone VARCHAR(20),
        ai_enabled BOOLEAN DEFAULT TRUE,
        needs_admin BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (phone_number, session_id)
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

    // 4. Chat Histories Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_histories (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(50),
        session_id VARCHAR(50) DEFAULT 'default',
        role VARCHAR(20) NOT NULL, -- 'user' or 'model'
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. Settings Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. API Usage Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_usage_logs (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        feature VARCHAR(50) NOT NULL,
        model_name VARCHAR(100) NOT NULL,
        input_tokens INT DEFAULT 0,
        output_tokens INT DEFAULT 0,
        cached_input_tokens INT DEFAULT 0,
        cost_usd NUMERIC(12, 6) DEFAULT 0,
        cost_idr NUMERIC(14, 2) DEFAULT 0
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
    await client.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS session_id VARCHAR(50) DEFAULT 'default' REFERENCES whatsapp_sessions(id) ON DELETE CASCADE;
    `);
    await client.query(`
      ALTER TABLE chat_histories ADD COLUMN IF NOT EXISTS session_id VARCHAR(50) DEFAULT 'default';
    `);

    // Dynamic PK Migration check
    const pkCheck = await client.query(`
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'customers'::regclass AND i.indisprimary;
    `);

    if (pkCheck.rows.length === 1 && pkCheck.rows[0].attname === 'phone_number') {
      console.log('🔄 Migrating customers table to composite primary key (phone_number, session_id)...');
      // Drop old FK
      await client.query(`ALTER TABLE chat_histories DROP CONSTRAINT IF EXISTS chat_histories_phone_number_fkey;`);
      // Drop old PK
      await client.query(`ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_pkey;`);
      // Set session_id to NOT NULL
      await client.query(`UPDATE customers SET session_id = 'default' WHERE session_id IS NULL;`);
      await client.query(`ALTER TABLE customers ALTER COLUMN session_id SET NOT NULL;`);
      // Add composite PK
      await client.query(`ALTER TABLE customers ADD PRIMARY KEY (phone_number, session_id);`);
      // Update chat_histories session_id
      await client.query(`UPDATE chat_histories SET session_id = 'default' WHERE session_id IS NULL;`);
      await client.query(`ALTER TABLE chat_histories ALTER COLUMN session_id SET NOT NULL;`);
      // Add new FK
      await client.query(`
        ALTER TABLE chat_histories ADD CONSTRAINT chat_histories_customer_fkey 
        FOREIGN KEY (phone_number, session_id) REFERENCES customers(phone_number, session_id) ON DELETE CASCADE;
      `);
      console.log('✅ Composite primary key migration completed.');
    }

    // Create indexes for optimization
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_histories_phone_session ON chat_histories(phone_number, session_id);`);
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
async function getCustomer(phoneNumber, sessionId = 'default') {
  const res = await pool.query(
    'SELECT * FROM customers WHERE phone_number = $1 AND session_id = $2',
    [phoneNumber, sessionId]
  );
  return res.rows[0] || null;
}

/**
 * Create or update customer record
 */
async function createOrUpdateCustomer(phoneNumber, name, updates = {}, sessionId = 'default') {
  const existing = await getCustomer(phoneNumber, sessionId);
  
  if (existing) {
    // Update existing customer fields that are passed
    const fields = [];
    const values = [];
    let idx = 1;

    const fieldsToUpdate = {
      name: name,
      status: updates.status,
      notes: updates.notes,
      needs_follow_up: updates.needs_follow_up,
      follow_up_reason: updates.follow_up_reason,
      contact_phone: updates.contact_phone,
      ai_enabled: updates.ai_enabled,
      needs_admin: updates.needs_admin
    };

    for (const [key, val] of Object.entries(fieldsToUpdate)) {
      if (val !== undefined && (key !== 'name' || val !== null)) {
        fields.push(`${key} = $${idx++}`);
        values.push(val);
      }
    }

    // Always update last interaction
    fields.push(`last_interaction = NOW()`);

    values.push(phoneNumber);
    const phoneIdx = idx++;
    values.push(sessionId);
    const sessionIdx = idx++;

    const query = `UPDATE customers SET ${fields.join(', ')} WHERE phone_number = $${phoneIdx} AND session_id = $${sessionIdx} RETURNING *`;
    const res = await pool.query(query, values);
    return res.rows[0];
  } else {
    const res = await pool.query(
      `INSERT INTO customers (phone_number, session_id, name, status, notes, needs_follow_up, follow_up_reason, contact_phone, ai_enabled, needs_admin, last_interaction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [
        phoneNumber,
        sessionId,
        name || 'Customer',
        updates.status || 'lead',
        updates.notes || '',
        updates.needs_follow_up || false,
        updates.follow_up_reason || null,
        updates.contact_phone || null,
        updates.ai_enabled ?? true,
        updates.needs_admin ?? false
      ]
    );
    return res.rows[0];
  }
}

/**
 * Save chat message to database
 */
async function saveChatMessage(phoneNumber, role, content, sessionId = 'default') {
  await pool.query(
    'INSERT INTO chat_histories (phone_number, session_id, role, content, timestamp) VALUES ($1, $2, $3, $4, NOW())',
    [phoneNumber, sessionId, role, content]
  );
}

/**
 * Retrieve chat history for a customer
 */
async function getChatHistory(phoneNumber, limit = 10, sessionId = 'default') {
  const res = await pool.query(
    'SELECT role, content FROM chat_histories WHERE phone_number = $1 AND session_id = $2 ORDER BY timestamp DESC LIMIT $3',
    [phoneNumber, sessionId, limit]
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
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
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
        } catch (e) {
          // Ignore JSON parsing errors for malformed vector strings
        }
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

/**
 * WhatsApp Session management DB functions
 */
async function getSessions() {
  const res = await pool.query('SELECT * FROM whatsapp_sessions ORDER BY created_at ASC');
  return res.rows;
}

async function getSession(id) {
  const res = await pool.query('SELECT * FROM whatsapp_sessions WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function createSession(id, name) {
  const res = await pool.query(
    `INSERT INTO whatsapp_sessions (id, name, status) 
     VALUES ($1, $2, 'disconnected') 
     RETURNING *`,
    [id, name]
  );
  return res.rows[0];
}

async function deleteSession(id) {
  await pool.query('DELETE FROM whatsapp_sessions WHERE id = $1', [id]);
}

async function updateSessionStatus(id, status) {
  await pool.query(
    'UPDATE whatsapp_sessions SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, id]
  );
}

async function updateSessionQR(id, qrCode, status) {
  await pool.query(
    'UPDATE whatsapp_sessions SET qr_code = $1, status = $2, updated_at = NOW() WHERE id = $3',
    [qrCode, status, id]
  );
}

async function updateSessionConnected(id, phoneNumber, status) {
  await pool.query(
    'UPDATE whatsapp_sessions SET phone_number = $1, status = $2, qr_code = NULL, updated_at = NOW() WHERE id = $3',
    [phoneNumber, status, id]
  );
}

/**
 * Log Gemini API usage (tokens and calculated costs in USD/IDR)
 */
async function saveUsageLog({ feature, modelName, inputTokens = 0, outputTokens = 0, cachedTokens = 0 }) {
  const standardInputTokens = Math.max(0, inputTokens - cachedTokens);
  
  // Cost constants (USD per 1M tokens)
  // Standard input: $0.25 ($0.00000025 per token)
  // Cached input: $0.025 ($0.000000025 per token)
  // Output: $1.50 ($0.0000015 per token)
  const costUsd = Number.parseFloat(((standardInputTokens * 0.00000025) + 
                  (cachedTokens * 0.000000025) + 
                  (outputTokens * 0.0000015)).toFixed(6));
                  
  const costIdr = Number.parseFloat((costUsd * 17500).toFixed(2));

  try {
    await pool.query(
      `INSERT INTO api_usage_logs (feature, model_name, input_tokens, output_tokens, cached_input_tokens, cost_usd, cost_idr)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [feature, modelName, inputTokens, outputTokens, cachedTokens, costUsd, costIdr]
    );
  } catch (err) {
    console.error('❌ Failed to save API usage log to DB:', err.message);
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
  backfillProductEmbeddings,
  getSessions,
  getSession,
  createSession,
  deleteSession,
  updateSessionStatus,
  updateSessionQR,
  updateSessionConnected,
  saveUsageLog
};
