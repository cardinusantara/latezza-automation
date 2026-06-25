const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');
const whatsappService = require('./whatsapp');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Helper to fetch ads metadata (specifically creative fields)
 */
async function fetchMetaAdsCreatives(accessToken, adAccountId) {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const fields = 'id,name,status,creative{id,name,title,body,image_url,thumbnail_url,object_story_spec}';
  const url = `https://graph.facebook.com/v19.0/${actId}/ads?fields=${fields}&limit=100&access_token=${accessToken}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Meta Ads API error fetching creatives (${res.status}): ${errText}`);
  }
  const json = await res.json();
  return json.data || [];
}

/**
 * Helper to fetch ad performance insights
 */
async function fetchMetaAdsInsights(accessToken, adAccountId) {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const fields = 'ad_id,spend,impressions,reach,actions';
  const url = `https://graph.facebook.com/v19.0/${actId}/insights?level=ad&date_preset=last_30d&fields=${fields}&limit=100&access_token=${accessToken}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Meta Ads API error fetching insights (${res.status}): ${errText}`);
  }
  const json = await res.json();
  return json.data || [];
}

/**
 * Extract copywriting text from a creative object
 */
function extractCopywriting(creative) {
  if (!creative) return '';
  if (creative.body) return creative.body;
  if (creative.object_story_spec) {
    const spec = creative.object_story_spec;
    if (spec.link_data?.message) return spec.link_data.message;
    if (spec.video_data?.message) return spec.video_data.message;
    if (spec.photo_data?.message) return spec.photo_data.message;
  }
  return '';
}

/**
 * Try to load generated report.json
 */
function loadAdsFromReportJson(reportJsonPath, log, onProgress) {
  if (!fs.existsSync(reportJsonPath)) return null;
  try {
    log.info(`Loading generated report from: ${reportJsonPath}`);
    if (onProgress) onProgress({ type: 'status', message: 'Membaca laporan iklan yang sudah digenerate...' });
    const reportContent = fs.readFileSync(reportJsonPath, 'utf8');
    const reportJson = JSON.parse(reportContent);
    if (reportJson && Array.isArray(reportJson.ads)) {
      log.info(`Successfully loaded ${reportJson.ads.length} ads from report.json`);
      return reportJson.ads;
    }
  } catch (err) {
    log.warn(`Failed to read or parse report.json: ${err.message}. Falling back to source fetch.`);
  }
  return null;
}

/**
 * Load and parse ads from CSV
 */
function loadAdsFromCsv(log, onProgress) {
  const csvPath = path.join(__dirname, '../../ads-analysis/uploaded-ads.csv');
  if (!fs.existsSync(csvPath)) {
    const errMsg = 'File CSV terupload tidak ditemukan. Silakan upload terlebih dahulu atau generate report.';
    if (onProgress) onProgress({ type: 'error', message: errMsg });
    throw new Error(errMsg);
  }
  log.info(`Parsing CSV file: ${csvPath}`);
  if (onProgress) onProgress({ type: 'status', message: 'Membaca data dari file CSV...' });
  
  const automation = require('../../ads-analysis/automation');
  const csvText = fs.readFileSync(csvPath, 'utf8');
  
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(today.getDate() - 30);
  const dateFrom = defaultFrom.toISOString().split('T')[0];
  const dateTo = today.toISOString().split('T')[0];
  
  const loadedAds = automation.parseCSV(csvText, dateFrom, dateTo);
  log.info(`Parsed ${loadedAds.length} ads from CSV`);
  return loadedAds;
}

/**
 * Fetch and map ads from Meta Ads API
 */
