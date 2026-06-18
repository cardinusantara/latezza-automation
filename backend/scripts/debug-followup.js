require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

async function debugFollowUp() {
  console.log('=== Follow-up Debug ===\n');

  try {
    // Check followup_hours setting
    const s = await db.pool.query('SELECT value FROM settings WHERE key = $1', ['followup_hours']);
    const followupHours = s.rows[0] ? parseInt(s.rows[0].value, 10) : 24;
    console.log('followup_hours setting:', followupHours, '(default 24 if not set)');

    // Check all customers with timing details
    const c = await db.pool.query(`
      SELECT 
        phone_number, 
        name,
        needs_follow_up, 
        status,
        follow_up_reason, 
        last_interaction,
        NOW() AS server_now,
        (NOW() - last_interaction) AS age_interval,
        EXTRACT(EPOCH FROM (NOW() - last_interaction)) / 3600 AS hours_since_interaction
      FROM customers
    `);
    console.log('\nAll customers with timing:');
    c.rows.forEach(r => {
      console.log(`  ${r.phone_number}`);
      console.log(`    name: ${r.name}`);
      console.log(`    needs_follow_up: ${r.needs_follow_up}`);
      console.log(`    status: ${r.status}`);
      console.log(`    last_interaction: ${r.last_interaction}`);
      console.log(`    server_now: ${r.server_now}`);
      console.log(`    hours since: ${parseFloat(r.hours_since_interaction).toFixed(2)} hours`);
      console.log('');
    });

    // Simulate exact query with different hour thresholds
    for (const hours of [1, 2, 24]) {
      const r = await db.pool.query(
        `SELECT * FROM customers WHERE needs_follow_up = TRUE AND last_interaction <= NOW() - INTERVAL '1 hour' * $1 AND status != 'opt_out'`,
        [hours]
      );
      console.log(`Query with ${hours}h threshold: ${r.rows.length} results`);
    }

    // Also check WITHOUT the time filter to see if needs_follow_up is actually set
    const r3 = await db.pool.query(`SELECT * FROM customers WHERE needs_follow_up = TRUE AND status != 'opt_out'`);
    console.log('\nCustomers with needs_follow_up=TRUE (no time filter):', r3.rows.length);
    r3.rows.forEach(r => console.log('  -', r.phone_number, r.name));

    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    try { await db.pool.end(); } catch (e) {}
    process.exit(1);
  }
}

debugFollowUp();
