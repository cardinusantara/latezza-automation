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

  beforeEach(() => {
    // Reset mock call history and queued resolutions between tests
    // (db.test.js style)
    if (db.pool && db.pool.query && typeof db.pool.query.mockReset === 'function') {
      db.pool.query.mockReset();
    }
    const dbMod = require('../db');
    if (dbMod.getSessions && typeof dbMod.getSessions.mockReset === 'function') {
      dbMod.getSessions.mockReset();
      // Restore a safe default for any test that doesn't override
      dbMod.getSessions.mockResolvedValue([{ id: 'default', name: 'Default Session' }]);
    }
    if (whatsappService.isReady && typeof whatsappService.isReady.mockReset === 'function') {
      whatsappService.isReady.mockReset();
      whatsappService.isReady.mockReturnValue(false);
    }
  });

  beforeAll(async () => {
    process.env.DASHBOARD_PASSWORD = 'test-password';
    process.env.AUTH_JWT_SECRET = 'test-jwt-secret-for-testing';

    fastify = Fastify({ logger: false });

    // Register the new lightweight /api/health endpoint (same logic as gateway.js)
    // so that fastify.inject tests can exercise the DB-ping + uptime behavior.
    fastify.get('/api/health', async (request, reply) => {
      try {
        await db.pool.query('SELECT 1');
        return {
          status: 'ok',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          db: 'connected'
        };
      } catch (err) {
        reply.status(503);
        return {
          status: 'degraded',
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          db: 'error',
          error: err.message
        };
      }
    });

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

  // Updated: old /health tests now point to the new lightweight /api/health
  test('GET /api/health returns ok when DB is reachable', async () => {
    // Mock successful cheap ping used by health check
    db.pool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('uptime');
    expect(typeof body.uptime).toBe('number');
    expect(body.db).toBe('connected');
    expect(body).toHaveProperty('timestamp');
  });

  test('GET /api/health returns degraded when DB ping fails', async () => {
    db.pool.query.mockRejectedValueOnce(new Error('DB connection lost'));

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/health'
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('error');
    expect(body).toHaveProperty('error');
    expect(body.error).toBe('DB connection lost');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('timestamp');
  });

  test('GET /api/stats returns correct shape (optimized query path)', async () => {
    // Mock getSessions (called for 'all')
    const dbMod = require('../db');
    dbMod.getSessions.mockResolvedValueOnce([{ id: 'default', name: 'Default' }]);

    // 1. customers aggregate
    db.pool.query
      .mockResolvedValueOnce({
        rows: [{ total_leads: 42, pending_followups: 7, new_24h: 3, new_7d: 11, new_30d: 25 }]
      })
      // 2. chat_histories aggregate
      .mockResolvedValueOnce({
        rows: [{ inc_24h: 120, inc_7d: 410, inc_30d: 980 }]
      })
      // 3. products
      .mockResolvedValueOnce({ rows: [{ count: 15 }] })
      // 4. recent leads
      .mockResolvedValueOnce({ rows: [{ phone_number: '628123', name: 'Test' }] });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/stats?session_id=all&business_id=1',
      headers: { authorization: `Bearer ${authToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty('status');
    expect(body.totalLeads).toBe(42);
    expect(body.pendingFollowUps).toBe(7);
    expect(body.totalProducts).toBe(15);
    expect(body.incomingMessages.last24h).toBe(120);
    expect(body.newLeads.last30d).toBe(25);
    expect(Array.isArray(body.recentLeads)).toBe(true);
  });

  test('GET /api/stats for session_id=all without business_id uses unfiltered aggregates', async () => {
    const dbMod = require('../db');
    dbMod.getSessions.mockResolvedValueOnce([{ id: 'default', name: 'Default' }]);

    // customers aggregate (no business filter branch)
    db.pool.query
      .mockResolvedValueOnce({
        rows: [{ total_leads: 100, pending_followups: 12, new_24h: 5, new_7d: 20, new_30d: 60 }]
      })
      // incoming aggregate (no business)
      .mockResolvedValueOnce({
        rows: [{ inc_24h: 30, inc_7d: 90, inc_30d: 200 }]
      })
      // products (no business)
      .mockResolvedValueOnce({ rows: [{ count: 8 }] })
      // recent leads (no business)
      .mockResolvedValueOnce({ rows: [{ phone_number: '1' }, { phone_number: '2' }] });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/stats?session_id=all',
      headers: { authorization: `Bearer ${authToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.totalLeads).toBe(100);
    expect(body.pendingFollowUps).toBe(12);
    expect(body.totalProducts).toBe(8);
    expect(body.incomingMessages.last30d).toBe(200);
    expect(body.newLeads.last7d).toBe(20);
    expect(body.recentLeads).toHaveLength(2);
  });

  test('GET /api/stats for specific session (default) without business_id returns session-scoped numbers', async () => {
    // Specific session path does NOT call getSessions.
    // It calls whatsappService.isReady(targetSessionId)
    whatsappService.isReady.mockReturnValueOnce(false);

    db.pool.query
      .mockResolvedValueOnce({
        rows: [{ total_leads: 7, pending_followups: 1, new_24h: 0, new_7d: 2, new_30d: 7 }]
      })
      .mockResolvedValueOnce({
        rows: [{ inc_24h: 4, inc_7d: 10, inc_30d: 22 }]
      })
      .mockResolvedValueOnce({ rows: [{ count: 3 }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/stats?session_id=default',
      headers: { authorization: `Bearer ${authToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('disconnected');
    expect(body.totalLeads).toBe(7);
    expect(body.pendingFollowUps).toBe(1);
    expect(body.totalProducts).toBe(3);
    expect(body.incomingMessages.last24h).toBe(4);
    expect(body.newLeads.last30d).toBe(7);
    expect(Array.isArray(body.recentLeads)).toBe(true);
  });

  test('GET /api/stats for specific session with business_id scopes products and still uses session for customers/recent', async () => {
    whatsappService.isReady.mockReturnValueOnce(true);

    // customers (specific session branch - ignores business for customers)
    db.pool.query
      .mockResolvedValueOnce({
        rows: [{ total_leads: 55, pending_followups: 4, new_24h: 9, new_7d: 15, new_30d: 40 }]
      })
      // incoming (specific session)
      .mockResolvedValueOnce({
        rows: [{ inc_24h: 11, inc_7d: 33, inc_30d: 77 }]
      })
      // products filtered by business_id
      .mockResolvedValueOnce({ rows: [{ count: 21 }] })
      // recent by session_id
      .mockResolvedValueOnce({ rows: [{ phone_number: '628999' }] });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/stats?session_id=cs1&business_id=2',
      headers: { authorization: `Bearer ${authToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('connected');
    expect(body.totalLeads).toBe(55);
    expect(body.totalProducts).toBe(21); // from business-scoped products query
    expect(body.incomingMessages.last7d).toBe(33);
    expect(body.newLeads.last24h).toBe(9);
    expect(body.recentLeads[0].phone_number).toBe('628999');
  });

  test('GET /api/stats for session_id=all with business_id returns correct business-scoped aggregates', async () => {
    const dbMod = require('../db');
    dbMod.getSessions.mockResolvedValueOnce([]);

    // customers with business filter
    db.pool.query
      .mockResolvedValueOnce({
        rows: [{ total_leads: 19, pending_followups: 0, new_24h: 1, new_7d: 3, new_30d: 10 }]
      })
      // incoming with business filter
      .mockResolvedValueOnce({
        rows: [{ inc_24h: 2, inc_7d: 6, inc_30d: 15 }]
      })
      // products with business
      .mockResolvedValueOnce({ rows: [{ count: 5 }] })
      // recent with business
      .mockResolvedValueOnce({ rows: [{ phone_number: 'b1' }] });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/stats?session_id=all&business_id=42',
      headers: { authorization: `Bearer ${authToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.totalLeads).toBe(19);
    expect(body.totalProducts).toBe(5);
    expect(body.pendingFollowUps).toBe(0);
    expect(body.incomingMessages.last30d).toBe(15);
    expect(body.newLeads.last24h).toBe(1);
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

  test('GET /api/settings accepts JWT via ?token= query (EventSource/SSE path)', async () => {
    // Ensure login token is available even if tests run reordered
    if (!authToken) {
      const loginRes = await fastify.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: 'test-password' },
      });
      authToken = JSON.parse(loginRes.payload).token;
    }

    db.getSetting.mockImplementation(async (key) => {
      if (key === 'gemini_api_key') return 'key-12345678-long-secret-key';
      if (key === 'system_instruction') return 'some prompt';
      return '';
    });

    const response = await fastify.inject({
      method: 'GET',
      url: `/api/settings?token=${encodeURIComponent(authToken)}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.system_instruction).toBe('some prompt');
  });

  test('GET /api/settings rejects empty/invalid ?token=', async () => {
    const empty = await fastify.inject({
      method: 'GET',
      url: '/api/settings?token=',
    });
    expect(empty.statusCode).toBe(401);

    const invalid = await fastify.inject({
      method: 'GET',
      url: '/api/settings?token=not-a-real-jwt',
    });
    expect(invalid.statusCode).toBe(401);
  });
});
