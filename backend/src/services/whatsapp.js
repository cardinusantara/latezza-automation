const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const path = require('node:path');
const fs = require('node:fs');
const db = require('../db');
const agent = require('../agent');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const SESSION_BASE_DIR = path.join(__dirname, '../../whatsapp-sessions');

// Pool of active sessions: sessionId -> { sock, ready, qr, status, name }
const sessions = new Map();

// In-Memory Rate Limiter Cache
const rateLimitCache = new Map();

// In-Memory Debounce Cache for incoming messages
const debounceCache = new Map();
const DEBOUNCE_DELAY_MS = Number.parseInt(process.env.DEBOUNCE_DELAY_MS || '3000', 10);

// In-Memory lock to prevent concurrent AI processing of the same customer
const processingCustomers = new Set();

const WHATSAPP_FENCE_PLACEHOLDER = '\x00FENCE';
const WHATSAPP_INLINE_CODE_PLACEHOLDER = '\x00CODE';
const WHATSAPP_PLACEHOLDER_TERMINATOR = '\x00';

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markdownToWhatsApp(text) {
  if (!text) {
    return text;
  }

  const fences = [];
  let result = text.replace(/```[\s\S]*?```/g, (match) => {
    fences.push(match);
    return `${WHATSAPP_FENCE_PLACEHOLDER}${fences.length - 1}${WHATSAPP_PLACEHOLDER_TERMINATOR}`;
  });

  const inlineCodes = [];
  result = result.replace(/`[^`\n]+`/g, (match) => {
    inlineCodes.push(match);
    return `${WHATSAPP_INLINE_CODE_PLACEHOLDER}${inlineCodes.length - 1}${WHATSAPP_PLACEHOLDER_TERMINATOR}`;
  });

  // Convert combined GFM strong+emphasis before plain strong so the plain
  // rules cannot leave literal `**` around the inner emphasis.
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, '*_$1_*');
  result = result.replace(/___(.+?)___/g, '*_$1_*');
  result = result.replace(/\*\*_(.+?)_\*\*/g, '*_$1_*');
  result = result.replace(/__\*(.+?)\*__/g, '*_$1_*');
  result = result.replace(/_\*\*(.+?)\*\*_/g, '*_$1_*');
  result = result.replace(/\*__(.+?)__\*/g, '*_$1_*');

  result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');
  result = result.replace(/__(.+?)__/g, '*$1*');
  result = result.replace(/~~(.+?)~~/g, '~$1~');

  const terminator = escapeRegExp(WHATSAPP_PLACEHOLDER_TERMINATOR);
  result = result.replace(
    new RegExp(`${escapeRegExp(WHATSAPP_INLINE_CODE_PLACEHOLDER)}(\\d+)${terminator}`, 'g'),
    (_, idx) => inlineCodes[Number(idx)] ?? ''
  );
  result = result.replace(
    new RegExp(`${escapeRegExp(WHATSAPP_FENCE_PLACEHOLDER)}(\\d+)${terminator}`, 'g'),
    (_, idx) => fences[Number(idx)] ?? ''
  );
  return result;
}

async function processDebouncedMessage(cacheKey, log = console) {
  const data = debounceCache.get(cacheKey);
  if (!data) return;

  // Immediately remove from cache so any subsequent messages start a new debounce timer
  debounceCache.delete(cacheKey);

  const { jid, sessionId, senderName, sock, texts, imageParts, imageUrls, voiceUrls, messageKeys } = data;

  const lockKey = `${sessionId}:${jid}`;
  if (processingCustomers.has(lockKey)) {
    log.info(`[Lock] Customer ${lockKey} is already being processed. Queueing this message for retry...`);
    try {
      const finalImagePart = imageParts.length > 0 ? imageParts[imageParts.length - 1] : null;
      const finalImageUrl = imageUrls.length > 0 ? imageUrls[imageUrls.length - 1] : null;
      const finalVoiceUrl = voiceUrls.length > 0 ? voiceUrls[voiceUrls.length - 1] : null;
      const combinedText = texts.map(t => t.trim()).filter(Boolean).join('\n');

      await db.upsertPendingReply(
        jid,
        sessionId,
        combinedText,
        finalImagePart,
        finalImageUrl,
        finalVoiceUrl,
        senderName,
        messageKeys
      );
    } catch (dbErr) {
      log.error(`Failed to upsert pending reply in DB: ${dbErr.message}`);
    }
    return;
  }

  // Acquire in-memory lock
  processingCustomers.add(lockKey);

  try {
    // Combine all texts. Filter out empty messages.
    const combinedText = texts.map(t => t.trim()).filter(Boolean).join('\n');
    
    // Choose the latest media (if any)
    const finalImagePart = imageParts.length > 0 ? imageParts[imageParts.length - 1] : null;
    const finalImageUrl = imageUrls.length > 0 ? imageUrls[imageUrls.length - 1] : null;
    const finalVoiceUrl = voiceUrls.length > 0 ? voiceUrls[voiceUrls.length - 1] : null;

    log.info(`🤖 Processing debounced messages for ${senderName} (${jid}) on session ${sessionId}. Total messages: ${texts.length}. Combined Text: "${combinedText}"`);

    // Dynamic typing status during actual Gemini processing
    await sock.sendPresenceUpdate('composing', jid);

    const replyText = await agent.handleIncomingMessage(
      jid,
      combinedText,
      senderName,
      finalImagePart,
      finalImageUrl,
      sessionId,
      finalVoiceUrl
    );

    await sock.sendPresenceUpdate('paused', jid);

    // Mark messages as read ONLY after successful AI completion
    if (messageKeys && messageKeys.length > 0) {
      try {
        await sock.readMessages(messageKeys);
      } catch (readErr) {
        log.warn(`Failed to read messages in processDebouncedMessage: ${readErr.message}`);
      }
    }

    await sock.sendMessage(jid, { text: markdownToWhatsApp(replyText) });
  } catch (err) {
    log.error(`❌ Error in processDebouncedMessage for ${jid} on session ${sessionId}: ${err.message}`);

    // Fallback: Queue failed message in pending_ai_replies for background retries
    try {
      const finalImagePart = imageParts.length > 0 ? imageParts[imageParts.length - 1] : null;
      const finalImageUrl = imageUrls.length > 0 ? imageUrls[imageUrls.length - 1] : null;
      const finalVoiceUrl = voiceUrls.length > 0 ? voiceUrls[voiceUrls.length - 1] : null;
      const combinedText = texts.map(t => t.trim()).filter(Boolean).join('\n');

      log.info(`Queueing failed message from ${jid} for retry...`);
      await db.upsertPendingReply(
        jid,
        sessionId,
        combinedText,
        finalImagePart,
        finalImageUrl,
        finalVoiceUrl,
        senderName,
        messageKeys
      );
    } catch (dbErr) {
      log.error(`Failed to upsert pending reply in DB: ${dbErr.message}`);
    }
  } finally {
    // Release in-memory lock
    processingCustomers.delete(lockKey);
  }
}

async function isRateLimited(jid, sessionId) {
  const cacheKey = `${sessionId}:${jid}`;
  const now = Date.now();
  const windowMs = Number.parseInt(await db.getSetting('rate_limit_window') || process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const maxMsg = Number.parseInt(await db.getSetting('rate_limit_max') || process.env.RATE_LIMIT_MAX_MSG || '5', 10);

  if (!rateLimitCache.has(cacheKey)) {
    rateLimitCache.set(cacheKey, [now]);
    return false;
  }
  const timestamps = rateLimitCache.get(cacheKey).filter(ts => now - ts < windowMs);
  if (timestamps.length >= maxMsg) {
    return true;
  }
  timestamps.push(now);
  rateLimitCache.set(cacheKey, timestamps);
  return false;
}

/**
 * Transcribe audio buffer using Gemini API
 */
async function transcribeAudio(audioBuffer, mimeType, log = console) {
  const activeApiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  if (!activeApiKey) {
    throw new Error('Active Gemini API Key is missing for audio transcription.');
  }

  const genAI = new GoogleGenerativeAI(activeApiKey);
  const cleanMime = mimeType.split(';')[0].trim();

  const audioPart = {
    inlineData: {
      data: audioBuffer.toString('base64'),
      mimeType: cleanMime
    }
  };

  const prompt = 'Tuliskan transkripsi lengkap dari audio berikut dalam bahasa Indonesia. Tuliskan hanya hasil transkripsinya saja secara harfiah, tanpa penjelasan, komentar, pembukaan, atau tanda kutip tambahan.';

  const configuredModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  
  try {
    log.info(`🤖 Attempting transcription with configured model: ${configuredModel}...`);
    const model = genAI.getGenerativeModel({ model: configuredModel });
    const result = await model.generateContent([audioPart, prompt]);

    // Log Gemini usage
    const usage = result.response.usageMetadata;
    if (usage) {
      await db.saveUsageLog({
        feature: 'audio_transcription',
        modelName: configuredModel,
        inputTokens: usage.promptTokenCount,
        outputTokens: usage.candidatesTokenCount,
        cachedTokens: usage.cachedContentTokenCount
      });
    }

    return result.response.text().trim();
  } catch (err) {
    log.warn(`⚠️ Transcription failed with ${configuredModel}: ${err.message}. Retrying with gemini-3.5-flash fallback...`);
    try {
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      const result = await fallbackModel.generateContent([audioPart, prompt]);

      // Log Gemini usage for fallback
      const usage = result.response.usageMetadata;
      if (usage) {
        await db.saveUsageLog({
          feature: 'audio_transcription',
          modelName: 'gemini-3.5-flash',
          inputTokens: usage.promptTokenCount,
          outputTokens: usage.candidatesTokenCount,
          cachedTokens: usage.cachedContentTokenCount
        });
      }

      return result.response.text().trim();
    } catch (fallbackErr) {
      log.error(`❌ Fallback transcription failed: ${fallbackErr.message}`);
      throw fallbackErr;
    }
  }
}

/**
 * Helper to determine if an incoming message should be ignored (e.g. from self, groups, broadcast, empty/non-media, or rate limited)
 */
async function shouldIgnoreMessage(msg, sessionId, log) {
  if (msg.key.fromMe) return true;

  const jid = msg.key.remoteJid;
  if (!jid) return true;

  if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@temp')) {
    return true;
  }

  const imageMessage = msg.message?.imageMessage;
  const audioMessage = msg.message?.audioMessage;

  const text = msg.message?.conversation || 
               msg.message?.extendedTextMessage?.text || 
               msg.message?.buttonsResponseMessage?.selectedButtonId || 
               msg.message?.listResponseMessage?.title || 
               imageMessage?.caption ||
               '';

  // Ignore commands or empty non-image/non-audio messages
  if (!text.trim() && !imageMessage && !audioMessage) return true;
  if (text.startsWith('/')) return true;

  // Rate Limit check
  if (await isRateLimited(jid, sessionId)) {
    log.warn(`Rate limit triggered for JID: ${jid} on session ${sessionId}. Message ignored.`);
    return true;
  }

  return false;
}

/**
 * Helper to download, save, and format an image message from Baileys
 */
async function downloadAndSaveImage(msg, imageMessage, senderName, sock, log) {
  try {
    log.info(`📸 Image message detected from ${senderName}. Downloading...`);
    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      { 
        logger: log,
        reuploadRequest: sock.updateMediaMessage
      }
    );

    // Generate filename based on timestamp
    const filename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
    const filepath = path.join(__dirname, '../../public/uploads', filename);

    // Ensure uploads directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filepath, buffer);
    const imageUrl = `/uploads/${filename}`;
    log.info(`✅ Image downloaded and saved to: ${filepath}`);

    const imagePart = {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: imageMessage.mimetype || 'image/jpeg'
      }
    };

    return { imageUrl, imagePart };
  } catch (dlErr) {
    log.error(`❌ Failed to download image message: ${dlErr.message}`);
    return { imageUrl: null, imagePart: null };
  }
}

/**
 * Helper to download, save, and transcribe an audio message from Baileys
 */
async function downloadAndSaveAudio(msg, audioMessage, senderName, sock, log) {
  try {
    log.info(`🎙️ Audio message detected from ${senderName}. Downloading...`);
    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      { 
        logger: log,
        reuploadRequest: sock.updateMediaMessage
      }
    );

    // Determine extension from mimetype (default to ogg)
    const ext = audioMessage.mimetype?.split('/')[1]?.split(';')[0] || 'ogg';
    const filename = `voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filepath = path.join(__dirname, '../../public/uploads', filename);

    // Ensure uploads directory exists
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filepath, buffer);
    const voiceUrl = `/uploads/${filename}`;
    log.info(`✅ Audio downloaded and saved to: ${filepath}`);

    log.info(`🧠 Transcribing audio with Gemini...`);
    const transcription = await transcribeAudio(buffer, audioMessage.mimetype || 'audio/ogg', log);
    log.info(`📝 Transcription result: "${transcription}"`);

    return { voiceUrl, text: transcription };
  } catch (dlErr) {
    log.error(`❌ Failed to download or transcribe audio message: ${dlErr.message}`);
    return { voiceUrl: null, text: '[Pesan Suara tidak dapat ditranskripsi]' };
  }
}

