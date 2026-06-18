require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

async function run() {
  try {
    await db.pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      ['followup_hours', '1']
    );
    console.log('✅ followup_hours set to 1 hour for testing');
    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    try { await db.pool.end(); } catch (e) {}
    process.exit(1);
  }
}

run();
