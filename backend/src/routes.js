const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const db = require('./db');
const agent = require('./agent');
const whatsappService = require('./services/whatsapp');
const followupService = require('./services/followup');
const adsService = require('./services/ads');
const broadcastService = require('./services/broadcast');

function convertWebmToOgg(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-i', inputPath,
      '-c:a', 'libopus',
      '-b:a', '16k',
      '-ar', '48000',
      '-ac', '1',
      '-y',
      outputPath
    ], (error, stdout, stderr) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(error?.message || 'unknown error'));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Helper to process manual audio message upload, transcode, transcribe and send via WhatsApp
 */
async function handleManualAudioMessage(phone, audioBase64, targetSessionId, fastify) {
  fastify.log.info(`🎙️ Received manual voice message for ${phone} on session ${targetSessionId}...`);
  const buffer = Buffer.from(audioBase64, 'base64');
  
  // Ensure uploads directory exists (resolving to backend/public/uploads)
  const uploadsDir = path.join(__dirname, '../public/uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Temporary file for original webm audio
  const tempFilename = `voice_out_temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.webm`;
  const tempFilepath = path.join(uploadsDir, tempFilename);
  fs.writeFileSync(tempFilepath, buffer);

  // Output converted .ogg file path
  const outputFilename = `voice_out_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.ogg`;
  const outputFilepath = path.join(uploadsDir, outputFilename);

  try {
    fastify.log.info(`🔄 Transcoding audio from ${tempFilepath} to ${outputFilepath}...`);
    await convertWebmToOgg(tempFilepath, outputFilepath);
    fastify.log.info(`✅ Audio transcoded successfully to Ogg Opus.`);
  } catch (transcodeErr) {
    fastify.log.error(`❌ Transcoding failed: ${transcodeErr.message}. Falling back to original audio.`);
    fs.copyFileSync(tempFilepath, outputFilepath);
  } finally {
    if (fs.existsSync(tempFilepath)) {
      try {
        fs.unlinkSync(tempFilepath);
      } catch (unlinkErr) {
        fastify.log.error(`Failed to delete temp file: ${unlinkErr.message}`);
      }
    }
  }

  const voiceUrl = `/uploads/${outputFilename}`;
  const oggBuffer = fs.readFileSync(outputFilepath);
  let finalReplyText = '';

  try {
    fastify.log.info(`🧠 Transcribing outgoing audio...`);
    const transcription = await whatsappService.transcribeAudio(oggBuffer, 'audio/ogg', fastify.log);
    finalReplyText = transcription;
    fastify.log.info(`📝 Outgoing audio transcription: "${finalReplyText}"`);
  } catch (tErr) {
    fastify.log.error(`Failed to transcribe outgoing audio: ${tErr.message}`);
    finalReplyText = '[Pesan Suara Kiriman]';
  }

  fastify.log.info(`📤 Sending WhatsApp voice note to ${phone}...`);
  const response = await whatsappService.sendMessage(phone, { 
    audio: oggBuffer, 
    mimetype: 'audio/ogg; codecs=opus', 
    ptt: true 
  }, targetSessionId);

  const dbText = `[Voice Note: ${voiceUrl}] ${finalReplyText}`.trim();
  await db.saveChatMessage(phone, 'model', dbText, targetSessionId);
  await db.createOrUpdateCustomer(phone, null, {
    ai_enabled: false,
    needs_admin: false
  }, targetSessionId);

  return { 
    status: 'success', 
    messageId: response.key.id, 
    voiceUrl, 
    transcription: finalReplyText 
  };
}

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
      const { session_id, business_id } = request.query;
      const parsedBusinessId = business_id ? Number.parseInt(business_id, 10) : null;
      
      let leadsCountRes, followupsCountRes, recentLeadsRes;
      let incomingLast24h, incomingLast7d, incomingLast30d;
      let newLeadsLast24h, newLeadsLast7d, newLeadsLast30d;
      let status;

      if (session_id === 'all') {
        const sessions = await db.getSessions(parsedBusinessId);
        const anyReady = sessions.some(s => whatsappService.isReady(s.id));
        status = anyReady ? 'connected' : 'disconnected';

        if (parsedBusinessId) {
          leadsCountRes = await db.pool.query('SELECT COUNT(*) FROM customers WHERE business_id = $1', [parsedBusinessId]);
          followupsCountRes = await db.pool.query('SELECT COUNT(*) FROM customers WHERE needs_follow_up = TRUE AND business_id = $1', [parsedBusinessId]);
          recentLeadsRes = await db.pool.query('SELECT * FROM customers WHERE business_id = $1 ORDER BY last_interaction DESC LIMIT 5', [parsedBusinessId]);

          incomingLast24h = await db.pool.query("SELECT COUNT(*) FROM chat_histories WHERE role = 'user' AND business_id = $1 AND timestamp >= NOW() - INTERVAL '24 hours'", [parsedBusinessId]);
          incomingLast7d = await db.pool.query("SELECT COUNT(*) FROM chat_histories WHERE role = 'user' AND business_id = $1 AND timestamp >= NOW() - INTERVAL '7 days'", [parsedBusinessId]);
          incomingLast30d = await db.pool.query("SELECT COUNT(*) FROM chat_histories WHERE role = 'user' AND business_id = $1 AND timestamp >= NOW() - INTERVAL '30 days'", [parsedBusinessId]);

          newLeadsLast24h = await db.pool.query("SELECT COUNT(*) FROM customers WHERE business_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'", [parsedBusinessId]);
          newLeadsLast7d = await db.pool.query("SELECT COUNT(*) FROM customers WHERE business_id = $1 AND created_at >= NOW() - INTERVAL '7 days'", [parsedBusinessId]);
          newLeadsLast30d = await db.pool.query("SELECT COUNT(*) FROM customers WHERE business_id = $1 AND created_at >= NOW() - INTERVAL '30 days'", [parsedBusinessId]);
        } else {
          leadsCountRes = await db.pool.query('SELECT COUNT(*) FROM customers');
          followupsCountRes = await db.pool.query('SELECT COUNT(*) FROM customers WHERE needs_follow_up = TRUE');
          recentLeadsRes = await db.pool.query('SELECT * FROM customers ORDER BY last_interaction DESC LIMIT 5');

          incomingLast24h = await db.pool.query("SELECT COUNT(*) FROM chat_histories WHERE role = 'user' AND timestamp >= NOW() - INTERVAL '24 hours'");
          incomingLast7d = await db.pool.query("SELECT COUNT(*) FROM chat_histories WHERE role = 'user' AND timestamp >= NOW() - INTERVAL '7 days'");
          incomingLast30d = await db.pool.query("SELECT COUNT(*) FROM chat_histories WHERE role = 'user' AND timestamp >= NOW() - INTERVAL '30 days'");

          newLeadsLast24h = await db.pool.query("SELECT COUNT(*) FROM customers WHERE created_at >= NOW() - INTERVAL '24 hours'");
          newLeadsLast7d = await db.pool.query("SELECT COUNT(*) FROM customers WHERE created_at >= NOW() - INTERVAL '7 days'");
          newLeadsLast30d = await db.pool.query("SELECT COUNT(*) FROM customers WHERE created_at >= NOW() - INTERVAL '30 days'");
        }
      } else {
        const targetSessionId = session_id || 'default';
        status = whatsappService.isReady(targetSessionId) ? 'connected' : 'disconnected';

        leadsCountRes = await db.pool.query('SELECT COUNT(*) FROM customers WHERE session_id = $1', [targetSessionId]);
        followupsCountRes = await db.pool.query('SELECT COUNT(*) FROM customers WHERE needs_follow_up = TRUE AND session_id = $1', [targetSessionId]);
        recentLeadsRes = await db.pool.query('SELECT * FROM customers WHERE session_id = $1 ORDER BY last_interaction DESC LIMIT 5', [targetSessionId]);

        incomingLast24h = await db.pool.query("SELECT COUNT(*) FROM chat_histories WHERE role = 'user' AND session_id = $1 AND timestamp >= NOW() - INTERVAL '24 hours'", [targetSessionId]);
        incomingLast7d = await db.pool.query("SELECT COUNT(*) FROM chat_histories WHERE role = 'user' AND session_id = $1 AND timestamp >= NOW() - INTERVAL '7 days'", [targetSessionId]);
        incomingLast30d = await db.pool.query("SELECT COUNT(*) FROM chat_histories WHERE role = 'user' AND session_id = $1 AND timestamp >= NOW() - INTERVAL '30 days'", [targetSessionId]);

        newLeadsLast24h = await db.pool.query("SELECT COUNT(*) FROM customers WHERE session_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'", [targetSessionId]);
        newLeadsLast7d = await db.pool.query("SELECT COUNT(*) FROM customers WHERE session_id = $1 AND created_at >= NOW() - INTERVAL '7 days'", [targetSessionId]);
        newLeadsLast30d = await db.pool.query("SELECT COUNT(*) FROM customers WHERE session_id = $1 AND created_at >= NOW() - INTERVAL '30 days'", [targetSessionId]);
      }
      
      let productsCountRes;
      if (parsedBusinessId) {
        productsCountRes = await db.pool.query('SELECT COUNT(*) FROM products WHERE business_id = $1', [parsedBusinessId]);
      } else {
        productsCountRes = await db.pool.query('SELECT COUNT(*) FROM products');
      }
      
      return {
        status,
        totalLeads: Number.parseInt(leadsCountRes.rows[0].count, 10),
        totalProducts: Number.parseInt(productsCountRes.rows[0].count, 10),
        pendingFollowUps: Number.parseInt(followupsCountRes.rows[0].count, 10),
        incomingMessages: {
          last24h: Number.parseInt(incomingLast24h.rows[0].count, 10),
          last7d: Number.parseInt(incomingLast7d.rows[0].count, 10),
          last30d: Number.parseInt(incomingLast30d.rows[0].count, 10),
        },
        newLeads: {
          last24h: Number.parseInt(newLeadsLast24h.rows[0].count, 10),
          last7d: Number.parseInt(newLeadsLast7d.rows[0].count, 10),
          last30d: Number.parseInt(newLeadsLast30d.rows[0].count, 10),
        },
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
      const { session_id, business_id } = request.query;
      if (business_id) {
        const res = await db.pool.query('SELECT * FROM customers WHERE business_id = $1 ORDER BY last_interaction DESC', [Number.parseInt(business_id, 10)]);
        return res.rows;
      }
      const targetSessionId = session_id || 'default';
      const res = await db.pool.query('SELECT * FROM customers WHERE session_id = $1 ORDER BY last_interaction DESC', [targetSessionId]);
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
    const { session_id } = request.query;
    try {
      const customer = await db.getCustomer(phone, session_id || 'default');
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
    const { session_id } = request.query;
    try {
      const res = await db.pool.query(
        'SELECT role, content, timestamp FROM chat_histories WHERE phone_number = $1 AND session_id = $2 ORDER BY timestamp ASC',
        [phone, session_id || 'default']
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
      const { business_id } = request.query;
      if (business_id) {
        const res = await db.pool.query('SELECT * FROM products WHERE business_id = $1 ORDER BY id ASC', [Number.parseInt(business_id, 10)]);
        return res.rows;
      }
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
          shopee_link: { type: 'string' },
          business_id: { type: 'integer' }
        }
      }
    },
    handler: async (request, reply) => {
      const { product_name, price, description, image_url, shopee_link, business_id } = request.body;
      const finalBusinessId = business_id ? Number.parseInt(business_id, 10) : 1;
      const finalShopeeLink = (shopee_link && shopee_link.includes('shop=657336422') && shopee_link.includes('keyword='))
        ? shopee_link
        : `https://shopee.co.id/search?keyword=${encodeURIComponent(product_name)}&shop=657336422`;

      try {
        fastify.log.info(`Creating product: ${product_name} for business ${finalBusinessId}`);
        const res = await db.pool.query(
          `INSERT INTO products (product_name, price, description, image_url, shopee_link, business_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [product_name, price, description || '', image_url || '', finalShopeeLink, finalBusinessId]
        );
        const product = res.rows[0];

        // Generate and save embedding in background
        const apiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
        if (apiKey) {
          db.generateEmbedding(apiKey, product_name, description || '')
             .then(async (embedding) => {
               if (embedding) {
                 await db.pool.query('UPDATE products SET embedding = $1 WHERE id = $2', [JSON.stringify(embedding), product.id]);
                 fastify.log.info(`✅ Generated embedding for new product: ${product_name}`);
               }
             })
             .catch(err => {
               fastify.log.error(`Failed to generate embedding for new product "${product_name}": ${err.message}`);
             });
        }

        return product;
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
      const finalShopeeLink = (shopee_link && shopee_link.includes('shop=657336422') && shopee_link.includes('keyword='))
        ? shopee_link
        : `https://shopee.co.id/search?keyword=${encodeURIComponent(product_name)}&shop=657336422`;

      try {
        fastify.log.info(`Updating product ID: ${id}`);
        const res = await db.pool.query(
          `UPDATE products 
           SET product_name = $1, price = $2, description = $3, image_url = $4, shopee_link = $5
           WHERE id = $6
           RETURNING *`,
          [product_name, price, description || '', image_url || '', finalShopeeLink, id]
        );
        if (res.rows.length === 0) {
          reply.status(404);
          return { status: 'error', message: 'Product not found.' };
        }
        const product = res.rows[0];

        // Regenerate embedding in background
        const apiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
        if (apiKey) {
          db.generateEmbedding(apiKey, product_name, description || '')
            .then(async (embedding) => {
              if (embedding) {
                await db.pool.query('UPDATE products SET embedding = $1 WHERE id = $2', [JSON.stringify(embedding), product.id]);
                fastify.log.info(`✅ Updated embedding for product: ${product_name}`);
              }
            })
            .catch(err => {
              fastify.log.error(`Failed to update embedding for product "${product_name}": ${err.message}`);
            });
        }

        return product;
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
    const { session_id } = request.query;
    try {
      fastify.log.info(`Fetching connected WhatsApp groups for session ${session_id || 'default'}...`);
      const groupList = await whatsappService.getGroups(session_id || 'default');
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

  // API: Send manual message from Dashboard (supports text and voice note)
  fastify.post('/api/customers/:phone/send-message', {
    schema: {
      body: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          audioBase64: { type: 'string' },
          mimetype: { type: 'string' },
          session_id: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      const { phone } = request.params;
      const { text, audioBase64, session_id } = request.body;
      const targetSessionId = session_id || 'default';

      try {
        if (audioBase64) {
          return await handleManualAudioMessage(phone, audioBase64, targetSessionId, fastify);
        } else {
          // Standard text message send
          fastify.log.info(`Sending manual dashboard message to ${phone} on session ${targetSessionId}...`);
          const response = await whatsappService.sendMessage(phone, { text: text || '' }, targetSessionId);
          
          await db.saveChatMessage(phone, 'model', text || '', targetSessionId);
          await db.createOrUpdateCustomer(phone, null, {
            ai_enabled: false,
            needs_admin: false
          }, targetSessionId);

          return { status: 'success', messageId: response.key.id };
        }
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
          ai_enabled: { type: 'boolean' },
          session_id: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      const { phone } = request.params;
      const { ai_enabled, session_id } = request.body;
      const targetSessionId = session_id || 'default';

      try {
        fastify.log.info(`Toggling AI response for ${phone} to ${ai_enabled} on session ${targetSessionId}`);
        await db.createOrUpdateCustomer(phone, null, { ai_enabled }, targetSessionId);
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
          notes: { type: 'string' },
          session_id: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      const { phone } = request.params;
      const { status, notes, session_id } = request.body;
      const targetSessionId = session_id || 'default';
      try {
        fastify.log.info(`Updating CRM details for customer ${phone} on session ${targetSessionId}: status=${status}`);
        await db.createOrUpdateCustomer(phone, null, { status, notes }, targetSessionId);
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
        gemini_model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
        whatsapp_group_jid: await db.getSetting('whatsapp_group_jid') || process.env.WHATSAPP_GROUP_JID || '',
        rate_limit_max: await db.getSetting('rate_limit_max') || process.env.RATE_LIMIT_MAX_MSG || '5',
        rate_limit_window: await db.getSetting('rate_limit_window') || process.env.RATE_LIMIT_WINDOW_MS || '60000',
        followup_hours: await db.getSetting('followup_hours') || '24',
        system_instruction: await db.getSetting('system_instruction') || '',
        followup_instruction: await db.getSetting('followup_instruction') || '',
        meta_access_token: maskedMetaToken,
        meta_ad_account_id: await db.getSetting('meta_ad_account_id') || process.env.META_AD_ACCOUNT_ID || '',
        ads_analysis_enabled: await db.getSetting('ads_analysis_enabled') || 'true',
        ads_analysis_frequency: await db.getSetting('ads_analysis_frequency') || '1',
        ads_analysis_time: await db.getSetting('ads_analysis_time') || '09:00',
        creative_analysis_enabled: await db.getSetting('creative_analysis_enabled') || 'true',
        creative_analysis_frequency: await db.getSetting('creative_analysis_frequency') || '7',
        creative_analysis_time: await db.getSetting('creative_analysis_time') || '09:00',
        shopee_shop_id: await db.getSetting('shopee_shop_id') || '657336422'
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
          meta_ad_account_id: { type: 'string' },
          ads_analysis_frequency: { type: 'string' },
          ads_analysis_time: { type: 'string' },
          creative_analysis_frequency: { type: 'string' },
          creative_analysis_time: { type: 'string' },
          shopee_shop_id: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const settings = request.body;
        
        // Loop through standard settings and update if defined
        const standardKeys = [
          'meta_ad_account_id',
          'whatsapp_group_jid',
          'rate_limit_max',
          'rate_limit_window',
          'followup_hours',
          'system_instruction',
          'followup_instruction',
          'ads_analysis_enabled',
          'ads_analysis_frequency',
          'ads_analysis_time',
          'creative_analysis_enabled',
          'creative_analysis_frequency',
          'creative_analysis_time',
          'shopee_shop_id'
        ];

        for (const key of standardKeys) {
          if (settings[key] !== undefined) {
            await db.setSetting(key, settings[key]);
          }
        }

        // Special keys that require validation / masking
        if (settings.gemini_api_key && !settings.gemini_api_key.includes('...')) {
          await db.setSetting('gemini_api_key', settings.gemini_api_key);
        }
        if (settings.meta_access_token && !settings.meta_access_token.includes('...')) {
          await db.setSetting('meta_access_token', settings.meta_access_token);
        }
        
        // Dynamically reload background schedules to reflect changes immediately
        const scheduler = require('./services/scheduler');
        scheduler.reloadSchedules(fastify.log).catch(err => {
          fastify.log.error(`Failed to reload background schedules: ${err.message}`);
        });

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

  // API: Get Gemini usage stats and billing cost log
  fastify.get('/api/settings/usage-stats', async (request, reply) => {
    try {
      // 1. Fetch Month-To-Date overall summary
      const mtdRes = await db.pool.query(`
        SELECT 
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(cached_input_tokens), 0) as cached_tokens,
          COALESCE(SUM(cost_usd), 0) as cost_usd,
          COALESCE(SUM(cost_idr), 0) as cost_idr,
          COUNT(*)::int as total_requests
        FROM api_usage_logs
        WHERE timestamp >= DATE_TRUNC('month', CURRENT_DATE)
      `);
      const mtd = mtdRes.rows[0];

      // 2. Fetch daily billing trend for chart plotting (last 30 days)
      const dailyTrendRes = await db.pool.query(`
        SELECT 
          TO_CHAR(timestamp, 'YYYY-MM-DD') as date,
          SUM(input_tokens)::int as input_tokens,
          SUM(output_tokens)::int as output_tokens,
          SUM(cached_input_tokens)::int as cached_tokens,
          SUM(cost_idr)::double precision as cost_idr,
          COUNT(*)::int as request_count
        FROM api_usage_logs
        WHERE timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY TO_CHAR(timestamp, 'YYYY-MM-DD')
        ORDER BY date ASC
      `);
      const dailyTrend = dailyTrendRes.rows;

      // 3. Fetch breakdown by feature
      const featureBreakdownRes = await db.pool.query(`
        SELECT 
          feature,
          SUM(input_tokens)::int as input_tokens,
          SUM(output_tokens)::int as output_tokens,
          SUM(cached_input_tokens)::int as cached_tokens,
          SUM(cost_idr)::double precision as cost_idr,
          COUNT(*)::int as request_count
        FROM api_usage_logs
        WHERE timestamp >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY feature
        ORDER BY cost_idr DESC
      `);
      const featureBreakdown = featureBreakdownRes.rows;

      return {
        status: 'success',
        mtd: {
          inputTokens: Number.parseInt(mtd.input_tokens, 10),
          outputTokens: Number.parseInt(mtd.output_tokens, 10),
          cachedTokens: Number.parseInt(mtd.cached_tokens, 10),
          costUsd: Number.parseFloat(mtd.cost_usd),
          costIdr: Number.parseFloat(mtd.cost_idr),
          totalRequests: mtd.total_requests
        },
        dailyTrend,
        featureBreakdown
      };
    } catch (err) {
      fastify.log.error(`GET usage-stats error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });



  // API: Upload CSV for Ads Analysis
  fastify.post('/api/upload-ads-csv', async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        reply.status(400);
        return { status: 'error', message: 'Tidak ada file yang diupload.' };
      }

      const filename = data.filename;
      if (!filename || (!filename.endsWith('.csv') && !filename.endsWith('.CSV'))) {
        reply.status(400);
        return { status: 'error', message: 'Hanya file CSV yang diperbolehkan.' };
      }

      // Read file buffer
      const chunks = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Validate content is actually CSV-like
      const content = buffer.toString('utf8');
      const lines = content.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        reply.status(400);
        return { status: 'error', message: 'File CSV harus memiliki header dan minimal 1 baris data.' };
      }

      // Save to uploaded-ads.csv
      const adsDir = path.join(__dirname, '../ads-analysis');
      if (!fs.existsSync(adsDir)) {
        fs.mkdirSync(adsDir, { recursive: true });
      }
      const csvPath = path.join(adsDir, 'uploaded-ads.csv');
      fs.writeFileSync(csvPath, buffer);

      // Parse row count (skip header)
      const dataLines = lines.slice(1).filter(l => l.trim());
      const rowCount = dataLines.length;

      // Save metadata
      const metadata = JSON.stringify({
        filename: filename,
        rows: rowCount,
        uploadedAt: new Date().toISOString(),
        size: buffer.length
      });
      await db.setSetting('ads_csv_metadata', metadata);
      await db.setSetting('ads_data_source', 'csv');

      fastify.log.info(`CSV uploaded: ${filename} (${rowCount} rows, ${buffer.length} bytes)`);
      return {
        status: 'success',
        message: `File "${filename}" berhasil diupload (${rowCount} baris data).`,
        metadata: JSON.parse(metadata)
      };
    } catch (err) {
      fastify.log.error(`CSV upload error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Check uploaded CSV status
  fastify.get('/api/ads-csv-status', async (request, reply) => {
    try {
      const csvPath = path.join(__dirname, '../ads-analysis/uploaded-ads.csv');
      const exists = fs.existsSync(csvPath);
      
      if (!exists) {
        return {
          status: 'success',
          exists: false,
          dataSource: await db.getSetting('ads_data_source') || 'api',
          metadata: null
        };
      }

      const stat = fs.statSync(csvPath);
      const storedMetadata = await db.getSetting('ads_csv_metadata');
      
      return {
        status: 'success',
        exists: true,
        dataSource: await db.getSetting('ads_data_source') || 'api',
        metadata: storedMetadata ? JSON.parse(storedMetadata) : {
          filename: 'uploaded-ads.csv',
          rows: 0,
          uploadedAt: stat.mtime.toISOString(),
          size: stat.size
        }
      };
    } catch (err) {
      fastify.log.error(`CSV status check error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Toggle data source (api/csv)
  fastify.post('/api/ads-data-source', {
    schema: {
      body: {
        type: 'object',
        required: ['source'],
        properties: {
          source: { type: 'string', enum: ['api', 'csv'] }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const { source } = request.body;
        await db.setSetting('ads_data_source', source);
        
        // Verify CSV exists if switching to csv
        if (source === 'csv') {
          const csvPath = path.join(__dirname, '../ads-analysis/uploaded-ads.csv');
          if (!fs.existsSync(csvPath)) {
            reply.status(400);
            return { status: 'error', message: 'Tidak ada file CSV terupload. Upload CSV terlebih dahulu.' };
          }
        }
        
        return { status: 'success', dataSource: source };
      } catch (err) {
        fastify.log.error(`Data source toggle error: ${err.message}`);
        reply.status(500);
        return { status: 'error', message: err.message };
      }
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

  // API: Run manual ads analysis via Server-Sent Events (SSE) Stream
  fastify.get('/api/run-analysis-stream', async (request, reply) => {
    const { date_from, date_to } = request.query || {};
    
    // Set headers for Server-Sent Events (SSE)
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const sendEvent = (eventObj) => {
      reply.raw.write(`data: ${JSON.stringify(eventObj)}\n\n`);
    };

    let child;
    try {
      fastify.log.info(`Starting SSE Stream for ads analysis: range: ${date_from || 'default'} to ${date_to || 'default'}...`);
      child = await adsService.runAnalysisSpawn(date_from, date_to, fastify.log);

      let buffer = '';
      
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        // Send the raw logs chunk to be displayed in the terminal UI
        sendEvent({ type: 'chunk', text: chunk });
        
        buffer += chunk;
        const lines = buffer.split('\n');
        // Keep the last partial line in the buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('::STATUS::')) {
            const message = trimmed.replace('::STATUS::', '');
            sendEvent({ type: 'status', message });
          } else if (trimmed.startsWith('::JSON_RESULT::')) {
            try {
              const resultPayload = JSON.parse(trimmed.replace('::JSON_RESULT::', ''));
              sendEvent({ type: 'done', data: resultPayload });
            } catch (err) {
              fastify.log.error(`Failed to parse final JSON result from stdout: ${err.message}`);
            }
          }
        }
      });

      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        // Stream raw stderr logs as error logs in terminal
        sendEvent({ type: 'chunk', text: chunk });
        fastify.log.warn(`Ads analysis script stderr: ${chunk.trim()}`);
      });

      child.on('close', (code) => {
        fastify.log.info(`Ads analysis process closed with code ${code}`);
        if (code !== 0) {
          sendEvent({ type: 'error', message: `Proses analisis keluar dengan kode error ${code}` });
        }
        reply.raw.end();
      });

      child.on('error', (err) => {
        fastify.log.error(`Failed to start child process for ads analysis: ${err.message}`);
        sendEvent({ type: 'error', message: `Gagal menjalankan proses analisis: ${err.message}` });
        reply.raw.end();
      });
      
    } catch (err) {
      fastify.log.error(`Ads analysis stream error: ${err.message}`);
      sendEvent({ type: 'error', message: err.message });
      reply.raw.end();
    }
  });

  fastify.post('/run-analysis', async (request, reply) => {
    try {
      const { date_from, date_to } = request.body || {};
      const result = await adsService.runAnalysisRaw(date_from, date_to, fastify.log);
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
    const { date_from, date_to } = request.body || {};
    fastify.log.info(`Manual analysis trigger received via POST /trigger-analysis (range: ${date_from || 'default'} to ${date_to || 'default'})`);
    adsService.runAnalysisAndSendReport(date_from, date_to, fastify.log)
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

  // API: Get latest AI creative report
  fastify.get('/api/creative-report', async (request, reply) => {
    try {
      const reportJson = await db.getSetting('creative_analysis_report');
      if (!reportJson) {
        reply.status(404);
        return { status: 'error', message: 'Laporan kreatif belum pernah digenerate. Silakan trigger regenerasi.' };
      }
      return JSON.parse(reportJson);
    } catch (err) {
      fastify.log.error(`GET creative report error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Run manual creative content analysis
  fastify.post('/api/trigger-creative-analysis', async (request, reply) => {
    try {
      const { prompt } = request.body || {};
      const creativeService = require('./services/creative');
      const report = await creativeService.runCreativeAnalysis(fastify.log, null, prompt || null);
      return { status: 'success', data: report };
    } catch (err) {
      fastify.log.error(`Manual creative analysis trigger error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Run manual creative content analysis via Server-Sent Events (SSE) Stream
  fastify.get('/api/trigger-creative-analysis-stream', async (request, reply) => {
    // Set headers for Server-Sent Events (SSE)
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const sendEvent = (eventObj) => {
      reply.raw.write(`data: ${JSON.stringify(eventObj)}\n\n`);
    };

    try {
      const userPrompt = request.query.prompt || null;
      fastify.log.info(`Starting SSE Stream for creative analysis manual trigger with prompt: ${userPrompt || 'none'}...`);
      const creativeService = require('./services/creative');
      const report = await creativeService.runCreativeAnalysis(fastify.log, (progress) => {
        sendEvent(progress);
      }, userPrompt);
      sendEvent({ type: 'done', data: report });
    } catch (err) {
      fastify.log.error(`Creative analysis stream error: ${err.message}`);
      sendEvent({ type: 'error', message: err.message });
    } finally {
      reply.raw.end();
    }
  });

  // API: Get saved message summary
  fastify.get('/api/message-summary', async (request, reply) => {
    try {
      const raw = await db.getSetting('message_summary_report');
      if (!raw) {
        reply.status(404);
        return { status: 'not_found', message: 'No summary report available.' };
      }
      return JSON.parse(raw);
    } catch (err) {
      fastify.log.error(`Message summary fetch error: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Trigger message summary via SSE stream
  fastify.get('/api/trigger-message-summary-stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const sendEvent = (eventObj) => {
      reply.raw.write(`data: ${JSON.stringify(eventObj)}\n\n`);
    };

    try {
      const sessionId = request.query.session_id || 'all';
      const dateRange = request.query.date_range || 'today';
      fastify.log.info(`Starting SSE Stream for message summary (session: ${sessionId}, range: ${dateRange})...`);
      const summaryService = require('./services/summary');
      const report = await summaryService.generateMessageSummary(fastify.log, (progress) => {
        sendEvent(progress);
      }, sessionId, dateRange);
      sendEvent({ type: 'done', data: report });
    } catch (err) {
      fastify.log.error(`Message summary stream error: ${err.message}`);
      sendEvent({ type: 'error', message: err.message });
    } finally {
      reply.raw.end();
    }
  });

  // API: Get all WhatsApp sessions
  fastify.get('/api/whatsapp/sessions', async (request, reply) => {
    try {
      const { business_id } = request.query;
      const parsedBusinessId = business_id ? Number.parseInt(business_id, 10) : null;
      const sessions = await db.getSessions(parsedBusinessId);
      const pool = whatsappService.sessions;
      const enriched = sessions.map(s => {
        const active = pool.get(s.id);
        return {
          ...s,
          status: active ? active.status : s.status,
          qr_code: active ? active.qr : s.qr_code,
          ready: active ? active.ready : false
        };
      });
      return enriched;
    } catch (err) {
      fastify.log.error(`Failed to fetch sessions: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Create new WhatsApp session
  fastify.post('/api/whatsapp/sessions', {
    schema: {
      body: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
          name: { type: 'string' },
          business_id: { type: 'integer' }
        }
      }
    },
    handler: async (request, reply) => {
      const { id, name, business_id } = request.body;
      const finalBusinessId = business_id ? Number.parseInt(business_id, 10) : 1;
      try {
        fastify.log.info(`Creating new WhatsApp session: ${name} (${id}) for business ${finalBusinessId}`);
        
        // 1. Insert into DB
        const session = await db.createSession(id, name, finalBusinessId);
        
        // 2. Initialize connection in background
        whatsappService.connectSession(id, name, fastify.log).catch(err => {
          fastify.log.error(`Failed to start session ${id} connection: ${err.message}`);
        });
        
        return { status: 'success', data: session };
      } catch (err) {
        fastify.log.error(`Failed to create session: ${err.message}`);
        reply.status(500);
        return { status: 'error', message: err.message };
      }
    }
  });

  // API: Delete WhatsApp session
  fastify.delete('/api/whatsapp/sessions/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      fastify.log.info(`Deleting WhatsApp session: ${id}`);
      
      // 1. Close connection and delete from pool
      await whatsappService.disconnectSession(id);
      
      // 2. Delete from DB
      await db.deleteSession(id);
      
      // 3. Delete directory credentials
      const sessionDir = path.join(__dirname, '../../whatsapp-sessions', id);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
      
      return { status: 'success', message: `Session ${id} deleted successfully.` };
    } catch (err) {
      fastify.log.error(`Failed to delete session ${id}: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // API: Regenerate WhatsApp session (reset & scan QR again)
  fastify.post('/api/whatsapp/sessions/:id/regenerate', async (request, reply) => {
    const { id } = request.params;
    try {
      fastify.log.info(`Regenerating WhatsApp session: ${id}`);
      
      const session = await db.getSession(id);
      if (!session) {
        reply.status(404);
        return { status: 'error', message: 'Session not found.' };
      }
      
      // 1. Disconnect current socket
      await whatsappService.disconnectSession(id);
      
      // 2. Clear credentials directory
      const sessionDir = path.join(__dirname, '../../whatsapp-sessions', id);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
      
      // 3. Clear QR and update status in DB
      await db.updateSessionQR(id, null, 'disconnected');
      
      // 4. Connect again in background
      whatsappService.connectSession(id, session.name, fastify.log).catch(err => {
        fastify.log.error(`Failed to start session ${id} connection: ${err.message}`);
      });
      
      return { status: 'success', message: `Session ${id} regenerated successfully.` };
    } catch (err) {
      fastify.log.error(`Failed to regenerate session ${id}: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // === BROADCAST API ENDPOINTS ===

  // 1. GET: List all campaigns
  fastify.get('/api/broadcasts/campaigns', async (request, reply) => {
    try {
      const { business_id } = request.query;
      const parsedBusinessId = business_id ? Number.parseInt(business_id, 10) : null;
      const campaigns = await db.getCampaigns(parsedBusinessId);
      return campaigns;
    } catch (err) {
      fastify.log.error(`Failed to fetch campaigns: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // 2. GET: Fetch campaign detail including queue items
  fastify.get('/api/broadcasts/campaigns/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      const campaign = await db.getCampaignById(id);
      if (!campaign) {
        reply.status(404);
        return { status: 'error', message: 'Kampanye tidak ditemukan.' };
      }
      const queue = await db.getQueueByCampaignId(id);
      return { campaign, queue };
    } catch (err) {
      fastify.log.error(`Failed to fetch campaign detail: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // 3. POST: Create campaign and queue targets
  fastify.post('/api/broadcasts/campaigns', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'template'],
        properties: {
          name: { type: 'string' },
          sessionId: { type: 'string', default: 'default' },
          template: { type: 'string' },
          mediaType: { type: 'string', enum: ['text', 'image', 'video'], default: 'text' },
          mediaUrl: { type: 'string', nullable: true },
          targetFilter: { type: 'string', enum: ['all', 'leads', 'dormant', 'needs_follow_up', 'manual'], default: 'all' },
          selectedPhones: { type: 'array', items: { type: 'string' }, default: [] },
          business_id: { type: 'integer' }
        }
      }
    },
    handler: async (request, reply) => {
      const { name, sessionId, template, mediaType, mediaUrl, targetFilter, selectedPhones, business_id } = request.body;
      const finalBusinessId = business_id ? Number.parseInt(business_id, 10) : 1;
      try {
        fastify.log.info(`Creating campaign "${name}" with target filter "${targetFilter}" for business ${finalBusinessId}...`);
        const campaign = await broadcastService.createCampaignAndQueue({
          name,
          sessionId,
          template,
          mediaType,
          mediaUrl,
          targetFilter,
          selectedPhones,
          businessId: finalBusinessId
        });
        return { status: 'success', campaign };
      } catch (err) {
        fastify.log.error(`Failed to create campaign: ${err.message}`);
        reply.status(err.message.includes('Tidak ada target') ? 400 : 500);
        return { status: 'error', message: err.message };
      }
    }
  });

  // 4. POST: Control campaign (start / pause / cancel)
  fastify.post('/api/broadcasts/campaigns/:id/control', {
    schema: {
      body: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ['start', 'pause', 'cancel'] }
        }
      }
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { action } = request.body;
      try {
        const campaign = await db.getCampaignById(id);
        if (!campaign) {
          reply.status(404);
          return { status: 'error', message: 'Kampanye tidak ditemukan.' };
        }

        fastify.log.info(`Control campaign ${id} action: ${action}`);

        if (action === 'start') {
          if (!whatsappService.isReady(campaign.session_id)) {
            reply.status(400);
            return { status: 'error', message: 'Session WhatsApp tidak terhubung. Silakan sambungkan sebelum memulai.' };
          }
          await db.updateCampaignStatus(id, 'processing');
        } else if (action === 'pause') {
          await db.updateCampaignStatus(id, 'paused');
        } else if (action === 'cancel') {
          await db.updateCampaignStatus(id, 'failed');
          // Mark all remaining pending queue items for this campaign as failed
          await db.pool.query(
            "UPDATE broadcast_queue SET status = 'failed', error_message = 'Dibatalkan oleh admin' WHERE campaign_id = $1 AND status = 'pending'",
            [id]
          );
        }

        const updatedCampaign = await db.getCampaignById(id);
        return { status: 'success', campaign: updatedCampaign };
      } catch (err) {
        fastify.log.error(`Failed to control campaign ${id}: ${err.message}`);
        reply.status(500);
        return { status: 'error', message: err.message };
      }
    }
  });

  // 5. POST: File upload for broadcast media (images/videos)
  fastify.post('/api/broadcasts/upload', async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        reply.status(400);
        return { status: 'error', message: 'Tidak ada file yang diunggah.' };
      }

      const filename = `broadcast_${Date.now()}_${data.filename.replace(/\s+/g, '_')}`;
      const savePath = path.join(__dirname, '../public/uploads', filename);
      
      const util = require('util');
      const { pipeline } = require('stream');
      const pump = util.promisify(pipeline);
      
      await pump(data.file, fs.createWriteStream(savePath));
      
      const fileUrl = `/uploads/${filename}`;
      return { status: 'success', url: fileUrl };
    } catch (err) {
      fastify.log.error(`Broadcast upload failed: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: 'Gagal mengunggah file: ' + err.message };
    }
  });

  // 6. POST: AI copywriting generator via Gemini
  fastify.post('/api/broadcasts/generate-content', {
    schema: {
      body: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string' },
          customerContext: { type: 'string', default: '' }
        }
      }
    },
    handler: async (request, reply) => {
      const { prompt, customerContext } = request.body;
      try {
        fastify.log.info(`Generating AI copywriting variations for broadcast...`);
        const result = await broadcastService.generateAICopywriting({
          prompt,
          customerContext
        });
        return { status: 'success', variations: result.variations || [] };
      } catch (err) {
        fastify.log.error(`AI copywriting generation failed: ${err.message}`);
        reply.status(500);
        return { status: 'error', message: err.message };
      }
    }
  });

  // 7. GET: List all businesses
  fastify.get('/api/businesses', async (request, reply) => {
    try {
      const list = await db.getBusinesses();
      return list;
    } catch (err) {
      fastify.log.error(`Failed to fetch businesses: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // GET: Single business details
  fastify.get('/api/businesses/:id', async (request, reply) => {
    const { id } = request.params;
    try {
      const business = await db.getBusinessById(Number.parseInt(id, 10));
      if (!business) {
        reply.status(404);
        return { status: 'error', message: 'Business not found' };
      }
      return business;
    } catch (err) {
      fastify.log.error(`Failed to fetch business by ID: ${err.message}`);
      reply.status(500);
      return { status: 'error', message: err.message };
    }
  });

  // POST: Create a new business
  fastify.post('/api/businesses', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'slug'],
        properties: {
          name: { type: 'string' },
          slug: { type: 'string' },
          shortDescription: { type: 'string', default: '' },
          contactPhone: { type: 'string', default: '' },
          address: { type: 'string', default: '' },
          website: { type: 'string', default: '' },
          socialMedia: { type: 'array', default: [] },
          aiSettings: { type: 'object', default: {} }
        }
      }
    },
    handler: async (request, reply) => {
      try {
        const business = await db.createBusiness(request.body);
        return { status: 'success', business };
      } catch (err) {
        fastify.log.error(`Failed to create business: ${err.message}`);
        reply.status(500);
        return { status: 'error', message: err.message };
      }
    }
  });

  // PUT: Update an existing business
  fastify.put('/api/businesses/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          shortDescription: { type: 'string' },
          contactPhone: { type: 'string' },
          address: { type: 'string' },
          website: { type: 'string' },
          socialMedia: { type: 'array' },
          aiSettings: { type: 'object' }
        }
      }
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      try {
        const business = await db.updateBusiness(Number.parseInt(id, 10), request.body);
        return { status: 'success', business };
      } catch (err) {
        fastify.log.error(`Failed to update business: ${err.message}`);
        reply.status(500);
        return { status: 'error', message: err.message };
      }
    }
  });
}

module.exports = registerRoutes;

