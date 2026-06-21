const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const agent = require('../agent');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const SESSION_BASE_DIR = path.join(__dirname, '../../whatsapp-sessions');

// Pool of active sessions: sessionId -> { sock, ready, qr, status, name }
const sessions = new Map();

// In-Memory Rate Limiter Cache
const rateLimitCache = new Map();

async function isRateLimited(jid, sessionId) {
  const cacheKey = `${sessionId}:${jid}`;
  const now = Date.now();
  const windowMs = parseInt(await db.getSetting('rate_limit_window') || process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const maxMsg = parseInt(await db.getSetting('rate_limit_max') || process.env.RATE_LIMIT_MAX_MSG || '5', 10);

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

  const configuredModel = await db.getSetting('gemini_model') || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  
  try {
    log.info(`🤖 Attempting transcription with configured model: ${configuredModel}...`);
    const model = genAI.getGenerativeModel({ model: configuredModel });
    const result = await model.generateContent([audioPart, prompt]);
    return result.response.text().trim();
  } catch (err) {
    log.warn(`⚠️ Transcription failed with ${configuredModel}: ${err.message}. Retrying with gemini-3.5-flash fallback...`);
    try {
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      const result = await fallbackModel.generateContent([audioPart, prompt]);
      return result.response.text().trim();
    } catch (fallbackErr) {
      log.error(`❌ Fallback transcription failed: ${fallbackErr.message}`);
      throw fallbackErr;
    }
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
      const userPhone = sock.user.id.split(':')[0];
      log.info(`🟢 WhatsApp Session "${name}" (${sessionId}) is CONNECTED and READY as ${userPhone}!`);
      await db.updateSessionConnected(sessionId, userPhone, 'connected');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Listen for incoming messages on this socket
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;

    for (const msg of m.messages) {
      try {
        if (msg.key.fromMe) continue;

        const jid = msg.key.remoteJid;
        if (!jid) continue;

        if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@temp')) {
          continue;
        }

        const imageMessage = msg.message?.imageMessage;
        const audioMessage = msg.message?.audioMessage;
        
        let text = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || 
                   msg.message?.buttonsResponseMessage?.selectedButtonId || 
                   msg.message?.listResponseMessage?.title || 
                   imageMessage?.caption ||
                   '';

        // Ignore commands or empty non-image/non-audio messages
        if (!text.trim() && !imageMessage && !audioMessage) continue;
        if (text.startsWith('/')) continue;

        // Rate Limit check
        if (await isRateLimited(jid, sessionId)) {
          log.warn(`Rate limit triggered for JID: ${jid} on session ${sessionId}. Message ignored.`);
          continue;
        }

        const senderName = msg.pushName || 'Customer';

        let customer = await db.getCustomer(jid, sessionId);
        if (!customer) {
          customer = await db.createOrUpdateCustomer(jid, senderName, { status: 'lead' }, sessionId);
        }

        if (customer.ai_enabled !== false) {
          try {
            await sock.sendPresenceUpdate('composing', jid);
            await sock.readMessages([msg.key]);
          } catch (err) {
            log.warn(`Failed initial presence/read update: ${err.message}`);
          }
        }
        
        // Handle image downloading and local storage
        let imagePart = null;
        let imageUrl = null;

        if (imageMessage) {
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
            imageUrl = `/uploads/${filename}`;
            log.info(`✅ Image downloaded and saved to: ${filepath}`);

            imagePart = {
              inlineData: {
                data: buffer.toString('base64'),
                mimeType: imageMessage.mimetype || 'image/jpeg'
              }
            };
          } catch (dlErr) {
            log.error(`❌ Failed to download image message: ${dlErr.message}`);
          }
        }

        // Handle audio downloading, saving, and transcription
        let voiceUrl = null;

        if (audioMessage) {
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
            voiceUrl = `/uploads/${filename}`;
            log.info(`✅ Audio downloaded and saved to: ${filepath}`);

            log.info(`🧠 Transcribing audio with Gemini...`);
            const transcription = await transcribeAudio(buffer, audioMessage.mimetype || 'audio/ogg', log);
            log.info(`📝 Transcription result: "${transcription}"`);
            text = transcription;
          } catch (dlErr) {
            log.error(`❌ Failed to download or transcribe audio message: ${dlErr.message}`);
            text = '[Pesan Suara tidak dapat ditranskripsi]';
          }
        }

        log.info(`📨 [Session: ${sessionId}] Received DM from ${senderName} (${jid}): "${text}" ${imageUrl ? '[Image Attached]' : ''} ${voiceUrl ? '[Voice Note Attached]' : ''}`);

        const dbText = imageUrl 
          ? `[Foto: ${imageUrl}] ${text}`.trim() 
          : (voiceUrl ? `[Voice Note: ${voiceUrl}] ${text}`.trim() : text);

        if (customer.ai_enabled === false) {
          log.info(`🤫 AI response is disabled for ${senderName} (${jid}) on session ${sessionId}. Message logged, skipping reply.`);
          await db.saveChatMessage(jid, 'user', dbText, sessionId);
          continue;
        }

        (async () => {
          try {
            await sock.sendPresenceUpdate('composing', jid);
            await new Promise(resolve => setTimeout(resolve, 1500));

            const replyText = await agent.handleIncomingMessage(jid, text, senderName, imagePart, imageUrl, sessionId, voiceUrl);

            await sock.sendPresenceUpdate('paused', jid);
            await sock.sendMessage(jid, { text: replyText });
          } catch (replyErr) {
            log.error(`Error sending AI reply to ${jid} on session ${sessionId}: ${replyErr.message}`);
          }
        })();

      } catch (err) {
        log.error(`Error in messages.upsert handler for session ${sessionId}: ${err.message}`);
      }
    }
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
  if (!s || !s.sock || !s.ready) {
    throw new Error(`WhatsApp session "${targetSessionId || 'default'}" is not ready.`);
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
  if (!s || !s.sock || !s.ready) {
    throw new Error(`WhatsApp session "${targetSessionId || 'default'}" is not ready.`);
  }
  const groups = await s.sock.groupFetchAllParticipating();
  return Object.keys(groups).map(jid => ({
    jid,
    subject: groups[jid].subject
  }));
}

module.exports = {
  connectToWhatsApp,
  connectSession,
  disconnectSession,
  isReady,
  sendMessage,
  getGroups,
  sessions,
  transcribeAudio
};
