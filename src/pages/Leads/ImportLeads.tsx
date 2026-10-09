import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../components/Select';
import ConfirmDialog from '../../components/ConfirmDialog';
import { authHeaders } from './types';

const API_URL = import.meta.env.VITE_API_URL;

// Import d'une liste de SALON (XLSX) — services/leadImport côté serveur. Trois temps, décidés par
// David le 2026-10-09 : aperçu (rien n'est créé), examen EN LOT (cet écran est l'examen : on
// décoche, on change le rep d'une ligne, on accepte), puis courriel de remerciement avec aperçu
// et test AVANT l'envoi au lot. Un lot se rouvre depuis la liste des lots récents : on peut
// accepter aujourd'hui et envoyer demain.

const INPUT =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const LABEL = 'mb-2 block text-sm font-medium text-black dark:text-white';
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const BTN = 'inline-flex items-center justify-center gap-2 rounded-md border border-stroke px-4 py-2.5 text-sm font-medium text-black hover:bg-gray-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-strokedark dark:text-white dark:hover:bg-meta-4';

interface Row {
  key: string;
  lines: number[];
  businessName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  comments: string[];
  warnings: string[];
  include: boolean;
  repName?: string | null;
  crm?: { status: string; summary: string | null; matches: { module: string; name: string; owner: string | null; matchedOn: string | null }[] };
  existingLead?: { refCode: string; status: string; rep: string | null; source: string | null } | null;
  lead?: { id: number; refCode: string; status: string; rep: string | null; crmLeadId: string | null; crmError: string | null; emailedAt: string | null; resendCount?: number; openedAt?: string | null; openCount?: number; linkOpenedAt?: string | null; linkOpenCount?: number; booked?: string | null; emailError: string | null } | null;
}
interface Batch {
  id: number;
  file_name: string;
  event_name: string | null;
  language: string;
  zoho_source: string | null;
  default_rep: string | null;
  status: string;
  rows: Row[];
  photoUrl?: string | null;
  photo_caption?: string | null;
  emailed_at?: string | null;
  summary?: { results: { key: string; ok: boolean; error?: string; detail?: string | null }[]; repMails: { rep: string; to?: string; ok: boolean; error?: string | null }[] } | null;
}
interface BatchListItem { id: number; file_name: string; event_name: string | null; status: string; created_at: string; row_count: number; accepted_count: number; emailed_count: number }
interface RepOpt { name: string; email: string | null; inZoho: boolean }

