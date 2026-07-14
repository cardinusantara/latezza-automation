const { handleIncomingMessage, buildSystemInstructions } = require('../agent');
const db = require('../db');

// Mock db
jest.mock('../db', () => ({
  getSetting: jest.fn(),
  saveChatMessage: jest.fn(),
  getChatHistory: jest.fn(() => Promise.resolve([])),
  searchProducts: jest.fn(),
  createOrUpdateCustomer: jest.fn(),
  getCustomer: jest.fn(),
  getBusinessById: jest.fn(() => Promise.resolve({ id: 1, name: 'Latezza Cake Hampers' })),
  getSession: jest.fn(() => Promise.resolve({ id: 'default', business_id: 1 })),
  saveSystemPromptCache: jest.fn(),
  getSystemPromptCache: jest.fn(() => Promise.resolve(null)),
  invalidateSystemPromptCache: jest.fn(),
  getSystemPromptStats: jest.fn()
}));

// Mock generative AI SDK
const mockSendMessage = jest.fn();
const mockStartChat = jest.fn(() => ({
  sendMessage: mockSendMessage
}));
const mockGetGenerativeModel = jest.fn(() => ({
  startChat: mockStartChat
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel
  }))
}));

describe('agent.js module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildSystemInstructions generates valid plain text prompt', async () => {
    const prompt = await buildSystemInstructions();
    expect(prompt).toContain('WhatsApp AI Agent');
    expect(prompt).toContain('GAYA KOMUNIKASI');
    expect(prompt).toContain('ATURAN PENTING & KEAMANAN');
  });

  test('handles incoming user message and returns text reply', async () => {
    db.getSetting.mockImplementation(async (key) => {
      if (key === 'gemini_api_key') return 'mock-key';
      return null;
    });

    db.getCustomer.mockResolvedValueOnce({ phone_number: '123456@s.whatsapp.net', name: 'John' });

    const mockResponseText = 'Halo! Saya asisten AI Latezza.';
    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => mockResponseText,
        functionCalls: () => []
      }
    });

    const reply = await handleIncomingMessage('123456@s.whatsapp.net', 'Halo asisten!', 'default');

    expect(reply).toBe(mockResponseText);
    expect(db.saveChatMessage).toHaveBeenCalledWith('123456@s.whatsapp.net', 'user', 'Halo asisten!', 'default');
    expect(db.saveChatMessage).toHaveBeenCalledWith('123456@s.whatsapp.net', 'model', mockResponseText, 'default');
  });

  test('handles tool calls (function calling) requested by Gemini model', async () => {
    db.getSetting.mockImplementation(async (key) => {
      if (key === 'gemini_api_key') return 'mock-key';
      return null;
    });

    db.getCustomer.mockResolvedValueOnce(null); // triggers createOrUpdateCustomer
    db.createOrUpdateCustomer.mockResolvedValueOnce({ phone_number: '123456@s.whatsapp.net', name: 'Customer' });
    db.searchProducts.mockResolvedValueOnce([
      { product_name: 'Kue Cokelat Lumer', price: 50000, shopee_link: 'http://shopee.com/kue' }
    ]);

    // 1st sendMessage returns a function call request
    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => '',
        functionCalls: () => [{
          name: 'search_products',
          args: { query: 'kue cokelat' }
        }]
      }
    });

    // 2nd sendMessage (sending back function execution results) returns text response
    const mockFinalReply = 'Berikut adalah Kue Cokelat Lumer seharga Rp 50.000.';
    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => mockFinalReply,
        functionCalls: () => []
      }
    });

    const reply = await handleIncomingMessage('123456@s.whatsapp.net', 'Cari kue cokelat dong', 'default');

    expect(reply).toBe(mockFinalReply);
    expect(db.searchProducts).toHaveBeenCalledWith('kue cokelat', 1);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendMessage).toHaveBeenLastCalledWith([
      {
        functionResponse: {
          name: 'search_products',
          response: {
            products: [{ product_name: 'Kue Cokelat Lumer', price: 50000, shopee_link: 'http://shopee.com/kue' }]
          }
        }
      }
    ]);
  });
});
