const fs = require('fs');
const path = require('path');
const db = require('./db');
const agent = require('./agent');
const whatsappService = require('./services/whatsapp');
const followupService = require('./services/followup');
const adsService = require('./services/ads');

function registerRoutes(fastify) {
  // Routes
  fastify.get('/health', async (request, reply) => {
    return {
      status: whatsappService.isReady() ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    };
  });

  fastify.get('/dashboard', async (request, reply) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    reply.redirect(frontendUrl);
  });

  fastify.get('/', async (request, reply) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    reply.redirect(frontendUrl);
  });

  // API: Stats Endpoint
  fastify.get('/api/stats', async (request, reply) => {
    try {
      const leadsCountRes = await db.pool.query('SELECT COUNT(*) FROM customers');
      const productsCountRes = await db.pool.query('SELECT COUNT(*) FROM products');
      const followupsCountRes = await db.pool.query('SELECT COUNT(*) FROM customers WHERE needs_follow_up = TRUE');
      const messagesCountRes = await db.pool.query('SELECT COUNT(*) FROM chat_histories');
      const recentLeadsRes = await db.pool.query('SELECT * FROM customers ORDER BY last_interaction DESC LIMIT 5');
      
      return {
        status: whatsappService.isReady() ? 'connected' : 'disconnected',
        totalLeads: parseInt(leadsCountRes.rows[0].count, 10),
        totalProducts: parseInt(productsCountRes.rows[0].count, 10),
        pendingFollowUps: parseInt(followupsCountRes.rows[0].count, 10),
        totalMessages: parseInt(messagesCountRes.rows[0].count, 10),
        recentLeads: recentLeadsRes.rows
      };
    } catch (err) {
      fastify.log.error(`API stats error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Customers List
  fastify.get('/api/customers', async (request, reply) => {
    try {
      const res = await db.pool.query('SELECT * FROM customers ORDER BY last_interaction DESC');
      return res.rows;
    } catch (err) {
      fastify.log.error(`API customers error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Get Single Customer Details
  fastify.get('/api/customers/:phone', async (request, reply) => {
    const { phone } = request.params;
    try {
      const customer = await db.getCustomer(phone);
      if (!customer) {
        reply.status(404);
        return { status: 'error', message: 'Customer not found.' };
      }
      return customer;
    } catch (err) {
      fastify.log.error(`API get customer error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Chat History
  fastify.get('/api/customers/:phone/history', async (request, reply) => {
    const { phone } = request.params;
    try {
      const res = await db.pool.query(
        'SELECT role, content, timestamp FROM chat_histories WHERE phone_number = $1 ORDER BY timestamp ASC',
        [phone]
      );
      return res.rows;
    } catch (err) {
      fastify.log.error(`API chat history error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Products List
  fastify.get('/api/products', async (request, reply) => {
    try {
      const res = await db.pool.query('SELECT * FROM products ORDER BY id ASC');
      return res.rows;
    } catch (err) {
      fastify.log.error(`API products error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Create Product
  fastify.post('/api/products', {
    schema: {
      body: {
        type: 'object',
        required: ['product_name', 'price'],
        properties: {
          product_name: { type: 'string' },
          price: { type: 'number' },
          description: { type: 'string' },
          image_url: { type: 'string' },
          shopee_link: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      const { product_name, price, description, image_url, shopee_link } = request.body;
      try {
        fastify.log.info(`Creating product: ${product_name}`);
        const res = await db.pool.query(
          `INSERT INTO products (product_name, price, description, image_url, shopee_link)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [product_name, price, description || '', image_url || '', shopee_link || '']
        );
        return res.rows[0];
      } catch (err) {
        fastify.log.error(`API create product error: ${err.message}`);
        reply.status(500);
        return { status: 'error', message: err.message };
      }
    }
  });

  // API: Update Product
  fastify.put('/api/products/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['product_name', 'price'],
        properties: {
          product_name: { type: 'string' },
          price: { type: 'number' },
          description: { type: 'string' },
          image_url: { type: 'string' },
          shopee_link: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { product_name, price, description, image_url, shopee_link } = request.body;
      try {
        fastify.log.info(`Updating product ID: ${id}`);
        const res = await db.pool.query(
          `UPDATE products 
           SET product_name = $1, price = $2, description = $3, image_url = $4, shopee_link = $5
           WHERE id = $6
           RETURNING *`,
          [product_name, price, description || '', image_url || '', shopee_link || '', id]
        );
        if (res.rows.length === 0) {
          reply.status(404);
          return { status: 'error', message: 'Product not found.' };
        }
        return res.rows[0];
      } catch (err) {
        fastify.log.error(`API update product error: ${err.message}`);
        reply.status(500);
        return { status: 'error', message: err.message };
      }
    }
  });

  // API: Delete Product
  fastify.delete('/api/products/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      fastify.log.info(`Deleting product ID: ${id}`);
      const res = await db.pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
      if (res.rows.length === 0) {
        reply.status(404);
        return { status: 'error', message: 'Product not found.' };
      }
      return { status: 'success', message: 'Product deleted successfully.' };
    } catch (err) {
      fastify.log.error(`API delete product error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Fetch WhatsApp Groups
  fastify.get('/api/whatsapp/groups', async (request, reply) => {
    try {
      fastify.log.info('Fetching connected WhatsApp groups...');
      const groupList = await whatsappService.getGroups();
      return groupList;
    } catch (err) {
      fastify.log.error(`Failed to fetch WhatsApp groups: ${err.message}`);
      return [];
    }
  });

  // API: Trigger Follow Ups Manual
  fastify.post('/api/trigger-followups', async (request, reply) => {
    try {
      fastify.log.info('Manual follow-up execution triggered via API');
      await followupService.runProactiveFollowUps(fastify.log, true);
      return { status: 'success', message: 'Proses follow-up selesai dijalankan.' };
    } catch (err) {
      fastify.log.error(`Manual follow-up error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Send manual message from Dashboard
  fastify.post('/api/customers/:phone/send-message', {
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      const { phone } = request.params;
      const { text } = request.body;

      try {
        fastify.log.info(`Sending manual dashboard message to ${phone}...`);
        const response = await whatsappService.sendMessage(phone, { text });
        
        await db.saveChatMessage(phone, 'model', text);
        await db.createOrUpdateCustomer(phone, null, {
          ai_enabled: false,
          needs_admin: false
        });

        return { status: 'success', messageId: response.key.id };
      } catch (err) {
        fastify.log.error(`Failed to send manual message: ${err.message}`);
        reply.status(err.message.includes('ready') ? 503 : 500);
        return { status: 'error', message: err.message };
      }
    }
  });

  // API: Toggle AI response for customer
  fastify.post('/api/customers/:phone/toggle-ai', {
    schema: {
      body: {
        type: 'object',
        required: ['ai_enabled'],
        properties: {
          ai_enabled: { type: 'boolean' }
        }
      }
    },
    handler: async (request, reply) => {
      const { phone } = request.params;
      const { ai_enabled } = request.body;

      try {
        fastify.log.info(`Toggling AI response for ${phone} to ${ai_enabled}`);
        await db.createOrUpdateCustomer(phone, null, { ai_enabled });
        return { status: 'success', ai_enabled };
      } catch (err) {
        fastify.log.error(`Failed to toggle AI: ${err.message}`);
        reply.status(500);
        return { status: 'error', message: err.message };
      }
    }
  });

  // API: Update Customer CRM details (status and notes)
  fastify.post('/api/customers/:phone/update-details', {
    schema: {
      body: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          notes: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      const { phone } = request.params;
      const { status, notes } = request.body;
      try {
        fastify.log.info(`Updating CRM details for customer ${phone}: status=${status}`);
        await db.createOrUpdateCustomer(phone, null, { status, notes });
        return { status: 'success' };
      } catch (err) {
        fastify.log.error(`Failed to update customer details: ${err.message}`);
        reply.status(500);
        return { status: 'error', message: err.message };
      }
    }
  });

  // API: GET settings
  fastify.get('/api/settings', async (request, reply) => {
    try {
      const geminiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY || '';
      const maskedKey = geminiKey ? `${geminiKey.substring(0, 8)}...${geminiKey.substring(geminiKey.length - 4)}` : '';
      
      const metaToken = await db.getSetting('meta_access_token') || process.env.META_ACCESS_TOKEN || '';
      const maskedMetaToken = metaToken ? `${metaToken.substring(0, 8)}...${metaToken.substring(metaToken.length - 4)}` : '';
      
      return {
        gemini_api_key: maskedKey,
        whatsapp_group_jid: await db.getSetting('whatsapp_group_jid') || process.env.WHATSAPP_GROUP_JID || '',
        rate_limit_max: await db.getSetting('rate_limit_max') || process.env.RATE_LIMIT_MAX_MSG || '5',
        rate_limit_window: await db.getSetting('rate_limit_window') || process.env.RATE_LIMIT_WINDOW_MS || '60000',
        followup_hours: await db.getSetting('followup_hours') || '24',
        system_instruction: await db.getSetting('system_instruction') || '',
        followup_instruction: await db.getSetting('followup_instruction') || '',
        meta_access_token: maskedMetaToken,
        meta_ad_account_id: await db.getSetting('meta_ad_account_id') || process.env.META_AD_ACCOUNT_ID || ''
      };
    } catch (err) {
      fastify.log.error(`GET settings error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: POST settings
  fastify.post('/api/settings', {
    schema: {
      body: {
        type: 'object',
        properties: {
          gemini_api_key: { type: 'string' },
          whatsapp_group_jid: { type: 'string' },
          rate_limit_max: { type: 'string' },
          rate_limit_window: { type: 'string' },
          followup_hours: { type: 'string' },
          system_instruction: { type: 'string' },
          followup_instruction: { type: 'string' },
          meta_access_token: { type: 'string' },
          meta_ad_account_id: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const settings = request.body;
        
        // Only save Gemini Key if it's new (doesn't contain mask '...')
        if (settings.gemini_api_key && !settings.gemini_api_key.includes('...')) {
          await db.setSetting('gemini_api_key', settings.gemini_api_key);
        }
        
        // Only save Meta Token if it's new (doesn't contain mask '...')
        if (settings.meta_access_token && !settings.meta_access_token.includes('...')) {
          await db.setSetting('meta_access_token', settings.meta_access_token);
        }
        
        if (settings.meta_ad_account_id !== undefined) await db.setSetting('meta_ad_account_id', settings.meta_ad_account_id);
        if (settings.whatsapp_group_jid !== undefined) await db.setSetting('whatsapp_group_jid', settings.whatsapp_group_jid);
        if (settings.rate_limit_max !== undefined) await db.setSetting('rate_limit_max', settings.rate_limit_max);
        if (settings.rate_limit_window !== undefined) await db.setSetting('rate_limit_window', settings.rate_limit_window);
        if (settings.followup_hours !== undefined) await db.setSetting('followup_hours', settings.followup_hours);
        if (settings.system_instruction !== undefined) await db.setSetting('system_instruction', settings.system_instruction);
        if (settings.followup_instruction !== undefined) await db.setSetting('followup_instruction', settings.followup_instruction);
        
        return { status: 'success' };
      } catch (err) {
        fastify.log.error(`POST settings error: ${err.message}`);
        reply.status(500);
        return { status: 'error', message: err.message };
      }
    }
  });

  // API: Get default system prompt preview
  fastify.get('/api/settings/default-system-prompt', async (request, reply) => {
    try {
      const defaultPrompt = agent.buildSystemInstructions();
      return { default_system_prompt: defaultPrompt };
    } catch (err) {
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Outgoing message directly
  fastify.post('/send-message', {
    schema: {
      body: {
        type: 'object',
        required: ['jid', 'text'],
        properties: {
          jid: { type: 'string' },
          text: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      const { jid, text } = request.body;
      try {
        fastify.log.info(`Sending message to ${jid}...`);
        const response = await whatsappService.sendMessage(jid, { text });
        return { status: 'success', messageId: response.key.id };
      } catch (err) {
        fastify.log.error(`Failed to send message: ${err.message}`);
        reply.status(err.message.includes('ready') ? 503 : 500);
        return { status: 'error', message: err.message };
      }
    }
  });

  fastify.get('/report-html', async (request, reply) => {
    const reportPath = path.join(__dirname, '../ads-analysis/report.html');
    try {
      const html = fs.readFileSync(reportPath, 'utf8');
      reply.type('text/html');
      return html;
    } catch (err) {
      fastify.log.error(`Failed to read report file: ${err.message}`);
      reply.status(404);
      return { status: 'error', message: 'Report file not found or not generated yet.' };
    }
  });

  fastify.post('/run-analysis', async (request, reply) => {
    try {
      const result = await adsService.runAnalysisRaw(fastify.log);
      return {
        status: 'success',
        stdout: result.stdout,
        stderr: result.stderr,
        publicUrl: process.env.PUBLIC_REPORT_URL || 'https://localhost:3001',
        whatsappGroupJid: process.env.WHATSAPP_GROUP_JID || '120363427625298309@g.us'
      };
    } catch (err) {
      reply.status(500);
      return { status: 'error', message: err.message, stderr: err.stderr, stdout: err.stdout };
    }
  });

  fastify.post('/trigger-analysis', async (request, reply) => {
    fastify.log.info('Manual analysis trigger received via POST /trigger-analysis');
    adsService.runAnalysisAndSendReport(fastify.log)
      .then(result => {
        fastify.log.info(`Manual analysis trigger completed successfully: ${result.messageId}`);
      })
      .catch(err => {
        fastify.log.error(`Manual analysis trigger failed: ${err.message}`);
      });
    return { status: 'success', message: 'Analysis triggered in background.' };
  });

  fastify.post('/run-followup', async (request, reply) => {
    fastify.log.info('Manual follow-up test received via POST /run-followup');
    followupService.runProactiveFollowUps(fastify.log, true)
      .then(() => {
        fastify.log.info('Manual follow-up completed.');
      })
      .catch(err => {
        fastify.log.error(`Manual follow-up failed: ${err.message}`);
      });
    return { status: 'success', message: 'Follow-up scan triggered in background. Check server logs.' };
  });
}

module.exports = registerRoutes;
