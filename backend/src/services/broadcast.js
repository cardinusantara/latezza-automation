const path = require('node:path');
const fs = require('node:fs');
const db = require('../db');
const whatsappService = require('./whatsapp');

/**
 * Converts a stored media URL (e.g. /uploads/foo.jpg) to an absolute
 * filesystem path that Baileys can read directly.
 * Falls back to the original value if it doesn't start with /uploads/.
 */
function resolveMediaPath(mediaUrl) {
  if (mediaUrl && mediaUrl.startsWith('/uploads/')) {
    const filename = mediaUrl.replace('/uploads/', '');
    return path.join(__dirname, '../../public/uploads', filename);
  }
  return mediaUrl;
}

let isRunning = false;
let globalLog = console;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isLidJid = (jid = '') => /@(lid|hosted\.lid)$/i.test(jid);

async function canSendToBroadcastTarget(session, jid) {
  if (isLidJid(jid)) {
    globalLog.info(`Skipping WhatsApp registration check for LID target ${jid}; Baileys cannot verify LIDs with onWhatsApp.`);
    return true;
  }

  try {
    const cleanPhone = jid.split('@')[0];
    const [waCheck] = await session.sock.onWhatsApp(cleanPhone);
    return !!(waCheck && waCheck.exists);
  } catch (checkErr) {
    globalLog.warn(`Failed to verify WhatsApp existence for ${jid}: ${checkErr.message}`);
    return true;
  }
}

/**
 * Parses spintax format in a text (e.g., "{Halo|Hai} {{name}}")
 */
function parseSpintax(text) {
  if (!text) return '';
  const spintaxPattern = /\{([^{}]+?\|[^{}]+?)\}/g;
  let matches;
  let newText = text;
  
  // Keep replacing until no more spintax patterns are found
  while ((matches = spintaxPattern.exec(newText)) !== null) {
    const choices = matches[1].split('|');
    const choice = choices[Math.floor(Math.random() * choices.length)];
    newText = newText.replace(matches[0], choice);
    // Reset index since the string length has changed
    spintaxPattern.lastIndex = 0;
  }
  return newText;
}

/**
 * Replaces placeholders and parses spintax to produce a personalized message
 */
function personalizeMessage(template, customer) {
  if (!template) return '';
  let text = template;
  
  // Replace standard placeholders
  text = text.replace(/\{\{name\}\}/gi, customer.name || 'Kak');
  text = text.replace(/\{\{phone\}\}/gi, customer.phone_number || '');
  text = text.replace(/\{\{status\}\}/gi, customer.status || '');
  text = text.replace(/\{\{notes\}\}/gi, customer.notes || '');
  
  // Parse spintax
  return parseSpintax(text);
}

/**
 * Creates a campaign and generates its corresponding queue items
 */
async function createCampaignAndQueue({ name, sessionId = 'default', template, mediaType = 'text', mediaUrl = null, targetFilter = 'all', selectedPhones = [] }) {
  // 1. Fetch target customers based on filter
  const targets = await db.getBroadcastTargets(sessionId, targetFilter, selectedPhones);
  if (targets.length === 0) {
    throw new Error('Tidak ada target customer yang cocok dengan filter yang dipilih.');
  }

  // 2. Create the campaign in draft status
  const campaign = await db.createCampaign({
    name,
    sessionId,
    messageTemplate: template,
    mediaType,
    mediaUrl,
    scheduledAt: null
  });

  // 3. Generate queue items with personalized messages
  let addedCount = 0;
  for (const customer of targets) {
    // Skip if customer opted out
    if (customer.status === 'opt_out') continue;

    const personalizedMessage = personalizeMessage(template, customer);
    await db.addQueueItem({
      campaignId: campaign.id,
      phoneNumber: customer.phone_number,
      sessionId,
      personalizedMessage
    });
    addedCount++;
  }

  // 4. Update campaign with total targets and set status to queued
  const updatedCampaign = await db.pool.query(
    `UPDATE broadcast_campaigns 
     SET total_targets = $1, status = 'queued', updated_at = NOW() 
     WHERE id = $2 
     RETURNING *`,
    [addedCount, campaign.id]
  );

  return updatedCampaign.rows[0];
}

/**
 * Background worker loop that processes queue items sequentially
 */
