import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Fully separate from AuthContext by design (see server.js's partner_users table comment) — a
// partner login never touches the internal token/localStorage keys, so there's no path for a
// partner session to be mistaken for (or upgraded into) an internal one.
interface PartnerUser {
  id: number;
  partnerId: number;
  partnerName: string | null;
  email: string;
  name: string;
  role: 'admin' | 'standard';
  totpEnabled: boolean;
}

interface PartnerAuthContextType {
  user: PartnerUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (userData: PartnerUser, token: string) => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const PartnerAuthContext = createContext<PartnerAuthContextType | undefined>(undefined);

export const PartnerAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<PartnerUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('partnerToken');
      if (!token) { setUser(null); return; }
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com'}/api/partner-auth/verify`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('partnerUser', JSON.stringify(data.user));
        setUser(data.user);
      } else {
        localStorage.removeItem('partnerToken');
        localStorage.removeItem('partnerUser');
        setUser(null);
      }
    } catch (error) {
      console.error('Partner auth check failed:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = (userData: PartnerUser, token: string) => {
    localStorage.setItem('partnerToken', token);
    localStorage.setItem('partnerUser', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('partnerToken');
    localStorage.removeItem('partnerUser');
    setUser(null);
  };

  const value = { user, isLoading, isAuthenticated: !!user, login, logout, checkAuth };
  return <PartnerAuthContext.Provider value={value}>{children}</PartnerAuthContext.Provider>;
};

export const usePartnerAuth = (): PartnerAuthContextType => {
  const context = useContext(PartnerAuthContext);
  if (context === undefined) {
    throw new Error('usePartnerAuth must be used within a PartnerAuthProvider');
  }
  return context;
};
