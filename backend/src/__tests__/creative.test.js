const { runCreativeAnalysis } = require('../services/creative');
const db = require('../db');
const whatsappService = require('../services/whatsapp');

// Mock db
jest.mock('../db', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn()
}));

// Mock whatsapp service
jest.mock('../services/whatsapp', () => ({
  isReady: jest.fn(() => true),
  sendMessage: jest.fn(() => Promise.resolve({ key: { id: 'msg-123' } }))
}));

// Mock Gemini AI
const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn(() => ({
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream
    }))
  }))
}));

// Mock global fetch for Meta API calls
global.fetch = jest.fn();

describe('creative.js service', () => {
  let mockLog;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLog = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  });

  test('successfully fetches ads, performs analysis, saves results, and sends WA broadcast', async () => {
    // 1. Setup mock DB settings
    db.getSetting.mockImplementation(async (key) => {
      if (key === 'gemini_api_key') return 'fake-gemini-key';
      if (key === 'meta_access_token') return 'fake-meta-token';
      if (key === 'meta_ad_account_id') return 'fake-ad-account-id';
      if (key === 'whatsapp_group_jid') return 'fake-group-jid';
      if (key === 'gemini_model') return 'gemini-1.5-flash';
      return null;
    });

    // 2. Setup mock Meta API responses
    const mockCreativesResponse = {
      data: [
        {
          id: 'ad-101',
          name: 'Promo Kue Cokelat Spektakuler',
          creative: {
            id: 'cr-101',
            title: 'Kue Cokelat Termantap',
            body: 'Beli kue cokelat sekarang juga! Diskon gede-gedean.'
          }
        },
        {
          id: 'ad-102',
          name: 'Promo Kue Sus Gagal',
          creative: {
            id: 'cr-102',
            title: 'Kue Sus Biasa Saja',
            body: 'Kue sus biasa, murah meriah.'
          }
        }
      ]
    };

    const mockInsightsResponse = {
      data: [
        {
          ad_id: 'ad-101',
          spend: '100000',
          impressions: '5000',
          reach: '4000',
          actions: [
            { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '25' }
          ]
        },
        {
          ad_id: 'ad-102',
          spend: '80000',
          impressions: '4000',
          reach: '3500',
          actions: [
            { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '2' }
          ]
        }
      ]
    };

    global.fetch.mockImplementation((url) => {
      if (url.includes('/ads?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCreativesResponse)
        });
      }
      if (url.includes('/insights?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockInsightsResponse)
        });
      }
      return Promise.reject(new Error('Unknown url: ' + url));
    });

    // 3. Setup mock Gemini AI structured response
    const mockReportResult = {
      winners: [
        { id: 'ad-101', name: 'Promo Kue Cokelat Spektakuler', explanation: 'CTR tinggi, konversi melimpah.' }
      ],
      losers: [
        { id: 'ad-102', name: 'Promo Kue Sus Gagal', explanation: 'Kacau balau, harga pesan terlalu mahal.' }
      ],
      ideas: [
        { title: 'Angle Cokelat Baru', angle: 'Emosi Kelezatan', visualGuide: 'Close-up kue cokelat meleleh', copywriting: 'Nikmati lumeran kebahagiaan!' }
      ]
    };

    mockGenerateContentStream.mockResolvedValueOnce({
      stream: (async function* () {
        yield { text: () => JSON.stringify(mockReportResult) };
      })()
    });

    const onProgress = jest.fn();
    const result = await runCreativeAnalysis(mockLog, onProgress);

    expect(result).toEqual(expect.objectContaining({
      winners: mockReportResult.winners,
      losers: mockReportResult.losers,
      ideas: mockReportResult.ideas
    }));
    expect(result).toHaveProperty('generatedAt');
    expect(result.isMock).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(db.setSetting).toHaveBeenCalledWith('creative_analysis_report', expect.any(String));
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      'fake-group-jid',
      expect.objectContaining({
        text: expect.stringContaining('Angle Cokelat Baru')
      })
    );
  });
});