async function fetchAndMapApiAds(accessToken, adAccountId, log, onProgress) {
  if (onProgress) onProgress({ type: 'status', message: 'Mengunduh data iklan & metrik dari Meta Ads API...' });
  log.info('Fetching live creative & performance stats from Meta Ads API...');
  const rawAds = await fetchMetaAdsCreatives(accessToken, adAccountId);
  const rawInsights = await fetchMetaAdsInsights(accessToken, adAccountId);

  log.info(`Fetched ${rawAds.length} ads and ${rawInsights.length} insight rows. Mapping...`);
  if (onProgress) onProgress({ type: 'status', message: `Berhasil mengunduh ${rawAds.length} iklan dan ${rawInsights.length} baris metrik.` });

  const insightsMap = new Map();
  rawInsights.forEach(ins => {
    insightsMap.set(ins.ad_id, ins);
  });

  const loadedAds = [];
  rawAds.forEach(ad => {
    const ins = insightsMap.get(ad.id);
    const spend = ins ? Number.parseFloat(ins.spend) || 0 : 0;
    const impressions = ins ? Number.parseInt(ins.impressions, 10) || 0 : 0;
    const reach = ins ? Number.parseInt(ins.reach, 10) || 0 : 0;
    
    let conversions = 0;
    if (Array.isArray(ins?.actions)) {
      const action = ins.actions.find(a => 
        a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
        a.action_type === 'messaging_first_reply' ||
        a.action_type === 'purchase' ||
        a.action_type === 'lead'
      );
      if (action) conversions = Number.parseInt(action.value, 10) || 0;
    }

    const cpr = conversions > 0 ? spend / conversions : 0;
    const copywriting = extractCopywriting(ad.creative);

    loadedAds.push({
      id: ad.id,
      name: ad.name,
      status: ad.status,
      spend,
      impressions,
      reach,
      results: conversions,
      cpr,
      copywriting: copywriting
    });
  });

  return loadedAds;
}

/**
 * Helper to load ads from various data sources (CSV, API, or local report.json)
 */
async function loadAdsFromSource(dataSource, accessToken, adAccountId, log, onProgress) {
  const reportJsonPath = path.join(__dirname, '../../ads-analysis/report.json');
  let loadedAds = loadAdsFromReportJson(reportJsonPath, log, onProgress);
  const isFromReport = !!loadedAds;

  if (dataSource === 'api' && !loadedAds && (!accessToken || !adAccountId)) {
    const errMsg = 'Kredensial Meta Ads API (Access Token / Ad Account ID) tidak terkonfigurasi di Pengaturan.';
    if (onProgress) onProgress({ type: 'error', message: errMsg });
    throw new Error(errMsg);
  }

  if (!loadedAds) {
    if (dataSource === 'csv') {
      loadedAds = loadAdsFromCsv(log, onProgress);
    } else {
      loadedAds = await fetchAndMapApiAds(accessToken, adAccountId, log, onProgress);
    }
  }

  return { loadedAds, isFromReport };
}

/**
 * Helper to classify ads into winning and losing creatives
 */
function classifyWinnerLoserAds(adsData) {
  // Group 1: Good (conversions > 0, sorted by Conversions desc, CPR asc)
  const goodAds = [...adsData]
    .filter(a => a.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions || a.cpr - b.cpr);

  // Group 2: Bad (spend > 0, sorted by conversions asc, spend desc)
  const badAds = [...adsData]
    .sort((a, b) => a.conversions - b.conversions || b.spend - a.spend);

  const bestAdsList = goodAds.slice(0, 3);
  const worstAdsList = badAds.slice(0, 3).filter(a => !bestAdsList.some(b => b.ad_id === a.ad_id));

  return { bestAdsList, worstAdsList };
}

/**
 * Helper to compile the stream response and log token usage
 */
async function processStreamResponse(result, modelName, log, onProgress) {
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
        feature: 'creative_analysis',
        modelName: modelName,
        inputTokens: usage.promptTokenCount,
        outputTokens: usage.candidatesTokenCount,
        cachedTokens: usage.cachedContentTokenCount
      });
    }
  } catch (usageErr) {
    log.warn(`Failed to log usage for creative analysis: ${usageErr.message}`);
  }

  return textResult;
}

/**
 * Main analysis runner
 */
/**
 * Fetch copywriting details from Meta API if using API and loaded from report.json
 */