const ImportLeads = ({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');

  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [reps, setReps] = useState<RepOpt[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [eventName, setEventName] = useState('');
  const [zohoSource, setZohoSource] = useState('GFS');
  const [language, setLanguage] = useState('en');
  const [defaultRep, setDefaultRep] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string; from: string | null; sampleLead: string } | null>(null);
  const [previewLang, setPreviewLang] = useState('en');
  const [caption, setCaption] = useState('');
  // Confirmation à l'image de l'application (plus de confirm() de Chrome) : l'envoi au lot, ou le
  // renvoi à une personne.
  const [confirm, setConfirm] = useState<{ kind: 'send' } | { kind: 'resend'; row: Row } | null>(null);

  const loadBatches = () => fetch(`${API_URL}/api/leads/import/batches`, { headers: authHeaders() })
    .then((r) => (r.ok ? r.json() : { batches: [] })).then((d) => setBatches(d.batches || [])).catch(() => {});

  useEffect(() => { if (open) loadBatches(); }, [open]);

  const adopt = (b: Batch, repList?: RepOpt[]) => {
    setBatch(b);
    setRows(b.rows);
    if (repList) setReps(repList);
    if (b.event_name) setEventName(b.event_name);
    if (b.zoho_source) setZohoSource(b.zoho_source);
    if (b.language) setLanguage(b.language);
    if (b.default_rep) setDefaultRep(b.default_rep);
    setPreviewLang(b.language || 'en');
    setCaption(b.photo_caption || '');
  };

  // Une photo de téléphone fait ~4 Mo et 5700 px : réduite ICI à 1200 px de large en JPEG avant
  // l'envoi. `createImageBitmap(..., { imageOrientation: 'from-image' })` applique la rotation
  // EXIF — sinon une photo prise en portrait arriverait couchée.
  const shrink = async (file: File): Promise<Blob> => {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, 1200 / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.82));
  };

  const savePhoto = async (file: File | null) => {
    setBusy('photo'); setError(null);
    try {
      const fd = new FormData();
      if (file) fd.append('photo', await shrink(file), 'photo.jpg');
      fd.append('caption', caption);
      const res = await fetch(`${API_URL}/api/leads/import/batches/${batch!.id}/photo`, { method: 'POST', headers: authHeaders(), body: fd });
      const data = await res.json();
      if (!res.ok) { setError(errText(data.error || 'failed')); return; }
      adopt(data.batch);
      if (preview) await loadPreview(previewLang);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const resend = async (r: Row) => {
    setBusy(`resend:${r.key}`); setError(null); setNotice(null);
    try {
      const res = await fetch(`${API_URL}/api/leads/import/batches/${batch!.id}/resend/${r.lead!.id}`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || errText(data.error || 'failed')); return; }
      adopt(data.batch);
      setNotice(t('leads.import.resent', { to: data.to }) as string);
    } finally { setBusy(null); setConfirm(null); }
  };

  const removePhoto = async () => {
    setBusy('photo');
    try {
      const res = await fetch(`${API_URL}/api/leads/import/batches/${batch!.id}/photo`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (res.ok) { adopt(data.batch); if (preview) await loadPreview(previewLang); }
    } finally { setBusy(null); }
  };

  const reset = () => { setBatch(null); setRows([]); setPreview(null); setError(null); setNotice(null); setEventName(''); setDefaultRep(''); };
  const close = () => { if (busy) return; reset(); onClose(); };

  const errText = (code: string) => t(`leads.import.errors.${code}`, { defaultValue: code }) as string;

  const upload = async (file: File) => {
    setBusy('preview'); setError(null); setNotice(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch(`${API_URL}/api/leads/import/preview`, { method: 'POST', headers: authHeaders(), body: fd });
      const data = await res.json();
      if (!res.ok) { setError(errText(data.error || 'failed')); return; }
      adopt(data.batch, data.reps);
      loadBatches();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const openBatch = async (id: number) => {
    setBusy('open'); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/leads/import/batches/${id}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) { setError(errText(data.error || 'failed')); return; }
      adopt(data.batch, data.reps);
    } finally { setBusy(null); }
  };

  const pending = rows.filter((r) => r.include && r.lead?.status !== 'accepted');
  const accepted = rows.filter((r) => r.lead?.status === 'accepted');
  const toEmail = accepted.filter((r) => r.email && !r.lead?.emailedAt);

  const accept = async () => {
    if (!eventName.trim()) { setError(errText('event_name_required')); return; }
    setBusy('accept'); setError(null); setNotice(null);
    try {
      const res = await fetch(`${API_URL}/api/leads/import/batches/${batch!.id}/accept`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventName, zohoSource, language, defaultRep,
          rows: rows.map((r) => ({ key: r.key, include: r.include, repName: r.repName || null })) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(errText(data.error || 'failed')); return; }
      adopt(data.batch);
      const s = data.summary;
      setNotice(t('leads.import.acceptedNotice', { ok: s.ok, failed: s.failed }) as string);
      onChanged();
      loadBatches();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  const loadPreview = async (lang: string) => {
    setPreviewLang(lang);
    const res = await fetch(`${API_URL}/api/leads/import/batches/${batch!.id}/email-preview?lang=${lang}`, { headers: authHeaders() });
    const data = await res.json();
    if (res.ok) setPreview(data); else setError(errText(data.error || 'failed'));
  };

  const sendTest = async () => {
    setBusy('test'); setError(null); setNotice(null);
    try {
      const res = await fetch(`${API_URL}/api/leads/import/batches/${batch!.id}/email-test`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: previewLang }),
      });
      const data = await res.json();
      if (!res.ok || !data.sent) { setError(data.error || errText('failed')); return; }
      setNotice(t('leads.import.testSent', { to: data.to }) as string);
    } finally { setBusy(null); }
  };

  const sendAll = async () => {
    setBusy('send'); setError(null); setNotice(null);
    try {
      const res = await fetch(`${API_URL}/api/leads/import/batches/${batch!.id}/send`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) { setError(errText(data.error || 'failed')); return; }
      adopt(data.batch);
      setNotice(t('leads.import.sentNotice', { n: data.sent, failed: data.failed.length }) as string);
      loadBatches();
    } finally { setBusy(null); setConfirm(null); }
  };

  const repOptions = useMemo(() => reps.map((r) => ({ value: r.name, label: r.email ? `${r.name} — ${r.email}` : `${r.name} — ${t('leads.import.noEmail')}` })), [reps, t]);
  const defaultRepInfo = reps.find((r) => r.name === defaultRep);
  // Ce qui manque pour accepter, DIT à l'écran : un bouton gris sans raison laisse deviner.
  const blockers = [
    !eventName.trim() ? t('leads.import.eventName') as string : null,
    !defaultRep && pending.some((r) => !r.repName) ? t('leads.import.defaultRep') as string : null,
  ].filter((x): x is string => !!x);
  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  if (!open) return null;

  const dt = (iso: string) => new Date(iso).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short' });

  return (
    <div className="fixed inset-0 z-[99999] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div role="dialog" aria-modal="true" className="relative my-auto w-full max-w-6xl rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex items-start justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
          <div>
            <h3 className="text-lg font-semibold text-black dark:text-white">{t('leads.import.title')}</h3>
            <p className="mt-0.5 text-sm text-bodydark2">{batch ? `${batch.file_name} · ${t('leads.import.peopleCount', { n: rows.length })}` : t('leads.import.subtitle')}</p>
          </div>
          <button type="button" onClick={close} className="text-bodydark2 hover:text-black dark:hover:text-white" aria-label={t('common.close') as string}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {error && <div className="mb-4 rounded border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
          {notice && <div className="mb-4 rounded border border-success/30 bg-success/10 px-4 py-3 text-sm text-black dark:text-white">{notice}</div>}

          {!batch && (
            <>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-stroke px-6 py-10 text-center hover:border-primary dark:border-strokedark">
                <input type="file" accept=".xlsx,.xls" className="hidden" disabled={!!busy}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
                <span className="text-sm font-medium text-black dark:text-white">{busy === 'preview' ? t('leads.import.reading') : t('leads.import.pick')}</span>
                <span className="mt-1 text-xs text-bodydark2">{t('leads.import.pickHint')}</span>
              </label>
              {batches.length > 0 && (
                <div className="mt-6">
                  <h4 className="mb-2 text-sm font-semibold text-black dark:text-white">{t('leads.import.recent')}</h4>
                  <ul className="divide-y divide-stroke rounded border border-stroke dark:divide-strokedark dark:border-strokedark">
                    {batches.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                        <span className="text-black dark:text-white">
                          <strong>{b.event_name || b.file_name}</strong>
                          <span className="ml-2 text-bodydark2">{dt(b.created_at)} · {t('leads.import.batchStats', { rows: b.row_count, accepted: b.accepted_count, emailed: b.emailed_count })}</span>
                        </span>
                        <button type="button" className={BTN} onClick={() => openBatch(b.id)} disabled={!!busy}>{t('leads.import.open')}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {batch && (
            <>
              {/* Réglages du lot */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className={LABEL}>{t('leads.import.eventName')} *</label>
                  <input className={INPUT} value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="GFS Food Show — Winnipeg 2026" />
                </div>
                <div>
                  <label className={LABEL}>{t('leads.import.zohoSource')}</label>
                  <Select value={zohoSource} onChange={setZohoSource} options={[
                    { value: 'GFS', label: 'GFS' },
                    { value: 'Gordon Food Service', label: 'Gordon Food Service' },
                    { value: 'RC Show', label: 'RC Show' },
                    { value: '', label: t('leads.import.zohoSourceNone') as string },
                  ]} />
                </div>
                <div>
                  <label className={LABEL}>{t('leads.import.language')}</label>
                  <Select value={language} onChange={setLanguage} options={[{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]} />
                </div>
                <div className="md:col-span-2">
                  <label className={LABEL}>{t('leads.import.defaultRep')} *</label>
                  <Select value={defaultRep} onChange={setDefaultRep} placeholder={t('leads.import.chooseRep') as string} options={repOptions} />
                  {defaultRepInfo && !defaultRepInfo.email && <p className="mt-1 text-xs text-danger">{t('leads.import.repNoEmail')}</p>}
                </div>
              </div>

              {/* Les personnes */}
              <div className="mt-5 overflow-x-auto rounded border border-stroke md:overflow-visible dark:border-strokedark">
                <table className="w-full table-auto text-sm">
                  <thead className="bg-gray-2 text-left text-xs font-medium uppercase text-bodydark2 dark:bg-meta-4">
                    <tr>
                      <th className="px-3 py-2.5">
                        <input type="checkbox" aria-label={t('leads.import.all') as string}
                          checked={rows.every((r) => r.include || r.lead?.status === 'accepted')}
                          onChange={(e) => setRows((rs) => rs.map((r) => (r.lead?.status === 'accepted' ? r : { ...r, include: e.target.checked && !!r.email })))} />
                      </th>
                      <th className="px-3 py-2.5">{t('leads.import.col.business')}</th>
                      <th className="px-3 py-2.5">{t('leads.import.col.contact')}</th>
                      <th className="px-3 py-2.5">{t('leads.import.col.notes')}</th>
                      <th className="px-3 py-2.5">{t('leads.import.col.check')}</th>
                      <th className="px-3 py-2.5">{t('leads.import.col.rep')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke dark:divide-strokedark">
                    {rows.map((r) => {
                      const done = r.lead?.status === 'accepted';
                      return (
                        <tr key={r.key} className={!r.include && !done ? 'opacity-55' : ''}>
                          <td className="px-3 py-3 align-top">
                            <input type="checkbox" checked={done || r.include} disabled={done || !r.email}
                              onChange={(e) => setRow(r.key, { include: e.target.checked })} />
                          </td>
                          <td className="px-3 py-3 align-top">
                            <p className="font-medium text-black dark:text-white">{r.businessName || '—'}</p>
                            <p className="text-xs text-bodydark2">{[r.city, r.province].filter(Boolean).join(', ') || '—'} · {t('leads.import.lines', { lines: r.lines.join(', ') })}</p>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <p className="text-black dark:text-white">{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</p>
                            <p className="text-xs text-bodydark2">{r.email || <span className="text-danger">{t('leads.import.noEmail')}</span>}{r.phone ? ` · ${r.phone}` : ''}</p>
                          </td>
                          <td className="max-w-[260px] px-3 py-3 align-top text-xs text-bodydark2">{r.comments.length ? r.comments.join(' / ') : '—'}</td>
                          <td className="px-3 py-3 align-top text-xs">
                            {done ? (
                              <span className="text-black dark:text-white">
                                ✓ {r.lead!.refCode}{r.lead!.emailedAt ? ` · ${t('leads.import.emailed')}` : ''}
                                {!!r.lead!.resendCount && <span className="text-bodydark2"> · {t('leads.import.resentCount', { n: r.lead!.resendCount })}</span>}
                                {r.lead!.emailedAt && (
                                  <span className="mt-1 flex flex-wrap gap-1">
                                    {r.lead!.booked
                                      ? <span className="rounded-full bg-success/20 px-2 py-0.5 text-[11px] font-medium text-success" title={new Date(r.lead!.booked).toLocaleString(fr ? 'fr-CA' : 'en-CA')}>{t('leads.import.track.booked')}</span>
                                      : null}
                                    {r.lead!.linkOpenedAt
                                      ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary" title={new Date(r.lead!.linkOpenedAt).toLocaleString(fr ? 'fr-CA' : 'en-CA')}>{t('leads.import.track.link', { n: r.lead!.linkOpenCount })}</span>
                                      : null}
                                    {r.lead!.openedAt
                                      ? <span className="rounded-full bg-gray-2 px-2 py-0.5 text-[11px] font-medium text-black dark:bg-meta-4 dark:text-white" title={new Date(r.lead!.openedAt).toLocaleString(fr ? 'fr-CA' : 'en-CA')}>{t('leads.import.track.opened', { n: r.lead!.openCount })}</span>
                                      : !r.lead!.linkOpenedAt && <span className="rounded-full border border-stroke px-2 py-0.5 text-[11px] text-bodydark2 dark:border-strokedark">{t('leads.import.track.notOpened')}</span>}
                                  </span>
                                )}
                                {r.lead!.emailError && <span className="block text-danger">{r.lead!.emailError}</span>}
                                {r.lead!.emailedAt && r.email && (
                                  <button type="button" disabled={!!busy} onClick={() => setConfirm({ kind: 'resend', row: r })}
                                    className="mt-1 block rounded border border-stroke px-2 py-0.5 text-xs font-medium text-black hover:bg-gray-2 disabled:opacity-50 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
                                    {busy === `resend:${r.key}` ? '…' : t('leads.import.resend')}
                                  </button>
                                )}
                              </span>
                            ) : (
                              <>
                                {r.lead?.crmError && <span className="block text-danger">Zoho : {r.lead.crmError}</span>}
                                {r.crm?.status === 'match_found' && (
                                  <span className="block text-warning">
                                    {t('leads.import.inZoho')} {r.crm.matches.map((m) => `${m.name}${m.owner ? ` (${m.owner})` : ''}`).join(', ')}
                                  </span>
                                )}
                                {r.existingLead && <span className="block text-warning">{t('leads.import.alreadyLead', { ref: r.existingLead.refCode, rep: r.existingLead.rep || '—' })}</span>}
                                {r.warnings.includes('bad_email') && <span className="block text-danger">{t('leads.import.badEmail')}</span>}
                                {r.crm?.status === 'error' && <span className="block text-bodydark2">{t('leads.import.checkFailed')}</span>}
                                {r.crm?.status !== 'match_found' && !r.existingLead && !r.warnings.length && r.crm?.status !== 'error' && <span className="text-bodydark2">{t('leads.import.new')}</span>}
                              </>
                            )}
                          </td>
                          <td className="min-w-[180px] px-3 py-3 align-top">
                            {done ? <span className="text-black dark:text-white">{r.lead!.rep}</span> : (
                              <Select value={r.repName || ''} onChange={(v) => setRow(r.key, { repName: v || null })}
                                options={[{ value: '', label: defaultRep ? `${t('leads.import.default')} — ${defaultRep}` : t('leads.import.default') as string }, ...reps.map((x) => ({ value: x.name, label: x.name }))]} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {batch.summary?.repMails?.length ? (
                <p className="mt-2 text-xs text-bodydark2">
                  {t('leads.import.repMails')} {batch.summary.repMails.map((m) => `${m.rep}${m.ok ? ' ✓' : ` ✗ ${m.error || ''}`}`).join(' · ')}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="max-w-2xl">
                  {blockers.length > 0 && pending.length > 0 && (
                    <p className="mb-1 text-sm font-medium text-danger">{t('leads.import.missing')} {blockers.join(' · ')}</p>
                  )}
                  <p className="text-sm text-bodydark2">{t('leads.import.acceptHint')}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={BTN} onClick={reset} disabled={!!busy}>{t('leads.import.back')}</button>
                  <button type="button" className={BTN_PRIMARY} onClick={accept}
                    disabled={!!busy || !pending.length || blockers.length > 0}>
                    {busy === 'accept' ? t('leads.import.accepting') : t('leads.import.accept', { n: pending.length })}
                  </button>
                </div>
              </div>

              {/* Le courriel de remerciement */}
              {accepted.length > 0 && (
                <div className="mt-6 rounded border border-stroke p-4 dark:border-strokedark">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-black dark:text-white">{t('leads.import.emailTitle')}</h4>
                      <p className="text-xs text-bodydark2">{t('leads.import.emailHint', { n: toEmail.length, total: accepted.length })}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={BTN} onClick={() => loadPreview(previewLang)} disabled={!!busy}>{t('leads.import.preview')}</button>
                      <button type="button" className={BTN} onClick={sendTest} disabled={!!busy || !preview}>{busy === 'test' ? '…' : t('leads.import.sendTest')}</button>
                      <button type="button" className={BTN_PRIMARY} onClick={() => setConfirm({ kind: 'send' })} disabled={!!busy || !preview || !toEmail.length}>
                        {busy === 'send' ? t('leads.import.sending') : t('leads.import.sendAll', { n: toEmail.length })}
                      </button>
                    </div>
                  </div>
                  {/* La photo du kiosque */}
                  <div className="mt-4 flex flex-wrap items-start gap-4 rounded border border-dashed border-stroke p-3 dark:border-strokedark">
                    {batch.photoUrl
                      ? <img src={batch.photoUrl} alt="" className="h-24 w-auto rounded" />
                      : <div className="flex h-24 w-32 items-center justify-center rounded bg-gray-2 text-xs text-bodydark2 dark:bg-meta-4">{t('leads.import.noPhoto')}</div>}
                    <div className="min-w-[240px] flex-1">
                      <p className="text-sm font-medium text-black dark:text-white">{t('leads.import.photoTitle')}</p>
                      <p className="mb-2 text-xs text-bodydark2">{t('leads.import.photoHint')}</p>
                      <input className={INPUT} value={caption} onChange={(e) => setCaption(e.target.value)}
                        placeholder={t('leads.import.captionPh') as string} />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <label className={`${BTN} cursor-pointer`}>
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={!!busy}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) savePhoto(f); e.target.value = ''; }} />
                          {busy === 'photo' ? '…' : batch.photoUrl ? t('leads.import.replacePhoto') : t('leads.import.addPhoto')}
                        </label>
                        {batch.photoUrl && (
                          <>
                            <button type="button" className={BTN} disabled={!!busy || caption === (batch.photo_caption || '')} onClick={() => savePhoto(null)}>{t('leads.import.saveCaption')}</button>
                            <button type="button" className={BTN} disabled={!!busy} onClick={removePhoto}>{t('leads.import.removePhoto')}</button>
                          </>
                        )}
                      </div>
                      {batch.photoUrl && batch.emailed_at && <p className="mt-2 text-xs text-warning">{t('leads.import.photoAfterSend')}</p>}
                    </div>
                  </div>
                  {preview && (
                    <div className="mt-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-bodydark2">
                        <span>
                          <strong className="text-black dark:text-white">{preview.subject}</strong><br />
                          {t('leads.import.from')} {preview.from || '—'} · {t('leads.import.sample', { name: preview.sampleLead })}
                        </span>
                        <span className="inline-flex rounded border border-stroke p-0.5 dark:border-strokedark">
                          {['en', 'fr'].map((l) => (
                            <button key={l} type="button" onClick={() => loadPreview(l)}
                              className={`rounded px-3 py-1 ${previewLang === l ? 'bg-primary text-white' : ''}`}>{l.toUpperCase()}</button>
                          ))}
                        </span>
                      </div>
                      <iframe title="preview" srcDoc={preview.html} sandbox="" className="h-[520px] w-full rounded border border-stroke bg-white dark:border-strokedark" />
                      <p className="mt-2 text-xs text-bodydark2">{t('leads.import.previewNote')}</p>
                    </div>
                  )}
                  {accepted.some((r) => r.lead?.emailedAt) && (
                    <p className="mt-3 text-xs text-bodydark2">
                      {t('leads.import.track.summary', {
                        sent: accepted.filter((r) => r.lead?.emailedAt).length,
                        opened: accepted.filter((r) => r.lead?.openedAt || r.lead?.linkOpenedAt).length,
                        clicked: accepted.filter((r) => r.lead?.linkOpenedAt).length,
                        booked: accepted.filter((r) => r.lead?.booked).length,
                      })}{' '}{t('leads.import.track.caveat')}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirm}
        busy={busy === 'send' || (confirm?.kind === 'resend' && busy === `resend:${confirm.row.key}`)}
        title={confirm?.kind === 'resend' ? t('leads.import.confirmResendTitle') as string : t('leads.import.confirmSendTitle', { n: toEmail.length }) as string}
        message={confirm?.kind === 'resend'
          ? t('leads.import.confirmResend', { email: confirm.row.email })
          : <>{t('leads.import.from')} <strong className="text-black dark:text-white">{preview?.from || '—'}</strong></>}
        confirmLabel={confirm?.kind === 'resend' ? t('leads.import.resend') as string : t('leads.import.sendAll', { n: toEmail.length }) as string}
        busyLabel={t('leads.import.sending') as string}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={() => (confirm?.kind === 'resend' ? resend(confirm.row) : sendAll())}
      >
        {confirm?.kind === 'send' && (
          <ul className="max-h-56 overflow-y-auto rounded border border-stroke text-sm dark:border-strokedark">
            {toEmail.map((r) => (
              <li key={r.key} className="flex justify-between gap-3 border-b border-stroke px-3 py-1.5 last:border-0 dark:border-strokedark">
                <span className="truncate text-black dark:text-white">{r.businessName}</span>
                <span className="truncate text-bodydark2">{r.email}</span>
              </li>
            ))}
          </ul>
        )}
      </ConfirmDialog>
    </div>
  );
};

export default ImportLeads;
