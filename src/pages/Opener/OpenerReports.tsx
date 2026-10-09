import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Save, Eye, Send, X, Mail } from 'lucide-react';
import Select from '../../components/Select';
import DateField from '../../components/DateField';
import { ContentLoader } from '../../common/Loader';
import { dialog } from '../../lib/dialog';
import { api, ApiError } from './api';
import { getOpenerConfig } from './GoogleMap';

// Onglet « Rapports » (perm opener:reports) — le rapport quotidien des visites des openers :
// à qui l'envoyer, à quelle heure, pour quels openers ; aperçu et envoi immédiat pour n'importe
// quelle date. Serveur : services/opener/report.js (envoyé par le worker, jours ouvrables).

interface Settings { enabled: boolean; hour: number; recipients: string[]; openers: string[] }
interface Payload { settings: Settings; openers: { email: string; name: string }[]; users: { email: string; displayName: string | null }[]; lastSent: string | null }
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export default function OpenerReports() {
  const { t } = useTranslation();
  const [data, setData] = useState<Payload | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [manual, setManual] = useState('');
  const [date, setDate] = useState('');
  const [previewOpener, setPreviewOpener] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<Payload>('/api/opener/report/settings').then((d) => { setData(d); setS(d.settings); }).catch((e) => dialog.alert(e.message));
    getOpenerConfig().then((c) => setDate(c.today)).catch(() => {});
  }, []);

  if (!data || !s) return <ContentLoader />;
  const patch = (p: Partial<Settings>) => { setS({ ...s, ...p }); setDirty(true); };
  const nameOf = (email: string) => data.users.find((u) => u.email === email)?.displayName || data.openers.find((o) => o.email === email)?.name || null;
  const addRecipient = (email: string) => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    if (!isEmail(e)) { dialog.alert(t('opener.report.invalidEmail') as string); return; }
    if (!s.recipients.includes(e)) patch({ recipients: [...s.recipients, e] });
    setManual('');
  };
  const save = async () => {
    setSaving(true);
    try { const r = await api<{ settings: Settings }>('/api/opener/report/settings', { method: 'PUT', body: s }); setS(r.settings); setDirty(false); }
    catch (e: any) { dialog.alert(e.message); } finally { setSaving(false); }
  };
  const doPreview = async () => {
    setBusy('preview');
    try {
      const q = new URLSearchParams({ date, ...(previewOpener ? { opener: previewOpener } : {}) });
      setPreview(await api<{ subject: string; html: string }>(`/api/opener/report/preview?${q}`));
    } catch (e: any) { dialog.alert(e.message); } finally { setBusy(null); }
  };
  const sendNow = async () => {
    if (dirty) { dialog.alert(t('opener.report.saveFirst') as string); return; }
    if (!(await dialog.confirm(t('opener.report.sendConfirm', { n: s.recipients.length, date }), { confirmText: t('opener.report.send') }))) return;
    setBusy('send');
    try {
      const r = await api<{ sent: number; openers: number }>('/api/opener/report/send', { method: 'POST', body: { date, opener: previewOpener || undefined } });
      dialog.alert(t('opener.report.sent', { n: r.sent, openers: r.openers }));
    } catch (e) {
      const err = e as ApiError;
      dialog.alert(err.body?.error === 'no_recipients' ? t('opener.report.noRecipients') : err.message);
    } finally { setBusy(null); }
  };

  const card = 'rounded-sm border border-stroke bg-white p-5 dark:border-strokedark dark:bg-boxdark';
  const label = 'mb-1 block text-sm font-medium text-black dark:text-white';
  const allOpeners = !s.openers.length;
  const userOptions = data.users.filter((u) => !s.recipients.includes(u.email))
    .map((u) => ({ value: u.email, label: u.displayName ? `${u.displayName} — ${u.email}` : u.email }));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <div className={card}>
        <h3 className="mb-1 text-lg font-semibold text-black dark:text-white">{t('opener.report.title')}</h3>
        <p className="mb-4 text-sm text-body dark:text-bodydark">{t('opener.report.help')}</p>

        <label className="mb-4 flex cursor-pointer items-center gap-3">
          <input type="checkbox" checked={s.enabled} onChange={(e) => patch({ enabled: e.target.checked })} className="h-4 w-4 accent-[#F58346]" />
          <span className="text-sm font-medium text-black dark:text-white">{t('opener.report.enabled')}</span>
        </label>

        <label className={label}>{t('opener.report.hour')}</label>
        <div className="mb-4 max-w-[200px]">
          <Select value={String(s.hour)} onChange={(v) => patch({ hour: Number(v) })}
            options={Array.from({ length: 11 }, (_, i) => 12 + i).map((h) => ({ value: String(h), label: `${h} h 00` }))} />
        </div>

        <p className={label}>{t('opener.report.recipients')} ({s.recipients.length})</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {!s.recipients.length && <span className="text-xs text-warning">{t('opener.report.noRecipientsYet')}</span>}
          {s.recipients.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-full bg-gray-2 px-2.5 py-1 text-xs text-black dark:bg-meta-4 dark:text-white">
              <Mail className="h-3 w-3 text-body" />{nameOf(e) ? `${nameOf(e)} · ` : ''}{e}
              <button onClick={() => patch({ recipients: s.recipients.filter((x) => x !== e) })} className="text-body hover:text-danger" aria-label="×"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select value="" onChange={(v) => v && addRecipient(v)} options={userOptions} placeholder={t('opener.report.pickUser') as string} />
          <div className="flex gap-1.5">
            <input value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addRecipient(manual); }}
              placeholder={t('opener.report.typeEmail') as string}
              className="min-w-0 flex-1 rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:text-white" />
            <button onClick={() => addRecipient(manual)} className="rounded border border-stroke px-3 text-sm font-semibold text-black hover:border-primary dark:border-strokedark dark:text-white">+</button>
          </div>
        </div>

        <p className={label}>{t('opener.report.openers')}</p>
        <label className="mb-1 flex cursor-pointer items-center gap-2 text-sm text-black dark:text-white">
          <input type="radio" checked={allOpeners} onChange={() => patch({ openers: [] })} className="accent-[#F58346]" />{t('opener.report.allOpeners')}
        </label>
        <label className="mb-1 flex cursor-pointer items-center gap-2 text-sm text-black dark:text-white">
          <input type="radio" checked={!allOpeners} onChange={() => patch({ openers: data.openers.slice(0, 1).map((o) => o.email) })} className="accent-[#F58346]" />{t('opener.report.someOpeners')}
        </label>
        {!allOpeners && (
          <div className="mb-2 ml-6 space-y-1">
            {data.openers.map((o) => (
              <label key={o.email} className="flex cursor-pointer items-center gap-2 text-sm text-black dark:text-white">
                <input type="checkbox" checked={s.openers.includes(o.email)} className="h-4 w-4 accent-[#F58346]"
                  onChange={(e) => patch({ openers: e.target.checked ? [...s.openers, o.email] : s.openers.filter((x) => x !== o.email) })} />
                {o.name}
              </label>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{t('opener.report.save')}
          </button>
          <span className="text-xs text-body dark:text-bodydark">
            {s.enabled ? t('opener.report.summaryOn', { hour: s.hour, n: s.recipients.length }) : t('opener.report.summaryOff')}
            {data.lastSent ? ` · ${t('opener.report.lastSent', { date: data.lastSent })}` : ''}
          </span>
        </div>
      </div>

      <div className={`${card} flex min-h-[520px] flex-col`}>
        <h3 className="mb-3 text-base font-semibold text-black dark:text-white">{t('opener.report.previewTitle')}</h3>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="w-[170px]"><DateField value={date} onChange={setDate} /></div>
          <div className="w-[220px]">
            <Select value={previewOpener} onChange={setPreviewOpener}
              options={[{ value: '', label: t('opener.report.allOpeners') as string }, ...data.openers.map((o) => ({ value: o.email, label: o.name }))]} />
          </div>
          <button onClick={doPreview} disabled={!!busy || !date}
            className="inline-flex items-center gap-1.5 rounded border border-stroke px-4 py-2 text-sm font-semibold text-black hover:border-primary disabled:opacity-50 dark:border-strokedark dark:text-white">
            {busy === 'preview' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}{t('opener.report.preview')}
          </button>
          <button onClick={sendNow} disabled={!!busy || !date}
            className="inline-flex items-center gap-1.5 rounded border border-stroke px-4 py-2 text-sm font-semibold text-black hover:border-primary disabled:opacity-50 dark:border-strokedark dark:text-white">
            {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{t('opener.report.send')}
          </button>
        </div>
        {preview ? (
          <>
            <p className="mb-2 text-sm font-semibold text-black dark:text-white">{preview.subject}</p>
            <iframe title="report" srcDoc={preview.html} className="min-h-[460px] w-full flex-1 rounded border border-stroke bg-white dark:border-strokedark" />
          </>
        ) : (
          <p className="text-sm text-body dark:text-bodydark">{t('opener.report.previewHelp')}</p>
        )}
      </div>
    </div>
  );
}
