require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

async function verify() {
  try {
    const c = await db.pool.query(
      'SELECT phone_number, name, needs_follow_up, follow_up_reason, last_interaction FROM customers WHERE phone_number = $1',
      ['6281234567890@s.whatsapp.net']
    );
    console.log('\n=== Customer Status After Follow-up ===');
    console.log(JSON.stringify(c.rows[0], null, 2));

    const h = await db.pool.query(
      'SELECT role, content, timestamp FROM chat_histories WHERE phone_number = $1 ORDER BY timestamp DESC LIMIT 5',
      ['6281234567890@s.whatsapp.net']
    );
    console.log('\n=== Last 5 Messages (newest first) ===');
    h.rows.forEach((r, i) => {
      const time = new Date(r.timestamp).toLocaleTimeString('id-ID');
      console.log(`[${i+1}] [${r.role}] ${time}: ${r.content.substring(0, 100)}`);
    });

    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    try { await db.pool.end(); } catch (e) {}
    process.exit(1);
  }
}

verify();
