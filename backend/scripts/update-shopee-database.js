require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

async function updateDatabase() {
  console.log('=== Updating Shopee shop ID in database ===');
  
  try {
    // 1. Update shopee_shop_id in settings table
    const settingsUpdate = await db.pool.query(
      "UPDATE settings SET value = '479628817' WHERE key = 'shopee_shop_id' AND value = '657336422'"
    );
    console.log(`Updated settings rows: ${settingsUpdate.rowCount}`);

    // 2. Update product links in products table
    const productsUpdate = await db.pool.query(
      "UPDATE products SET shopee_link = REPLACE(shopee_link, 'shop=657336422', 'shop=479628817') WHERE shopee_link LIKE '%shop=657336422%'"
    );
    console.log(`Updated products rows: ${productsUpdate.rowCount}`);
    
    console.log('✅ Database update completed successfully.');
  } catch (err) {
    console.error('❌ Database update failed:', err.message);
  } finally {
    await db.pool.end();
  }
}

updateDatabase();
