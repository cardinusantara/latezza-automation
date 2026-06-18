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

    // Schedule Daily Ads Report at 9:00 AM (Asia/Jakarta)
    cron.schedule('0 9 * * *', () => {
      fastify.log.info('Running scheduled daily Meta Ads report at 9:00 AM...');
      adsService.runAnalysisAndSendReport(fastify.log)
        .catch(err => fastify.log.error(`Scheduled execution failed: ${err.message}`));
    }, {
      timezone: "Asia/Jakarta"
    });

    // Schedule Hourly Follow-ups (dynamic checks based on settings delay)
    cron.schedule('0 * * * *', () => {
      fastify.log.info('Running scheduled hourly customer follow-up check...');
      followupService.runProactiveFollowUps(fastify.log)
        .catch(err => fastify.log.error(`Scheduled follow-up failed: ${err.message}`));
    }, {
      timezone: "Asia/Jakarta"
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
