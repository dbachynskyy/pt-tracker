import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, User } from '../api/client';

interface AuthState {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const clearAuth = useCallback(() => {
    api.setToken(null);
    setToken(null);
    setUser(null);
  }, []);

  // Register 401 handler so any expired/revoked token triggers an automatic logout.
  useEffect(() => {
    api.setOnUnauthorized(clearAuth);
  }, [clearAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api.login(email, password);
    api.setToken(tokens.access_token);
    setToken(tokens.access_token);
    const me = await api.me();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    clearAuth();
  }, [clearAuth]);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
