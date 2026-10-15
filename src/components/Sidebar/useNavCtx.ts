import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { NavCtx } from '../../config/navigation';

// Who may see which screen — ONE definition shared by the sidebar, the mobile tab bar and the
// « Plus » page, so the phone never shows an entry the desktop menu would hide.
//
// Admin status from the EFFECTIVE identity (/api/auth/verify via AuthContext), never the raw
// JWT — that stays admin while impersonating and would leak the admin menu during "view as".
export function useNavCtx(): NavCtx {
  const { user } = useAuth();
  return useMemo<NavCtx>(() => {
    const perms = user?.permissions || [];
    return {
      isAdmin: !!user?.isAdmin,
      can: (p: string) => perms.includes('*') || perms.includes(p) || perms.includes(`${p.split(':')[0]}:*`),
    };
  }, [user]);
}
