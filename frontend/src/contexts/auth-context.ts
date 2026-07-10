import { createContext } from 'react';

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);
