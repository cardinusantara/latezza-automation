const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const db = require('./db');
const agent = require('./agent');
const whatsappService = require('./services/whatsapp');
const followupService = require('./services/followup');
const adsService = require('./services/ads');

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
        reject(error);
      } else {
        resolve();
      }
    });
  });
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
      const { session_id } = request.query;
      const targetSessionId = session_id || 'default';

      const leadsCountRes = await db.pool.query('SELECT COUNT(*) FROM customers WHERE session_id = $1', [targetSessionId]);
      const productsCountRes = await db.pool.query('SELECT COUNT(*) FROM products');
      const followupsCountRes = await db.pool.query('SELECT COUNT(*) FROM customers WHERE needs_follow_up = TRUE AND session_id = $1', [targetSessionId]);
      const messagesCountRes = await db.pool.query('SELECT COUNT(*) FROM chat_histories WHERE session_id = $1', [targetSessionId]);
      const recentLeadsRes = await db.pool.query('SELECT * FROM customers WHERE session_id = $1 ORDER BY last_interaction DESC LIMIT 5', [targetSessionId]);
      
      return {
        status: whatsappService.isReady(targetSessionId) ? 'connected' : 'disconnected',
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
      const { session_id } = request.query;
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
      const { text, audioBase64, mimetype, session_id } = request.body;
      const targetSessionId = session_id || 'default';

      try {
        let finalReplyText = text || '';
        let voiceUrl = null;

        if (audioBase64) {
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
            // Fallback: copy temp file as the output file if transcoding fails
            fs.copyFileSync(tempFilepath, outputFilepath);
          } finally {
            // Clean up the temporary webm file
            if (fs.existsSync(tempFilepath)) {
              try {
                fs.unlinkSync(tempFilepath);
              } catch (unlinkErr) {
                fastify.log.error(`Failed to delete temp file: ${unlinkErr.message}`);
              }
            }
          }

          voiceUrl = `/uploads/${outputFilename}`;
          const oggBuffer = fs.readFileSync(outputFilepath);

          // Transcribe the outgoing audio using the transcoded ogg buffer so it is saved in history
          try {
            fastify.log.info(`🧠 Transcribing outgoing audio...`);
            const transcription = await whatsappService.transcribeAudio(oggBuffer, 'audio/ogg', fastify.log);
            finalReplyText = transcription;
            fastify.log.info(`📝 Outgoing audio transcription: "${finalReplyText}"`);
          } catch (tErr) {
            fastify.log.error(`Failed to transcribe outgoing audio: ${tErr.message}`);
            finalReplyText = '[Pesan Suara Kiriman]';
          }

          // Send voice message via WhatsApp
          fastify.log.info(`📤 Sending WhatsApp voice note to ${phone}...`);
          const response = await whatsappService.sendMessage(phone, { 
            audio: oggBuffer, 
            mimetype: 'audio/ogg; codecs=opus', // standard voice note mimetype for Baileys/WhatsApp
            ptt: true // ptt: true makes it appear as a recording (Push To Talk)
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
        } else {
          // Standard text message send
          fastify.log.info(`Sending manual dashboard message to ${phone} on session ${targetSessionId}...`);
          const response = await whatsappService.sendMessage(phone, { text: finalReplyText }, targetSessionId);
          
          await db.saveChatMessage(phone, 'model', finalReplyText, targetSessionId);
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
        gemini_model: await db.getSetting('gemini_model') || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        whatsapp_group_jid: await db.getSetting('whatsapp_group_jid') || process.env.WHATSAPP_GROUP_JID || '',
        rate_limit_max: await db.getSetting('rate_limit_max') || process.env.RATE_LIMIT_MAX_MSG || '5',
        rate_limit_window: await db.getSetting('rate_limit_window') || process.env.RATE_LIMIT_WINDOW_MS || '60000',
        followup_hours: await db.getSetting('followup_hours') || '24',
        system_instruction: await db.getSetting('system_instruction') || '',
        followup_instruction: await db.getSetting('followup_instruction') || '',
        meta_access_token: maskedMetaToken,
        meta_ad_account_id: await db.getSetting('meta_ad_account_id') || process.env.META_AD_ACCOUNT_ID || '',
        ads_analysis_frequency: await db.getSetting('ads_analysis_frequency') || '1',
        ads_analysis_time: await db.getSetting('ads_analysis_time') || '09:00',
        creative_analysis_frequency: await db.getSetting('creative_analysis_frequency') || '7',
        creative_analysis_time: await db.getSetting('creative_analysis_time') || '09:00'
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
          gemini_model: { type: 'string' },
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
          creative_analysis_time: { type: 'string' }
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
        
        if (settings.gemini_model !== undefined) await db.setSetting('gemini_model', settings.gemini_model);
        if (settings.meta_ad_account_id !== undefined) await db.setSetting('meta_ad_account_id', settings.meta_ad_account_id);
        if (settings.whatsapp_group_jid !== undefined) await db.setSetting('whatsapp_group_jid', settings.whatsapp_group_jid);
        if (settings.rate_limit_max !== undefined) await db.setSetting('rate_limit_max', settings.rate_limit_max);
        if (settings.rate_limit_window !== undefined) await db.setSetting('rate_limit_window', settings.rate_limit_window);
        if (settings.followup_hours !== undefined) await db.setSetting('followup_hours', settings.followup_hours);
        if (settings.system_instruction !== undefined) await db.setSetting('system_instruction', settings.system_instruction);
        if (settings.followup_instruction !== undefined) await db.setSetting('followup_instruction', settings.followup_instruction);
        if (settings.ads_analysis_frequency !== undefined) await db.setSetting('ads_analysis_frequency', settings.ads_analysis_frequency);
        if (settings.ads_analysis_time !== undefined) await db.setSetting('ads_analysis_time', settings.ads_analysis_time);
        if (settings.creative_analysis_frequency !== undefined) await db.setSetting('creative_analysis_frequency', settings.creative_analysis_frequency);
        if (settings.creative_analysis_time !== undefined) await db.setSetting('creative_analysis_time', settings.creative_analysis_time);
        
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

  // API: Get available Gemini models from official API
  fastify.get('/api/settings/gemini-models', async (request, reply) => {
    try {
      const apiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return [
          { name: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
          { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
          { name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' }
        ];
      }

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) {
        throw new Error(`Gemini API returned status ${res.status}`);
      }
      const json = await res.json();
      const models = json.models || [];

      // Filter and map models that support content generation
      const filtered = models
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => {
          const cleanName = m.name.replace(/^models\//, '');
          return {
            name: cleanName,
            displayName: m.displayName || cleanName
          };
        });

      return filtered;
    } catch (err) {
      fastify.log.error(`Failed to fetch Gemini models: ${err.message}`);
      return [
        { name: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
        { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
        { name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' }
      ];
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
      const creativeService = require('./services/creative');
      const report = await creativeService.runCreativeAnalysis(fastify.log);
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
      fastify.log.info('Starting SSE Stream for creative analysis manual trigger...');
      const creativeService = require('./services/creative');
      const report = await creativeService.runCreativeAnalysis(fastify.log, (progress) => {
        sendEvent(progress);
      });
      sendEvent({ type: 'done', data: report });
    } catch (err) {
      fastify.log.error(`Creative analysis stream error: ${err.message}`);
      sendEvent({ type: 'error', message: err.message });
    } finally {
      reply.raw.end();
    }
  });

  // API: Get all WhatsApp sessions
  fastify.get('/api/whatsapp/sessions', async (request, reply) => {
    try {
      const sessions = await db.getSessions();
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
          name: { type: 'string' }
        }
      }
    },
    handler: async (request, reply) => {
      const { id, name } = request.body;
      try {
        fastify.log.info(`Creating new WhatsApp session: ${name} (${id})`);
        
        // 1. Insert into DB
        const session = await db.createSession(id, name);
        
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
}

module.exports = registerRoutes;
