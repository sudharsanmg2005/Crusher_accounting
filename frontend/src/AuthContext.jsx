import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from './api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [loading, setLoading] = useState(() => {
    const hasToken = !!localStorage.getItem('token');
    const hasUser = !!localStorage.getItem('user');
    return !(hasToken && hasUser);
  });

  useEffect(() => {
    const bootstrap = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get('/auth/me');
        localStorage.setItem('user', JSON.stringify(res.data));
        setUser(res.data);
      } catch (err) {
        // Only log out if it is an authentication failure (401 Unauthorized or 403 Forbidden)
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('lastActivity');
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('lastActivity');
    setUser(null);
  };

  useEffect(() => {
    if (!user) return;

    let timeoutId;
    const idleTime = 60 * 60 * 1000; // 60 minutes (1 hour) in milliseconds

    const handleAutoLogout = () => {
      logout();
      alert('Your session has expired due to inactivity. Please log in again.');
    };

    const resetTimer = () => {
      localStorage.setItem('lastActivity', Date.now().toString());
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleAutoLogout, idleTime);
    };

    // Check if session already expired since last activity
    const lastActivity = localStorage.getItem('lastActivity');
    if (lastActivity) {
      const elapsed = Date.now() - parseInt(lastActivity, 10);
      if (elapsed > idleTime) {
        handleAutoLogout();
        return;
      } else {
        // Set timeout for the remaining time
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(handleAutoLogout, idleTime - elapsed);
      }
    } else {
      resetTimer();
    }

    // Listen to user activity events
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Cleanup on unmount or user change
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  const login = async ({ username, password }) => {
    const res = await api.post('/auth/login', { username, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    setUser(res.data.user);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

