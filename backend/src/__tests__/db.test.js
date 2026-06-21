const db = require('../db');

jest.mock('pg', () => {
  const mClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mPool = {
    connect: jest.fn(() => Promise.resolve(mClient)),
    query: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

describe('db.js module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getSetting retrieves from database and caches', async () => {
    const mockQueryResult = {
      rows: [{ value: 'test-value' }],
    };
    db.pool.query.mockResolvedValueOnce(mockQueryResult);

    const value = await db.getSetting('test-key');
    expect(value).toBe('test-value');
    expect(db.pool.query).toHaveBeenCalledWith('SELECT value FROM settings WHERE key = $1', ['test-key']);

    // Second call should hit the cache and not query the database
    const cachedValue = await db.getSetting('test-key');
    expect(cachedValue).toBe('test-value');
    expect(db.pool.query).toHaveBeenCalledTimes(1);
  });

  test('setSetting inserts/updates value and updates cache', async () => {
    db.pool.query.mockResolvedValueOnce({});
    
    await db.setSetting('new-key', 'new-value');
    expect(db.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO settings'),
      ['new-key', 'new-value']
    );

    // Should return from cache now
    db.pool.query.mockClear();
    const value = await db.getSetting('new-key');
    expect(value).toBe('new-value');
    expect(db.pool.query).not.toHaveBeenCalled();
  });

  test('getCustomer retrieves correct customer record', async () => {
    const mockCustomer = { phone_number: '123456', name: 'John Doe' };
    db.pool.query.mockResolvedValueOnce({ rows: [mockCustomer] });

    const customer = await db.getCustomer('123456', 'default');
    expect(customer).toEqual(mockCustomer);
    expect(db.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM customers'),
      ['123456', 'default']
    );
  });
});