/**
 * Helper to process connection updates for a WhatsApp session socket
 */
async function handleConnectionUpdate(update, sessionId, name, sessionData, sessionDir, log) {
  const { connection, lastDisconnect, qr } = update;
  
  if (qr) {
    log.info(`📲 QR code updated for session: ${name} (${sessionId})`);
    sessionData.qr = qr;
    sessionData.status = 'qr_received';
    await db.updateSessionQR(sessionId, qr, 'qr_received');
  }
  
  if (connection === 'close') {
    sessionData.ready = false;
    sessionData.qr = null;
    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
    log.warn(`⚠️ Connection closed for session "${name}" (${sessionId}) due to: ${lastDisconnect?.error?.message || 'unknown error'}`);
    
    if (shouldReconnect) {
      sessionData.status = 'connecting';
      await db.updateSessionStatus(sessionId, 'connecting');
      log.info(`🔄 Attempting reconnection for session "${name}" (${sessionId}) in 5 seconds...`);
      setTimeout(() => connectSession(sessionId, name, log), 5000);
    } else {
      sessionData.status = 'disconnected';
      await db.updateSessionStatus(sessionId, 'disconnected');
      log.error(`❌ Session "${name}" (${sessionId}) logged out. Clearing credentials folder.`);
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (err) {
        log.error(`Failed to delete session folder: ${err.message}`);
      }
    }
  } else if (connection === 'open') {
    sessionData.ready = true;
    sessionData.qr = null;
    sessionData.status = 'connected';
    const userPhone = sessionData.sock.user.id.split(':')[0];
    log.info(`🟢 WhatsApp Session "${name}" (${sessionId}) is CONNECTED and READY as ${userPhone}!`);
    await db.updateSessionConnected(sessionId, userPhone, 'connected');
  }
}

