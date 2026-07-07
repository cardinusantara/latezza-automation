require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

async function migrate() {
  console.log('=== Migrating product Shopee links ===');
  
  try {
    // 1. Fetch all products
    const res = await db.pool.query('SELECT id, product_name, shopee_link FROM products');
    const products = res.rows;
    console.log(`Found ${products.length} products to check.`);

    let updatedCount = 0;

    for (const product of products) {
      const targetLink = `https://shopee.co.id/search?keyword=${encodeURIComponent(product.product_name)}&shop=479628817`;

      // Check if the current link is already correct to avoid unnecessary updates
      if (product.shopee_link !== targetLink) {
        await db.pool.query(
          'UPDATE products SET shopee_link = $1 WHERE id = $2',
          [targetLink, product.id]
        );
        updatedCount++;
      }
    }

    console.log(`✅ Successfully updated ${updatedCount} products to use the new Shopee search URL format.`);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await db.pool.end();
  }
}

migrate();
