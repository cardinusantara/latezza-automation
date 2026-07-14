const { handleIncomingMessage, buildAndCacheSystemPrompt } = require('../agent');
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
  getSystemPromptCache: jest.fn(),
  invalidateSystemPromptCache: jest.fn(),
  getSystemPromptStats: jest.fn(),
  saveUsageLog: jest.fn()
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

describe('System Prompt Caching Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildAndCacheSystemPrompt - Cache MISS scenario (saves to DB)', async () => {
    // 1. Mock DB returns null (cache empty)
    db.getSystemPromptCache.mockResolvedValueOnce(null);
    db.saveSystemPromptCache.mockResolvedValueOnce({
      business_id: 1,
      prompt_hash: 'mock-hash',
      cache_token_count: 500
    });

    const result = await buildAndCacheSystemPrompt(1);

    expect(result.isCached).toBe(false);
    expect(db.getSystemPromptCache).toHaveBeenCalledWith(1);
    expect(db.saveSystemPromptCache).toHaveBeenCalled();
    
    const [bizId, content, tokenCount] = db.saveSystemPromptCache.mock.calls[0];
    expect(bizId).toBe(1);
    expect(tokenCount).toBeGreaterThan(0); // must estimate token count
  });

  test('buildAndCacheSystemPrompt - Cache HIT scenario (does not save)', async () => {
    // Determine target hash by generating standard instruction
    const crypto = require('crypto');
    const { buildSystemInstructions } = require('../agent');
    const prompt = await buildSystemInstructions(1);
    const hash = crypto.createHash('sha256').update(prompt).digest('hex');

    // Mock DB returns active valid cache
    db.getSystemPromptCache.mockResolvedValueOnce({
      business_id: 1,
      prompt_hash: hash,
      cache_token_count: 800
    });

    const result = await buildAndCacheSystemPrompt(1);

    expect(result.isCached).toBe(true);
    expect(result.cacheTokenCount).toBe(800);
    expect(db.saveSystemPromptCache).not.toHaveBeenCalled();
  });

  test('handleIncomingMessage - MISS logger (cachedTokens = 0)', async () => {
    db.getSetting.mockImplementation(async (key) => {
      if (key === 'gemini_api_key') return 'mock-key';
      return null;
    });
    db.getCustomer.mockResolvedValueOnce({ phone_number: '123456@s.whatsapp.net', name: 'Customer' });
    
    // Simulate Cache MISS
    db.getSystemPromptCache.mockResolvedValueOnce(null);

    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => 'Halo!',
        functionCalls: () => [],
        usageMetadata: {
          promptTokenCount: 1500,
          candidatesTokenCount: 50,
          cachedContentTokenCount: 0
        }
      }
    });

    await handleIncomingMessage('123456@s.whatsapp.net', 'Hello', 'default');

    expect(db.saveUsageLog).toHaveBeenCalled();
    const logArgs = db.saveUsageLog.mock.calls[0][0];
    expect(logArgs.inputTokens).toBe(1500);
    expect(logArgs.cachedTokens).toBe(0); // MISS: cachedTokens must be 0
  });

  test('handleIncomingMessage - HIT logger (injects cachedTokens from cache count)', async () => {
    db.getSetting.mockImplementation(async (key) => {
      if (key === 'gemini_api_key') return 'mock-key';
      return null;
    });
    db.getCustomer.mockResolvedValueOnce({ phone_number: '123456@s.whatsapp.net', name: 'Customer' });
    
    // Determine hash
    const crypto = require('crypto');
    const { buildSystemInstructions } = require('../agent');
    const prompt = await buildSystemInstructions(1);
    const hash = crypto.createHash('sha256').update(prompt).digest('hex');

    // Simulate Cache HIT (cacheCount = 900)
    db.getSystemPromptCache.mockResolvedValueOnce({
      business_id: 1,
      prompt_hash: hash,
      cache_token_count: 900
    });

    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => 'Halo!',
        functionCalls: () => [],
        usageMetadata: {
          promptTokenCount: 1550,
          candidatesTokenCount: 60,
          cachedContentTokenCount: 0 // API returns 0 but DB cache HIT must override
        }
      }
    });

    await handleIncomingMessage('123456@s.whatsapp.net', 'Hello', 'default');

    expect(db.saveUsageLog).toHaveBeenCalled();
    const logArgs = db.saveUsageLog.mock.calls[0][0];
    expect(logArgs.inputTokens).toBe(1550);
    expect(logArgs.cachedTokens).toBe(900); // HIT: cachedTokens must be 900
  });
});
