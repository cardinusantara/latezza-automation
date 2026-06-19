const cron = require('node-cron');
const db = require('../db');
const adsService = require('./ads');
const followupService = require('./followup');

// Store running cron job references in-memory
let adsJob = null;
let creativeJob = null;
let followupJob = null;

/**
 * Helper to build standard cron expression for a day interval and specific time.
 **/
function buildCronExpression(frequencyDays, timeStr) {
  const cleanTime = timeStr && timeStr.includes(':') ? timeStr : '09:00';
  const [hourStr, minuteStr] = cleanTime.split(':');
  const hour = parseInt(hourStr, 10) || 0;
  const minute = parseInt(minuteStr, 10) || 0;
  
  const freq = parseInt(frequencyDays, 10) || 1;
  
  // E.g. every day at 09:00: '0 9 */1 * *' (same as every day)
  return `${minute} ${hour} */${freq} * *`;
}

/**
 * Dynamically register cron jobs based on DB settings
 */
async function setupScheduledJobs(log = console) {
  log.info('Initializing background scheduler tasks...');

  // Stop any existing jobs first to prevent duplicates
  stopAllJobs(log);

  // 1. Load Scheduling Settings
  const adsFreq = await db.getSetting('ads_analysis_frequency', '1');
  const adsTime = await db.getSetting('ads_analysis_time', '09:00');
  
  const creativeFreq = await db.getSetting('creative_analysis_frequency', '7');
  const creativeTime = await db.getSetting('creative_analysis_time', '09:00');

  // Load standard services (using require inside to avoid circular dependencies if any)
  const creativeService = require('./creative');

  // 2. Schedule Meta Ads Report Job
  const adsCronExpr = buildCronExpression(adsFreq, adsTime);
  log.info(`Scheduling Ads Analysis: "${adsCronExpr}" (Every ${adsFreq} days at ${adsTime})`);
  
  adsJob = cron.schedule(adsCronExpr, () => {
    log.info('Triggering scheduled Ads Analysis runner...');
    adsService.runAnalysisAndSendReport(log)
      .catch(err => log.error(`Scheduled Ads Analysis failed: ${err.message}`));
  }, {
    timezone: "Asia/Jakarta"
  });

  // 3. Schedule AI Creative / Content Ideation Job
  const creativeCronExpr = buildCronExpression(creativeFreq, creativeTime);
  log.info(`Scheduling AI Creative Analysis: "${creativeCronExpr}" (Every ${creativeFreq} days at ${creativeTime})`);
  
  creativeJob = cron.schedule(creativeCronExpr, () => {
    log.info('Triggering scheduled AI Creative Analysis runner...');
    creativeService.runCreativeAnalysis(log)
      .catch(err => log.error(`Scheduled AI Creative Analysis failed: ${err.message}`));
  }, {
    timezone: "Asia/Jakarta"
  });

  // 4. Schedule Hourly Customer Follow-ups (remains hourly)
  log.info('Scheduling Hourly Customer Follow-up scan: "0 * * * *"');
  followupJob = cron.schedule('0 * * * *', () => {
    log.info('Triggering scheduled hourly customer follow-up check...');
    followupService.runProactiveFollowUps(log)
      .catch(err => log.error(`Scheduled follow-up failed: ${err.message}`));
  }, {
    timezone: "Asia/Jakarta"
  });
  
  log.info('✅ Background scheduler tasks registered successfully.');
}

/**
 * Stop all running cron jobs
 */
function stopAllJobs(log = console) {
  if (adsJob) {
    log.info('Stopping active Ads Analysis cron job...');
    adsJob.stop();
    adsJob = null;
  }
  if (creativeJob) {
    log.info('Stopping active AI Creative Analysis cron job...');
    creativeJob.stop();
    creativeJob = null;
  }
  if (followupJob) {
    log.info('Stopping active Follow-up cron job...');
    followupJob.stop();
    followupJob = null;
  }
}

/**
 * Reloads all schedules. Should be called after settings are updated.
 */
async function reloadSchedules(log = console) {
  log.info('🔄 Reloading background schedules due to config update...');
  await setupScheduledJobs(log);
}

module.exports = {
  setupScheduledJobs,
  reloadSchedules,
  stopAllJobs
};
