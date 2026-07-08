const scheduler = require('../services/scheduler');
const cron = require('node-cron');
const db = require('../db');
const adsService = require('../services/ads');
const followupService = require('../services/followup');
const creativeService = require('../services/creative');

jest.mock('node-cron', () => {
  const mockJobs = [];
  return {
    schedule: jest.fn((expr, callback, options) => {
      const job = {
        stop: jest.fn(),
        expr,
        callback,
        options
      };
      mockJobs.push(job);
      return job;
    }),
    _getMockJobs: () => mockJobs,
    _clearMockJobs: () => {
      mockJobs.length = 0;
    }
  };
});

jest.mock('../db', () => ({
  getSetting: jest.fn()
}));

jest.mock('../services/ads', () => ({
  runAnalysisAndSendReport: jest.fn(() => Promise.resolve())
}));

jest.mock('../services/followup', () => ({
  runProactiveFollowUps: jest.fn(() => Promise.resolve())
}));

jest.mock('../services/creative', () => ({
  runCreativeAnalysis: jest.fn(() => Promise.resolve())
}));

describe('Scheduler Service', () => {
  let mockLog;

  beforeEach(() => {
    jest.clearAllMocks();
    cron._clearMockJobs();
    mockLog = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
  });

  afterEach(() => {
    scheduler.stopAllJobs(mockLog);
  });

  test('setupScheduledJobs registers cron jobs with correct daily expressions', async () => {
    db.getSetting.mockImplementation((key, defaultValue) => {
      if (key === 'ads_analysis_time') return Promise.resolve('08:30');
      if (key === 'creative_analysis_time') return Promise.resolve('22:15');
      if (key === 'ads_analysis_enabled') return Promise.resolve('true');
      if (key === 'creative_analysis_enabled') return Promise.resolve('true');
      return Promise.resolve(defaultValue);
    });

    await scheduler.setupScheduledJobs(mockLog);

    const jobs = cron._getMockJobs();
    expect(jobs).toHaveLength(4); // Ads, Creative, Follow-up, Pending AI Replies
    
    // Check cron expressions
    expect(jobs[0].expr).toBe('30 8 * * *'); // Ads
    expect(jobs[1].expr).toBe('15 22 * * *'); // Creative
    expect(jobs[2].expr).toBe('0 * * * *'); // Follow-up
    expect(jobs[3].expr).toBe('*/1 * * * *'); // Pending AI Replies
  });

  test('setupScheduledJobs defaults invalid time formats to 09:00', async () => {
    db.getSetting.mockImplementation((key, defaultValue) => {
      if (key === 'ads_analysis_time') return Promise.resolve('invalid-time');
      if (key === 'creative_analysis_time') return Promise.resolve(null);
      return Promise.resolve(defaultValue);
    });

    await scheduler.setupScheduledJobs(mockLog);

    const jobs = cron._getMockJobs();
    expect(jobs[0].expr).toBe('0 9 * * *');
    expect(jobs[1].expr).toBe('0 9 * * *');
  });

  test('setupScheduledJobs does not schedule jobs when disabled', async () => {
    db.getSetting.mockImplementation((key, defaultValue) => {
      if (key === 'ads_analysis_enabled') return Promise.resolve('false');
      if (key === 'creative_analysis_enabled') return Promise.resolve('false');
      return Promise.resolve(defaultValue);
    });

    await scheduler.setupScheduledJobs(mockLog);

    const jobs = cron._getMockJobs();
    expect(jobs).toHaveLength(2); // Follow-up and Pending AI Replies (both always scheduled)
    expect(jobs[0].expr).toBe('0 * * * *');
    expect(jobs[1].expr).toBe('*/1 * * * *');
  });

  test('Ads Analysis cron job execution logic - run vs skip', async () => {
    db.getSetting.mockImplementation((key, defaultValue) => {
      if (key === 'ads_analysis_frequency') return Promise.resolve('2'); // 2 days frequency
      if (key === 'ads_analysis_time') return Promise.resolve('09:00');
      if (key === 'ads_analysis_enabled') return Promise.resolve('true');
      if (key === 'ads_analysis_last_run') {
        // Last run was 1 day ago (less than frequency)
        const lastRun = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return Promise.resolve(lastRun.toISOString());
      }
      return Promise.resolve(defaultValue);
    });

    await scheduler.setupScheduledJobs(mockLog);
    const jobs = cron._getMockJobs();
    const adsCallback = jobs[0].callback;

    // Trigger callback - should skip because last run was 1 day ago and frequency is 2 days
    await adsCallback();
    expect(adsService.runAnalysisAndSendReport).not.toHaveBeenCalled();

    // Now modify mock so last run was 3 days ago (greater than frequency)
    db.getSetting.mockImplementation((key, defaultValue) => {
      if (key === 'ads_analysis_frequency') return Promise.resolve('2');
      if (key === 'ads_analysis_last_run') {
        const lastRun = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        return Promise.resolve(lastRun.toISOString());
      }
      return Promise.resolve(defaultValue);
    });

    await adsCallback();
    expect(adsService.runAnalysisAndSendReport).toHaveBeenCalledTimes(1);
  });

  test('Ads Analysis cron job handles service rejection', async () => {
    db.getSetting.mockImplementation((key, defaultValue) => {
      if (key === 'ads_analysis_frequency') return Promise.resolve('1');
      if (key === 'ads_analysis_last_run') return Promise.resolve(null);
      return Promise.resolve(defaultValue);
    });

    adsService.runAnalysisAndSendReport.mockRejectedValueOnce(new Error('Ads Analysis API Fail'));

    await scheduler.setupScheduledJobs(mockLog);
    const jobs = cron._getMockJobs();
    await jobs[0].callback();

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Scheduled Ads Analysis failed: Ads Analysis API Fail'));
  });

  test('AI Creative cron job execution logic - run vs skip & handles invalid json', async () => {
    db.getSetting.mockImplementation((key, defaultValue) => {
      if (key === 'creative_analysis_frequency') return Promise.resolve('3');
      if (key === 'creative_analysis_report') {
        // Last run 1 day ago, frequency 3
        const generatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        return Promise.resolve(JSON.stringify({ generatedAt }));
      }
      return Promise.resolve(defaultValue);
    });

    await scheduler.setupScheduledJobs(mockLog);
    const jobs = cron._getMockJobs();
    const creativeCallback = jobs[1].callback;

    // Trigger - should skip
    await creativeCallback();
    expect(creativeService.runCreativeAnalysis).not.toHaveBeenCalled();

    // Last run 4 days ago - should run
    db.getSetting.mockImplementation((key, defaultValue) => {
      if (key === 'creative_analysis_frequency') return Promise.resolve('3');
      if (key === 'creative_analysis_report') {
        const generatedAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
        return Promise.resolve(JSON.stringify({ generatedAt }));
      }
      return Promise.resolve(defaultValue);
    });
    await creativeCallback();
    expect(creativeService.runCreativeAnalysis).toHaveBeenCalledTimes(1);

    // Invalid JSON - should log parse error and still run analysis
    db.getSetting.mockImplementation((key, defaultValue) => {
      if (key === 'creative_analysis_frequency') return Promise.resolve('3');
      if (key === 'creative_analysis_report') return Promise.resolve('invalid-json-string');
      return Promise.resolve(defaultValue);
    });
    await creativeCallback();
    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse creative report'));
    expect(creativeService.runCreativeAnalysis).toHaveBeenCalledTimes(2);
  });

  test('AI Creative Analysis handles service rejection', async () => {
    db.getSetting.mockImplementation((key, defaultValue) => {
      if (key === 'creative_analysis_report') return Promise.resolve(null);
      return Promise.resolve(defaultValue);
    });
    creativeService.runCreativeAnalysis.mockRejectedValueOnce(new Error('Creative Fail'));

    await scheduler.setupScheduledJobs(mockLog);
    const jobs = cron._getMockJobs();
    await jobs[1].callback();

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Scheduled AI Creative Analysis failed: Creative Fail'));
  });

  test('Hourly Follow-up cron job triggers followup service', async () => {
    await scheduler.setupScheduledJobs(mockLog);
    const jobs = cron._getMockJobs();
    const followupCallback = jobs[2].callback;

    await followupCallback();
    expect(followupService.runProactiveFollowUps).toHaveBeenCalledTimes(1);
  });

  test('Hourly Follow-up handles service rejection', async () => {
    followupService.runProactiveFollowUps.mockRejectedValueOnce(new Error('Followup service down'));

    await scheduler.setupScheduledJobs(mockLog);
    const jobs = cron._getMockJobs();
    await jobs[2].callback();

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining('Scheduled follow-up failed: Followup service down'));
  });

  test('reloadSchedules re-initializes all jobs', async () => {
    db.getSetting.mockResolvedValue('false'); // Disable to minimize triggers in reload

    await scheduler.reloadSchedules(mockLog);
    
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('Reloading background schedules'));
    expect(db.getSetting).toHaveBeenCalled();
  });
});
