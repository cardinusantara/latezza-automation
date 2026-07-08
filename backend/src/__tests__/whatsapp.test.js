const whatsapp = require('../services/whatsapp');
const agent = require('../agent');
const db = require('../db');
const fs = require('node:fs');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Mock out-of-scope variables for Gemini
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel
  }))
}));

// Mock db
jest.mock('../db', () => ({
  getSetting: jest.fn(() => Promise.resolve('')),
  getCustomer: jest.fn(),
  createOrUpdateCustomer: jest.fn(),
  getSessions: jest.fn(() => Promise.resolve([])),
  updateSessionQR: jest.fn(() => Promise.resolve()),
  updateSessionStatus: jest.fn(() => Promise.resolve()),
  updateSessionConnected: jest.fn(() => Promise.resolve()),
  createSession: jest.fn(() => Promise.resolve()),
  saveChatMessage: jest.fn(() => Promise.resolve()),
  saveUsageLog: jest.fn(() => Promise.resolve()),
  upsertPendingReply: jest.fn(() => Promise.resolve()),
  pool: {
    connect: jest.fn(() => Promise.resolve({
      query: jest.fn(() => Promise.resolve({ rows: [] })),
      release: jest.fn()
    }))
  }
}));

// Mock agent
jest.mock('../agent', () => ({
  handleIncomingMessage: jest.fn(() => Promise.resolve('Mock AI Response')),
  buildSystemInstructions: jest.fn()
}));

// Mock Baileys
const mockSockObj = {
  ev: {
    on: jest.fn()
  },
  end: jest.fn(),
  sendPresenceUpdate: jest.fn(() => Promise.resolve()),
  sendMessage: jest.fn(() => Promise.resolve()),
  readMessages: jest.fn(() => Promise.resolve()),
  groupFetchAllParticipating: jest.fn(() => Promise.resolve({}))
};

jest.mock('@whiskeysockets/baileys', () => ({
  default: jest.fn(() => mockSockObj),
  useMultiFileAuthState: jest.fn(() => Promise.resolve({
    state: { creds: {} },
    saveCreds: jest.fn()
  })),
  DisconnectReason: {
    loggedOut: 401
  },
  downloadMediaMessage: jest.fn()
}));

// Mock fs
jest.mock('node:fs', () => ({
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  rmSync: jest.fn()
}));

