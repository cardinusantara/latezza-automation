require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

const NATURAL_INSTRUCTION = 'Ingatkan kustomer soal pesanan custom cake yang sempat mereka tanyakan. Sebutkan bahwa slot produksi terbatas dan lebih baik konfirmasi segera. Tanya kapan tanggal acaranya agar kami bisa jadwalkan.';

async function run() {
  try {
    // Set a natural-language instruction (no template variables)
    await db.pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      ['followup_instruction', NATURAL_INSTRUCTION]
    );
    console.log('✅ followup_instruction set to natural language mode:');
    console.log(' ', NATURAL_INSTRUCTION);

    // Re-seed the test customer
    await db.pool.query(
      'UPDATE customers SET needs_follow_up = TRUE, follow_up_reason = $1, last_interaction = NOW() - INTERVAL \'2 hours\' WHERE phone_number = $2',
      ['Tertarik custom birthday cake tapi belum konfirmasi order', '6281234567890@s.whatsapp.net']
    );
    console.log('\n✅ Customer re-seeded for follow-up test');

    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    try { await db.pool.end(); } catch (e) {}
    process.exit(1);
  }
}

run();
