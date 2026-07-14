const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../src/db');
const agent = require('../src/agent');

async function testIntegrationCache() {
  console.log('🔄 Running Integration Testing for System Prompt Caching...');

  try {
    // 1. Initialize DB to run migration
    console.log('📦 Initializing DB and running migrations...');
    await db.initDb();
    console.log('✅ DB initialized.');

    const businessId = 1;
    const jid = '628999999999@s.whatsapp.net';
    const sessionId = 'default';

    // Ensure session exists
    console.log('👤 Ensuring WhatsApp session exists in DB...');
    await db.pool.query(
      `INSERT INTO whatsapp_sessions (id, name, status, business_id)
       VALUES ($1, $2, 'connected', $3)
       ON CONFLICT (id) DO NOTHING`,
      [sessionId, 'Default Session', businessId]
    );

    // Clean old logs and cache for clean test
    console.log('🧹 Cleaning system prompt cache and logs for business 1...');
    await db.pool.query('DELETE FROM system_prompt_cache WHERE business_id = $1', [businessId]);
    await db.pool.query("DELETE FROM api_usage_logs WHERE feature = 'whatsapp_chat'");

    // 2. First Message (Cache MISS expected)
    console.log('\n💬 Sending Message 1 (Cache MISS expected)...');
    const reply1 = await agent.handleIncomingMessage(jid, 'Halo, di mana lokasi toko Latezza?', 'Test User');
    console.log('🤖 Reply 1:', reply1);

    // Verify cache entry
    const cacheAfterMsg1 = await db.getSystemPromptCache(businessId);
    console.log('\n📊 Cache table state after Message 1:');
    console.log('  - Has Cached Entry:', !!cacheAfterMsg1);
    if (cacheAfterMsg1) {
      console.log('  - Token Count:', cacheAfterMsg1.cache_token_count);
      console.log('  - Hash:', cacheAfterMsg1.prompt_hash);
    }

    // Verify usage log
    const logsAfterMsg1 = await db.pool.query(
      "SELECT * FROM api_usage_logs WHERE feature = 'whatsapp_chat' ORDER BY id DESC LIMIT 1"
    );
    console.log('\n📊 Log table state after Message 1:');
    if (logsAfterMsg1.rows.length > 0) {
      const log = logsAfterMsg1.rows[0];
      console.log('  - Input Tokens:', log.input_tokens);
      console.log('  - Cached Tokens:', log.cached_input_tokens);
      console.log('  - Cost (USD):', log.cost_usd);
      console.log('  - Cost (IDR):', log.cost_idr);
    }

    // 3. Second Message (Cache HIT expected)
    console.log('\n💬 Sending Message 2 (Cache HIT expected)...');
    const reply2 = await agent.handleIncomingMessage(jid, 'Berapa harga Strawberry Shortcake?', 'Test User');
    console.log('🤖 Reply 2:', reply2);

    // Verify usage log for hit
    const logsAfterMsg2 = await db.pool.query(
      "SELECT * FROM api_usage_logs WHERE feature = 'whatsapp_chat' ORDER BY id DESC LIMIT 1"
    );
    console.log('\n📊 Log table state after Message 2 (Cache HIT):');
    if (logsAfterMsg2.rows.length > 0) {
      const log = logsAfterMsg2.rows[0];
      console.log('  - Input Tokens:', log.input_tokens);
      console.log('  - Cached Tokens (Hit):', log.cached_input_tokens);
      console.log('  - Cost (USD):', log.cost_usd);
      console.log('  - Cost (IDR):', log.cost_idr);
    }

    // 4. Retrieve Stats API
    console.log('\n📊 Retrieving Statistics from DB helper...');
    const stats = await db.getSystemPromptStats(businessId);
    console.log('Stats Result:', JSON.stringify(stats, null, 2));

    console.log('\n🚀 Integration test completed successfully!');
  } catch (err) {
    console.error('❌ Integration test failed:', err);
  } finally {
    await db.pool.end();
  }
}

testIntegrationCache();
