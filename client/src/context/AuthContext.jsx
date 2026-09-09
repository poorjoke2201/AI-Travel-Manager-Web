import { createContext, useCallback, useEffect, useState } from 'react';
import { fetchMe } from '../services/authService';
import { getToken, setToken, clearToken, registerUnauthorizedHandler } from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(logout);
  }, [logout]);

  useEffect(() => {
    async function bootstrap() {
      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await fetchMe();
        setUser(me);
      } catch {
        clearToken(); // token invalid/expired - fail quietly, land on login
      } finally {
        setIsLoading(false);
      }
    }
    bootstrap();
  }, []);

  const authenticate = useCallback(({ user: nextUser, token }) => {
    setToken(token);
    setUser(nextUser);
  }, []);

  const value = { user, isLoading, isAuthenticated: !!user, authenticate, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}