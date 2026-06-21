const Fastify = require('fastify');
const registerRoutes = require('../routes');
const whatsappService = require('../services/whatsapp');
const db = require('../db');

// Mock services & db
jest.mock('../db', () => ({
  getSessions: jest.fn(() => Promise.resolve([{ id: 'default', name: 'Default Session' }])),
  pool: {
    query: jest.fn()
  },
  getSetting: jest.fn(),
  setSetting: jest.fn(),
  loadAllSettings: jest.fn()
}));

jest.mock('../services/whatsapp', () => ({
  isReady: jest.fn(() => false)
}));

jest.mock('../services/followup', () => ({}));
jest.mock('../services/ads', () => ({}));
jest.mock('../agent', () => ({}));

describe('routes.js endpoint registration', () => {
  let fastify;

  beforeAll(async () => {
    fastify = Fastify({ logger: false });
    registerRoutes(fastify);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  test('GET /health returns disconnected status when WA is not ready', async () => {
    whatsappService.isReady.mockReturnValueOnce(false);

    const response = await fastify.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('disconnected');
    expect(body).toHaveProperty('timestamp');
  });

  test('GET /health returns connected status when WA is ready', async () => {
    whatsappService.isReady.mockReturnValueOnce(true);

    const response = await fastify.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('connected');
  });

  test('GET /api/settings returns settings successfully', async () => {
    db.getSetting.mockImplementation(async (key) => {
      if (key === 'gemini_api_key') return 'key-12345678-long-secret-key';
      if (key === 'system_instruction') return 'some prompt';
      return '';
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/settings'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.gemini_api_key).toBe('key-1234...-key');
    expect(body.system_instruction).toBe('some prompt');
  });
});
