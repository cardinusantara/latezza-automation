require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const agent = require('../src/agent');
const db = require('../src/db');

async function test() {
  const imagePath = process.argv[2];
  const queryText = process.argv[3] || 'ada kue yang kayak gini?';

  if (!imagePath) {
    console.error('Usage: node scripts/test-multimodal-search.js <path_to_image> [query_text]');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`Error: File does not exist at ${imagePath}`);
    process.exit(1);
  }

  console.log(`📸 Loading image from: ${imagePath}...`);
  const imageBuffer = fs.readFileSync(imagePath);
  
  // Detect mime type simple fallback
  let mimeType = 'image/png';
  if (imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg')) {
    mimeType = 'image/jpeg';
  }

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString('base64'),
      mimeType: mimeType
    }
  };

  const testJid = '123456789@s.whatsapp.net';
  const testName = 'Test User';
  const imageUrl = '/uploads/test_run.jpg'; // mock URL for logging

  console.log(`🤖 Sending image to AI agent with prompt: "${queryText}"...\n`);

  try {
    const reply = await agent.handleIncomingMessage(testJid, queryText, testName, imagePart, imageUrl);
    console.log('\n=== AGENT RESPONSE ===');
    console.log(reply);
    console.log('======================\n');
    
    await db.pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    try { await db.pool.end(); } catch (e) {}
    process.exit(1);
  }
}

test();
