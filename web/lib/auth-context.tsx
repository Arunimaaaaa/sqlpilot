'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from './api';

interface User {
  id: number;
  email: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('sqlpilot_token');
    const savedUser = localStorage.getItem('sqlpilot_user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('sqlpilot_token');
        localStorage.removeItem('sqlpilot_user');
      }
    } else {
      // Auto-set a guest/demo user for seamless out-of-the-box local exploration
      const demoUser = { id: 1, email: 'developer@sqlpilot.local' };
      const demoToken = 'demo-session-token';
      setUser(demoUser);
      setToken(demoToken);
      localStorage.setItem('sqlpilot_user', JSON.stringify(demoUser));
      localStorage.setItem('sqlpilot_token', demoToken);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await api.auth.login({ email, password: pass });
    setUser(res.user);
    setToken(res.token);
    localStorage.setItem('sqlpilot_token', res.token);
    localStorage.setItem('sqlpilot_user', JSON.stringify(res.user));
  };

  const register = async (email: string, pass: string) => {
    const res = await api.auth.register({ email, password: pass });
    setUser(res.user);
    setToken(res.token);
    localStorage.setItem('sqlpilot_token', res.token);
    localStorage.setItem('sqlpilot_user', JSON.stringify(res.user));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('sqlpilot_token');
    localStorage.removeItem('sqlpilot_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
