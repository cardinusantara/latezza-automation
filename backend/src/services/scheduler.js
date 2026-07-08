const cron = require('node-cron');
const db = require('../db');
const adsService = require('./ads');
const followupService = require('./followup');

// Store running cron job references in-memory
let adsJob = null;
let creativeJob = null;
let followupJob = null;
let pendingRepliesJob = null;

/**
 * Helper to build standard cron expression for a daily check at a specific time.
 **/
function buildDailyCronExpression(timeStr) {
  const cleanTime = timeStr?.includes(':') ? timeStr : '09:00';
  const [hourStr, minuteStr] = cleanTime.split(':');
  const hour = Number.parseInt(hourStr, 10) || 0;
  const minute = Number.parseInt(minuteStr, 10) || 0;
  
  return `${minute} ${hour} * * *`;
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
  const adsEnabled = await db.getSetting('ads_analysis_enabled', 'true');
  
  const creativeFreq = await db.getSetting('creative_analysis_frequency', '7');
  const creativeTime = await db.getSetting('creative_analysis_time', '09:00');
  const creativeEnabled = await db.getSetting('creative_analysis_enabled', 'true');

  // Load standard services (using require inside to avoid circular dependencies if any)
  const creativeService = require('./creative');

  // 2. Schedule Meta Ads Report Job
  if (adsEnabled === 'false') {
    log.info('Ads Analysis cron job is DISABLED by user setting.');
  } else {
    const adsCronExpr = buildDailyCronExpression(adsTime);
    log.info(`Scheduling Ads Analysis (daily check at ${adsTime}, freq = ${adsFreq} days): "${adsCronExpr}"`);
    
    adsJob = cron.schedule(adsCronExpr, async () => {
      const lastRunStr = await db.getSetting('ads_analysis_last_run');
      if (lastRunStr) {
        const lastRun = new Date(lastRunStr);
        const diffMs = Date.now() - lastRun.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays < Number.parseInt(adsFreq, 10) - 0.1) {
          log.info(`Skipping scheduled Ads Analysis: last run was ${diffDays.toFixed(1)} days ago, frequency is ${adsFreq} days.`);
          return;
        }
      }
      log.info('Triggering scheduled Ads Analysis runner...');
      adsService.runAnalysisAndSendReport(log)
        .catch(err => log.error(`Scheduled Ads Analysis failed: ${err.message}`));
    }, {
      timezone: "Asia/Jakarta"
    });
  }

  // 3. Schedule AI Creative / Content Ideation Job
  if (creativeEnabled === 'false') {
    log.info('AI Creative Analysis cron job is DISABLED by user setting.');
  } else {
    const creativeCronExpr = buildDailyCronExpression(creativeTime);
    log.info(`Scheduling AI Creative Analysis (daily check at ${creativeTime}, freq = ${creativeFreq} days): "${creativeCronExpr}"`);
    
    creativeJob = cron.schedule(creativeCronExpr, async () => {
      const reportStr = await db.getSetting('creative_analysis_report');
      if (reportStr) {
        try {
          const report = JSON.parse(reportStr);
          if (report.generatedAt) {
            const lastRun = new Date(report.generatedAt);
            const diffMs = Date.now() - lastRun.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            if (diffDays < Number.parseInt(creativeFreq, 10) - 0.1) {
              log.info(`Skipping scheduled AI Creative Analysis: last run was ${diffDays.toFixed(1)} days ago, frequency is ${creativeFreq} days.`);
              return;
            }
          }
        } catch (e) {
          log.error(`Failed to parse creative report for schedule check: ${e.message}`);
        }
      }
      log.info('Triggering scheduled AI Creative Analysis runner...');
      creativeService.runCreativeAnalysis(log)
        .catch(err => log.error(`Scheduled AI Creative Analysis failed: ${err.message}`));
    }, {
      timezone: "Asia/Jakarta"
    });
  }

  // 4. Schedule Hourly Customer Follow-ups (remains hourly)
  log.info('Scheduling Hourly Customer Follow-up scan: "0 * * * *"');
  followupJob = cron.schedule('0 * * * *', () => {
    log.info('Triggering scheduled hourly customer follow-up check...');
    followupService.runProactiveFollowUps(log)
      .catch(err => log.error(`Scheduled follow-up failed: ${err.message}`));
  }, {
    timezone: "Asia/Jakarta"
  });

  // 5. Schedule WhatsApp Pending Replies Retry scan (every minute)
  log.info('Scheduling Minute Pending AI Replies scan: "*/1 * * * *"');
  pendingRepliesJob = cron.schedule('*/1 * * * *', () => {
    log.info('Triggering scheduled pending AI replies retry check...');
    const whatsappService = require('./whatsapp');
    whatsappService.processPendingReplies(log)
      .catch(err => log.error(`Scheduled pending replies retry failed: ${err.message}`));
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
  if (pendingRepliesJob) {
    log.info('Stopping active Pending AI Replies cron job...');
    pendingRepliesJob.stop();
    pendingRepliesJob = null;
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
