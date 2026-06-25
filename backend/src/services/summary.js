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
 * Helper to build the message summary query dynamically
 */
function buildSummaryQuery(dateRange, sessionId) {
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

  return { queryText, queryParams };
}

/**
 * Helper to run a prompt with fallback models and streaming support
 */
async function runPromptWithModelFallback(genAI, uniqueModels, prompt, onProgress, log) {
  let lastError = null;
  for (const modelName of uniqueModels) {
    try {
      const finalSummaryText = await generateStreamWithRetry(genAI, modelName, prompt, onProgress, log);
      return finalSummaryText;
    } catch (err) {
      log.warn(`Stream generation failed with model ${modelName}: ${err.message}`);
      lastError = err;
    }
  }
  throw lastError || new Error('Gagal menghasilkan output dari Gemini AI.');
}

/**
 * Helper to process and summarize a single batch of messages using a fallback model loop
 */
async function summarizeBatch(genAI, uniqueModels, batch, index, totalBatches, log) {
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

  let lastError = null;
  for (const modelName of uniqueModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: batchPrompt }] }]
      });

      // Log Gemini usage
      const usage = res.response.usageMetadata;
      if (usage) {
        await db.saveUsageLog({
          feature: 'message_summary',
          modelName: modelName,
          inputTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          cachedTokens: usage.cachedContentTokenCount
        });
      }

      return res.response.text();
    } catch (err) {
      log.warn(`Batch ${index + 1} failed with model ${modelName}: ${err.message}`);
      lastError = err;
    }
  }
  throw lastError || new Error(`Failed to summarize batch ${index + 1}`);
}

/**
 * Helper to run single-pass summary logic for under 100 messages
 */
async function runSinglePassSummary(genAI, uniqueModels, messages, totalCustomers, dateRangeLabel, onProgress, log) {
  log.info('Message count < 100: executing single-pass summary');
  if (onProgress) onProgress({ type: 'status', message: `Menganalisis ${messages.length} pesan dalam satu tahap...` });

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

  return runPromptWithModelFallback(genAI, uniqueModels, prompt, onProgress, log);
}

/**
 * Helper to run hierarchical two-pass summary logic for 100+ messages
 */
async function runTwoPassSummary(genAI, uniqueModels, messages, totalCustomers, dateRangeLabel, onProgress, log) {
  log.info(`Message count >= 100 (${messages.length} messages): executing two-pass hierarchical summary`);
  if (onProgress) onProgress({ type: 'status', message: `Pesan cukup banyak (${messages.length}). Memulai analisis bertahap (hierarchical batching)...` });

  const batchSize = 50;
  const batches = [];
  for (let i = 0; i < messages.length; i += batchSize) {
    batches.push(messages.slice(i, i + batchSize));
  }

  const batchSummaries = [];
  if (onProgress) onProgress({ type: 'status', message: `Menganalisis ${batches.length} batch pesan secara paralel...` });

  let lastError = null;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (onProgress) onProgress({ type: 'status', message: `Memproses batch ${i + 1} dari ${batches.length} (${batch.length} pesan)...` });

    try {
      const batchSummary = await summarizeBatch(genAI, uniqueModels, batch, i, batches.length, log);
      if (batchSummary) {
        batchSummaries.push(`Batch ${i + 1} Summary:\n${batchSummary}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (batchSummaries.length === 0) {
    throw new Error(`Gagal merangkum batch pesan: ${lastError ? lastError.message : 'Unknown error'}`);
  }

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

  return runPromptWithModelFallback(genAI, uniqueModels, synthesisPrompt, onProgress, log);
}

/**
 * Helper to parse and sanitize Gemini JSON response
 */
function parseGeminiJson(rawText) {
  let cleanJson = rawText.trim();
  if (cleanJson.startsWith('```json')) {
    cleanJson = cleanJson.slice(7);
  }
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.slice(3);
  }
  if (cleanJson.endsWith('```')) {
    cleanJson = cleanJson.slice(0, -3);
  }
  return JSON.parse(cleanJson.trim());
}

/**
 * Helper to build an empty state summary report
 */
function buildEmptySummaryReport(dateRange, sessionId) {
  return {
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
  const { queryText, queryParams } = buildSummaryQuery(dateRange, sessionId);

  if (onProgress) onProgress({ type: 'status', message: 'Mengambil riwayat percakapan dari database...' });
  const result = await db.pool.query(queryText, queryParams);
  const messages = result.rows;

  log.info(`Found ${messages.length} messages for summary.`);

  // Calculate unique active customers in this period
  const uniquePhones = new Set(messages.map(m => m.phone_number));
  const totalCustomers = uniquePhones.size;

  // Handle empty messages scenario
  if (messages.length === 0) {
    const emptyReport = buildEmptySummaryReport(dateRange, sessionId);
    await db.setSetting('message_summary_report', JSON.stringify(emptyReport));
    if (onProgress) {
      onProgress({ type: 'status', message: 'Tidak ada pesan untuk dirangkum.' });
      onProgress({ type: 'chunk', text: JSON.stringify(emptyReport.summary, null, 2) });
    }
    return emptyReport;
  }

  const genAI = new GoogleGenerativeAI(activeApiKey);
  const envModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const modelsToTry = [envModel, 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-1.5-pro'].filter(Boolean);
  const uniqueModels = [...new Set(modelsToTry)];

  const dateRangeLabel = getDateRangeLabel(dateRange);

  let finalSummaryText = '';

  // 2. Determine Single-pass vs Two-pass batching based on message count (threshold: 100 messages)
  if (messages.length < 100) {
    finalSummaryText = await runSinglePassSummary(genAI, uniqueModels, messages, totalCustomers, dateRangeLabel, onProgress, log);
  } else {
    finalSummaryText = await runTwoPassSummary(genAI, uniqueModels, messages, totalCustomers, dateRangeLabel, onProgress, log);
  }

  // 3. Parse result and save to settings table
  try {
    const parsedSummary = parseGeminiJson(finalSummaryText);

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

      // Log Gemini usage
      try {
        const response = await result.response;
        const usage = response.usageMetadata;
        if (usage) {
          await db.saveUsageLog({
            feature: 'message_summary',
            modelName: modelName,
            inputTokens: usage.promptTokenCount,
            outputTokens: usage.candidatesTokenCount,
            cachedTokens: usage.cachedContentTokenCount
          });
        }
      } catch (usageErr) {
        log.warn(`Failed to log usage for summary stream: ${usageErr.message}`);
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
