import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL;

type KnownUser = { email: string; displayName: string | null; isAdmin: boolean; userType: string };

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/**
 * Reusable recipient picker: shows current recipients as removable chips,
 * lets you pick from a pre-populated user list OR type a manual email address.
 * Used by every notification type in this section.
 */
function RecipientPicker({
  recipients, onChange, users,
}: {
  recipients: string[];
  onChange: (next: string[]) => void;
  users: KnownUser[];
}) {
  const { t } = useTranslation();
  const [manual, setManual] = useState('');

  const nameFor = (email: string) => {
    const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    return u?.displayName || null;
  };

  // Users not already selected, for the dropdown
  const available = useMemo(() => {
    const sel = new Set(recipients.map((r) => r.toLowerCase()));
    return users
      .filter((u) => u.email && !sel.has(u.email.toLowerCase()))
      .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
  }, [users, recipients]);

  const add = (email: string) => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    if (!isEmail(e)) { dialog.alert(t('admin.notifications.invalidEmail') as string); return; }
    if (recipients.some((r) => r.toLowerCase() === e)) return;
    onChange([...recipients, e]);
  };

  const remove = (email: string) =>
    onChange(recipients.filter((r) => r.toLowerCase() !== email.toLowerCase()));

  return (
    <div>
      {/* Current recipients — who this is being sent to */}
      <div className="mb-3">
        <p className="mb-1.5 text-xs font-medium text-black dark:text-white">
          {t('admin.notifications.sendingTo')} ({recipients.length})
        </p>
        {recipients.length === 0 ? (
          <p className="text-xs italic text-body">{t('admin.notifications.noRecipients')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {recipients.map((email) => {
              const name = nameFor(email);
              return (
                <span key={email}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-1.5 text-xs text-primary dark:bg-primary/20">
                  <span className="font-medium">{name || email}</span>
                  {name && <span className="opacity-60">{email}</span>}
                  <button type="button" onClick={() => remove(email)}
                    title={t('common.remove') as string}
                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary hover:text-white">
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Add controls: pick a known user OR type a manual address */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value=""
          onChange={(e) => { if (e.target.value) add(e.target.value); }}
          className="rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white sm:w-64">
          <option value="">{t('admin.notifications.pickUser')}</option>
          {available.map((u) => (
            <option key={u.email} value={u.email}>
              {u.displayName ? `${u.displayName} — ${u.email}` : u.email}
            </option>
          ))}
        </select>
        <div className="flex grow gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(manual); setManual(''); } }}
            placeholder={t('admin.notifications.manualPlaceholder') as string}
            className="grow rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white" />
          <button type="button"
            onClick={() => { add(manual); setManual(''); }}
            className="whitespace-nowrap rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-white">
            {t('admin.notifications.add')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Admin → Notifications: central place to configure who receives each automated
// email notification. Pre-populated user list + manual emails + visible recipients.
export default function NotificationsAdmin() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<KnownUser[]>([]);
  const [probation, setProbation] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    (async () => {
      try {
        const [u, p] = await Promise.all([
          axios.get(`${API_URL}/api/admin/users`, { headers: headers() }),
          axios.get(`${API_URL}/api/admin/probation-recipients`, { headers: headers() }),
        ]);
        setUsers(u.data.users || []);
        setProbation((p.data.recipients || []).map((s: string) => s.toLowerCase()));
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveProbation = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/admin/probation-recipients`,
        { emails: probation }, { headers: headers() });
      dialog.alert(t('admin.notifications.saved') as string);
    } catch {
      dialog.alert(t('admin.notifications.saveError') as string);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-body">{t('common.loading')}</div>;

  return (
    <div className="flex flex-col gap-6">
      {/* Probation-ending notification */}
      <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-lg">⏳</span>
          <h3 className="text-base font-semibold text-black dark:text-white">
            {t('admin.notifications.probationTitle')}
          </h3>
        </div>
        <p className="mb-4 text-xs text-body">{t('admin.notifications.probationHint')}</p>

        <RecipientPicker recipients={probation} onChange={setProbation} users={users} />

        <div className="mt-4 flex justify-end">
          <button onClick={saveProbation} disabled={saving}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      {/* Hint that future notification types land here automatically */}
      <p className="text-xs italic text-body">{t('admin.notifications.moreSoon')}</p>
    </div>
  );
}
