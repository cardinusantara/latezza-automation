require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });
const path = require('node:path');
const Fastify = require('fastify');
const cron = require('node-cron');

// Import Database and Services
const db = require('./src/db');
const whatsappService = require('./src/services/whatsapp');
const followupService = require('./src/services/followup');
const adsService = require('./src/services/ads');
const registerRoutes = require('./src/routes');

// Initialize Fastify with pino logger
const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  }
});

// === Global error handlers to prevent silent crashes ===
// These prevent one bad async operation (e.g. WhatsApp, Gemini, scheduler) from taking down the entire API.
process.on('uncaughtException', (err) => {
  fastify.log.error({ err }, 'UNCAUGHT EXCEPTION - application will continue running');
  // Do NOT process.exit here — let the process manager (Docker restart policy) decide.
  // We log aggressively so we can see patterns in logs.
});

process.on('unhandledRejection', (reason, promise) => {
  fastify.log.error({ reason, promise }, 'UNHANDLED PROMISE REJECTION');
});

// === Improved CORS configuration ===
// Supports:
// - localhost dev
// - latezza-automation.vercel.app + any vercel preview deployments
// - explicit FRONTEND_URL (auto-fixed to include https if missing)
function normalizeOrigin(origin) {
  if (!origin) return origin;
  // Remove trailing slash
  return origin.replace(/\/$/, '');
}

const allowedOrigins = (origin, cb) => {
  if (!origin) {
    cb(null, true);
    return;
  }

  const normalized = normalizeOrigin(origin);

  // Always allow local development
  if (
    normalized.startsWith('http://localhost') ||
    normalized.startsWith('http://127.0.0.1') ||
    normalized.startsWith('http://192.168.')
  ) {
    cb(null, true);
    return;
  }

  // Production + Vercel deployments for this project
  // Matches:
  //   https://latezza-automation.vercel.app
  //   https://latezza-automation-abc123.vercel.app (previews)
  if (normalized.startsWith('https://latezza-automation') && normalized.includes('vercel.app')) {
    cb(null, true);
    return;
  }

  // Explicit FRONTEND_URL (normalize protocol if missing)
  const configured = process.env.FRONTEND_URL;
  if (configured) {
    let expected = normalizeOrigin(configured);
    if (!expected.startsWith('http')) {
      expected = 'https://' + expected;
    }
    if (normalized === expected) {
      cb(null, true);
      return;
    }
  }

  fastify.log.warn(`CORS rejected origin: ${origin}`);
  cb(new Error('Not allowed by CORS'), false);
};

fastify.register(require('@fastify/cors'), {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  // Important: preflight must be handled by the plugin
  preflight: true,
});

// Register multipart for file uploads
fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

// Ensure public/uploads directory exists
const fs = require('node:fs');
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Register Static Files to serve uploads directory
fastify.register(require('@fastify/static'), {
  root: uploadsDir,
  prefix: '/uploads/'
});

// === Lightweight health check (used by monitoring / load balancers / Cloudflare) ===
// This must be fast and not depend on WhatsApp connections.
fastify.get('/api/health', async (request, reply) => {
  try {
    // Very cheap DB ping
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

const PORT = process.env.WHATSAPP_PORT || 3001;

// Register Auth plugin (JWT + login/verify routes)
fastify.register(require('./src/auth'));

// Register API and redirect routes
registerRoutes(fastify);

// Start fastify server and initialize processes
async function start() {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`HTTP server listening on port ${PORT}`);
    
    // DB is critical — if this fails we cannot serve properly.
    await db.initDb();
    fastify.log.info('✅ Database initialized');

    // WhatsApp, scheduler and broadcast are important but we want the HTTP API
    // to stay up even if they have transient problems (they have their own retry logic).
    try {
      await whatsappService.connectToWhatsApp(fastify.log);
    } catch (waErr) {
      fastify.log.error({ err: waErr }, '⚠️ WhatsApp connection failed during startup (will retry internally)');
    }

    try {
      const scheduler = require('./src/services/scheduler');
      await scheduler.setupScheduledJobs(fastify.log);
      fastify.log.info('✅ Scheduler jobs registered');
    } catch (schedErr) {
      fastify.log.error({ err: schedErr }, '⚠️ Scheduler setup failed');
    }

    try {
      const broadcastService = require('./src/services/broadcast');
      await broadcastService.startQueueWorker(fastify.log);
      fastify.log.info('✅ Broadcast queue worker started');
    } catch (bcErr) {
      fastify.log.error({ err: bcErr }, '⚠️ Broadcast queue worker failed to start');
    }
  } catch (err) {
    fastify.log.error({ err }, 'Fatal error during startup');
    // Only exit for truly fatal early failures (e.g. port already in use, DB completely down at boot)
    process.exit(1);
  }
}

start();
