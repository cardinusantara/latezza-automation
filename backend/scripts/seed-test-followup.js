require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/db');

async function seed() {
  console.log('=== Seeding test customer for follow-up testing ===');

  try {
    // Insert test customer: needs_follow_up=true, last_interaction 2 jam lalu
    await db.pool.query(`
      INSERT INTO customers (phone_number, name, status, needs_follow_up, follow_up_reason, last_interaction, ai_enabled)
      VALUES ($1, $2, 'lead', TRUE, $3, NOW() - INTERVAL '2 hours', TRUE)
      ON CONFLICT (phone_number) DO UPDATE
      SET 
        needs_follow_up = TRUE,
        follow_up_reason = $3,
        last_interaction = NOW() - INTERVAL '2 hours',
        name = $2
    `, [
      '6281234567890@s.whatsapp.net',
      'Siti Rahayu Test',
      'Tertarik custom birthday cake tapi belum konfirmasi order'
    ]);

    // Delete old history if any and re-insert
    await db.pool.query(
      'DELETE FROM chat_histories WHERE phone_number = $1',
      ['6281234567890@s.whatsapp.net']
    );

    await db.pool.query(`
      INSERT INTO chat_histories (phone_number, role, content, timestamp)
      VALUES 
      ($1, 'user', 'Halo, saya mau tanya soal custom birthday cake', NOW() - INTERVAL '3 hours'),
      ($1, 'model', 'Halo Kak Siti! Dengan senang hati kami bantu. Untuk custom birthday cake, kami bisa buat sesuai tema yang Kakak mau. Ada ukuran 20cm, 25cm, dan 30cm. Mau yang seperti apa Kak?', NOW() - INTERVAL '2 hours 50 minutes'),
      ($1, 'user', 'Saya mau yang ukuran 20cm tema princess untuk anak saya. Harganya berapa ya?', NOW() - INTERVAL '2 hours 30 minutes'),
      ($1, 'model', 'Wah bagus banget tema princess! Untuk custom cake 20cm tema princess harganya mulai Rp 350.000. Kami butuh DP 50% untuk konfirmasi order ya Kak. Apakah Kakak mau lanjut?', NOW() - INTERVAL '2 hours 5 minutes')
    `, ['6281234567890@s.whatsapp.net']);

    const res = await db.pool.query(
      'SELECT phone_number, name, needs_follow_up, follow_up_reason, last_interaction, status FROM customers WHERE phone_number = $1',
      ['6281234567890@s.whatsapp.net']
    );
    console.log('\n✅ Customer seeded:');
    console.log(JSON.stringify(res.rows[0], null, 2));

    const hist = await db.pool.query(
      'SELECT role, content FROM chat_histories WHERE phone_number = $1 ORDER BY timestamp',
      ['6281234567890@s.whatsapp.net']
    );
    console.log(`\n✅ Chat history seeded: ${hist.rows.length} messages`);
    hist.rows.forEach((r, i) => {
      console.log(`  [${i+1}] ${r.role}: ${r.content.substring(0, 60)}...`);
    });

    console.log('\n✅ Seed complete! Customer 6281234567890 is ready for follow-up test.');
    console.log('Run: curl -X POST http://localhost:3001/run-followup');

    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    try { await db.pool.end(); } catch (e) {}
    process.exit(1);
  }
}

seed();