/**
 * Helper to extract text content from a WhatsApp message
 */
function extractMessageText(msg, imageMessage) {
  return msg.message?.conversation || 
         msg.message?.extendedTextMessage?.text || 
         msg.message?.buttonsResponseMessage?.selectedButtonId || 
         msg.message?.listResponseMessage?.title || 
         imageMessage?.caption ||
         '';
}

/**
 * Helper to download and save incoming media files (image/audio)
 */
async function downloadIncomingMedia(msg, imageMessage, audioMessage, senderName, sock, log) {
  let imagePart = null;
  let imageUrl = null;
  let voiceUrl = null;
  let text = '';

  if (imageMessage) {
    const imageResult = await downloadAndSaveImage(msg, imageMessage, senderName, sock, log);
    imageUrl = imageResult.imageUrl;
    imagePart = imageResult.imagePart;
  }

  if (audioMessage) {
    const audioResult = await downloadAndSaveAudio(msg, audioMessage, senderName, sock, log);
    voiceUrl = audioResult.voiceUrl;
    text = audioResult.text;
  }

  return { imagePart, imageUrl, voiceUrl, text };
}

/**
 * Helper to resolve customer profile and handle composing presence
 */
async function resolveCustomerAndPresence(jid, senderName, sessionId, sock, msg, log) {
  let customer = await db.getCustomer(jid, sessionId);
  if (!customer) {
    customer = await db.createOrUpdateCustomer(jid, senderName, { status: 'lead' }, sessionId);
  }

  if (customer.ai_enabled !== false) {
    try {
      await sock.sendPresenceUpdate('composing', jid);
    } catch (err) {
      log.warn(`Failed initial presence update: ${err.message}`);
    }
  }
  return customer;
}

