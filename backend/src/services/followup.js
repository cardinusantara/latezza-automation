const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../db');
const whatsappService = require('./whatsapp');

/**
 * Helper to process follow-up for a single customer lead
 */
async function processSingleFollowUp(lead, model, activeModel, userInstruction, log) {
  const jid = lead.phone_number;
  const sessionId = lead.session_id || 'default';

  if (!whatsappService.isReady(sessionId)) {
    log.warn(`WhatsApp session "${sessionId}" is not ready. Skipping follow-up for customer ${jid}.`);
    return;
  }

  const historyRows = await db.getChatHistory(jid, 10, sessionId);

  if (historyRows.length === 0) return;

  const historyText = historyRows
    .map(h => `${h.role === 'model' ? 'AI Agent' : 'Customer'}: ${h.content}`)
    .join('\n');

  // The strict output enforcement block always appended at the end
  const strictOutputRule = `\nINSTRUKSI OUTPUT (WAJIB DIIKUTI):\n- Tulis HANYA satu pesan WhatsApp siap kirim. TIDAK BOLEH ada opsi, penjelasan, tips, atau teks lain selain pesan itu sendiri.\n- JANGAN gunakan format markdown (tidak ada **, *, >, #). Teks polos saja.\n- Mulai dengan sapaan ke "{name}", contoh: "Halo Kak {name}!"\n- Maksimal 2-3 kalimat. Akhiri dengan kalimat yang mengundang respons.\n\nOutput HANYA teks pesan WhatsApp-nya saja, tidak ada yang lain.`;

  let followUpPrompt;

  if (!userInstruction) {
    // No custom instruction – use built-in default
    followUpPrompt = `Anda adalah staf CS toko kue Latezza yang sedang mengirim pesan WhatsApp follow-up ke kustomer bernama "{name}".

Riwayat percakapan sebelumnya:
---
{history}
---
Alasan follow-up: "{reason}"

Gaya pesan: Ramah, santai, tidak memaksa. Ingatkan produk yang sempat ditanyakan atau tanyakan apakah ada yang bisa dibantu lebih lanjut.
${strictOutputRule}`;
  } else if (userInstruction.includes('{history}')) {
    // User wrote a full custom prompt template – use as-is but enforce strict output
    followUpPrompt = userInstruction + `\n${strictOutputRule}`;
  } else {
    // User wrote a natural-language instruction (no template variables) – auto-wrap
    followUpPrompt = `Anda adalah staf CS toko kue Latezza yang sedang mengirim pesan WhatsApp follow-up ke kustomer bernama "{name}".

Riwayat percakapan sebelumnya:
---
{history}
---
Alasan follow-up: "{reason}"

Instruksi khusus dari admin:
${userInstruction}
${strictOutputRule}`;
  }

  // Format dynamic placeholders
  const formattedPrompt = followUpPrompt
    .replaceAll('{history}', historyText)
    .replaceAll('{reason}', lead.follow_up_reason || 'Tertarik produk')
    .replaceAll('{name}', lead.name || 'Kak');

  try {
    const result = await model.generateContent(formattedPrompt);
    const replyText = result.response.text().trim();

    // Log Gemini usage
    const usage = result.response.usageMetadata;
    if (usage) {
      await db.saveUsageLog({
        feature: 'followup',
        modelName: activeModel,
        inputTokens: usage.promptTokenCount,
        outputTokens: usage.candidatesTokenCount,
        cachedTokens: usage.cachedContentTokenCount
      });
    }

    if (replyText) {
      log.info(`Sending proactive follow-up to ${jid} on session ${sessionId}...`);
      await whatsappService.sendMessage(jid, { text: replyText }, sessionId);

      await db.saveChatMessage(jid, 'model', replyText, sessionId);
      await db.createOrUpdateCustomer(jid, null, { needs_follow_up: false, follow_up_reason: null }, sessionId);
    }
  } catch (err) {
    log.error(`Failed to follow up for ${jid}: ${err.message}`);
  }
}

/**
 * Scan database for customer leads requiring follow-up and send personalized reminders
 */
async function runProactiveFollowUps(log = console, ignoreThreshold = false) {
  if (!whatsappService.isReady()) {
    log.warn('WhatsApp connection is not ready. Skipping follow-ups.');
    return;
  }

  try {
    const delayHours = Number.parseInt(await db.getSetting('followup_hours') || '24', 10);
    const leads = await db.getCustomersForFollowUp(delayHours, ignoreThreshold);
    log.info(`Found ${leads.length} leads that require follow-up.`);

    const activeApiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
    if (!activeApiKey) {
      log.warn('Gemini API Key is missing. Skipping follow-ups.');
      return;
    }

    const genAI = new GoogleGenerativeAI(activeApiKey);
    const activeModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    const model = genAI.getGenerativeModel({ model: activeModel });
    const userInstruction = await db.getSetting('followup_instruction');

    for (const lead of leads) {
      await processSingleFollowUp(lead, model, activeModel, userInstruction, log);
    }
  } catch (err) {
    log.error(`Error during runProactiveFollowUps: ${err.message}`);
  }
}

module.exports = {
  runProactiveFollowUps
};