describe('WhatsApp Service', () => {
  let mockLog;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const val of whatsapp.debounceCache.values()) {
      if (val.timer) clearTimeout(val.timer);
    }
    whatsapp.debounceCache.clear();
    whatsapp.sessions.clear();
    mockLog = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
    process.env.DEBOUNCE_DELAY_MS = '0';
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    for (const val of whatsapp.debounceCache.values()) {
      if (val.timer) clearTimeout(val.timer);
    }
    whatsapp.debounceCache.clear();
  });

  describe('isReady', () => {
    test('returns false if no sessions exist', () => {
      expect(whatsapp.isReady()).toBe(false);
    });

    test('returns ready state of a specific session', () => {
      whatsapp.sessions.set('default', { ready: true });
      whatsapp.sessions.set('other', { ready: false });

      expect(whatsapp.isReady('default')).toBe(true);
      expect(whatsapp.isReady('other')).toBe(false);
      expect(whatsapp.isReady('non-existent')).toBe(false);
    });

    test('returns true if any session is ready when sessionId is null', () => {
      whatsapp.sessions.set('default', { ready: false });
      whatsapp.sessions.set('other', { ready: true });

      expect(whatsapp.isReady()).toBe(true);
    });
  });

  describe('sendMessage', () => {
    test('throws error if target session is not ready', async () => {
      await expect(whatsapp.sendMessage('123@s.whatsapp.net', { text: 'test' }, 'default'))
        .rejects.toThrow('WhatsApp session "default" is not ready');
    });

    test('routes to first ready session if no sessionId is provided', async () => {
      const mockSock = { sendMessage: jest.fn(() => Promise.resolve('sent')) };
      whatsapp.sessions.set('default', { ready: false });
      whatsapp.sessions.set('session-2', { ready: true, sock: mockSock });

      await whatsapp.sendMessage('123@s.whatsapp.net', { text: 'test' });
      expect(mockSock.sendMessage).toHaveBeenCalledWith('123@s.whatsapp.net', { text: 'test' });
    });

    test('sends via specified session if ready', async () => {
      const mockSock = { sendMessage: jest.fn(() => Promise.resolve('sent')) };
      whatsapp.sessions.set('session-1', { ready: true, sock: mockSock });

      await whatsapp.sendMessage('123@s.whatsapp.net', { text: 'test' }, 'session-1');
      expect(mockSock.sendMessage).toHaveBeenCalledWith('123@s.whatsapp.net', { text: 'test' });
    });
  });

  describe('getGroups', () => {
    test('throws if session is not ready', async () => {
      await expect(whatsapp.getGroups('default')).rejects.toThrow('WhatsApp session "default" is not ready');
    });

    test('fetches and maps groups correctly', async () => {
      const mockSock = {
        groupFetchAllParticipating: jest.fn(() => Promise.resolve({
          'group1@g.us': { subject: 'Grup Kue' },
          'group2@g.us': { subject: 'Grup Brownies' }
        }))
      };
      whatsapp.sessions.set('default', { ready: true, sock: mockSock });

      const groups = await whatsapp.getGroups('default');
      expect(groups).toEqual([
        { jid: 'group1@g.us', subject: 'Grup Kue' },
        { jid: 'group2@g.us', subject: 'Grup Brownies' }
      ]);
    });
  });

  describe('transcribeAudio', () => {
    test('throws if no Gemini API Key is available', async () => {
      db.getSetting.mockResolvedValue(null);
      delete process.env.GEMINI_API_KEY;

      await expect(whatsapp.transcribeAudio(Buffer.from(''), 'audio/ogg', mockLog))
        .rejects.toThrow('Active Gemini API Key is missing');
    });

    test('transcribes successfully with primary model', async () => {
      db.getSetting.mockResolvedValue('key-from-db');
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => '  Transkripsi Hasil Suara  ',
          usageMetadata: {
            promptTokenCount: 80,
            candidatesTokenCount: 20,
            cachedContentTokenCount: 0
          }
        }
      });

      const text = await whatsapp.transcribeAudio(Buffer.from('audio-data'), 'audio/ogg', mockLog);
      expect(text).toBe('Transkripsi Hasil Suara');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-3.1-flash-lite' });

      // Assert Gemini API usage logging occurred
      expect(db.saveUsageLog).toHaveBeenCalledWith({
        feature: 'audio_transcription',
        modelName: 'gemini-3.1-flash-lite',
        inputTokens: 80,
        outputTokens: 20,
        cachedTokens: 0
      });
    });

    test('retries and transcribes with fallback model on primary failure', async () => {
      db.getSetting.mockResolvedValue('key-from-db');
      mockGenerateContent
        .mockRejectedValueOnce(new Error('Quota Exceeded on Lite'))
        .mockResolvedValueOnce({
          response: {
            text: () => 'Fallback Result',
            usageMetadata: {
              promptTokenCount: 90,
              candidatesTokenCount: 25,
              cachedContentTokenCount: 0
            }
          }
        });

      const text = await whatsapp.transcribeAudio(Buffer.from('audio-data'), 'audio/ogg', mockLog);
      expect(text).toBe('Fallback Result');
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-3.5-flash' });
      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Transcription failed with gemini-3.1-flash-lite'));

      // Assert Gemini API usage logging occurred for fallback model
      expect(db.saveUsageLog).toHaveBeenCalledWith({
        feature: 'audio_transcription',
        modelName: 'gemini-3.5-flash',
        inputTokens: 90,
        outputTokens: 25,
        cachedTokens: 0
      });
    });

    test('throws if both primary and fallback transcription fail', async () => {
      db.getSetting.mockResolvedValue('key-from-db');
      mockGenerateContent
        .mockRejectedValueOnce(new Error('Lite Fail'))
        .mockRejectedValueOnce(new Error('Fallback Fail'));

      await expect(whatsapp.transcribeAudio(Buffer.from('audio-data'), 'audio/ogg', mockLog))
        .rejects.toThrow('Fallback Fail');
    });
  });

  describe('Message Debouncing', () => {
    let mockSock;
    
    beforeEach(() => {
      mockSock = {
        sendPresenceUpdate: jest.fn(() => Promise.resolve()),
        sendMessage: jest.fn(() => Promise.resolve())
      };
    });

    test('should combine multiple text messages and trigger agent once', async () => {
      const cacheKey = 'default:12345@s.whatsapp.net';
      
      whatsapp.debounceCache.set(cacheKey, {
        timer: null,
        jid: '12345@s.whatsapp.net',
        sessionId: 'default',
        senderName: 'John',
        sock: mockSock,
        texts: ['Halo', 'saya mau tanya kue', 'apakah ada?'],
        imageParts: [],
        imageUrls: [],
        voiceUrls: []
      });

      await whatsapp.processDebouncedMessage(cacheKey, mockLog);

      expect(agent.handleIncomingMessage).toHaveBeenCalledTimes(1);
      expect(agent.handleIncomingMessage).toHaveBeenCalledWith(
        '12345@s.whatsapp.net',
        'Halo\nsaya mau tanya kue\napakah ada?',
        'John',
        null,
        null,
        'default',
        null
      );

      expect(mockSock.sendPresenceUpdate).toHaveBeenCalledWith('composing', '12345@s.whatsapp.net');
      expect(mockSock.sendPresenceUpdate).toHaveBeenCalledWith('paused', '12345@s.whatsapp.net');
      expect(mockSock.sendMessage).toHaveBeenCalledWith('12345@s.whatsapp.net', { text: 'Mock AI Response' });
      expect(whatsapp.debounceCache.has(cacheKey)).toBe(false);
    });

    test('should keep latest non-null media files in debounced trigger', async () => {
      const cacheKey = 'default:12345@s.whatsapp.net';
      const mockImagePart = { inlineData: { data: 'base64', mimeType: 'image/jpeg' } };
      
      whatsapp.debounceCache.set(cacheKey, {
        timer: null,
        jid: '12345@s.whatsapp.net',
        sessionId: 'default',
        senderName: 'John',
        sock: mockSock,
        texts: ['', 'ready kak?'],
        imageParts: [mockImagePart],
        imageUrls: ['/uploads/img_1.jpg'],
        voiceUrls: []
      });

      await whatsapp.processDebouncedMessage(cacheKey, mockLog);

      expect(agent.handleIncomingMessage).toHaveBeenCalledTimes(1);
      expect(agent.handleIncomingMessage).toHaveBeenCalledWith(
        '12345@s.whatsapp.net',
        'ready kak?',
        'John',
        mockImagePart,
        '/uploads/img_1.jpg',
        'default',
        null
      );
    });

    test('handles errors in processDebouncedMessage gracefully', async () => {
      const cacheKey = 'default:12345@s.whatsapp.net';
      mockSock.sendMessage.mockRejectedValueOnce(new Error('Network Closed'));

      whatsapp.debounceCache.set(cacheKey, {
        timer: null,
        jid: '12345@s.whatsapp.net',
        sessionId: 'default',
        senderName: 'John',
        sock: mockSock,
        texts: ['test'],
        imageParts: [],
        imageUrls: [],
        voiceUrls: []
      });

      await whatsapp.processDebouncedMessage(cacheKey, mockLog);
      expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Error in processDebouncedMessage'));
    });
  });

  describe('Connection Lifecycle and Events', () => {
    test('connectToWhatsApp starts default session if no sessions exist in DB', async () => {
      db.getSessions.mockResolvedValue([]);
      
      await whatsapp.connectToWhatsApp(mockLog);
      
      expect(db.createSession).toHaveBeenCalledWith('default', 'Default Agent');
      expect(whatsapp.sessions.has('default')).toBe(true);
    });

    test('connectToWhatsApp connects all db sessions', async () => {
      db.getSessions.mockResolvedValue([
        { id: 'sess-1', name: 'Agent 1' },
        { id: 'sess-2', name: 'Agent 2' }
      ]);
      
      await whatsapp.connectToWhatsApp(mockLog);
      
      expect(whatsapp.sessions.has('sess-1')).toBe(true);
      expect(whatsapp.sessions.has('sess-2')).toBe(true);
    });

    test('disconnectSession ends socket and clears from pool', async () => {
      const mockSock = {
        ev: { removeAllListeners: jest.fn() },
        end: jest.fn()
      };
      whatsapp.sessions.set('session-to-close', { sock: mockSock });

      await whatsapp.disconnectSession('session-to-close');

      expect(mockSock.ev.removeAllListeners).toHaveBeenCalledWith('connection.update');
      expect(mockSock.ev.removeAllListeners).toHaveBeenCalledWith('creds.update');
      expect(mockSock.ev.removeAllListeners).toHaveBeenCalledWith('messages.upsert');
      expect(mockSock.end).toHaveBeenCalled();
      expect(whatsapp.sessions.has('session-to-close')).toBe(false);
    });

    test('handles connection open and QR updates', async () => {
      db.getSessions.mockResolvedValue([{ id: 'default', name: 'Default Agent' }]);
      
      let connectionUpdateCallback;
      mockSockObj.ev.on.mockImplementation((event, cb) => {
        if (event === 'connection.update') {
          connectionUpdateCallback = cb;
        }
      });

      await whatsapp.connectSession('default', 'Default Agent', mockLog);

      expect(connectionUpdateCallback).toBeDefined();

      // Trigger QR update
      await connectionUpdateCallback({ qr: 'mock-qr-code' });
      const sessionData = whatsapp.sessions.get('default');
      expect(sessionData.qr).toBe('mock-qr-code');
      expect(sessionData.status).toBe('qr_received');
      expect(db.updateSessionQR).toHaveBeenCalledWith('default', 'mock-qr-code', 'qr_received');

      // Trigger Connection open
      mockSockObj.user = { id: '62812345678:1@s.whatsapp.net' };
      await connectionUpdateCallback({ connection: 'open' });
      expect(sessionData.ready).toBe(true);
      expect(sessionData.status).toBe('connected');
      expect(db.updateSessionConnected).toHaveBeenCalledWith('default', '62812345678', 'connected');
    });

    test('handles connection close and reconnects', async () => {
      jest.useFakeTimers();
      db.getSessions.mockResolvedValue([{ id: 'default', name: 'Default Agent' }]);
      
      let connectionUpdateCallback;
      mockSockObj.ev.on.mockImplementation((event, cb) => {
        if (event === 'connection.update') {
          connectionUpdateCallback = cb;
        }
      });

      await whatsapp.connectSession('default', 'Default Agent', mockLog);

      const mockError = new Error('Connection Reset');
      mockError.output = { statusCode: 500 };
      
      await connectionUpdateCallback({
        connection: 'close',
        lastDisconnect: { error: mockError }
      });

      const sessionData = whatsapp.sessions.get('default');
      expect(sessionData.ready).toBe(false);
      expect(sessionData.status).toBe('connecting');
      expect(db.updateSessionStatus).toHaveBeenCalledWith('default', 'connecting');

      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('Attempting reconnection'));

      jest.advanceTimersByTime(5000);
      jest.useRealTimers();
    });

    test('handles connection close and deletes credentials if logged out', async () => {
      db.getSessions.mockResolvedValue([{ id: 'default', name: 'Default Agent' }]);
      
      let connectionUpdateCallback;
      mockSockObj.ev.on.mockImplementation((event, cb) => {
        if (event === 'connection.update') {
          connectionUpdateCallback = cb;
        }
      });

      await whatsapp.connectSession('default', 'Default Agent', mockLog);

      const mockError = new Error('Logged Out');
      mockError.output = { statusCode: 401 }; // DisconnectReason.loggedOut
      
      await connectionUpdateCallback({
        connection: 'close',
        lastDisconnect: { error: mockError }
      });

      const sessionData = whatsapp.sessions.get('default');
      expect(sessionData.ready).toBe(false);
      expect(sessionData.status).toBe('disconnected');
      expect(db.updateSessionStatus).toHaveBeenCalledWith('default', 'disconnected');
      expect(fs.rmSync).toHaveBeenCalled();
    });
  });

  describe('Incoming Messages Handler', () => {
    test('processes incoming text message and buffers it', async () => {
      let messagesUpsertCallback;
      mockSockObj.ev.on.mockImplementation((event, cb) => {
        if (event === 'messages.upsert') {
          messagesUpsertCallback = cb;
        }
      });

      await whatsapp.connectSession('default', 'Default Agent', mockLog);

      db.getCustomer.mockResolvedValue({ ai_enabled: true });

      const mockMsg = {
        key: { fromMe: false, remoteJid: '62812345678@s.whatsapp.net', id: 'msg1' },
        message: { conversation: 'Halo' },
        pushName: 'Alice'
      };

      await messagesUpsertCallback({
        type: 'notify',
        messages: [mockMsg]
      });

      expect(db.getCustomer).toHaveBeenCalledWith('62812345678@s.whatsapp.net', 'default');
      expect(whatsapp.debounceCache.has('default:62812345678@s.whatsapp.net')).toBe(true);
    });

    test('saves message but skips reply if AI is disabled for customer', async () => {
      let messagesUpsertCallback;
      mockSockObj.ev.on.mockImplementation((event, cb) => {
        if (event === 'messages.upsert') {
          messagesUpsertCallback = cb;
        }
      });

      await whatsapp.connectSession('default', 'Default Agent', mockLog);

      db.getCustomer.mockResolvedValue({ ai_enabled: false });

      const mockMsg = {
        key: { fromMe: false, remoteJid: '62812345678@s.whatsapp.net', id: 'msg1' },
        message: { conversation: 'Halo' },
        pushName: 'Alice'
      };

      await messagesUpsertCallback({
        type: 'notify',
        messages: [mockMsg]
      });

      expect(db.saveChatMessage).toHaveBeenCalledWith('62812345678@s.whatsapp.net', 'user', 'Halo', 'default');
      expect(whatsapp.debounceCache.has('default:62812345678@s.whatsapp.net')).toBe(false);
    });

    test('processes incoming image message, downloads it, and buffers it', async () => {
      let messagesUpsertCallback;
      mockSockObj.ev.on.mockImplementation((event, cb) => {
        if (event === 'messages.upsert') {
          messagesUpsertCallback = cb;
        }
      });

      await whatsapp.connectSession('default', 'Default Agent', mockLog);

      db.getCustomer.mockResolvedValue({ ai_enabled: true });
      downloadMediaMessage.mockResolvedValue(Buffer.from('fake-image-data'));

      const mockMsg = {
        key: { fromMe: false, remoteJid: '62812345678@s.whatsapp.net', id: 'msg1' },
        message: {
          imageMessage: { caption: 'Brownies ready?', mimetype: 'image/jpeg' }
        },
        pushName: 'Alice'
      };

      await messagesUpsertCallback({
        type: 'notify',
        messages: [mockMsg]
      });

      expect(downloadMediaMessage).toHaveBeenCalled();
      expect(whatsapp.debounceCache.has('default:62812345678@s.whatsapp.net')).toBe(true);
      const debounced = whatsapp.debounceCache.get('default:62812345678@s.whatsapp.net');
      expect(debounced.imageUrls[0]).toContain('/uploads/img_');
      expect(debounced.imageParts[0].inlineData.data).toBe(Buffer.from('fake-image-data').toString('base64'));
    });

    test('processes incoming audio message, downloads it, transcribes it, and buffers it', async () => {
      let messagesUpsertCallback;
      mockSockObj.ev.on.mockImplementation((event, cb) => {
        if (event === 'messages.upsert') {
          messagesUpsertCallback = cb;
        }
      });

      await whatsapp.connectSession('default', 'Default Agent', mockLog);

      db.getCustomer.mockResolvedValue({ ai_enabled: true });
      db.getSetting.mockResolvedValue('gemini-key');
      downloadMediaMessage.mockResolvedValue(Buffer.from('fake-audio-data'));
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => ' Brownies rasa keju '
        }
      });

      const mockMsg = {
        key: { fromMe: false, remoteJid: '62812345678@s.whatsapp.net', id: 'msg1' },
        message: {
          audioMessage: { mimetype: 'audio/ogg; codecs=opus' }
        },
        pushName: 'Alice'
      };

      await messagesUpsertCallback({
        type: 'notify',
        messages: [mockMsg]
      });

      expect(downloadMediaMessage).toHaveBeenCalled();
      expect(mockGenerateContent).toHaveBeenCalled();
      expect(whatsapp.debounceCache.has('default:62812345678@s.whatsapp.net')).toBe(true);
      const debounced = whatsapp.debounceCache.get('default:62812345678@s.whatsapp.net');
      expect(debounced.texts[0]).toBe('Brownies rasa keju');
      expect(debounced.voiceUrls[0]).toContain('/uploads/voice_');
    });

    test('ignores messages based on conditions', async () => {
      let messagesUpsertCallback;
      mockSockObj.ev.on.mockImplementation((event, cb) => {
        if (event === 'messages.upsert') {
          messagesUpsertCallback = cb;
        }
      });

      await whatsapp.connectSession('default', 'Default Agent', mockLog);

      const makeNotify = (msg) => ({ type: 'notify', messages: [msg] });

      // Case 1: fromMe
      await messagesUpsertCallback(makeNotify({
        key: { fromMe: true, remoteJid: '123@s.whatsapp.net' },
        message: { conversation: 'hi' }
      }));
      expect(db.getCustomer).not.toHaveBeenCalled();

      // Case 2: Group JID
      await messagesUpsertCallback(makeNotify({
        key: { fromMe: false, remoteJid: '12345@g.us' },
        message: { conversation: 'hi' }
      }));
      expect(db.getCustomer).not.toHaveBeenCalled();

      // Case 3: Empty text and no media
      await messagesUpsertCallback(makeNotify({
        key: { fromMe: false, remoteJid: '123@s.whatsapp.net' },
        message: { conversation: '   ' }
      }));
      expect(db.getCustomer).not.toHaveBeenCalled();

      // Case 4: Command message
      await messagesUpsertCallback(makeNotify({
        key: { fromMe: false, remoteJid: '123@s.whatsapp.net' },
        message: { conversation: '/help' }
      }));
      expect(db.getCustomer).not.toHaveBeenCalled();

      // Case 5: Rate limited message
      db.getSetting.mockImplementation((key) => {
        if (key === 'rate_limit_window') return Promise.resolve('60000');
        if (key === 'rate_limit_max') return Promise.resolve('1'); // max 1 message allowed
        return Promise.resolve(null);
      });
      // First message initializes the window and is allowed
      await messagesUpsertCallback(makeNotify({
        key: { fromMe: false, remoteJid: 'rate-limited@s.whatsapp.net' },
        message: { conversation: 'message 1' }
      }));
      // Second message exceeds max of 1 and is rate limited
      await messagesUpsertCallback(makeNotify({
        key: { fromMe: false, remoteJid: 'rate-limited@s.whatsapp.net' },
        message: { conversation: 'message 2' }
      }));
      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Rate limit triggered'));
    });
  });

  describe('markdownToWhatsApp', () => {
    test('converts basic markdown bold, italic, and strikethrough', () => {
      expect(whatsapp.markdownToWhatsApp('Hello **world**!')).toBe('Hello *world*!');
      expect(whatsapp.markdownToWhatsApp('Hello __world__!')).toBe('Hello *world*!');
      expect(whatsapp.markdownToWhatsApp('Hello ~~world~~!')).toBe('Hello ~world~!');
    });

    test('converts bold italic combinations', () => {
      expect(whatsapp.markdownToWhatsApp('Hello ***world***!')).toBe('Hello *_world_*!');
      expect(whatsapp.markdownToWhatsApp('Hello ___world___!')).toBe('Hello *_world_*!');
    });

    test('preserves inline code blocks and fences', () => {
      expect(whatsapp.markdownToWhatsApp('Here is `**code**` and **bold**.')).toBe('Here is `**code**` and *bold*.');
      expect(whatsapp.markdownToWhatsApp('```\nconst a = "**bold**";\n```')).toBe('```\nconst a = "**bold**";\n```');
    });

    test('returns empty or null inputs as-is', () => {
      expect(whatsapp.markdownToWhatsApp('')).toBe('');
      expect(whatsapp.markdownToWhatsApp(null)).toBe(null);
      expect(whatsapp.markdownToWhatsApp(undefined)).toBe(undefined);
    });
  });

  describe('processPendingReplies', () => {
    let mockExecutableReplies;
    beforeEach(() => {
      mockExecutableReplies = [
        {
          id: 1,
          jid: '628123456@s.whatsapp.net',
          session_id: 'default',
          combined_text: 'Tanya Kue',
          image_part: null,
          image_url: null,
          voice_url: null,
          sender_name: 'Fardhan',
          message_keys: [{ remoteJid: '628123456@s.whatsapp.net', fromMe: false, id: '123' }],
          attempts: 0
        }
      ];
      db.getExecutablePendingReplies = jest.fn(() => Promise.resolve(mockExecutableReplies));
      db.deletePendingReply = jest.fn(() => Promise.resolve());
      db.incrementPendingReplyAttempt = jest.fn(() => Promise.resolve());
      
      // Ensure default session is ready in sessions Map
      whatsapp.sessions.set('default', { sock: mockSockObj, ready: true });
    });

    test('successfully retries a pending reply', async () => {
      agent.handleIncomingMessage.mockResolvedValue('AI Response for Retry');

      await whatsapp.processPendingReplies(mockLog);

      expect(agent.handleIncomingMessage).toHaveBeenCalledWith(
        '628123456@s.whatsapp.net',
        'Tanya Kue',
        'Fardhan',
        null,
        null,
        'default',
        null
      );
      expect(mockSockObj.readMessages).toHaveBeenCalledWith(mockExecutableReplies[0].message_keys);
      expect(mockSockObj.sendMessage).toHaveBeenCalledWith('628123456@s.whatsapp.net', { text: 'AI Response for Retry' });
      expect(db.deletePendingReply).toHaveBeenCalledWith(1);
    });

    test('increments attempts on retry failure', async () => {
      agent.handleIncomingMessage.mockRejectedValue(new Error('Gemini API Error'));

      await whatsapp.processPendingReplies(mockLog);

      expect(db.incrementPendingReplyAttempt).toHaveBeenCalledWith(1, 60);
      expect(db.deletePendingReply).not.toHaveBeenCalled();
    });
  });
});