/**
 * Helper to push an incoming message to the debounce cache queue
 */
function addMessageToDebounceBuffer(params) {
  const { cacheKey, jid, sessionId, senderName, sock, text, imagePart, imageUrl, voiceUrl, log, msg } = params;
  if (debounceCache.has(cacheKey)) {
    const pending = debounceCache.get(cacheKey);
    clearTimeout(pending.timer);

    pending.texts.push(text);
    if (imagePart) pending.imageParts.push(imagePart);
    if (imageUrl) pending.imageUrls.push(imageUrl);
    if (voiceUrl) pending.voiceUrls.push(voiceUrl);
    if (msg?.key) pending.messageKeys.push(msg.key);

    pending.timer = setTimeout(() => processDebouncedMessage(cacheKey, log), DEBOUNCE_DELAY_MS);
    log.info(`⏳ Added to existing debounce buffer for ${senderName} (${jid}). Message count: ${pending.texts.length}`);
  } else {
    const timer = setTimeout(() => processDebouncedMessage(cacheKey, log), DEBOUNCE_DELAY_MS);
    debounceCache.set(cacheKey, {
      timer,
      jid,
      sessionId,
      senderName,
      sock,
      texts: [text],
      messageKeys: msg?.key ? [msg.key] : [],
      imageParts: imagePart ? [imagePart] : [],
      imageUrls: imageUrl ? [imageUrl] : [],
      voiceUrls: voiceUrl ? [voiceUrl] : []
    });
    log.info(`⏳ Created new debounce buffer for ${senderName} (${jid}) with ${DEBOUNCE_DELAY_MS}ms window.`);
  }
}

