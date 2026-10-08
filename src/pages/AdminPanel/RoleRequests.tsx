import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, X, Loader2 } from 'lucide-react';
import { dialog } from '../../lib/dialog';

// Demandes de rôle des usagers qui n'en ont pas encore (écran NoRoleNotice). Affichées en tête
// d'Admin → Usagers ; une demande disparaît d'elle-même dès qu'un rôle est attribué à l'usager
// (dans la liste juste en dessous). Permission : users:role_requests (ou admin:users).

const API_URL = import.meta.env.VITE_API_URL || '';
interface Req { id: number; email: string; name: string | null; message: string | null; createdAt: string }

export default function RoleRequests() {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<Req[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };

  const load = useCallback(() => {
    fetch(`${API_URL}/api/admin/role-requests`, { headers })
      .then((r) => (r.ok ? r.json() : { requests: [] }))
      .then((d) => setList(d.requests || []))
      .catch(() => setList([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const dismiss = async (r: Req) => {
    if (!(await dialog.confirm(t('admin.roleRequests.dismissConfirm', { name: r.name || r.email })))) return;
    setBusy(r.id);
    try {
      await fetch(`${API_URL}/api/admin/role-requests/${r.id}/dismiss`, { method: 'POST', headers });
      setList((l) => (l ? l.filter((x) => x.id !== r.id) : l));
    } finally { setBusy(null); }
  };

  if (!list || !list.length) return null;
  const fmt = (s: string) => new Date(s).toLocaleString(i18n.language?.startsWith('fr') ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="mb-6 rounded-sm border border-warning/50 bg-white shadow-default dark:border-warning/40 dark:bg-boxdark">
      <div className="flex items-center gap-2 border-b border-stroke px-7 py-4 dark:border-strokedark">
        <UserPlus className="h-5 w-5 text-warning" />
        <h3 className="text-base font-semibold text-black dark:text-white">{t('admin.roleRequests.title', { count: list.length })}</h3>
      </div>
      <p className="px-7 pt-3 text-xs text-body dark:text-bodydark">{t('admin.roleRequests.help')}</p>
      <div className="divide-y divide-stroke px-7 pb-2 dark:divide-strokedark">
        {list.map((r) => (
          <div key={r.id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-black dark:text-white">{r.name || r.email} <span className="font-normal text-body dark:text-bodydark">· {r.email}</span></p>
              <p className="text-xs text-body dark:text-bodydark">{fmt(r.createdAt)}</p>
              {r.message && <p className="mt-1 text-sm italic text-black dark:text-bodydark1">« {r.message} »</p>}
            </div>
            <button onClick={() => dismiss(r)} disabled={busy === r.id} title={t('admin.roleRequests.dismiss') as string}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-stroke px-2.5 py-1.5 text-xs font-medium text-body hover:border-danger hover:text-danger dark:border-strokedark dark:text-bodydark">
              {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}{t('admin.roleRequests.dismiss')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
