import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserCog, Send, Loader2, Clock, RefreshCw } from 'lucide-react';
import { ContentLoader } from '../common/Loader';

// Écran d'un usager SANS rôle (2026-10-08, demande de David) : au lieu d'un Sales Hub vide et
// muet, on lui dit qu'il n'a pas encore de rôle et il demande un accès. La demande part aux
// destinataires « nouvel usager sans rôle » (Admin → Notifications) et apparaît dans
// Admin → Usagers ; elle se ferme d'elle-même quand un rôle est attribué.

const API_URL = import.meta.env.VITE_API_URL || '';
interface RoleRequest { id: number; message: string | null; createdAt: string }

export default function NoRoleNotice({ name }: { name?: string | null }) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<RoleRequest | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch(`${API_URL}/api/me/role-request`, { headers })
      .then((r) => r.json())
      .then((d) => {
        // Un rôle vient d'être attribué : on recharge pour récupérer les permissions.
        if (d.hasRole) { window.location.reload(); return; }
        setRequest(d.request || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    setSending(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/me/role-request`, { method: 'POST', headers, body: JSON.stringify({ message }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) { window.location.reload(); return; }
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setRequest(d.request);
    } catch (e: any) { setError(e.message); } finally { setSending(false); }
  };

  if (loading) return <ContentLoader />;
  const fmt = (s: string) => new Date(s).toLocaleString(i18n.language?.startsWith('fr') ? 'fr-CA' : 'en-CA', { dateStyle: 'long', timeStyle: 'short' });

  return (
    <div className="mx-auto mt-6 max-w-xl rounded-sm border border-stroke bg-white p-8 shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UserCog className="h-6 w-6" />
      </div>
      <h1 className="mb-2 text-xl font-bold text-black dark:text-white">{t('noRole.title', { name: name ? `, ${name.split(' ')[0]}` : '' })}</h1>
      <p className="mb-5 text-sm leading-relaxed text-body dark:text-bodydark">{t('noRole.body')}</p>

      {request ? (
        <div className="rounded-md border border-success/40 bg-success/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-black dark:text-white"><Clock className="h-4 w-4 text-success" />{t('noRole.pendingTitle')}</p>
          <p className="mt-1 text-xs text-body dark:text-bodydark">{t('noRole.pendingBody', { date: fmt(request.createdAt) })}</p>
          {request.message && <p className="mt-2 rounded bg-white/60 p-2 text-xs italic text-body dark:bg-boxdark-2 dark:text-bodydark">« {request.message} »</p>}
          <button onClick={() => window.location.reload()} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
            <RefreshCw className="h-3.5 w-3.5" />{t('noRole.check')}
          </button>
        </div>
      ) : (
        <>
          <label className="mb-1 block text-sm font-medium text-black dark:text-white">{t('noRole.messageLabel')}</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={3}
            placeholder={t('noRole.messagePh') as string}
            className="mb-3 w-full rounded border border-stroke bg-transparent p-3 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:text-white" />
          {error && <p className="mb-2 text-xs text-danger">{error}</p>}
          <button onClick={send} disabled={sending}
            className="inline-flex items-center gap-2 rounded bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{t('noRole.request')}
          </button>
        </>
      )}
    </div>
  );
}
