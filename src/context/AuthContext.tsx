import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  email: string;
  name: string;
  zoho_id: string;
  photo?: string | null;
  isAdmin?: boolean;
  isSalesperson?: boolean;
  isDemo?: boolean; // demo mode: scrambled data, read-only (from /api/auth/verify)
  permissions?: string[]; // effective permission keys ('*' for admins) from /api/auth/verify
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (userData: User, token: string) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (token && storedUser) {
        // Verify token with backend. IMPORTANT: this uses fetch (not axios), so the
        // axios interceptor that adds X-Impersonate-As does NOT apply — attach it
        // manually, otherwise the Sidebar keeps the ADMIN identity (full admin menu)
        // while impersonating a rep.
        const headers: Record<string, string> = { 'Authorization': `Bearer ${token}` };
        const impersonateAs = localStorage.getItem('impersonateAs');
        if (impersonateAs) headers['X-Impersonate-As'] = impersonateAs;
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com'}/api/auth/verify`,
          { headers }
        );

        if (response.ok) {
          const data = await response.json();
          // Use fresh user data from server (includes latest photo, name, etc.)
          const freshUser = data.user || JSON.parse(storedUser);
          localStorage.setItem('user', JSON.stringify(freshUser));
          setUser(freshUser);
        } else {
          // Token invalid, clear storage
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = (userData: User, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    // Start each session with the sidebar collapsed (icons only) — the user expands it if wanted.
    localStorage.setItem('sidebar-collapsed', 'true');
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
