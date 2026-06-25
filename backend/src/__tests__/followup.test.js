const followup = require('../services/followup');
const db = require('../db');
const whatsappService = require('../services/whatsapp');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel
  }))
}));

jest.mock('../db', () => ({
  getSetting: jest.fn(),
  getCustomersForFollowUp: jest.fn(),
  getChatHistory: jest.fn(),
  saveUsageLog: jest.fn(),
  saveChatMessage: jest.fn(),
  createOrUpdateCustomer: jest.fn()
}));

jest.mock('../services/whatsapp', () => ({
  isReady: jest.fn(),
  sendMessage: jest.fn()
}));

describe('Follow-up Service', () => {
  let mockLog;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLog = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
    process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite';
    process.env.GEMINI_API_KEY = 'test-key-env';
  });

  test('runProactiveFollowUps aborts if WhatsApp connection is not ready', async () => {
    whatsappService.isReady.mockReturnValue(false);

    await followup.runProactiveFollowUps(mockLog);

    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('WhatsApp connection is not ready'));
    expect(db.getCustomersForFollowUp).not.toHaveBeenCalled();
  });

  test('runProactiveFollowUps aborts if Gemini API Key is missing', async () => {
    whatsappService.isReady.mockReturnValue(true);
    db.getSetting.mockImplementation((key) => {
      if (key === 'followup_hours') return Promise.resolve('12');
      if (key === 'gemini_api_key') return Promise.resolve('');
      return Promise.resolve(null);
    });
    db.getCustomersForFollowUp.mockResolvedValue([]);
    delete process.env.GEMINI_API_KEY;

    await followup.runProactiveFollowUps(mockLog);

    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Gemini API Key is missing'));
  });

  test('runProactiveFollowUps handles main loop and catches root errors', async () => {
    whatsappService.isReady.mockReturnValue(true);
    db.getCustomersForFollowUp.mockRejectedValue(new Error('DB Query Failed'));

    await followup.runProactiveFollowUps(mockLog);

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Error during runProactiveFollowUps: DB Query Failed'));
  });

  test('processSingleFollowUp skips if WhatsApp session is not ready', async () => {
    whatsappService.isReady.mockImplementation((sessId) => {
      if (sessId === 'session1') return false;
      return true;
    });

    db.getSetting.mockImplementation((key) => {
      if (key === 'gemini_api_key') return Promise.resolve('key-from-db');
      return Promise.resolve(null);
    });

    db.getCustomersForFollowUp.mockResolvedValue([
      { phone_number: '123@s.whatsapp.net', session_id: 'session1', name: 'Alice' }
    ]);

    await followup.runProactiveFollowUps(mockLog);

    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('WhatsApp session "session1" is not ready. Skipping follow-up'));
    expect(db.getChatHistory).not.toHaveBeenCalled();
  });

  test('processSingleFollowUp skips if chat history is empty', async () => {
    whatsappService.isReady.mockReturnValue(true);
    db.getSetting.mockResolvedValue('key-from-db');
    db.getCustomersForFollowUp.mockResolvedValue([
      { phone_number: '123@s.whatsapp.net', session_id: 'default', name: 'Alice' }
    ]);
    db.getChatHistory.mockResolvedValue([]);

    await followup.runProactiveFollowUps(mockLog);

    expect(db.getChatHistory).toHaveBeenCalledWith('123@s.whatsapp.net', 10, 'default');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  test('processSingleFollowUp templates: default, custom prompt template, and natural language instruction', async () => {
    whatsappService.isReady.mockReturnValue(true);
    
    const lead = {
      phone_number: '123@s.whatsapp.net',
      session_id: 'default',
      name: 'Alice',
      follow_up_reason: 'Bertanya harga brownies'
    };
    db.getCustomersForFollowUp.mockResolvedValue([lead]);

    const history = [
      { role: 'user', content: 'Halo' },
      { role: 'model', content: 'Halo Kak Alice' }
    ];
    db.getChatHistory.mockResolvedValue(history);

    const mockResultText = 'Halo Kak Alice! Pesan follow up test.';
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => mockResultText,
        usageMetadata: {
          promptTokenCount: 50,
          candidatesTokenCount: 20,
          cachedContentTokenCount: 0
        }
      }
    });

    // Case 1: Default template (no userInstruction)
    db.getSetting.mockImplementation((key) => {
      if (key === 'gemini_api_key') return Promise.resolve('key-from-db');
      if (key === 'followup_instruction') return Promise.resolve(null);
      return Promise.resolve(null);
    });

    await followup.runProactiveFollowUps(mockLog);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const prompt1 = mockGenerateContent.mock.calls[0][0];
    expect(prompt1).toContain('Anda adalah staf CS toko kue Latezza');
    expect(prompt1).toContain('Customer: Halo\nAI Agent: Halo Kak Alice');
    expect(prompt1).toContain('Alasan follow-up: "Bertanya harga brownies"');
    expect(prompt1).toContain('INSTRUKSI OUTPUT (WAJIB DIIKUTI)');

    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      '123@s.whatsapp.net',
      { text: mockResultText },
      'default'
    );
    expect(db.saveUsageLog).toHaveBeenCalledWith({
      feature: 'followup',
      modelName: 'gemini-3.1-flash-lite',
      inputTokens: 50,
      outputTokens: 20,
      cachedTokens: 0
    });
    expect(db.saveChatMessage).toHaveBeenCalledWith('123@s.whatsapp.net', 'model', mockResultText, 'default');
    expect(db.createOrUpdateCustomer).toHaveBeenCalledWith(
      '123@s.whatsapp.net',
      null,
      { needs_follow_up: false, follow_up_reason: null },
      'default'
    );

    // Reset mocks for Case 2
    jest.clearAllMocks();
    db.getCustomersForFollowUp.mockResolvedValue([lead]);
    db.getChatHistory.mockResolvedValue(history);
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Custom response 2',
        usageMetadata: {}
      }
    });

    // Case 2: Custom Prompt Template containing {history}
    db.getSetting.mockImplementation((key) => {
      if (key === 'gemini_api_key') return Promise.resolve('key-from-db');
      if (key === 'followup_instruction') return Promise.resolve('Custom template with {history} for {name} about {reason}');
      return Promise.resolve(null);
    });

    await followup.runProactiveFollowUps(mockLog);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const prompt2 = mockGenerateContent.mock.calls[0][0];
    expect(prompt2).toContain('Custom template with Customer: Halo\nAI Agent: Halo Kak Alice for Alice about Bertanya harga brownies');

    // Reset mocks for Case 3
    jest.clearAllMocks();
    db.getCustomersForFollowUp.mockResolvedValue([lead]);
    db.getChatHistory.mockResolvedValue(history);
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Custom response 3',
        usageMetadata: null
      }
    });

    // Case 3: Natural language instruction (no {history})
    db.getSetting.mockImplementation((key) => {
      if (key === 'gemini_api_key') return Promise.resolve('key-from-db');
      if (key === 'followup_instruction') return Promise.resolve('Gunakan bahasa Jawa halus.');
      return Promise.resolve(null);
    });

    await followup.runProactiveFollowUps(mockLog);

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const prompt3 = mockGenerateContent.mock.calls[0][0];
    expect(prompt3).toContain('Instruksi khusus dari admin:\nGunakan bahasa Jawa halus.');
    expect(db.saveUsageLog).not.toHaveBeenCalled();
  });

  test('processSingleFollowUp handles generateContent failure gracefully', async () => {
    whatsappService.isReady.mockReturnValue(true);
    db.getSetting.mockResolvedValue('key-from-db');
    db.getCustomersForFollowUp.mockResolvedValue([
      { phone_number: '123@s.whatsapp.net', session_id: 'default', name: 'Alice' }
    ]);
    db.getChatHistory.mockResolvedValue([{ role: 'user', content: 'Halo' }]);
    mockGenerateContent.mockRejectedValue(new Error('Gemini Quota Exceeded'));

    await followup.runProactiveFollowUps(mockLog);

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Failed to follow up for 123@s.whatsapp.net: Gemini Quota Exceeded'));
    expect(whatsappService.sendMessage).not.toHaveBeenCalled();
  });
});
