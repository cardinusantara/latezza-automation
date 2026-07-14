const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGeminiCache() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY is not defined in .env');
    process.exit(1);
  }

  console.log('🔌 Initializing Gemini client...');
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Use config model or default
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  console.log(`🤖 Using model: ${modelName}`);

  // Create a relatively large dummy system prompt (~500 tokens)
  const systemInstruction = `
    Anda adalah asisten AI resmi untuk Latezza Cake Hampers.
    Latezza Cake Hampers adalah toko kue Korean cake minimalis dan custom cake premium di Jakarta.
    Kontak: +6281188027702.
    Alamat: Jl. Sudirman No. 12, Jakarta Selatan.
    
    ATURAN UTAMA:
    1. Selalu sapa pelanggan dengan ramah dan sopan.
    2. Jika pelanggan bertanya tentang menu, rekomendasikan menu kue best-seller seperti Strawberry Shortcake, Chocolate Fudge, dan Lotus Biscoff Cake.
    3. Jika pelanggan menanyakan harga, katakan bahwa harga berkisar antara Rp 150.000 hingga Rp 450.000 tergantung pada ukuran dan tingkat kerumitan dekorasi.
    4. Selalu gunakan Bahasa Indonesia yang baik dan benar, dengan nada yang hangat dan bersahabat.
    5. JANGAN PERNAH memberikan informasi palsu. Jika Anda tidak tahu, katakan bahwa Anda akan menghubungkan pelanggan dengan admin manusia.
    
    INFORMASI PRODUK DETAIL:
    - Strawberry Shortcake: Kue spons vanilla lembut dengan lapisan krim segar dan buah strawberry asli. Cocok untuk ulang tahun anak-anak atau perayaan kecil. Harga Rp 180.000 (diameter 15cm).
    - Chocolate Fudge: Kue cokelat pekat dengan lapisan ganache cokelat premium. Sangat manis dan memanjakan lidah pecinta cokelat. Harga Rp 220.000 (diameter 15cm).
    - Lotus Biscoff Cake: Kue dengan rasa karamel khas biskuit Lotus Biscoff, dilapisi krim Biscoff yang lezat. Harga Rp 250.000 (diameter 15cm).
    
    INFORMASI PENGIRIMAN:
    Pengiriman dilakukan menggunakan kurir instan (GoSend/GrabExpress) dari Jakarta Selatan untuk menjaga keutuhan dekorasi kue. Biaya pengiriman ditanggung sepenuhnya oleh pembeli sesuai tarif aplikasi kurir.
  `.repeat(10); // Repeat to make it larger (~5,000 tokens to test threshold if needed)

  console.log(`📝 Generated system prompt length: ${systemInstruction.length} characters (approx. ${Math.ceil(systemInstruction.length / 4)} tokens)`);

  const userMessage = 'Halo, apa saja menu best seller di Latezza Cake?';

  try {
    console.log('\n--- REQUEST 1 (Cache MISS expected) ---');
    console.log('Sending message to Gemini with cacheControl: ephemeral...');
    
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemInstruction
    });

    let startTime = Date.now();
    let chat = model.startChat();
    let result = await chat.sendMessage(userMessage);
    let duration1 = Date.now() - startTime;

    console.log(`⏱️ Duration: ${duration1}ms`);
    console.log('💬 Response:', result.response.text().trim());
    console.log('📊 Usage Metadata:', JSON.stringify(result.response.usageMetadata, null, 2));

    console.log('\n--- REQUEST 2 (Cache HIT expected if cached) ---');
    console.log('Sending another message to the same or new session with same prompt...');
    
    // We recreate model with same prompt to see if context caching hits
    const model2 = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemInstruction
    });

    startTime = Date.now();
    let chat2 = model2.startChat();
    let result2 = await chat2.sendMessage('Berapa harga Strawberry Shortcake?');
    let duration2 = Date.now() - startTime;

    console.log(`⏱️ Duration: ${duration2}ms`);
    console.log('💬 Response:', result2.response.text().trim());
    console.log('📊 Usage Metadata:', JSON.stringify(result2.response.usageMetadata, null, 2));

  } catch (err) {
    console.error('❌ API Call failed:', err);
  }
}

testGeminiCache();