async function processIncomingMessage(msg, sessionId, sock, log) {
  try {
    if (await shouldIgnoreMessage(msg, sessionId, log)) {
      return;
    }

    const jid = msg.key.remoteJid;
    const senderName = msg.pushName || 'Customer';

    const imageMessage = msg.message?.imageMessage;
    const audioMessage = msg.message?.audioMessage;

    // 1. Extract text and download media files
    let text = extractMessageText(msg, imageMessage);
    const media = await downloadIncomingMedia(msg, imageMessage, audioMessage, senderName, sock, log);
    
    const imagePart = media.imagePart;
    const imageUrl = media.imageUrl;
    const voiceUrl = media.voiceUrl;
    if (media.text) {
      text = media.text;
    }

    // 2. Resolve customer profile and read presence
    const customer = await resolveCustomerAndPresence(jid, senderName, sessionId, sock, msg, log);

    log.info(`📨 [Session: ${sessionId}] Received DM from ${senderName} (${jid}): "${text}" ${imageUrl ? '[Image Attached]' : ''} ${voiceUrl ? '[Voice Note Attached]' : ''}`);

    let dbText = text;
    if (imageUrl) {
      dbText = `[Foto: ${imageUrl}] ${text}`.trim();
    } else if (voiceUrl) {
      dbText = `[Voice Note: ${voiceUrl}] ${text}`.trim();
    }

    if (customer.ai_enabled === false) {
      log.info(`🤫 AI response is disabled for ${senderName} (${jid}) on session ${sessionId}. Message logged, skipping reply.`);
      await db.saveChatMessage(jid, 'user', dbText, sessionId);
      return;
    }

    // 3. Debounce / Buffer the incoming message
    const cacheKey = `${sessionId}:${jid}`;
    addMessageToDebounceBuffer({ cacheKey, jid, sessionId, senderName, sock, text, imagePart, imageUrl, voiceUrl, log, msg });

  } catch (err) {
    log.error(`Error in processIncomingMessage handler for session ${sessionId}: ${err.message}`);
  }
}

