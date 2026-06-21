const { generateMessageSummary } = require('../services/summary');
const db = require('../db');

// Mock db module
jest.mock('../db', () => {
  return {
    getSetting: jest.fn(),
    setSetting: jest.fn(),
    pool: {
      query: jest.fn()
    }
  };
});

// Mock generative AI SDK
const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
  generateContentStream: mockGenerateContentStream
}));

jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel
    }))
  };
});

describe('summary.js service', () => {
  let mockLog;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLog = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  });

  test('returns empty summary when there are no messages', async () => {
    db.getSetting.mockImplementation(async (key) => {
      if (key === 'gemini_api_key') return 'mock-key';
      if (key === 'gemini_model') return 'gemini-1.5-flash';
      return null;
    });

    db.pool.query.mockResolvedValueOnce({ rows: [] }); // 0 messages

    const report = await generateMessageSummary(mockLog, null, 'all', 'today');

    expect(report.totalMessages).toBe(0);
    expect(report.totalCustomers).toBe(0);
    expect(db.setSetting).toHaveBeenCalledWith('message_summary_report', expect.any(String));
  });

  test('successfully generates summary using Gemini when messages exist', async () => {
    db.getSetting.mockImplementation(async (key) => {
      if (key === 'gemini_api_key') return 'mock-key';
      if (key === 'gemini_model') return 'gemini-1.5-flash';
      return null;
    });

    db.pool.query.mockResolvedValueOnce({
      rows: [
        { phone_number: '123', content: 'Halo, saya mau beli kue.', timestamp: new Date(), session_id: 'default' },
        { phone_number: '123', content: 'Apakah kue cokelat ready?', timestamp: new Date(), session_id: 'default' }
      ]
    });

    // Mock first pass (batch summary generation)
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => 'Batch 1 summary content'
      }
    });

    // Mock second pass (hierarchical streaming summary)
    const mockJsonResult = JSON.stringify({
      totalCustomers: 1,
      topProducts: ['Kue Cokelat'],
      commonQuestions: ['Apakah kue ready?'],
      complaints: [],
      salesOpportunities: ['Minat beli kue cokelat'],
      insights: ['Customer responsif']
    });

    mockGenerateContentStream.mockResolvedValueOnce({
      stream: (async function* () {
        yield { text: () => mockJsonResult };
      })()
    });

    const onProgress = jest.fn();
    const report = await generateMessageSummary(mockLog, onProgress, 'all', 'today');

    expect(report.totalMessages).toBe(2);
    expect(report.totalCustomers).toBe(1);
    expect(report.summary.topProducts).toContain('Kue Cokelat');
    expect(db.setSetting).toHaveBeenCalledWith('message_summary_report', expect.any(String));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ type: 'chunk' }));
  });
});
