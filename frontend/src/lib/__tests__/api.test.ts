import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError, setAuthToken } from '../api';
import { API_BASE_URL } from '@/config';

/** Helper: build a mock Response with JSON headers */
function mockJsonResponse(
  data: unknown,
  ok = true,
  status = 200,
): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? 'application/json' : null,
    },
  } as unknown as Response;
}

describe('api service layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.fetch = vi.fn();
    // Reset module-level isSessionExpired flag by simulating a fresh login
    setAuthToken('reset-token');
    setAuthToken(null);
  });

  afterEach(() => {
    setAuthToken(null);
  });

  test('api.get() makes a GET request and returns parsed JSON', async () => {
    const mockData = { status: 'success', data: [1, 2, 3] };
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse(mockData),
    );

    const result = await api.get('/api/test');

    expect(window.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (window.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/test`);
    expect(options.method).toBe('GET');
    expect(options.body).toBeUndefined();
    expect(result).toEqual(mockData);
  });

  test('api.post() makes a POST request with correct body', async () => {
    const mockData = { status: 'success' };
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse(mockData),
    );

    const payload = { name: 'Test', value: 42 };
    const result = await api.post('/api/test', payload);

    expect(window.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (window.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/test`);
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify(payload));
    expect(result).toEqual(mockData);
  });

  test('api.put() makes a PUT request with correct body', async () => {
    const mockData = { status: 'updated' };
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse(mockData),
    );

    const payload = { name: 'Updated' };
    const result = await api.put('/api/test/1', payload);

    expect(window.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (window.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/test/1`);
    expect(options.method).toBe('PUT');
    expect(options.body).toBe(JSON.stringify(payload));
    expect(result).toEqual(mockData);
  });

  test('api.delete() makes a DELETE request', async () => {
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({ status: 'deleted' }),
    );

    const result = await api.delete('/api/test/1');

    expect(window.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (window.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/test/1`);
    expect(options.method).toBe('DELETE');
    expect(options.body).toBeUndefined();
    expect(result).toEqual({ status: 'deleted' });
  });

  test('non-ok response throws ApiError with correct status code', async () => {
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({ message: 'Not found' }, false, 404),
    );

    await expect(api.get('/api/missing')).rejects.toThrow(ApiError);

    try {
      await api.get('/api/missing');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(404);
      expect((err as ApiError).endpoint).toBe('/api/missing');
      expect((err as Error).message).toBe('Not found');
    }
  });

  test('non-ok response with error field throws ApiError with that message', async () => {
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({ error: 'Validation failed' }, false, 400),
    );

    try {
      await api.post('/api/test', {});
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(400);
      expect((err as Error).message).toBe('Validation failed');
    }
  });

  test('non-ok response without JSON body uses default message', async () => {
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
      headers: {
        get: () => null,
      },
    } as unknown as Response);

    try {
      await api.get('/api/server-error');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(500);
      expect((err as Error).message).toBe('HTTP 500');
    }
  });

  test('network error throws ApiError', async () => {
    (window.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    await expect(api.get('/api/test')).rejects.toThrow(ApiError);

    try {
      await api.get('/api/test');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as Error).message).toBe('Failed to fetch');
      expect((err as ApiError).endpoint).toBe('/api/test');
      expect((err as ApiError).statusCode).toBeUndefined();
    }
  });

  test('abort signal is passed through to fetch', async () => {
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({ ok: true }),
    );

    const controller = new AbortController();
    await api.get('/api/test', controller.signal);

    const [, options] = (window.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(options.signal).toBe(controller.signal);
  });

  test('DOMException AbortError is re-thrown as-is (not wrapped in ApiError)', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    (window.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(abortError);

    await expect(api.get('/api/test')).rejects.toThrow(abortError);
  });

  test('non-JSON response returns undefined', async () => {
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 204,
      headers: {
        get: () => null,
      },
    } as unknown as Response);

    const result = await api.delete('/api/test/1');
    expect(result).toBeUndefined();
  });

  test('post without body sends undefined body', async () => {
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({ ok: true }),
    );

    await api.post('/api/test');

    const [, options] = (window.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(options.body).toBeUndefined();
  });

  test('custom headers are merged with default Content-Type', async () => {
    // api.get/post/put/delete don't expose headers param directly,
    // but the internal request function spreads custom headers.
    // We test that the default Content-Type is always set.
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({ ok: true }),
    );

    await api.post('/api/test', { foo: 'bar' });

    const [, options] = (window.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  test('setAuthToken adds Authorization Bearer header', async () => {
    setAuthToken('my-test-token');
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({ ok: true }),
    );

    await api.get('/api/test');

    const [, options] = (window.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(options.headers['Authorization']).toBe('Bearer my-test-token');
    setAuthToken(null);
  });

  test('setting auth token to null removes Authorization header', async () => {
    setAuthToken('temp-token');
    setAuthToken(null);
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({ ok: true }),
    );

    await api.get('/api/test');

    const [, options] = (window.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(options.headers['Authorization']).toBeUndefined();
  });

  test('401 response dispatches auth:unauthorized event', async () => {
    setAuthToken('expired-token');
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockJsonResponse({ message: 'Unauthorized' }, false, 401),
    );

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await expect(api.get('/api/test')).rejects.toThrow(ApiError);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'auth:unauthorized',
      }),
    );
    setAuthToken(null);
    dispatchSpy.mockRestore();
  });

  test('requests after 401 are blocked without hitting the network', async () => {
    // First request returns 401
    setAuthToken('expired-token');
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ message: 'Unauthorized' }, false, 401),
    );
    await expect(api.get('/api/test')).rejects.toThrow(ApiError);

    // Second request should be blocked immediately — fetch should NOT be called again
    vi.clearAllMocks();
    await expect(api.get('/api/protected')).rejects.toThrow('Session expired');
    expect(window.fetch).not.toHaveBeenCalled();

    // Login endpoint should still be allowed through
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockJsonResponse({ token: 'new-token', status: 'success' }),
    );
    const result = await api.post('/api/auth/login', { password: 'cardi123' });
    expect(result).toMatchObject({ status: 'success' });
    expect(window.fetch).toHaveBeenCalledTimes(1);
  });
});