/**
 * Handle incoming messages upsert event
 */
async function handleIncomingMessagesUpsert(m, sessionId, sock, log) {
  if (m.type !== 'notify') return;

  for (const msg of m.messages) {
    await processIncomingMessage(msg, sessionId, sock, log);
  }
}

/**
 * Connect a specific WhatsApp session
 */
async function connectSession(sessionId, name, log = console) {
  log.info(`🔌 Connecting WhatsApp session: ${name} (${sessionId})...`);
  
  const sessionDir = path.join(SESSION_BASE_DIR, sessionId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: require('pino')({ level: 'silent' })
  });
  
  const sessionData = {
    sock,
    ready: false,
    qr: null,
    status: 'connecting',
    name
  };
  sessions.set(sessionId, sessionData);
  await db.updateSessionStatus(sessionId, 'connecting');
  
  sock.ev.on('connection.update', async (update) => {
    await handleConnectionUpdate(update, sessionId, name, sessionData, sessionDir, log);
  });

  sock.ev.on('creds.update', saveCreds);

  // Listen for incoming messages on this socket
  sock.ev.on('messages.upsert', async (m) => {
    await handleIncomingMessagesUpsert(m, sessionId, sock, log);
  });
}

/**
 * Disconnect a WhatsApp session socket
 */
async function disconnectSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    try {
      if (session.sock) {
        session.sock.ev.removeAllListeners('connection.update');
        session.sock.ev.removeAllListeners('creds.update');
        session.sock.ev.removeAllListeners('messages.upsert');
        session.sock.end();
      }
    } catch (e) {
      console.error(`Error closing socket for session ${sessionId}:`, e.message);
    }
    sessions.delete(sessionId);
  }
}

/**
 * Initialize WhatsApp connections for all stored sessions
 */
async function connectToWhatsApp(log = console) {
  // Ensure SESSION_BASE_DIR exists
  if (!fs.existsSync(SESSION_BASE_DIR)) {
    fs.mkdirSync(SESSION_BASE_DIR, { recursive: true });
  }

  // Load all sessions from database
  const dbSessions = await db.getSessions();
  if (dbSessions.length === 0) {
    // Automatically create default session
    await db.createSession('default', 'Default Agent');
    await connectSession('default', 'Default Agent', log);
  } else {
    for (const session of dbSessions) {
      await connectSession(session.id, session.name, log);
    }
  }
}

function isReady(sessionId = null) {
  if (sessionId) {
    const s = sessions.get(sessionId);
    return s ? s.ready : false;
  }
  for (const s of sessions.values()) {
    if (s.ready) return true;
  }
  return false;
}

async function sendMessage(jid, content, sessionId = null) {
  let targetSessionId = sessionId;
  if (!targetSessionId) {
    for (const [id, s] of sessions.entries()) {
      if (s.ready) {
        targetSessionId = id;
        break;
      }
    }
    if (!targetSessionId) {
      targetSessionId = 'default';
    }
  }

  const s = sessions.get(targetSessionId);
  if (!s?.sock || !s?.ready) {
    throw new Error(`WhatsApp session "${targetSessionId || 'default'}" is not ready.`);
  }

  // Convert markdown to WhatsApp formatting style
  if (content && typeof content.text === 'string') {
    content.text = markdownToWhatsApp(content.text);
  }

  return await s.sock.sendMessage(jid, content);
}

