require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../src/db');

async function listModels() {
  const apiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('API key not found');
    process.exit(1);
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Note: listModels is a method on the genAI client or requires calling the API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    console.log('Available models:');
    if (data.models) {
      data.models.forEach(m => {
        console.log(`- ${m.name} (methods: ${m.supportedGenerationMethods.join(', ')})`);
      });
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

listModels();
