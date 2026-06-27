const broadcastService = require('../services/broadcast');
const db = require('../db');
const whatsappService = require('../services/whatsapp');

// Mock db
jest.mock('../db', () => ({
  getBroadcastTargets: jest.fn(),
  createCampaign: jest.fn(),
  addQueueItem: jest.fn(),
  getNextPendingQueueItem: jest.fn(),
  getCampaignById: jest.fn(),
  updateCampaignStatus: jest.fn(),
  updateQueueItemStatus: jest.fn(),
  incrementCampaignStats: jest.fn(),
  getPendingQueueCount: jest.fn(),
  saveChatMessage: jest.fn(),
  pool: {
    query: jest.fn()
  }
}));

// Mock whatsappService
jest.mock('../services/whatsapp', () => {
  const mockSock = {
    onWhatsApp: jest.fn(),
    sendPresenceUpdate: jest.fn(),
    sendMessage: jest.fn()
  };
  const sessionsMap = new Map();
  sessionsMap.set('default', { sock: mockSock, ready: true });
  sessionsMap.set('session1', { sock: mockSock, ready: true });
  return {
    isReady: jest.fn(),
    sessions: sessionsMap
  };
});

describe('Broadcast Service', () => {
  let mockLog;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLog = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
    // Set low delays for fast testing
    process.env.BROADCAST_BASE_DELAY_MS = '1';
    process.env.BROADCAST_MAX_JITTER_MS = '1';
    process.env.BROADCAST_MIN_TYPING_MS = '1';
    process.env.BROADCAST_MAX_TYPING_MS = '1';
    process.env.BROADCAST_CHAR_TYPING_MS = '1';
    process.env.BROADCAST_POLL_INTERVAL_MS = '1';
    process.env.BROADCAST_SKIP_INTERVAL_MS = '1';
  });

  afterEach(() => {
    broadcastService.stopQueueWorker();
  });

  describe('Utility Functions', () => {
    test('parseSpintax parses templates correctly', () => {
      const spintax = '{Halo|Hai} {{name}}, {apa kabar|bagaimana}?';
      const parsed = broadcastService.parseSpintax(spintax);
      
      // Halo or Hai should be in the string
      expect(parsed).toMatch(/(Halo|Hai)/);
      // apa kabar or bagaimana should be in the string
      expect(parsed).toMatch(/(apa kabar|bagaimana)/);
      // placeholders should not be touched by spintax parser
      expect(parsed).toContain('{{name}}');
    });

    test('parseSpintax returns empty string if null/empty input', () => {
      expect(broadcastService.parseSpintax(null)).toBe('');
      expect(broadcastService.parseSpintax('')).toBe('');
    });

    test('personalizeMessage replaces variables and parses spintax', () => {
      const template = '{Halo|Hai} {{name}}, catatan Anda: {{notes}}';
      const customer = {
        name: 'Budi',
        phone_number: '62812345678',
        status: 'lead',
        notes: 'Tertarik kue cokelat'
      };

      const personalized = broadcastService.personalizeMessage(template, customer);
      expect(personalized).toMatch(/(Halo|Hai)/);
      expect(personalized).toContain('Budi');
      expect(personalized).toContain('Tertarik kue cokelat');
      expect(personalized).not.toContain('{{name}}');
      expect(personalized).not.toContain('{{notes}}');
    });
  });

  describe('Campaign and Queue Creation', () => {
    test('createCampaignAndQueue creates campaign and generates queue items', async () => {
      const targets = [
        { phone_number: '628111@s.whatsapp.net', name: 'Alice', status: 'lead', notes: '' },
        { phone_number: '628222@s.whatsapp.net', name: 'Bob', status: 'customer', notes: '' }
      ];
      db.getBroadcastTargets.mockResolvedValue(targets);
      db.createCampaign.mockResolvedValue({ id: 1, name: 'Promo Ramadhan' });
      db.addQueueItem.mockResolvedValue({});
      db.pool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Promo Ramadhan', total_targets: 2, status: 'queued' }]
      });

      const campaign = await broadcastService.createCampaignAndQueue({
        name: 'Promo Ramadhan',
        sessionId: 'default',
        template: 'Halo {{name}}!',
        mediaType: 'text',
        mediaUrl: null,
        targetFilter: 'all',
        selectedPhones: []
      });

      expect(db.getBroadcastTargets).toHaveBeenCalledWith('default', 'all', []);
      expect(db.createCampaign).toHaveBeenCalledWith({
        name: 'Promo Ramadhan',
        sessionId: 'default',
        messageTemplate: 'Halo {{name}}!',
        mediaType: 'text',
        mediaUrl: null,
        scheduledAt: null
      });
      expect(db.addQueueItem).toHaveBeenCalledTimes(2);
      expect(campaign.total_targets).toBe(2);
      expect(campaign.status).toBe('queued');
    });

    test('createCampaignAndQueue skips opt_out customers', async () => {
      const targets = [
        { phone_number: '628111@s.whatsapp.net', name: 'Alice', status: 'lead', notes: '' },
        { phone_number: '628222@s.whatsapp.net', name: 'Bob', status: 'opt_out', notes: '' }
      ];
      db.getBroadcastTargets.mockResolvedValue(targets);
      db.createCampaign.mockResolvedValue({ id: 1, name: 'Promo' });
      db.addQueueItem.mockResolvedValue({});
      db.pool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Promo', total_targets: 1, status: 'queued' }]
      });

      const campaign = await broadcastService.createCampaignAndQueue({
        name: 'Promo',
        sessionId: 'default',
        template: 'Halo {{name}}!',
        mediaType: 'text',
        mediaUrl: null,
        targetFilter: 'all'
      });

      expect(db.addQueueItem).toHaveBeenCalledTimes(1); // Bob should be skipped
      expect(campaign.total_targets).toBe(1);
    });

    test('createCampaignAndQueue throws error if no targets found', async () => {
      db.getBroadcastTargets.mockResolvedValue([]);

      await expect(broadcastService.createCampaignAndQueue({
        name: 'Promo',
        template: 'Halo'
      })).rejects.toThrow('Tidak ada target customer yang cocok');
    });
  });

  describe('Queue Worker Daemon', () => {
    test('startQueueWorker starts worker and processQueueStep processes items', async () => {
      whatsappService.isReady.mockReturnValue(true);
      const session = whatsappService.sessions.get('default');
      session.sock.onWhatsApp.mockResolvedValue([{ exists: true }]);
      session.sock.sendPresenceUpdate.mockResolvedValue({});
      session.sock.sendMessage.mockResolvedValue({});

      // Setup queue items: 1 pending item
      const mockQueueItem = {
        id: 10,
        campaign_id: 1,
        phone_number: '628111@s.whatsapp.net',
        session_id: 'default',
        personalized_message: 'Halo Alice!'
      };
      
      // Let's mock DB returns: first call returns queue item, second returns null (to stop loop or let it sleep)
      db.getNextPendingQueueItem
        .mockResolvedValueOnce(mockQueueItem)
        .mockResolvedValue(null);

      db.getCampaignById.mockResolvedValue({
        id: 1,
        name: 'Promo',
        status: 'processing',
        media_type: 'text'
      });
      db.updateQueueItemStatus.mockResolvedValue({});
      db.incrementCampaignStats.mockResolvedValue({});
      db.getPendingQueueCount.mockResolvedValue(0); // completed
      db.updateCampaignStatus.mockResolvedValue({});

      // Start worker
      await broadcastService.startQueueWorker(mockLog);
      expect(broadcastService.isRunning()).toBe(true);

      // Wait a tiny bit for async worker loop step to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(db.getNextPendingQueueItem).toHaveBeenCalled();
      expect(db.updateQueueItemStatus).toHaveBeenCalledWith(10, 'sending');
      expect(session.sock.onWhatsApp).toHaveBeenCalledWith('628111');
      expect(session.sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', '628111@s.whatsapp.net');
      expect(session.sock.sendMessage).toHaveBeenCalledWith('628111@s.whatsapp.net', { text: 'Halo Alice!' });
      expect(db.saveChatMessage).toHaveBeenCalledWith('628111@s.whatsapp.net', 'model', 'Halo Alice!', 'default');
      expect(db.updateQueueItemStatus).toHaveBeenCalledWith(10, 'sent');
      expect(db.incrementCampaignStats).toHaveBeenCalledWith(1, 'sent_count');
      expect(db.getPendingQueueCount).toHaveBeenCalledWith(1);
      expect(db.updateCampaignStatus).toHaveBeenCalledWith(1, 'completed');
    });

    test('Queue worker handles non-existent WhatsApp numbers', async () => {
      whatsappService.isReady.mockReturnValue(true);
      const session = whatsappService.sessions.get('default');
      session.sock.onWhatsApp.mockResolvedValue([{ exists: false }]); // doesn't exist

      const mockQueueItem = {
        id: 11,
        campaign_id: 1,
        phone_number: '628111@s.whatsapp.net',
        session_id: 'default',
        personalized_message: 'Halo Alice!'
      };
      
      db.getNextPendingQueueItem
        .mockResolvedValueOnce(mockQueueItem)
        .mockResolvedValue(null);

      db.getCampaignById.mockResolvedValue({
        id: 1,
        name: 'Promo',
        status: 'processing',
        media_type: 'text'
      });
      db.getPendingQueueCount.mockResolvedValue(0);

      await broadcastService.startQueueWorker(mockLog);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(db.updateQueueItemStatus).toHaveBeenCalledWith(11, 'sending');
      expect(db.updateQueueItemStatus).toHaveBeenCalledWith(11, 'failed', 'Nomor tidak terdaftar di WhatsApp');
      expect(db.incrementCampaignStats).toHaveBeenCalledWith(1, 'failed_count');
      expect(session.sock.sendMessage).not.toHaveBeenCalled();
    });
    test('Queue worker sends LID targets without onWhatsApp preflight', async () => {
      whatsappService.isReady.mockReturnValue(true);
      const session = whatsappService.sessions.get('default');
      session.sock.sendPresenceUpdate.mockResolvedValue({});
      session.sock.sendMessage.mockResolvedValue({});

      const mockQueueItem = {
        id: 13,
        campaign_id: 3,
        phone_number: '188695395176555@lid',
        session_id: 'default',
        personalized_message: 'Halo Kak!'
      };

      db.getNextPendingQueueItem
        .mockResolvedValueOnce(mockQueueItem)
        .mockResolvedValue(null);

      db.getCampaignById.mockResolvedValue({
        id: 3,
        name: 'Promo LID',
        status: 'processing',
        media_type: 'text'
      });
      db.getPendingQueueCount.mockResolvedValue(0);
      db.updateQueueItemStatus.mockResolvedValue({});
      db.incrementCampaignStats.mockResolvedValue({});
      db.updateCampaignStatus.mockResolvedValue({});

      await broadcastService.startQueueWorker(mockLog);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(session.sock.onWhatsApp).not.toHaveBeenCalled();
      expect(session.sock.sendMessage).toHaveBeenCalledWith('188695395176555@lid', { text: 'Halo Kak!' });
      expect(db.updateQueueItemStatus).toHaveBeenCalledWith(13, 'sent');
    });

    test('Queue worker pauses campaign if WhatsApp session is not ready', async () => {
      whatsappService.isReady.mockReturnValue(false); // session disconnected

      const mockQueueItem = {
        id: 12,
        campaign_id: 2,
        phone_number: '628111@s.whatsapp.net',
        session_id: 'default',
        personalized_message: 'Halo Alice!'
      };
      
      db.getNextPendingQueueItem
        .mockResolvedValueOnce(mockQueueItem)
        .mockResolvedValue(null);

      db.getCampaignById.mockResolvedValue({
        id: 2,
        name: 'Promo',
        status: 'processing',
        media_type: 'text'
      });

      await broadcastService.startQueueWorker(mockLog);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(db.updateCampaignStatus).toHaveBeenCalledWith(2, 'paused');
      expect(db.updateQueueItemStatus).toHaveBeenCalledWith(12, 'pending', expect.any(String));
    });
  });
});

