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

  test('saveUsageLog correctly inserts token usage and calculates costs', async () => {
    db.pool.query.mockResolvedValueOnce({});

    await db.saveUsageLog({
      feature: 'whatsapp_chat',
      modelName: 'gemini-3.1-flash-lite',
      inputTokens: 2000,
      outputTokens: 100,
      cachedTokens: 1000
    });

    // costUsd = ((2000 - 1000) * 0.00000025) + (1000 * 0.000000025) + (100 * 0.0000015)
    //         = 0.00025 + 0.000025 + 0.00015 = 0.000425
    // costIdr = 0.000425 * 17500 = 7.4375 => rounded to 2 decimals is 7.44
    expect(db.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO api_usage_logs'),
      [
        'whatsapp_chat',
        'gemini-3.1-flash-lite',
        2000,
        100,
        1000,
        0.000425,
        7.44
      ]
    );
  });

  test('createOrUpdateCustomer inserts new customer if not exists', async () => {
    db.pool.query.mockResolvedValueOnce({ rows: [] }); // getCustomer SELECT returns empty
    db.pool.query.mockResolvedValueOnce({ rows: [{ id: 'default', business_id: 1 }] }); // getSession SELECT returns session
    const mockCustomer = { phone_number: '123456', name: 'New Customer' };
    db.pool.query.mockResolvedValueOnce({ rows: [mockCustomer] }); // INSERT returns customer

    const customer = await db.createOrUpdateCustomer('123456', 'New Customer', { status: 'lead' }, 'default');
    expect(customer).toEqual(mockCustomer);
    expect(db.pool.query).toHaveBeenCalledTimes(3);
    expect(db.pool.query.mock.calls[2][0]).toContain('INSERT INTO customers');
  });

  test('createOrUpdateCustomer updates existing customer if exists', async () => {
    const existingCustomer = { phone_number: '123456', name: 'Old Customer' };
    db.pool.query.mockResolvedValueOnce({ rows: [existingCustomer] }); // getCustomer SELECT returns existing
    db.pool.query.mockResolvedValueOnce({ rows: [{ id: 'default', business_id: 1 }] }); // getSession SELECT returns session
    const updatedCustomer = { phone_number: '123456', name: 'Updated Customer' };
    db.pool.query.mockResolvedValueOnce({ rows: [updatedCustomer] }); // UPDATE returns updated customer

    const customer = await db.createOrUpdateCustomer('123456', 'Updated Customer', { status: 'customer' }, 'default');
    expect(customer).toEqual(updatedCustomer);
    expect(db.pool.query).toHaveBeenCalledTimes(3);
    expect(db.pool.query.mock.calls[2][0]).toContain('UPDATE customers SET');
  });

  test('createBusiness correctly inserts a business', async () => {
    const mockBusiness = { id: 2, name: 'New Business', slug: 'new-business' };
    db.pool.query.mockResolvedValueOnce({ rows: [mockBusiness] });

    const business = await db.createBusiness({
      name: 'New Business',
      slug: 'new-business',
      shortDescription: 'Desc',
      contactPhone: '12345',
      address: 'Addr',
      website: 'Web',
      socialMedia: [{ type: 'instagram', value: 'ig' }],
      aiSettings: { temperature: 0.5 }
    });

    expect(business).toEqual(mockBusiness);
    expect(db.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO businesses'),
      [
        'New Business',
        'new-business',
        'Desc',
        '12345',
        'Addr',
        'Web',
        JSON.stringify([{ type: 'instagram', value: 'ig' }]),
        JSON.stringify({ temperature: 0.5 })
      ]
    );
  });

  test('getBusinesses fetches all businesses', async () => {
    const mockList = [{ id: 1, name: 'Biz A' }, { id: 2, name: 'Biz B' }];
    db.pool.query.mockResolvedValueOnce({ rows: mockList });

    const list = await db.getBusinesses();
    expect(list).toEqual(mockList);
    expect(db.pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM businesses ORDER BY name ASC'));
  });

  test('getBusinessById fetches single business', async () => {
    const mockBusiness = { id: 1, name: 'Biz A' };
    db.pool.query.mockResolvedValueOnce({ rows: [mockBusiness] });

    const business = await db.getBusinessById(1);
    expect(business).toEqual(mockBusiness);
    expect(db.pool.query).toHaveBeenCalledWith('SELECT * FROM businesses WHERE id = $1', [1]);
  });

  test('getBusinessBySlug fetches single business', async () => {
    const mockBusiness = { id: 1, name: 'Biz A', slug: 'biz-a' };
    db.pool.query.mockResolvedValueOnce({ rows: [mockBusiness] });

    const business = await db.getBusinessBySlug('biz-a');
    expect(business).toEqual(mockBusiness);
    expect(db.pool.query).toHaveBeenCalledWith('SELECT * FROM businesses WHERE slug = $1', ['biz-a']);
  });

  test('updateBusiness executes correct UPDATE query', async () => {
    const mockUpdated = { id: 1, name: 'Updated Biz' };
    db.pool.query.mockResolvedValueOnce({ rows: [mockUpdated] });

    const business = await db.updateBusiness(1, {
      name: 'Updated Biz',
      contactPhone: '98765',
      aiSettings: { temperature: 0.4 }
    });

    expect(business).toEqual(mockUpdated);
    expect(db.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE businesses'),
      [
        'Updated Biz',
        '98765',
        JSON.stringify({ temperature: 0.4 }),
        1
      ]
    );
  });
});