async function fetchCopywritingFromMeta(accessToken, adAccountId, log, onProgress) {
  const creativeCopyMap = new Map();
  if (!accessToken || !adAccountId) return creativeCopyMap;
  try {
    log.info('Fetching creative metadata from Meta API for copywriting details...');
    if (onProgress) onProgress({ type: 'status', message: 'Mengunduh copywriting iklan dari Meta API...' });
    const rawAds = await fetchMetaAdsCreatives(accessToken, adAccountId);
    rawAds.forEach(ad => {
      const copywriting = extractCopywriting(ad.creative);
      if (copywriting) {
        creativeCopyMap.set(ad.name, copywriting);
        if (ad.id) creativeCopyMap.set(ad.id, copywriting);
      }
    });
  } catch (err) {
    log.warn(`Failed to fetch copywriting from Meta Ads API: ${err.message}. Will use fallback placeholder.`);
  }
  return creativeCopyMap;
}

/**
 * Combine and normalize adsData for Gemini
 */
function normalizeAdsData(loadedAds, dataSource, creativeCopyMap) {
  const adsData = [];
  loadedAds.forEach(ad => {
    const spend = ad.spend || 0;
    const impressions = ad.impressions || 0;
    const reach = ad.reach || 0;
    const conversions = ad.results || ad.conversions || 0;
    const cpr = ad.cpr || 0;
    const status = ad.status || 'active';

    let copywriting = ad.copywriting || creativeCopyMap.get(ad.name) || (ad.id && creativeCopyMap.get(ad.id)) || '';

    if (!copywriting) {
      if (dataSource === 'csv') {
        copywriting = `[Iklan CSV: ${ad.name} | Angle: ${ad.adset || 'Umum'} | Kualitas: ${ad.quality || '-'} | Interaksi: ${ad.engagement || '-'}]`;
      } else {
        copywriting = `[Teks copywriting tidak ditemukan untuk iklan: ${ad.name}]`;
      }
    }

    if (copywriting && spend > 5000) {
      adsData.push({
        ad_id: ad.id || ad.name,
        ad_name: ad.name,
        copywriting: copywriting,
        spend: spend,
        impressions: impressions,
        reach: reach,
        conversions: conversions,
        cpr: cpr,
        status: status
      });
    }
  });
  return adsData;
}

/**
 * Send creative analysis summary broadcast to WhatsApp Group
 */
async function broadcastCreativeReportToWhatsApp(creativeReport, log) {
  if (!whatsappService.isReady()) {
    log.warn('WhatsApp service is disconnected. Skipped broadcast.');
    return;
  }
  try {
    const targetJid = await db.getSetting('whatsapp_group_jid') || process.env.WHATSAPP_GROUP_JID || '120363427625298309@g.us';
    let waText = `💡 *REKOMENDASI IDE KONTEN BARU DARI AI*\n` +
      `Period: ${creativeReport.dateRange}\n\n` +
      `Berikut adalah ide konten baru hasil audit copywriting iklan winners vs losers:\n\n`;

    creativeReport.ideas.forEach((idea, idx) => {
      waText += `*${idx + 1}. ${idea.title}*\n` +
        `• _Angle:_ ${idea.angle}\n` +
        `• _Visual:_ ${idea.visualGuide}\n` +
        `• _Draft Copy:_ "${idea.copywriting}"\n\n`;
    });

    waText += `🔗 _Lihat ide & salin copywriting lengkap di Dashboard!_`;

    log.info(`Sending creative analysis summary broadcast to WhatsApp Group: ${targetJid}`);
    await whatsappService.sendMessage(targetJid, { text: waText });
  } catch (waErr) {
    log.error(`Failed to send WhatsApp broadcast for creative report: ${waErr.message}`);
  }
}

/**
 * Main analysis runner
 */
function notifyProgress(onProgress, type, message) {
  if (onProgress) onProgress({ type, message });
}

function parseCreativeReport(responseText, log) {
  try {
    const creativeReport = JSON.parse(responseText);
    creativeReport.generatedAt = new Date().toISOString();
    creativeReport.isMock = false;
    return creativeReport;
  } catch (err) {
    log.error('Failed to parse Gemini output. Raw response:', responseText, err);
    throw new Error('Gemini did not return valid JSON for creative report: ' + err.message);
  }
}

