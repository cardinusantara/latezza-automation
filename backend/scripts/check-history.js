require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

async function check() {
  try {
    const customersRes = await db.pool.query('SELECT * FROM customers');
    console.log('--- CUSTOMERS ---');
    console.table(customersRes.rows);

    const historyRes = await db.pool.query('SELECT * FROM chat_histories ORDER BY timestamp ASC');
    console.log('--- CHAT HISTORY ---');
    console.table(historyRes.rows.map(r => ({
      id: r.id,
      phone: r.phone_number,
      role: r.role,
      content: r.content ? (r.content.substring(0, 60) + (r.content.length > 60 ? '...' : '')) : '[EMPTY]',
      time: r.timestamp.toISOString()
    })));

    const productsRes = await db.pool.query('SELECT count(*) FROM products');
    console.log('Total products in database:', productsRes.rows[0].count);

    process.exit(0);
  } catch (err) {
    console.error('Error checking database:', err.message);
    process.exit(1);
  }
}

check();