async function getGroups(sessionId = null) {
  let targetSessionId = sessionId;
  if (!targetSessionId) {
    for (const [id, s] of sessions.entries()) {
      if (s.ready) {
        targetSessionId = id;
        break;
      }
    }
    if (!targetSessionId) {
      targetSessionId = 'default';
    }
  }

  const s = sessions.get(targetSessionId);
  if (!s?.sock || !s?.ready) {
    throw new Error(`WhatsApp session "${targetSessionId || 'default'}" is not ready.`);
  }
  const groups = await s.sock.groupFetchAllParticipating();
  return Object.keys(groups).map(jid => {
    const g = groups[jid] || {};
    return {
      jid,
      subject: g.subject || '',
      creation: g.creation || null,
      desc: g.desc || '',
      owner: g.owner || g.ownerJid || null,
      size: Array.isArray(g.participants) ? g.participants.length : (g.size || null),
    };
  });
}

async function processPendingReplies(log = console) {
  try {
    const pending = await db.getExecutablePendingReplies();
    if (pending.length === 0) return;

    log.info(`[Retry Queue] Found ${pending.length} pending AI replies to retry.`);

    for (const row of pending) {
      const sessionId = row.session_id || 'default';
      const jid = row.jid;

      if (!isReady(sessionId)) {
        log.warn(`[Retry Queue] WhatsApp session "${sessionId}" is not ready. Skipping retry for ${jid}.`);
        continue;
      }

      const lockKey = `${sessionId}:${jid}`;
      if (processingCustomers.has(lockKey)) {
        log.info(`[Retry Queue] Customer ${lockKey} is currently processing in another worker. Skipping retry.`);
        continue;
      }

      const s = sessions.get(sessionId);
      const sock = s.sock;

      // Acquire in-memory lock
      processingCustomers.add(lockKey);

      try {
        log.info(`[Retry Queue] Retrying reply for ${row.sender_name} (${jid}) on session ${sessionId} (Attempt ${row.attempts + 1})...`);

        // Send composing presence update
        await sock.sendPresenceUpdate('composing', jid);

        const replyText = await agent.handleIncomingMessage(
          jid,
          row.combined_text,
          row.sender_name,
          row.image_part,
          row.image_url,
          sessionId,
          row.voice_url
        );

        await sock.sendPresenceUpdate('paused', jid);

        // Mark messages as read
        if (row.message_keys && row.message_keys.length > 0) {
          try {
            await sock.readMessages(row.message_keys);
          } catch (readErr) {
            log.warn(`Failed to read messages in processPendingReplies: ${readErr.message}`);
          }
        }

        // Send the reply
        await sock.sendMessage(jid, { text: markdownToWhatsApp(replyText) });

        // Remove from pending replies
        await db.deletePendingReply(row.id);
        log.info(`[Retry Queue] Successfully processed and sent reply to ${jid}.`);
      } catch (err) {
        log.error(`[Retry Queue] Failed retry attempt for ${jid}: ${err.message}`);

        // Increment attempt with linear backoff (60s * attempts, max 300s)
        const nextAttemptDelay = Math.min(60 * (row.attempts + 1), 300);
        await db.incrementPendingReplyAttempt(row.id, nextAttemptDelay);
      } finally {
        // Release in-memory lock
        processingCustomers.delete(lockKey);
      }
    }
  } catch (err) {
    log.error(`[Retry Queue] Error in processPendingReplies worker: ${err.message}`);
  }
}

module.exports = {
  connectToWhatsApp,
  connectSession,
  disconnectSession,
  isReady,
  sendMessage,
  getGroups,
  sessions,
  transcribeAudio,
  debounceCache,
  processDebouncedMessage,
  markdownToWhatsApp,
  processPendingReplies
};
