const db = require('../db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Helper to translate date range label
 */
function getDateRangeLabel(dateRange) {
  switch (dateRange) {
    case 'today': return 'Hari Ini';
    case '3d': return '3 Hari Terakhir';
    case '7d': return '7 Hari Terakhir';
    case '30d': return '30 Hari Terakhir';
    default: return dateRange;
  }
}

/**
 * Generate Message Summary using Gemini AI (Hierarchical Two-Pass approach for scalability)
 */
async function generateMessageSummary(log = console, onProgress = null, sessionId = 'all', dateRange = 'today') {
  log.info(`Starting Message Summary generation: session_id=${sessionId}, date_range=${dateRange}`);
  if (onProgress) onProgress({ type: 'status', message: 'Menginisialisasi pembuatan rangkuman pesan...' });

  const activeApiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  if (!activeApiKey) {
    const errMsg = 'Missing active Gemini API key. Cannot run AI analysis.';
    if (onProgress) onProgress({ type: 'error', message: errMsg });
    throw new Error(errMsg);
  }

  // 1. Query incoming messages (role = 'user') for specified timeframe and session
  let queryText = `
    SELECT phone_number, content, timestamp, session_id 
    FROM chat_histories 
    WHERE role = 'user'
  `;
  const queryParams = [];

  if (dateRange === 'today') {
    queryText += ` AND timestamp >= CURRENT_DATE`;
  } else if (dateRange === '3d') {
    queryText += ` AND timestamp >= NOW() - INTERVAL '3 days'`;
  } else if (dateRange === '7d') {
    queryText += ` AND timestamp >= NOW() - INTERVAL '7 days'`;
  } else if (dateRange === '30d') {
    queryText += ` AND timestamp >= NOW() - INTERVAL '30 days'`;
  } else {
    queryText += ` AND timestamp >= CURRENT_DATE`;
  }

  if (sessionId && sessionId !== 'all') {
    queryParams.push(sessionId);
    queryText += ` AND session_id = $${queryParams.length}`;
  }

  queryText += ` ORDER BY timestamp ASC`;

  if (onProgress) onProgress({ type: 'status', message: 'Mengambil riwayat percakapan dari database...' });
  const result = await db.pool.query(queryText, queryParams);
  const messages = result.rows;

  log.info(`Found ${messages.length} messages for summary.`);

  // Calculate unique active customers in this period
  const uniquePhones = new Set(messages.map(m => m.phone_number));
  const totalCustomers = uniquePhones.size;

  // Handle empty messages scenario
  if (messages.length === 0) {
    const emptyReport = {
      generatedAt: new Date().toISOString(),
      dateRange,
      sessionId,
      totalMessages: 0,
      totalCustomers: 0,
      summary: {
        totalCustomers: 0,
        topProducts: [],
        commonQuestions: ['Tidak ada pesan pelanggan masuk pada periode ini.'],
        complaints: [],
        salesOpportunities: [],
        insights: []
      }
    };
    await db.setSetting('message_summary_report', JSON.stringify(emptyReport));
    if (onProgress) {
      onProgress({ type: 'status', message: 'Tidak ada pesan untuk dirangkum.' });
      onProgress({ type: 'chunk', text: JSON.stringify(emptyReport.summary, null, 2) });
    }
    return emptyReport;
  }

  const genAI = new GoogleGenerativeAI(activeApiKey);
  const dbModel = await db.getSetting('gemini_model');
  const modelsToTry = [dbModel, 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-pro'].filter(Boolean);
  const uniqueModels = [...new Set(modelsToTry)];

  const dateRangeLabel = getDateRangeLabel(dateRange);

  let finalSummaryText = '';
  let lastError = null;

  // 2. Determine Single-pass vs Two-pass batching based on message count (threshold: 100 messages)
  if (messages.length < 100) {
    log.info('Message count < 100: executing single-pass summary');
    if (onProgress) onProgress({ type: 'status', message: `Menganalisis ${messages.length} pesan dalam satu tahap...` });

    // Format all messages chronologically
    const rawMessagesText = messages.map(m => {
      const timeStr = new Date(m.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return `[Pelanggan ${m.phone_number.slice(-4)} | ${timeStr}]: ${m.content}`;
    }).join('\n');

    const prompt = `
Kamu adalah analis CRM Latezza, KAMU KRITIS DAN JUJUR.
Berdasarkan percakapan masuk dari pelanggan pada periode ${dateRangeLabel}, buat laporan ringkas dalam format JSON.
BUATLAH SUMMARY YANG JUJUR APA ADANYA.
Format JSON harus valid dan persis seperti struktur ini:
{
  "totalCustomers": ${totalCustomers},
  "topProducts": ["...", "..."],
  "commonQuestions": ["...", "..."],
  "complaints": ["...", "..."],
  "salesOpportunities": ["...", "..."],
  "insights": ["...", "..."]
}

Percakapan pelanggan yang harus dianalisis:
${rawMessagesText}

PENTING: Kembalikan respon hanya dalam format JSON yang valid. Jangan sertakan teks penjelasan lain atau blok markdown \`\`\`json. Pastikan seluruh nilai di dalam JSON relevan dengan percakapan pelanggan yang diberikan.
`;

    // Stream generate content for the final pass
    for (const modelName of uniqueModels) {
      try {
        finalSummaryText = await generateStreamWithRetry(genAI, modelName, prompt, onProgress, log);
        break;
      } catch (err) {
        log.warn(`Single-pass failed with model ${modelName}: ${err.message}`);
        lastError = err;
      }
    }
  } else {
    log.info(`Message count >= 100 (${messages.length} messages): executing two-pass hierarchical summary`);
    if (onProgress) onProgress({ type: 'status', message: `Pesan cukup banyak (${messages.length}). Memulai analisis bertahap (hierarchical batching)...` });

    // Split messages into batches of 50
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < messages.length; i += batchSize) {
      batches.push(messages.slice(i, i + batchSize));
    }

    const batchSummaries = [];
    if (onProgress) onProgress({ type: 'status', message: `Menganalisis ${batches.length} batch pesan secara paralel...` });

    // Process each batch (Pass 1)
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (onProgress) onProgress({ type: 'status', message: `Memproses batch ${i + 1} dari ${batches.length} (${batch.length} pesan)...` });

      const batchMessagesText = batch.map(m => {
        const timeStr = new Date(m.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        return `[Pelanggan ${m.phone_number.slice(-4)} | ${timeStr}]: ${m.content}`;
      }).join('\n');

      const batchPrompt = `
Rangkum pesan-pesan pelanggan berikut dalam 3-5 bullet points yang padat informasi.
Fokus: apa saja produk yang ditanyakan/diminati, pertanyaan umum, dan apakah ada keluhan.

Pesan-pesan pelanggan:
${batchMessagesText}
`;

      let batchSummary = '';
      for (const modelName of uniqueModels) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const res = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: batchPrompt }] }]
          });
          batchSummary = res.response.text();
          break;
        } catch (err) {
          log.warn(`Batch ${i + 1} failed with model ${modelName}: ${err.message}`);
          lastError = err;
        }
      }

      if (batchSummary) {
        batchSummaries.push(`Batch ${i + 1} Summary:\n${batchSummary}`);
      }
    }

    if (batchSummaries.length === 0) {
      throw new Error(`Gagal merangkum batch pesan: ${lastError ? lastError.message : 'Unknown error'}`);
    }

    // Synthesis Pass (Pass 2)
    if (onProgress) onProgress({ type: 'status', message: 'Mensintesis seluruh rangkuman menjadi laporan akhir...' });
    const combinedSummariesText = batchSummaries.join('\n\n');

    const synthesisPrompt = `
Kamu adalah analis CRM Latezza, KAMU KRITIS DAN JUJUR.
Berdasarkan hasil rangkuman percakapan per batch pada periode ${dateRangeLabel}, buat laporan ringkas dalam format JSON.
BUATLAH SUMMARY YANG JUJUR APA ADANYA.
Format JSON harus valid dan persis seperti struktur ini:
{
  "totalCustomers": ${totalCustomers},
  "topProducts": ["...", "..."],
  "commonQuestions": ["...", "..."],
  "complaints": ["...", "..."],
  "salesOpportunities": ["...", "..."],
  "insights": ["...", "..."]
}

Rangkuman percakapan pelanggan dari berbagai batch:
${combinedSummariesText}

PENTING: Kembalikan respon hanya dalam format JSON yang valid. Jangan sertakan teks penjelasan lain atau blok markdown \`\`\`json. Pastikan seluruh nilai di dalam JSON relevan dengan rangkuman percakapan pelanggan yang diberikan.
`;

    for (const modelName of uniqueModels) {
      try {
        finalSummaryText = await generateStreamWithRetry(genAI, modelName, synthesisPrompt, onProgress, log);
        break;
      } catch (err) {
        log.warn(`Synthesis pass failed with model ${modelName}: ${err.message}`);
        lastError = err;
      }
    }
  }

  if (!finalSummaryText) {
    const errMsg = lastError ? lastError.message : 'Gagal menghasilkan rangkuman pesan dari Gemini AI.';
    if (onProgress) onProgress({ type: 'error', message: errMsg });
    throw new Error(errMsg);
  }

  // 3. Parse result and save to settings table
  try {
    // Sanitize output just in case markdown block format was used
    let cleanJson = finalSummaryText.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.slice(7);
    }
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.slice(3);
    }
    if (cleanJson.endsWith('```')) {
      cleanJson = cleanJson.slice(0, -3);
    }
    cleanJson = cleanJson.trim();

    const parsedSummary = JSON.parse(cleanJson);

    const report = {
      generatedAt: new Date().toISOString(),
      dateRange,
      sessionId,
      totalMessages: messages.length,
      totalCustomers,
      summary: parsedSummary
    };

    await db.setSetting('message_summary_report', JSON.stringify(report));
    log.info('Successfully saved message summary report to database settings.');
    
    if (onProgress) {
      onProgress({ type: 'status', message: 'Rangkuman pesan berhasil disimpan!' });
    }

    return report;
  } catch (err) {
    log.error(`Failed to parse final summary JSON: ${err.message}. Raw output: ${finalSummaryText}`);
    if (onProgress) onProgress({ type: 'error', message: `Gagal membaca format JSON hasil analisis: ${err.message}` });
    throw err;
  }
}

/**
 * Helper to call Gemini stream and handle retries with exponential backoff
 */
async function generateStreamWithRetry(genAI, modelName, prompt, onProgress, log, retries = 3, delay = 2000) {
  const model = genAI.getGenerativeModel({ model: modelName });
  for (let i = 0; i < retries; i++) {
    try {
      log.info(`Attempting content generation stream with model ${modelName} (Attempt ${i + 1}/${retries})...`);
      if (onProgress && i > 0) {
        onProgress({ type: 'status', message: `Mencoba ulang model ${modelName} (Percobaan ${i + 1}/${retries})...` });
      }

      const result = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      });

      let textResult = '';
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        textResult += chunkText;
        if (onProgress) {
          onProgress({ type: 'chunk', text: chunkText });
        }
      }
      return textResult;
    } catch (err) {
      log.warn(`Attempt ${i + 1} failed for ${modelName}: ${err.message}`);
      if (i === retries - 1) throw err;
      log.info(`Waiting ${delay}ms before next retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

module.exports = {
  generateMessageSummary
};
