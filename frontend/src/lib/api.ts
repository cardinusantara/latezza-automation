import { API_BASE_URL } from '@/config';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
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
  const url = `${API_BASE_URL}${endpoint}`;
  const body = options?.body !== undefined ? JSON.stringify(options.body) : undefined;
  try {
    const headers: Record<string, string> = {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
      ...options?.headers,
    };
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: options?.signal,
    });

    if (res.status === 401) {
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
  get<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return request<T>('GET', endpoint, { signal });
  },

  post<T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>('POST', endpoint, { body, signal });
  },

  put<T>(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>('PUT', endpoint, { body, signal });
  },

  delete<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return request<T>('DELETE', endpoint, { signal });
  },
};