async function runWorkerLoop() {
  while (isRunning) {
    try {
      // 1. Get next pending item
      const nextItem = await db.getNextPendingQueueItem();
      if (!nextItem) {
        // No pending items to process, wait 5 seconds before polling again (configurable for testing)
        const pollInterval = Number.parseInt(process.env.BROADCAST_POLL_INTERVAL_MS || '5000', 10);
        await sleep(pollInterval);
        continue;
      }

      const { id, campaign_id, phone_number, session_id, personalized_message } = nextItem;

      // 2. Double-check campaign and session readiness
      const campaign = await db.getCampaignById(campaign_id);
      if (!campaign || campaign.status !== 'processing') {
        // If the campaign is not active (e.g. paused, draft), skip this item
        // Note: getNextPendingQueueItem only returns items for 'processing' campaigns,
        // but we double check to avoid race conditions.
        const skipInterval = Number.parseInt(process.env.BROADCAST_SKIP_INTERVAL_MS || '1000', 10);
        await sleep(skipInterval);
        continue;
      }

      // Check if WhatsApp session is ready
      if (!whatsappService.isReady(session_id)) {
        globalLog.warn(`Session "${session_id}" is not ready. Pausing campaign ${campaign_id}.`);
        await db.updateCampaignStatus(campaign_id, 'paused');
        await db.updateQueueItemStatus(id, 'pending', 'Session WhatsApp terputus. Silakan sambungkan kembali.');
        continue;
      }

      // 3. Mark queue item as sending
      await db.updateQueueItemStatus(id, 'sending');

      // Get session socket reference
      const session = whatsappService.sessions.get(session_id);
      
      // 4. Pre-flight check: Verify phone-number JIDs exist on WhatsApp.
      // Baileys does not support onWhatsApp for @lid targets, so those are sent directly.
      const exists = await canSendToBroadcastTarget(session, phone_number);

      if (!exists) {
        globalLog.info(`Target ${phone_number} is not registered on WhatsApp. Marking as failed.`);
        await db.updateQueueItemStatus(id, 'failed', 'Nomor tidak terdaftar di WhatsApp');
        await db.incrementCampaignStats(campaign_id, 'failed_count');
        await checkAndCompleteCampaign(campaign_id);
        continue;
      }

      // 5. Simulate human typing behavior
      try {
        await session.sock.sendPresenceUpdate('composing', phone_number);
        // Delay based on character length: 30ms per character, min 1.5s, max 5s (configurable for testing)
        const minTyping = Number.parseInt(process.env.BROADCAST_MIN_TYPING_MS || '1500', 10);
        const maxTyping = Number.parseInt(process.env.BROADCAST_MAX_TYPING_MS || '5000', 10);
        const charTyping = Number.parseInt(process.env.BROADCAST_CHAR_TYPING_MS || '30', 10);
        const typingDelay = Math.min(maxTyping, Math.max(minTyping, personalized_message.length * charTyping));
        await sleep(typingDelay);
        await session.sock.sendPresenceUpdate('paused', phone_number);
      } catch (presenceErr) {
        globalLog.warn(`Failed to send presence update for ${phone_number}: ${presenceErr.message}`);
      }

      // 6. Prepare message content
      let content = { text: personalized_message };
      if (campaign.media_type === 'image' && campaign.media_url) {
        const absPath = resolveMediaPath(campaign.media_url);
        if (!fs.existsSync(absPath)) {
          throw new Error(`Media file not found: ${absPath} (stored url: ${campaign.media_url})`);
        }
        content = {
          image: fs.readFileSync(absPath),
          caption: personalized_message
        };
      } else if (campaign.media_type === 'video' && campaign.media_url) {
        const absPath = resolveMediaPath(campaign.media_url);
        if (!fs.existsSync(absPath)) {
          throw new Error(`Media file not found: ${absPath} (stored url: ${campaign.media_url})`);
        }
        content = {
          video: fs.readFileSync(absPath),
          caption: personalized_message
        };
      }

      // 7. Send message via Baileys
      globalLog.info(`Sending broadcast message to ${phone_number} (Campaign: ${campaign.name})...`);
      await session.sock.sendMessage(phone_number, content);

      // 8. Log to chat history for CRM visibility
      await db.saveChatMessage(phone_number, 'model', personalized_message, session_id);

      // 9. Update queue item status to sent
      await db.updateQueueItemStatus(id, 'sent');
      await db.incrementCampaignStats(campaign_id, 'sent_count');

      // 10. Check if campaign is completed
      await checkAndCompleteCampaign(campaign_id);

      // 11. Implement Anti-Ban Cooldown Jitter delay
      // In production: base delay 20s + random jitter 15s. In testing/dev, can be configured lower.
      const baseDelay = Number.parseInt(process.env.BROADCAST_BASE_DELAY_MS || '20000', 10);
      const maxJitter = Number.parseInt(process.env.BROADCAST_MAX_JITTER_MS || '15000', 10);
      const cooldown = baseDelay + Math.floor(Math.random() * maxJitter);
      
      globalLog.info(`Cooling down for ${(cooldown / 1000).toFixed(1)} seconds to prevent WhatsApp rate-limiting...`);
      await sleep(cooldown);

    } catch (err) {
      globalLog.error(`Error in worker loop step: ${err.message}`);
      // Sleep briefly on general error to avoid fast loops
      await sleep(5000);
    }
  }
}