function buildCreativePrompt(bestAdsList, worstAdsList, userPrompt) {
  const summaryPayload = {
    business: "Latezza Cake Hampers (Korean cakes, Custom cakes, Hampers, cookies, marmer cake, bogel cake)",
    winners: bestAdsList.map(a => ({
      name: a.ad_name,
      copy: a.copywriting,
      spend: Math.round(a.spend),
      conv: a.conversions,
      cpr: Math.round(a.cpr)
    })),
    losers: worstAdsList.map(a => ({
      name: a.ad_name,
      copy: a.copywriting,
      spend: Math.round(a.spend),
      conv: a.conversions,
      cpr: Math.round(a.cpr)
    }))
  };

  return `
  Kamu adalah Creative Director dan Copywriter iklan digital senior untuk brand: Latezza Cake Hampers.
  Kamu bekerja dengan jujur, kritis, dan analitis.
  Tugas kamu adalah menganalisis copywriting iklan yang berkinerja BAGUS (Winners) dibanding yang JELEK (Losers), kemudian merumuskan audit kreatif serta menciptakan 3-5 ide konten iklan baru yang siap pakai.
  
  Data performa iklan 30 hari terakhir:
  ${JSON.stringify(summaryPayload, null, 2)}
  
  Lakukan tugas berikut:
  1. Identifikasi 3-5 "winningElements" (pola kata, hook, promosi, atau tone suara yang terbukti sukses pada iklan Winners). JIKA TIDAK ADA ELEMEN PEMENANG YANG RELEVAN ATAU BERGUNA, JUJUR AJA DAN ISI TIDAK ADA
  2. Identifikasi 3-5 "losingElements" (pola tulisan, kesalahan penyusunan, atau tone yang membuat iklan Losers boncos/gagal). JIKA TIDAK ADA ELEMEN GAGAL YANG RELEVAN ATAU BERGUNA, JUJUR AJA DAN ISI TIDADA
  3. Ciptakan minimal 3 ide iklan baru ("ideas") yang memuat:
     - "title": Judul konsep iklan (Indonesian)
     - "angle": Sudut pandang promosi / alasan di balik ide tersebut (Indonesian)
     - "copywriting": Draft caption copywriting lengkap yang ramah WhatsApp, memuat emoji manis, hook yang kuat, penawaran menarik, dan Call to Action (CTA) yang jelas. (Indonesian)
     - "visualGuide": Deskripsi panduan visual untuk tim pembuat foto/video iklan. (Indonesian)

  Kembalikan output dalam format JSON bersih dengan struktur berikut:
  {
    "dateRange": "Periode 30 Hari Terakhir",
    "audit": {
      "winningElements": ["...", "..."],
      "losingElements": ["...", "..."]
    },
    "ideas": [
      {
        "title": "...",
        "angle": "...",
        "copywriting": "...",
        "visualGuide": "..."
      }
    ]
  }

  ${userPrompt ? `\n  INSTRUKSI TAMBAHAN DARI USER:\n  "${userPrompt}"\n  Pastikan ide konten yang kamu hasilkan sesuai dengan arahan di atas. Sesuaikan judul, angle, copywriting, dan visual guide agar relevan dengan instruksi user.\n` : ''}
  PENTING: Tulis respons hanya dalam format JSON yang valid. Jangan gunakan blok markdown \`\`\`json. Teks copywriting harus orisinal, menarik, dan menggunakan bahasa Indonesia yang persuasif, natural, dan asik untuk target audiens Latezza.
  `;
}

