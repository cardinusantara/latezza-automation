const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const path = require('path');
const db = require('../db');
const agent = require('../agent');

const SESSION_DIR = path.join(__dirname, '../../whatsapp-session');

let sock = null;
let ready = false;

// In-Memory Rate Limiter Cache
const rateLimitCache = new Map();

async function isRateLimited(jid) {
  const now = Date.now();
  const windowMs = parseInt(await db.getSetting('rate_limit_window') || process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const maxMsg = parseInt(await db.getSetting('rate_limit_max') || process.env.RATE_LIMIT_MAX_MSG || '5', 10);

  if (!rateLimitCache.has(jid)) {
    rateLimitCache.set(jid, [now]);
    return false;
  }
  const timestamps = rateLimitCache.get(jid).filter(ts => now - ts < windowMs);
  if (timestamps.length >= maxMsg) {
    return true;
  }
  timestamps.push(now);
  rateLimitCache.set(jid, timestamps);
  return false;
}

/**
 * Initialize WhatsApp connection
 */
async function connectToWhatsApp(log = console) {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: require('pino')({ level: 'silent' })
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      log.info('Scan this QR code to connect your WhatsApp account:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      ready = false;
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      log.warn(`Connection closed due to: ${lastDisconnect?.error?.message || 'unknown error'}`);
      
      if (shouldReconnect) {
        log.info('Attempting reconnection in 5 seconds...');
        setTimeout(() => connectToWhatsApp(log), 5000);
      } else {
        log.error('Logged out from WhatsApp. Please delete whatsapp-session folder and restart gateway to scan QR again.');
      }
    } else if (connection === 'open') {
      ready = true;
      log.info('=============================================');
      log.info('🟢 WhatsApp Gateway is CONNECTED and READY!');
      log.info('=============================================');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Listen for incoming messages
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

        const text = msg.message?.conversation || 
                     msg.message?.extendedTextMessage?.text || 
                     msg.message?.buttonsResponseMessage?.selectedButtonId || 
                     msg.message?.listResponseMessage?.title || 
                     '';

        if (!text.trim()) continue;
        if (text.startsWith('/')) continue;

        // Rate Limit check
        if (await isRateLimited(jid)) {
          log.warn(`Rate limit triggered for JID: ${jid}. Message ignored.`);
          continue;
        }

        const senderName = msg.pushName || 'Customer';
        log.info(`📨 Received DM from ${senderName} (${jid}): "${text}"`);

        let customer = await db.getCustomer(jid);
        if (!customer) {
          customer = await db.createOrUpdateCustomer(jid, senderName, { status: 'lead' });
        }

        if (customer.ai_enabled === false) {
          log.info(`🤫 AI response is disabled for ${senderName} (${jid}). Message logged, skipping reply.`);
          await db.saveChatMessage(jid, 'user', text);
          continue;
        }

        (async () => {
          try {
            await sock.sendPresenceUpdate('composing', jid);
            await new Promise(resolve => setTimeout(resolve, 1500));

            const replyText = await agent.handleIncomingMessage(jid, text, senderName);

            await sock.sendPresenceUpdate('paused', jid);
            await sock.sendMessage(jid, { text: replyText });
          } catch (replyErr) {
            log.error(`Error sending AI reply to ${jid}: ${replyErr.message}`);
          }
        })();

      } catch (err) {
        log.error(`Error in messages.upsert handler: ${err.message}`);
      }
    }
  });
}

function isReady() {
  return ready;
}

function getSock() {
  return sock;
}

async function sendMessage(jid, content) {
  if (!ready || !sock) {
    throw new Error('WhatsApp connection is not ready.');
  }
  return await sock.sendMessage(jid, content);
}

async function getGroups() {
  if (!ready || !sock) {
    throw new Error('WhatsApp connection is not ready.');
  }
  const groups = await sock.groupFetchAllParticipating();
  return Object.keys(groups).map(jid => ({
    jid,
    subject: groups[jid].subject
  }));
}

module.exports = {
  connectToWhatsApp,
  isReady,
  getSock,
  sendMessage,
  getGroups
};
