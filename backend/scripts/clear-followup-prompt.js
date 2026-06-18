require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

async function run() {
  try {
    // Check what followup settings are in the DB
    const r = await db.pool.query("SELECT key, value FROM settings WHERE key LIKE 'followup%'");
    console.log('Current followup settings in DB:');
    r.rows.forEach(row => {
      console.log(`  key: "${row.key}"`);
      console.log(`  value: "${row.value ? row.value.substring(0, 200) : null}"`);
      console.log('');
    });

    // Delete or clear followup_instruction so the new code default is used
    const del = await db.pool.query("DELETE FROM settings WHERE key = 'followup_instruction' RETURNING key");
    if (del.rowCount > 0) {
      console.log('✅ Deleted old followup_instruction from DB. New default prompt will be used.');
    } else {
      console.log('ℹ️  No followup_instruction found in DB settings (was already empty).');
    }

    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    try { await db.pool.end(); } catch (e) {}
    process.exit(1);
  }
}

run();
