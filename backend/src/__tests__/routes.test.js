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
  let authToken;

  beforeAll(async () => {
    process.env.DASHBOARD_PASSWORD = 'test-password';
    process.env.AUTH_JWT_SECRET = 'test-jwt-secret-for-testing';

    fastify = Fastify({ logger: false });
    await fastify.register(require('../auth'));
    registerRoutes(fastify);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    delete process.env.DASHBOARD_PASSWORD;
    delete process.env.AUTH_JWT_SECRET;
  });

  test('POST /api/auth/login returns token for correct password', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'test-password' }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('success');
    expect(body.token).toBeDefined();
    authToken = body.token;
  });

  test('POST /api/auth/login rejects wrong password', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'wrong-password' }
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.error).toBe('Unauthorized');
  });

  test('GET /api/auth/verify returns user for valid token', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/auth/verify',
      headers: { authorization: `Bearer ${authToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('success');
    expect(body.user.sub).toBe('admin');
  });

  test('GET /api/auth/verify rejects request without token', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/auth/verify'
    });

    expect(response.statusCode).toBe(401);
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

  test('GET /api/settings returns settings successfully with valid token', async () => {
    db.getSetting.mockImplementation(async (key) => {
      if (key === 'gemini_api_key') return 'key-12345678-long-secret-key';
      if (key === 'system_instruction') return 'some prompt';
      return '';
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { authorization: `Bearer ${authToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.gemini_api_key).toBe('key-1234...-key');
    expect(body.system_instruction).toBe('some prompt');
    expect(body.shopee_shop_id).toBe('479628817');
  });

  test('GET /api/settings returns 401 without token', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/settings'
    });

    expect(response.statusCode).toBe(401);
  });
});