async function runCreativeAnalysis(log = console, onProgress = null, userPrompt = null) {
  log.info('Starting AI Creative Analysis & Content Ideation automation...');
  notifyProgress(onProgress, 'status', 'Menginisialisasi analisis kreatif...');
  
  const activeApiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  if (!activeApiKey) {
    const errMsg = 'Missing active Gemini API key. Cannot run AI analysis.';
    notifyProgress(onProgress, 'error', errMsg);
    throw new Error(errMsg);
  }

  const accessToken = await db.getSetting('meta_access_token') || process.env.META_ACCESS_TOKEN;
  const adAccountId = await db.getSetting('meta_ad_account_id') || process.env.META_AD_ACCOUNT_ID;

  const dataSource = await db.getSetting('ads_data_source') || 'api';
  log.info(`Using ads data source: ${dataSource}`);

  // 1. Load ads using helper
  const { loadedAds, isFromReport } = await loadAdsFromSource(dataSource, accessToken, adAccountId, log, onProgress);

  // 2. Fetch copywriting metadata if source is API and we loaded ads from report.json
  let creativeCopyMap = new Map();
  if (dataSource === 'api' && isFromReport) {
    creativeCopyMap = await fetchCopywritingFromMeta(accessToken, adAccountId, log, onProgress);
  }

  // 3. Combine and normalize into adsData for Gemini
  const adsData = normalizeAdsData(loadedAds, dataSource, creativeCopyMap);

  if (adsData.length === 0) {
    const errMsg = 'Tidak ditemukan data iklan aktif yang memiliki teks copywriting dan pembelanjaan > Rp 5.000 dalam 30 hari terakhir.';
    notifyProgress(onProgress, 'error', errMsg);
    throw new Error(errMsg);
  }

  notifyProgress(onProgress, 'status', 'Mengkategorikan performa iklan Winners vs Losers...');

  const { bestAdsList, worstAdsList } = classifyWinnerLoserAds(adsData);

  // 4. Formulate Prompt for Gemini using helper
  const prompt = buildCreativePrompt(bestAdsList, worstAdsList, userPrompt);

  // 5. Invoke Gemini API with fallback model loop and exponential backoff
  log.info('Invoking Gemini API for Content Ideation analysis...');
  notifyProgress(onProgress, 'status', 'Menghubungi Gemini AI untuk proses audit & ideasi...');
  const genAI = new GoogleGenerativeAI(activeApiKey);
  const envModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

  const modelsToTry = [envModel, 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-1.5-pro'].filter(Boolean);
  const uniqueModels = [...new Set(modelsToTry)];

  const responseText = await generateCreativeContent(genAI, uniqueModels, prompt, log, onProgress);

  if (!responseText) {
    log.error('All model attempts failed.');
    const errMsg = 'Failed to generate content with Gemini API';
    notifyProgress(onProgress, 'error', errMsg);
    throw new Error(errMsg);
  }

  // Parse result to ensure validity
  let creativeReport;
  try {
    creativeReport = parseCreativeReport(responseText, log);
    notifyProgress(onProgress, 'status', 'Hasil analisis terstruktur berhasil diproses.');
  } catch (err) {
    notifyProgress(onProgress, 'error', err.message);
    throw err;
  }

  // 6. Save report to DB settings table
  await db.setSetting('creative_analysis_report', JSON.stringify(creativeReport));
  log.info('✅ Saved creative report to database settings.');
  notifyProgress(onProgress, 'status', 'Menyimpan laporan kreatif ke database...');

  // 7. Broadcast summary to WA target group
  await broadcastCreativeReportToWhatsApp(creativeReport, log);

  notifyProgress(onProgress, 'status', 'Analisis kreatif selesai sepenuhnya!');
  return creativeReport;
}

/**
 * Helper for retries with backoff and streaming support for creative analysis
 */
async function generateCreativeWithRetry(genAI, modelName, prompt, log, onProgress, retries = 3, delay = 2000) {
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
      
      return await processStreamResponse(result, modelName, log, onProgress);
    } catch (err) {
      log.warn(`Attempt ${i + 1} failed for ${modelName}: ${err.message}`);
      if (i === retries - 1) throw err;
      log.info(`Waiting ${delay}ms before next retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // exponential backoff
    }
  }
}

/**
 * Helper to run creative content generation with model fallback
 */
async function generateCreativeContent(genAI, uniqueModels, prompt, log, onProgress) {
  let lastError = null;
  for (const modelName of uniqueModels) {
    try {
      const responseText = await generateCreativeWithRetry(genAI, modelName, prompt, log, onProgress, 3, 2000);
      log.info(`Successfully generated content using model: ${modelName}`);
      return responseText;
    } catch (err) {
      log.warn(`All attempts failed for model ${modelName}. Moving to next model...`);
      lastError = err;
    }
  }
  throw lastError || new Error('Failed to generate content with Gemini API');
}

module.exports = {
  runCreativeAnalysis
};
