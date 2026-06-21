require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const path = require('path');
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

// Register CORS to allow cross-origin requests from frontend
fastify.register(require('@fastify/cors'), {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

// Register multipart for file uploads
fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

// Ensure public/uploads directory exists
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Register Static Files to serve uploads directory
fastify.register(require('@fastify/static'), {
  root: uploadsDir,
  prefix: '/uploads/'
});

const PORT = process.env.WHATSAPP_PORT || 3001;

// Register API and redirect routes
registerRoutes(fastify);

// Start fastify server and initialize processes
async function start() {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`HTTP server listening on port ${PORT}`);
    
    // Initialize DB
    await db.initDb();

    // Connect to WhatsApp
    await whatsappService.connectToWhatsApp(fastify.log);

    // Initialize dynamic scheduler (Ads report, Creative analysis, Hourly followups)
    const scheduler = require('./src/services/scheduler');
    await scheduler.setupScheduledJobs(fastify.log);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
