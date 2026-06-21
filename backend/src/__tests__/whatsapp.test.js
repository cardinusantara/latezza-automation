const whatsapp = require('../services/whatsapp');
const agent = require('../agent');

// Mock db
jest.mock('../db', () => ({
  getSetting: jest.fn(() => Promise.resolve('')),
  getCustomer: jest.fn(),
  createOrUpdateCustomer: jest.fn(),
  getSessions: jest.fn(() => Promise.resolve([]))
}));

// Mock agent
jest.mock('../agent', () => ({
  handleIncomingMessage: jest.fn(() => Promise.resolve('Mock AI Response')),
  buildSystemInstructions: jest.fn()
}));

// Mock Baileys
jest.mock('@whiskeysockets/baileys', () => ({
  default: jest.fn(),
  useMultiFileAuthState: jest.fn(() => Promise.resolve({
    state: { creds: {} },
    saveCreds: jest.fn()
  })),
  DisconnectReason: {},
  downloadMediaMessage: jest.fn()
}));

// Mock Gemini SDK
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn()
}));

describe('WhatsApp Message Debouncing', () => {
  let mockSock;
  
  beforeEach(() => {
    jest.clearAllMocks();
    whatsapp.debounceCache.clear();
    
    mockSock = {
      sendPresenceUpdate: jest.fn(() => Promise.resolve()),
      sendMessage: jest.fn(() => Promise.resolve())
    };
  });

  test('should combine multiple text messages and trigger agent once', async () => {
    const cacheKey = 'default:12345@s.whatsapp.net';
    
    // Simulate debouncing three incoming messages
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

    await whatsapp.processDebouncedMessage(cacheKey);

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
    
    // Simulate incoming messages containing both images and text
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

    await whatsapp.processDebouncedMessage(cacheKey);

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
});
