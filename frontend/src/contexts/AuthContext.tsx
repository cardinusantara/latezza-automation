import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, setAuthToken } from '@/lib/api';
import { AuthContext } from '@/contexts/auth-context';

type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

function getInitialAuthState(): AuthState {
  const token = localStorage.getItem('auth_token');
  return token ? 'loading' : 'unauthenticated';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(getInitialAuthState);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setAuthToken(null);
    setState('unauthenticated');
  }, []);

  const handleUnauthorized = useCallback(() => logout(), [logout]);

  useEffect(() => {
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [handleUnauthorized]);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    setAuthToken(token);
    api.get<{ status: string }>('/api/auth/verify')
      .then(() => setState('authenticated'))
      .catch(() => {
        localStorage.removeItem('auth_token');
        setAuthToken(null);
        setState('unauthenticated');
      });
  }, []);

  const login = useCallback(async (password: string) => {
    try {
      const data = await api.post<{ status: string; token: string }>('/api/auth/login', { password });
      if (data.status === 'success' && data.token) {
        localStorage.setItem('auth_token', data.token);
        setAuthToken(data.token);
        setState('authenticated');
        return { success: true };
      }
      return { success: false, error: 'Login gagal.' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Koneksi gagal.' };
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      isAuthenticated: state === 'authenticated',
      isLoading: state === 'loading',
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
