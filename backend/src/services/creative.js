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
    if (spec.link_data && spec.link_data.message) return spec.link_data.message;
    if (spec.video_data && spec.video_data.message) return spec.video_data.message;
    if (spec.photo_data && spec.photo_data.message) return spec.photo_data.message;
  }
  return '';
}

/**
 * Main analysis runner
 */
async function runCreativeAnalysis(log = console, onProgress = null) {
  log.info('Starting AI Creative Analysis & Content Ideation automation...');
  if (onProgress) onProgress({ type: 'status', message: 'Menginisialisasi analisis kreatif...' });
  
  const activeApiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  if (!activeApiKey) {
    const errMsg = 'Missing active Gemini API key. Cannot run AI analysis.';
    if (onProgress) onProgress({ type: 'error', message: errMsg });
    throw new Error(errMsg);
  }

  const accessToken = await db.getSetting('meta_access_token') || process.env.META_ACCESS_TOKEN;
  const adAccountId = await db.getSetting('meta_ad_account_id') || process.env.META_AD_ACCOUNT_ID;

  let adsData = [];

  // 1. Ensure credentials are present
  if (!accessToken || !adAccountId) {
    const errMsg = 'Kredensial Meta Ads API (Access Token / Ad Account ID) tidak terkonfigurasi di Pengaturan.';
    if (onProgress) onProgress({ type: 'error', message: errMsg });
    throw new Error(errMsg);
  }

  // 2. Fetch live API data
  if (onProgress) onProgress({ type: 'status', message: 'Mengunduh data iklan & metrik dari Meta Ads API...' });
  log.info('Fetching live creative & performance stats from Meta Ads API...');
  const rawAds = await fetchMetaAdsCreatives(accessToken, adAccountId);
  const rawInsights = await fetchMetaAdsInsights(accessToken, adAccountId);

  log.info(`Fetched ${rawAds.length} ads and ${rawInsights.length} insight rows. Mapping...`);
  if (onProgress) onProgress({ type: 'status', message: `Berhasil mengunduh ${rawAds.length} iklan dan ${rawInsights.length} baris metrik.` });

  // Map insights by ad_id
  const insightsMap = new Map();
  rawInsights.forEach(ins => {
    insightsMap.set(ins.ad_id, ins);
  });

  // Combine metadata and insights
  rawAds.forEach(ad => {
    const ins = insightsMap.get(ad.id);
    const spend = ins ? parseFloat(ins.spend) || 0 : 0;
    const impressions = ins ? parseInt(ins.impressions, 10) || 0 : 0;
    const reach = ins ? parseInt(ins.reach, 10) || 0 : 0;
    
    let conversions = 0;
    if (ins && ins.actions && Array.isArray(ins.actions)) {
      const action = ins.actions.find(a => 
        a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
        a.action_type === 'messaging_first_reply' ||
        a.action_type === 'purchase' ||
        a.action_type === 'lead'
      );
      if (action) conversions = parseInt(action.value, 10) || 0;
    }

    const cpr = conversions > 0 ? spend / conversions : 0;
    const copywriting = extractCopywriting(ad.creative);

    if (copywriting && spend > 5000) {
      adsData.push({
        ad_id: ad.id,
        ad_name: ad.name,
        copywriting: copywriting,
        spend: spend,
        impressions: impressions,
        reach: reach,
        conversions: conversions,
        cpr: cpr,
        status: ad.status
      });
    }
  });

  if (adsData.length === 0) {
    const errMsg = 'Tidak ditemukan data iklan aktif yang memiliki teks copywriting dan pembelanjaan > Rp 5.000 dalam 30 hari terakhir.';
    if (onProgress) onProgress({ type: 'error', message: errMsg });
    throw new Error(errMsg);
  }

  if (onProgress) onProgress({ type: 'status', message: 'Mengkategorikan performa iklan Winners vs Losers...' });

  // 2. Classify into winning and losing creatives
  // Group 1: Good (conversions > 0, sorted by Conversions desc, CPR asc)
  const goodAds = [...adsData]
    .filter(a => a.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions || a.cpr - b.cpr);

  // Group 2: Bad (spend > 0, sorted by conversions asc, spend desc)
  const badAds = [...adsData]
    .sort((a, b) => a.conversions - b.conversions || b.spend - a.spend);

  const bestAdsList = goodAds.slice(0, 3);
  const worstAdsList = badAds.slice(0, 3).filter(a => !bestAdsList.some(b => b.ad_id === a.ad_id));

  // 3. Formulate Prompt for Gemini
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

  const prompt = `
  Kamu adalah Creative Director dan Copywriter iklan digital senior untuk brand: Latezza Cake Hampers.
  Kamu bekerja dengan jujur, kritis, dan analitis.
  Tugas kamu adalah menganalisis copywriting iklan yang berkinerja BAGUS (Winners) dibanding yang JELEK (Losers), kemudian merumuskan audit kreatif serta menciptakan 3-5 ide konten iklan baru yang siap pakai.
  
  Data performa iklan 30 hari terakhir:
  ${JSON.stringify(summaryPayload, null, 2)}
  
  Lakukan tugas berikut:
  1. Identifikasi 3-5 "winningElements" (pola kata, hook, promosi, atau tone suara yang terbukti sukses pada iklan Winners). JIKA TIDAK ADA ELEMEN PEMENANG YANG RELEVAN ATAU BERGUNA, JUJUR AJA DAN ISI TIDAK ADA
  2. Identifikasi 3-5 "losingElements" (pola tulisan, kesalahan penyusunan, atau tone yang membuat iklan Losers boncos/gagal). JIKA TIDAK ADA ELEMEN GAGAL YANG RELEVAN ATAU BERGUNA, JUJUR AJA DAN ISI TIDAK ADA
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

  PENTING: Tulis respons hanya dalam format JSON yang valid. Jangan gunakan blok markdown \`\`\`json. Teks copywriting harus orisinal, menarik, dan menggunakan bahasa Indonesia yang persuasif, natural, dan asik untuk target audiens Latezza.
  `;

  // 4. Invoke Gemini API with fallback model loop and exponential backoff
  log.info('Invoking Gemini API for Content Ideation analysis...');
  if (onProgress) onProgress({ type: 'status', message: 'Menghubungi Gemini AI untuk proses audit & ideasi...' });
  const genAI = new GoogleGenerativeAI(activeApiKey);
  const dbModel = await db.getSetting('gemini_model');

  // Order of preference: User configured, Gemini 2.5 Flash, Gemini 1.5 Pro
  const modelsToTry = [dbModel, 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-1.5-pro'].filter(Boolean);
  const uniqueModels = [...new Set(modelsToTry)];

  let responseText = '';
  let lastError = null;

  // Helper for retries with backoff and streaming support
  async function generateWithRetry(modelName, retries = 3, delay = 2000) {
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
        delay *= 2; // exponential backoff
      }
    }
  }

  for (const modelName of uniqueModels) {
    try {
      responseText = await generateWithRetry(modelName, 3, 2000);
      log.info(`Successfully generated content using model: ${modelName}`);
      break; // stop trying if successful
    } catch (err) {
      log.warn(`All attempts failed for model ${modelName}. Moving to next model...`);
      lastError = err;
    }
  }

  if (!responseText) {
    log.error('All model attempts failed.');
    const errMsg = lastError ? lastError.message : 'Failed to generate content with Gemini API';
    if (onProgress) onProgress({ type: 'error', message: errMsg });
    throw lastError || new Error(errMsg);
  }

  // Parse result to ensure validity
  let creativeReport;
  try {
    creativeReport = JSON.parse(responseText);
    creativeReport.generatedAt = new Date().toISOString();
    creativeReport.isMock = false;
    log.info('AI Creative Analysis output parsed successfully.');
    if (onProgress) onProgress({ type: 'status', message: 'Hasil analisis terstruktur berhasil diproses.' });
  } catch (err) {
    log.error('Failed to parse Gemini output. Raw response:', responseText);
    const parseErrMsg = 'Gemini did not return valid JSON for creative report.';
    if (onProgress) onProgress({ type: 'error', message: parseErrMsg });
    throw new Error(parseErrMsg);
  }

  // 5. Save report to DB settings table
  await db.setSetting('creative_analysis_report', JSON.stringify(creativeReport));
  log.info('✅ Saved creative report to database settings.');
  if (onProgress) onProgress({ type: 'status', message: 'Menyimpan laporan kreatif ke database...' });

  // 6. Broadcast summary to WA target group
  const targetJid = await db.getSetting('whatsapp_group_jid') || process.env.WHATSAPP_GROUP_JID || '120363427625298309@g.us';
  if (whatsappService.isReady()) {
    try {
      let waText = `💡 *REKOMENDASI IDE KONTEN BARU DARI AI*\n` +
        `Period: ${creativeReport.dateRange}\n\n` +
        `Berikut adalah ide konten baru hasil audit copywriting iklan winners vs losers:\n\n`;

      creativeReport.ideas.forEach((idea, idx) => {
        waText += `*${idx + 1}. ${idea.title}*\n` +
          `• _Angle:_ ${idea.angle}\n` +
          `• _Visual:_ ${idea.visualGuide}\n` +
          `• _Draft Copy:_ "${idea.copywriting.substring(0, 150)}..."\n\n`;
      });

      waText += `🔗 _Lihat ide & salin copywriting lengkap di Dashboard!_`;

      log.info(`Sending creative analysis summary broadcast to WhatsApp Group: ${targetJid}`);
      await whatsappService.sendMessage(targetJid, { text: waText });
      if (onProgress) onProgress({ type: 'status', message: 'Mengirimkan ringkasan laporan ke WhatsApp Group...' });
    } catch (waErr) {
      log.error(`Failed to send WhatsApp broadcast for creative report: ${waErr.message}`);
    }
  } else {
    log.warn('WhatsApp service is disconnected. Skipped broadcast.');
  }

  if (onProgress) onProgress({ type: 'status', message: 'Analisis kreatif selesai sepenuhnya!' });
  return creativeReport;
}

module.exports = {
  runCreativeAnalysis
};