/**
 * Checks if a campaign has any remaining pending items, and completes it if not
 */
async function checkAndCompleteCampaign(campaignId) {
  try {
    const remaining = await db.getPendingQueueCount(campaignId);
    if (remaining === 0) {
      globalLog.info(`Campaign ${campaignId} has completed all sending tasks.`);
      await db.updateCampaignStatus(campaignId, 'completed');
    }
  } catch (err) {
    globalLog.error(`Failed to check campaign completion for ${campaignId}: ${err.message}`);
  }
}

/**
 * Starts the background queue worker
 */
async function startQueueWorker(log = console) {
  if (isRunning) return;
  globalLog = log;
  isRunning = true;
  globalLog.info('Starting WhatsApp Broadcast Queue Worker...');
  runWorkerLoop().catch(err => {
    globalLog.error(`Broadcast Queue Worker encountered fatal error: ${err.message}`);
    isRunning = false;
  });
}

/**
 * Stops the background queue worker
 */
function stopQueueWorker() {
  if (!isRunning) return;
  globalLog.info('Stopping WhatsApp Broadcast Queue Worker...');
  isRunning = false;
}

async function generateAICopywriting({ prompt, customerContext = '' }) {
  const activeApiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  if (!activeApiKey) {
    throw new Error('Gemini API Key tidak dikonfigurasi.');
  }

  const genAI = new GoogleGenerativeAI(activeApiKey);
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const model = genAI.getGenerativeModel({ model: modelName });

  const systemInstruction = `
Anda adalah copywriter profesional kelas dunia untuk Latezza Cake, toko kue premium di Indonesia.
Tugas Anda adalah menulis draf pesan broadcast WhatsApp yang sangat menarik, ramah, persuasif, dan natural (terlihat seperti ditulis manusia, bukan bot).

Aturan Penulisan:
1. JANGAN gunakan format markdown tebal (**), miring (*), atau header (#). Tulis dalam teks polos (plaintext) sepenuhnya agar terlihat alami.
2. Gunakan emoji secara ramah dan tidak berlebihan.
3. Selalu sapa pelanggan secara personal dengan menyertakan placeholder {{name}}.
4. Perbaiki draf pesan agar lebih jelas, natural, persuasif, dan siap dikirim sebagai broadcast WhatsApp tanpa mengubah inti penawaran.
5. Di akhir setiap variasi, sertakan instruksi opt-out yang ramah: "Ketik 9 untuk berhenti menerima pesan ini."

Format Output harus berupa JSON terstruktur yang valid dengan skema berikut:
{
  "variations": [
    "Pesan variasi 1",
    "Pesan variasi 2",
    "Pesan variasi 3"
  ]
}
`;

  const userPrompt = `
Tolong buatkan pesan broadcast promosi berdasarkan detail berikut:
- Deskripsi Promosi/Pesan: "${prompt}"
- Konteks Tambahan: "${customerContext}"

Harap kembalikan hanya JSON yang sesuai dengan format yang ditentukan, tanpa pembuka atau penutup markdown.
`;

  const result = await model.generateContent([
    { text: systemInstruction },
    { text: userPrompt }
  ]);

  const responseText = result.response.text().trim();
  
  // Log Gemini usage
  const usage = result.response.usageMetadata;
  if (usage) {
    await db.saveUsageLog({
      feature: 'broadcast_generation',
      modelName,
      inputTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
      cachedTokens: usage.cachedContentTokenCount
    });
  }

  // Clean up potential markdown formatting in JSON response
  const cleanJsonText = responseText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleanJsonText);
  } catch (e) {
    // Fallback: if JSON parsing fails, split by lines or return a single variation
    return {
      variations: [responseText]
    };
  }
}

const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = {
  isLidJid,
  canSendToBroadcastTarget,
  parseSpintax,
  personalizeMessage,
  createCampaignAndQueue,
  startQueueWorker,
  stopQueueWorker,
  isRunning: () => isRunning,
  generateAICopywriting
};


