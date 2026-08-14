import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Troisième surface d'identité de l'app, entièrement séparée de AuthContext et de
// PartnerAuthContext — voir le commentaire de la table pass_members dans server.js. Un
// membre de La Passe ne touche jamais les clés localStorage des deux autres, donc aucune
// session ne peut être confondue avec une autre ni promue en une autre.
//
// Pas de mot de passe ni de TOTP ici : la connexion se fait par lien magique. Ce contexte
// ne connaît donc qu'un jeton déjà obtenu et le membre qu'il désigne.

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-production-b7f9.up.railway.app';

export const PASS_TOKEN_KEY = 'passToken';

export interface PassTier {
  level: number;
  key: string;
  credit: number;
  // Optionnel : le palier 1 n'accorde pas ce rabais, et une configuration enregistrée avant
  // l'ajout du champ peut ne pas le porter (le serveur la complète, mais le type reste
  // honnête sur ce qui peut arriver).
  productDiscountPct?: number;
}

export interface PassMember {
  id: number;
  email: string;
  fullName: string | null;
  business: string | null;
  province: string | null;
  locale: 'fr-CA' | 'en-CA';
  joinedAt: string;
  lifetimeLiveReferrals: number;
  tier: PassTier;
  nextTier: (PassTier & { referralsAway: number }) | null;
  hardwareDiscount: number;
  currency: string;
}

interface PassAuthContextType {
  member: PassMember | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (member: PassMember, token: string) => void;
  logout: () => void;
  refresh: () => Promise<void>;
}

const PassAuthContext = createContext<PassAuthContextType | undefined>(undefined);

export const PassAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [member, setMember] = useState<PassMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    try {
      const token = localStorage.getItem(PASS_TOKEN_KEY);
      if (!token) { setMember(null); return; }
      const res = await fetch(`${API_URL}/api/pass/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setMember(data.member);
      } else {
        // Le jeton dure 30 jours, mais le serveur relit la ligne vivante à chaque requête :
        // une adhésion suspendue doit vider la session tout de suite, pas à l'expiration.
        localStorage.removeItem(PASS_TOKEN_KEY);
        setMember(null);
      }
    } catch {
      setMember(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const login = (m: PassMember, token: string) => {
    localStorage.setItem(PASS_TOKEN_KEY, token);
    setMember(m);
    setIsLoading(false);
  };

  const logout = () => {
    localStorage.removeItem(PASS_TOKEN_KEY);
    setMember(null);
  };

  return (
    <PassAuthContext.Provider
      value={{ member, isLoading, isAuthenticated: !!member, login, logout, refresh }}
    >
      {children}
    </PassAuthContext.Provider>
  );
};

export const usePassAuth = () => {
  const ctx = useContext(PassAuthContext);
  if (!ctx) throw new Error('usePassAuth must be used within a PassAuthProvider');
  return ctx;
};
