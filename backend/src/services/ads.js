const { exec } = require('node:child_process');
const path = require('node:path');
const util = require('node:util');
const db = require('../db');
const whatsappService = require('./whatsapp');

const execPromise = util.promisify(exec);
const scriptPath = path.join(__dirname, '../../ads-analysis/automation.js');

/**
 * Run the ads analysis script and broadcast the report to WhatsApp group
 */
async function runAnalysisAndSendReport(dateFrom = null, dateTo = null, log = console) {
  // If the first argument is a logger object, swap it to log and set dates to null
  if (dateFrom && typeof dateFrom === 'object' && typeof dateFrom.info === 'function') {
    log = dateFrom;
    dateFrom = null;
    dateTo = null;
  }

  log.info(`Starting Meta Ads analysis background runner at ${scriptPath}...`);
  
  const activeApiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  const activeMetaAccessToken = await db.getSetting('meta_access_token') || process.env.META_ACCESS_TOKEN;
  const activeMetaAdAccountId = await db.getSetting('meta_ad_account_id') || process.env.META_AD_ACCOUNT_ID;

  const dataSource = await db.getSetting('ads_data_source') || 'api';
  const csvPath = path.join(__dirname, '../../ads-analysis/uploaded-ads.csv');

  const envVars = {
    ...process.env,
    GEMINI_API_KEY: activeApiKey,
    META_ACCESS_TOKEN: activeMetaAccessToken,
    META_AD_ACCOUNT_ID: activeMetaAdAccountId,
    ADS_DATA_SOURCE: dataSource,
    ADS_CSV_PATH: csvPath
  };

  if (dateFrom) envVars.ADS_DATE_FROM = dateFrom;
  if (dateTo) envVars.ADS_DATE_TO = dateTo;

  const targetJid = await db.getSetting('whatsapp_group_jid') || process.env.WHATSAPP_GROUP_JID || '120363427625298309@g.us';

  try {
    let stdout = '';
    let stderr = '';
    try {
      const result = await execPromise(`node "${scriptPath}"`, { env: envVars });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execErr) {
      // execPromise rejects on non-zero exit code, but stdout may still contain ::JSON_RESULT::
      stdout = execErr.stdout || '';
      stderr = execErr.stderr || execErr.message;
    }

    const lines = stdout.split('\n');
    const resultLine = lines.find(l => l.startsWith('::JSON_RESULT::'));
    if (!resultLine) {
      const detail = stderr ? `\nScript stderr: ${stderr.trim()}` : '';
      throw new Error(`Could not find ::JSON_RESULT:: in stdout${detail}`);
    }
    const data = JSON.parse(resultLine.replace('::JSON_RESULT::', ''));

    // Log Gemini usage for Meta Ads analysis
    if (data.usage) {
      const activeModelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
      await db.saveUsageLog({
        feature: 'ads_analysis',
        modelName: activeModelName,
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
        cachedTokens: data.usage.cachedTokens
      });
    }
    
    const baseUrl = process.env.PUBLIC_REPORT_URL || 'https://localhost:3001';
    const reportUrl = `${baseUrl.replace(/\/$/, '')}/report-html`;
    
    const text = `📊 *LAPORAN IKLAN*: ${data.custom.dateRange}\n\n` +
      `${data.custom.summary}\n\n` +
      `🔗 *Link Dashboard Report*:\n${reportUrl}`;
    
    if (whatsappService.isReady()) {
      log.info(`Sending report message to group ${targetJid}...`);
      const response = await whatsappService.sendMessage(targetJid, { text });
      await db.setSetting('ads_analysis_last_run', new Date().toISOString());
      return { status: 'success', messageId: response.key.id, data };
    } else {
      log.warn('WhatsApp connection is not ready. Skipping message broadcast.');
      throw new Error('WhatsApp connection is not ready.');
    }
  } catch (error) {
    log.error(`Analysis script execution failed: ${error.message}`);
    if (whatsappService.isReady()) {
      try {
        await whatsappService.sendMessage(targetJid, { text: `⚠️ *AUTOMATION ERROR*: Gagal menjalankan analisis Meta Ads.\nError: ${error.message}` });
      } catch (sendErr) {
        log.error(`Failed to send failure notification to group: ${sendErr.message}`);
      }
    }
    throw error;
  }
}

/**
 * Raw analysis execution wrapper returning execution logs
 */
async function runAnalysisRaw(dateFrom = null, dateTo = null, log = console) {
  // If the first argument is a logger object, swap it to log and set dates to null
  if (dateFrom && typeof dateFrom === 'object' && typeof dateFrom.info === 'function') {
    log = dateFrom;
    dateFrom = null;
    dateTo = null;
  }

  log.info(`Running raw analysis script at ${scriptPath}...`);
  
  const activeApiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  const activeMetaAccessToken = await db.getSetting('meta_access_token') || process.env.META_ACCESS_TOKEN;
  const activeMetaAdAccountId = await db.getSetting('meta_ad_account_id') || process.env.META_AD_ACCOUNT_ID;

  const dataSource = await db.getSetting('ads_data_source') || 'api';
  const csvPath = path.join(__dirname, '../../ads-analysis/uploaded-ads.csv');

  const envVars = {
    ...process.env,
    GEMINI_API_KEY: activeApiKey,
    META_ACCESS_TOKEN: activeMetaAccessToken,
    META_AD_ACCOUNT_ID: activeMetaAdAccountId,
    ADS_DATA_SOURCE: dataSource,
    ADS_CSV_PATH: csvPath
  };

  if (dateFrom) envVars.ADS_DATE_FROM = dateFrom;
  if (dateTo) envVars.ADS_DATE_TO = dateTo;

  try {
    const { stdout, stderr } = await execPromise(`node "${scriptPath}"`, { env: envVars });
    return { stdout, stderr };
  } catch (error) {
    log.error(`Script error: ${error.message}`);
    const err = new Error(error.message);
    err.stderr = error.stderr;
    err.stdout = error.stdout;
    throw err;
  }
}

/**
 * Spawn the ads analysis script and return the child process (Promise-wrapped)
 */
async function runAnalysisSpawn(dateFrom = null, dateTo = null, log = console) {
  log.info(`Spawning Meta Ads analysis process at ${scriptPath}...`);
  
  const activeApiKey = await db.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  const activeMetaAccessToken = await db.getSetting('meta_access_token') || process.env.META_ACCESS_TOKEN;
  const activeMetaAdAccountId = await db.getSetting('meta_ad_account_id') || process.env.META_AD_ACCOUNT_ID;

  const dataSource = await db.getSetting('ads_data_source') || 'api';
  const csvPath = path.join(__dirname, '../../ads-analysis/uploaded-ads.csv');

  const envVars = {
    ...process.env,
    GEMINI_API_KEY: activeApiKey,
    META_ACCESS_TOKEN: activeMetaAccessToken,
    META_AD_ACCOUNT_ID: activeMetaAdAccountId,
    ADS_DATA_SOURCE: dataSource,
    ADS_CSV_PATH: csvPath
  };

  if (dateFrom) envVars.ADS_DATE_FROM = dateFrom;
  if (dateTo) envVars.ADS_DATE_TO = dateTo;

  const { spawn } = require('node:child_process');
  const child = spawn('node', [scriptPath], { env: envVars });
  return child;
}

module.exports = {
  runAnalysisAndSendReport,
  runAnalysisRaw,
  runAnalysisSpawn
};
