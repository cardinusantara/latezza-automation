import { API_BASE_URL } from '@/config';

let authToken: string | null = null;
// Once a 401 is received, block all subsequent requests until a new token is set.
// This prevents polling intervals from hammering the server with unauthenticated requests.
let isSessionExpired = false;

export function setAuthToken(token: string | null) {
  authToken = token;
  // A new token (login) resets the expired flag; clearing token (logout) keeps it set
  // so we only reset on actual login (token !== null).
  if (token !== null) {
    isSessionExpired = false;
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = authToken || localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  statusCode?: number;
  endpoint?: string;

  constructor(message: string, statusCode?: number, endpoint?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}

async function request<T>(
  method: string,
  endpoint: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  },
): Promise<T> {
  // Guard: stop all API calls immediately after a 401, except login itself.
  // This prevents polling loops from firing unauthenticated requests before React unmounts.
  if (isSessionExpired && !endpoint.startsWith('/api/auth/')) {
    throw new ApiError('Session expired', 401, endpoint);
  }

  let url = `${API_BASE_URL}${endpoint}`;
  if (method === 'GET') {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}_t=${Date.now()}`;
  }
  const body = options?.body !== undefined ? JSON.stringify(options.body) : undefined;
  try {
    const token = authToken || localStorage.getItem('auth_token');
    (window as any).__api_token = token;
    (window as any).__api_session_expired = isSessionExpired;
    const headers: Record<string, string> = {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options?.headers,
    };
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: options?.signal,
    });

    if (res.status === 401) {
      isSessionExpired = true;
      setAuthToken(null);
      localStorage.removeItem('auth_token');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const errorData = await res.json();
        message = errorData.message || errorData.error || message;
      } catch {
        // Response body is not JSON
      }
      throw new ApiError(message, res.status, endpoint);
    }

    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return (await res.json()) as T;
    }
    return undefined as unknown as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(
      err instanceof Error ? err.message : 'Network error',
      undefined,
      endpoint,
    );
  }
}

export const api = {
  get<T = any>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return request<T>('GET', endpoint, { signal });
  },

  post<T = any>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>('POST', endpoint, { body, signal });
  },

  put<T = any>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>('PUT', endpoint, { body, signal });
  },

  delete<T = any>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return request<T>('DELETE', endpoint, { signal });
  },
};
