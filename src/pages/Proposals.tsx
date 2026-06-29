import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../lib/dialog';
import { formatDateOnly } from '../utils/date';
import PdfThumbPreview from './PdfThumbPreview';

const b64ToBytes = (b64: string) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface Estimate {
  estimateId: string; number: string; customerName: string;
  total: number; currency: string; date: string; status: string; salesperson: string;
}
interface Prepared { pdfBase64: string; fileName: string; presentationPageCount: number; estimatePageCount: number; email: { to: string; subject: string; body: string }; }
interface SentRow {
  id: number; estimateId: string; number: string; customerName: string; repEmail: string; toEmail: string;
  sentAt: string; status: string; viewed: boolean; viewedTime: string; acceptedDate: string; declinedDate: string;
  emailOpened: boolean; emailOpenedAt: string; emailOpenCount: number;
  linkClickCount: number; linkFirstClickAt: string; linkLastClickAt: string;
}

const Proposals: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<'pending' | 'sent'>('pending');
  const [sent, setSent] = useState<SentRow[]>([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Builder state (when an estimate is selected)
  const [sel, setSel] = useState<Estimate | null>(null);
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const [title, setTitle] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  // editable email
  const [to, setTo] = useState(''); const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(''); const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Page selection: which presentation pages to include + whether to attach the quote
  const [selPages, setSelPages] = useState<number[]>([]); // 1-based; empty = all
  const [inclEstimate, setInclEstimate] = useState(true);
  // Cover co-branding: show the client NAME (default) or the client LOGO
  const [branding, setBranding] = useState<'name' | 'logo'>('name');

  const fetchEstimates = async () => {
    setLoading(true); setError('');
    try {
      const r = await axios.get(`${API_URL}/api/proposals/estimates`, { headers: authHeaders(), params: { q } });
      setEstimates(r.data.estimates || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.response?.data?.error || t('proposals.loadError'));
      setEstimates([]);
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchEstimates(); /* eslint-disable-next-line */ }, []);

  const fetchSent = async () => {
    setSentLoading(true);
    try { const r = await axios.get(`${API_URL}/api/proposals/sent`, { headers: authHeaders() }); setSent(r.data.proposals || []); }
    catch { setSent([]); }
    finally { setSentLoading(false); }
  };
  useEffect(() => { if (view === 'sent') fetchSent(); /* eslint-disable-next-line */ }, [view]);

  // Admin status (from /api/auth/verify — never the raw JWT) drives the delete control.
  useEffect(() => {
    axios.get(`${API_URL}/api/auth/verify`, { headers: authHeaders() })
      .then((r) => { const u = r.data?.user; setIsAdmin(!!u?.isAdmin || (u?.permissions || []).includes('*')); })
      .catch(() => {});
  }, []);

  const deleteSent = async (r: SentRow) => {
    if (!(await dialog.confirm(t('proposals.deleteConfirm', { customer: r.customerName }) as string, { danger: true, confirmText: t('common.delete') as string }))) return;
    try { await axios.delete(`${API_URL}/api/proposals/sent/${r.id}`, { headers: authHeaders() }); fetchSent(); }
    catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };

  const openBuilder = (e: Estimate) => {
    setSel(e); setLang(i18n.language?.startsWith('en') ? 'en' : 'fr'); setTitle(''); setLogo(null);
    setPrepared(null); setTo(''); setCc(''); setSubject(''); setBody('');
    setSelPages([]); setInclEstimate(true); setBranding('name');
  };
  const closeBuilder = () => { setSel(null); setPrepared(null); };
  // Only close on a genuine backdrop click — one that BOTH starts and ends on the overlay.
  // Without this, selecting text inside the modal and releasing the mouse outside the window
  // fires a click whose target is the overlay, closing the popup mid-selection.
  const overlayDownRef = useRef(false);

  const onLogo = (f?: File) => {
    if (!f) { setLogo(null); return; }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result || ''));
    reader.readAsDataURL(f);
  };

  const prepare = async () => {
    if (!sel) return;
    setPreparing(true);
    try {
      // Always render the FULL document so every page shows as a thumbnail; the rep then toggles
      // which pages to actually send (applied at send time).
      const r = await axios.post(`${API_URL}/api/proposals/prepare`,
        { estimateId: sel.estimateId, lang, title: title.trim(), clientName: sel.customerName, logoBase64: branding === 'logo' ? (logo || undefined) : undefined, includeEstimate: true },
        { headers: authHeaders() });
      const p: Prepared = r.data;
      setPrepared(p);
      // Default: all presentation pages + the quote included.
      setSelPages(Array.from({ length: p.presentationPageCount }, (_, i) => i + 1));
      setInclEstimate(true);
      setTo(p.email?.to || ''); setSubject(p.email?.subject || ''); setBody(p.email?.body || '');
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('proposals.prepareError')); }
    finally { setPreparing(false); }
  };

  const send = async () => {
    if (!sel || !prepared) return;
    if (!to.trim()) { dialog.alert(t('proposals.toRequired')); return; }
    if (!(await dialog.confirm(t('proposals.sendConfirm', { to: to.trim() }) as string, { confirmText: t('proposals.sendBtn') as string }))) return;
    setSending(true);
    try {
      const resp = await axios.post(`${API_URL}/api/proposals/send`,
        { estimateId: sel.estimateId, lang, title: title.trim(), clientName: sel.customerName, logoBase64: branding === 'logo' ? (logo || undefined) : undefined, to: to.trim(), cc: cc.trim() || undefined, subject: subject.trim(), body,
          selectedPages: selPages.length ? selPages : undefined, includeEstimate: inclEstimate },
        { headers: authHeaders() });
      const note = resp.data && resp.data.acceptLinkIncluded === false ? '\n\n' + t('proposals.noAcceptLink') : '';
      await dialog.alert(t('proposals.sent', { to: to.trim() }) + note);
      closeBuilder();
      setView('sent'); fetchSent();
    } catch (e: any) {
      const code = e?.response?.data?.error;
      dialog.alert(code === 'smtp_not_configured' ? t('proposals.smtpOff') : (e?.response?.data?.reason || e?.response?.data?.error || t('proposals.sendError')));
    } finally { setSending(false); }
  };

  // Download the EXACT PDF that will be sent — rebuilt server-side with the current page selection
  // (so footers are renumbered) + the quote toggle.
  const download = async () => {
    if (!sel || !prepared) return;
    setDownloading(true);
    try {
      const r = await axios.post(`${API_URL}/api/proposals/prepare`,
        { estimateId: sel.estimateId, lang, clientName: sel.customerName,
          logoBase64: branding === 'logo' ? (logo || undefined) : undefined,
          selectedPages: selPages.length ? selPages : undefined, includeEstimate: inclEstimate },
        { headers: authHeaders() });
      const blob = new Blob([b64ToBytes(r.data.pdfBase64) as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = r.data.fileName || 'proposition.pdf';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Download failed'); }
    finally { setDownloading(false); }
  };

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';
  const money = (n: number, c: string) => `${(n || 0).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c || ''}`.trim();
  const statusBadge = (r: SentRow): { label: string; cls: string } => {
    if (r.status === 'accepted') return { label: t('proposals.statusAccepted'), cls: 'bg-success/15 text-success' };
    if (r.status === 'declined') return { label: t('proposals.statusDeclined'), cls: 'bg-danger/15 text-danger' };
    if (r.status === 'expired') return { label: t('proposals.statusExpired'), cls: 'bg-gray-200 text-gray-500 dark:bg-meta-4' };
    if (r.viewed) return { label: t('proposals.statusViewed'), cls: 'bg-[#2b67c2]/15 text-[#2b67c2]' };
    return { label: t('proposals.statusSent'), cls: 'bg-warning/15 text-warning' };
  };

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-black dark:text-white">{t('proposals.title')}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('proposals.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="mb-5 inline-flex rounded-lg border border-stroke p-1 dark:border-strokedark">
        {(['pending', 'sent'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-md px-4 py-1.5 text-sm font-medium ${view === v ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`}>
            {v === 'pending' ? t('proposals.tabPending') : t('proposals.tabSent')}
          </button>
        ))}
      </div>

      {view === 'pending' && (<>
      {/* Search */}
      <div className="mb-5 flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-body" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') fetchEstimates(); }}
            placeholder={t('proposals.search') as string}
            className="w-full rounded-lg border border-stroke bg-white py-2.5 pl-9 pr-3 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-boxdark dark:text-white" />
        </div>
        <button onClick={fetchEstimates} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-opacity-90">{t('proposals.refresh')}</button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : error ? (
        <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark"><p className="text-sm text-danger">{error}</p></div>
      ) : estimates.length === 0 ? (
        <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark"><p className="text-sm text-gray-500">{t('proposals.empty')}</p></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-gray-2 dark:bg-meta-4">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">{t('proposals.number')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('proposals.customer')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('proposals.total')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('proposals.date')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {estimates.map((e) => (
                  <tr key={e.estimateId} className="border-t border-stroke hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4/40">
                    <td className="px-4 py-2.5 font-medium text-black dark:text-white">{e.number}</td>
                    <td className="px-4 py-2.5 text-body">{e.customerName}</td>
                    <td className="px-4 py-2.5 text-right text-body">{money(e.total, e.currency)}</td>
                    <td className="px-4 py-2.5 text-body">{formatDateOnly(e.date, i18n.language)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => openBuilder(e)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        {t('proposals.prepare')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>)}

      {/* Sent proposals — status board */}
      {view === 'sent' && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('proposals.sentSubtitle')}</p>
            <button onClick={fetchSent} className="rounded-lg border border-stroke bg-white px-3 py-2 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">{t('proposals.refresh')}</button>
          </div>
          {sentLoading ? (
            <div className="flex h-40 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : sent.length === 0 ? (
            <div className="rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark"><p className="text-sm text-gray-500">{t('proposals.sentEmpty')}</p></div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-gray-2 dark:bg-meta-4">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">{t('proposals.customer')}</th>
                      <th className="px-4 py-3 text-left font-medium">{t('proposals.number')}</th>
                      <th className="px-4 py-3 text-left font-medium">{t('proposals.sentOn')}</th>
                      <th className="px-4 py-3 text-left font-medium">{t('proposals.to')}</th>
                      <th className="px-4 py-3 text-left font-medium">{t('proposals.colEmail')}</th>
                      <th className="px-4 py-3 text-left font-medium">{t('proposals.colStatus')}</th>
                      {isAdmin && <th className="px-4 py-3"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sent.map((r) => {
                      const b = statusBadge(r);
                      const detail = r.acceptedDate ? `${t('proposals.acceptedOn')} ${formatDateOnly(r.acceptedDate, i18n.language)}`
                        : r.viewedTime ? `${t('proposals.viewedOn')} ${formatDateOnly(r.viewedTime, i18n.language)}` : '';
                      return (
                        <tr key={r.id} className="border-t border-stroke dark:border-strokedark">
                          <td className="px-4 py-2.5 font-medium text-black dark:text-white">{r.customerName}</td>
                          <td className="px-4 py-2.5 text-body">{r.number}</td>
                          <td className="px-4 py-2.5 text-body">{formatDateOnly(r.sentAt, i18n.language)}</td>
                          <td className="px-4 py-2.5 text-body">{r.toEmail}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-1">
                              {r.emailOpened ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                                    ✓ {t('proposals.emailOpened')}{r.emailOpenCount > 0 ? ` · ${r.emailOpenCount}×` : ''}
                                  </span>
                                  {r.emailOpenedAt && (
                                    <span className="text-[11px] text-gray-400" title={t('proposals.emailFirstOpened') as string}>
                                      {new Date(r.emailOpenedAt).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">{t('proposals.emailNotOpened')}</span>
                              )}
                              {r.linkClickCount > 0 && (
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                                    🔗 {t('proposals.linkClicked')} · {r.linkClickCount}×
                                  </span>
                                  {r.linkLastClickAt && (
                                    <span className="text-[11px] text-gray-400" title={t('proposals.linkLastClicked') as string}>
                                      {new Date(r.linkLastClickAt).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</span>
                            {detail && <span className="ml-2 text-xs text-gray-400">{detail}</span>}
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-2.5 text-right">
                              <button onClick={() => deleteSent(r)} title={t('common.delete') as string} className="rounded-lg p-1.5 text-body hover:text-danger">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Builder modal */}
      {sel && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => { overlayDownRef.current = e.target === e.currentTarget; }}
          onClick={(e) => { if (overlayDownRef.current && e.target === e.currentTarget) closeBuilder(); }}
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-stroke bg-white shadow-2xl dark:border-strokedark dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
              <div>
                <h3 className="text-lg font-semibold text-black dark:text-white">{t('proposals.builderTitle')}</h3>
                <p className="text-xs text-gray-400">{sel.number} · {sel.customerName}</p>
              </div>
              <button onClick={closeBuilder} className="rounded-lg p-1.5 text-body hover:bg-gray-1 dark:hover:bg-meta-4"><svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
              {/* Left: form / email */}
              <div className="thin-scrollbar space-y-4 overflow-y-auto p-6">
                {/* Language */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-body">{t('proposals.language')}</label>
                  <div className="inline-flex rounded-lg border border-stroke p-1 dark:border-strokedark">
                    {(['fr', 'en'] as const).map((l) => (
                      <button key={l} onClick={() => { setLang(l); setPrepared(null); }} className={`rounded-md px-4 py-1.5 text-sm font-medium ${lang === l ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`}>{l === 'fr' ? 'Français' : 'English'}</button>
                    ))}
                  </div>
                </div>
                {/* Cover co-branding: client name OR client logo (rep's choice) */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-body">{t('proposals.branding')}</label>
                  <div className="inline-flex rounded-lg border border-stroke p-1 dark:border-strokedark">
                    {(['name', 'logo'] as const).map((m) => (
                      <button key={m} onClick={() => { setBranding(m); setPrepared(null); }}
                        className={`rounded-md px-4 py-1.5 text-sm font-medium ${branding === m ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`}>
                        {m === 'name' ? t('proposals.brandingName') : t('proposals.brandingLogo')}
                      </button>
                    ))}
                  </div>
                  {branding === 'logo' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={(e) => { onLogo(e.target.files?.[0]); setPrepared(null); }}
                        className="text-sm text-body file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white" />
                      {logo && <button onClick={() => { setLogo(null); if (fileRef.current) fileRef.current.value = ''; }} className="text-xs text-danger hover:underline">{t('common.remove') || 'Retirer'}</button>}
                    </div>
                  )}
                </div>

                <button onClick={prepare} disabled={preparing} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
                  {preparing ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{t('proposals.preparing')}</> : (prepared ? t('proposals.regenerate') : t('proposals.generatePreview'))}
                </button>

                {/* Page selection now lives on the thumbnails in the preview (right). */}
                {prepared && prepared.presentationPageCount > 0 && (
                  <p className="border-t border-stroke pt-4 text-xs text-gray-400 dark:border-strokedark">
                    {t('proposals.pagesHintThumb', { count: selPages.length + (inclEstimate ? prepared.estimatePageCount : 0) })}
                  </p>
                )}

                {/* Email draft (after prepare) */}
                {prepared && (
                  <div className="space-y-3 border-t border-stroke pt-4 dark:border-strokedark">
                    <p className="text-sm font-semibold text-black dark:text-white">{t('proposals.emailDraft')}</p>
                    <div><label className="mb-1 block text-xs font-medium text-body">{t('proposals.to')}</label><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" className={inputCls} /></div>
                    <div><label className="mb-1 block text-xs font-medium text-body">{t('proposals.cc')}</label><input value={cc} onChange={(e) => setCc(e.target.value)} className={inputCls} /></div>
                    <div><label className="mb-1 block text-xs font-medium text-body">{t('proposals.subject')}</label><input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} /></div>
                    <div><label className="mb-1 block text-xs font-medium text-body">{t('proposals.message')}</label><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className={inputCls} /></div>
                    <div className="flex gap-2">
                      <button onClick={download} disabled={downloading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-stroke bg-white px-4 py-2.5 text-sm font-medium text-body hover:border-primary hover:text-primary disabled:opacity-60 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
                        {downloading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m6 5v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1" /></svg>}
                        {t('proposals.downloadPdf')}
                      </button>
                      <button onClick={send} disabled={sending} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
                        {sending ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{t('proposals.sending')}</> : <><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>{t('proposals.sendBtn')}</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: clickable-thumbnail PDF preview (also drives page selection) */}
              <div className="hidden min-h-[400px] border-l border-stroke md:block">
                {prepared ? (
                  <PdfThumbPreview
                    pdfBase64={prepared.pdfBase64}
                    presentationPageCount={prepared.presentationPageCount}
                    estimatePageCount={prepared.estimatePageCount}
                    selPages={selPages} setSelPages={setSelPages}
                    inclEstimate={inclEstimate} setInclEstimate={setInclEstimate}
                    onDownload={download} downloading={downloading}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">{t('proposals.previewHint')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Proposals;
