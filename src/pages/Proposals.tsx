import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../lib/dialog';
import { formatDateOnly } from '../utils/date';
import PdfThumbPreview from './PdfThumbPreview';
import ActivityTimeline from '../components/ActivityTimeline';
import Select from '../components/Select';
import { Button, DataTable, FilterBar, Modal, PageHeader, StatusPill, Tabs, CARD_TITLE, CARD_SUB, LABEL, SEG, segBtn } from '../components/ui';
import type { StatusFamily } from '../components/ui';
import { useLocation, useNavigate } from 'react-router-dom';
import { authHeaders, getToken } from '../lib/auth';

const b64ToBytes = (b64: string) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface Estimate {
  estimateId: string; number: string; customerName: string;
  total: number; currency: string; date: string; status: string; salesperson: string;
}
// Proposition de CHAÎNE : la tarification vient d'un scénario du modélisateur (prix client seulement).
interface ChainScenario { id: string; name: string; merchantName: string; numLocs: number; hasLogo?: boolean }
// Soumission venue du guide de prix (refonte UI, P2) : le serveur relit les prix en base.
interface PricingQuote { items: { id: string; qty: number; type: 'package' | 'hardware' }[]; billing: 'monthly' | 'yearly'; clientName?: string }

// Le logo du scénario passe en PNG avant d'aller sur la couverture : le rendu de secours (pdf-lib,
// si le service Chromium est indisponible) ne lit que PNG et JPEG, et un WebP y casserait la
// proposition.
const toPng = (dataUrl: string): Promise<string> => new Promise((resolve) => {
  if (dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/jpeg')) { resolve(dataUrl); return; }
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d')!.drawImage(img, 0, 0); resolve(c.toDataURL('image/png'));
  };
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});
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
  const [activityFor, setActivityFor] = useState<{ estimateId: string; number: string } | null>(null);
  const [estPreview, setEstPreview] = useState<{ estimateId: string; number: string; loading: boolean } | null>(null);

  // Builder state. sel = the picked Zoho estimate, or null for a presentation-only proposal
  // (cover+deck, no estimate) — builderOpen drives modal visibility independently of sel so a
  // "blank" proposal can open the same modal with no estimate selected.
  const [builderOpen, setBuilderOpen] = useState(false);
  const [sel, setSel] = useState<Estimate | null>(null);
  const [blankClientName, setBlankClientName] = useState(''); // free-typed client name when sel is null
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const [title, setTitle] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  // editable email
  const [to, setTo] = useState(''); const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(''); const [body, setBody] = useState('');
  // Last email the server generated. A field that differs from it was edited by the rep, and a
  // re-prepare (new language, client name, logo…) must not wipe that edit silently.
  const generatedEmail = useRef({ to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [emailPreview, setEmailPreview] = useState<{ html: string; loading: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Page reordering + selection: `order` is a full permutation of every page number (1-based,
  // presentation then estimate) driving drag position; `excludedPages` marks which are dropped
  // from the final document, independent of their position in `order`.
  const [order, setOrder] = useState<number[]>([]);
  const [excludedPages, setExcludedPages] = useState<number[]>([]);
  // Cover co-branding: show the client NAME (default) or the client LOGO
  const [branding, setBranding] = useState<'name' | 'logo'>('name');
  // Proposition de chaîne (perm proposals:chain, décidée par /api/auth/verify — jamais le jeton brut).
  const [canChain, setCanChain] = useState(false);
  const [chainMode, setChainMode] = useState(false);
  const [chainScenarios, setChainScenarios] = useState<ChainScenario[]>([]);
  const [chain, setChain] = useState<ChainScenario | null>(null);
  const [quoteSource, setQuoteSource] = useState<PricingQuote | null>(null);
  const clientName = () => (sel ? sel.customerName : blankClientName.trim());

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
      .then((r) => {
        const u = r.data?.user; const perms: string[] = u?.permissions || [];
        const admin = !!u?.isAdmin || perms.includes('*');
        setIsAdmin(admin); setCanChain(admin || perms.includes('proposals:chain'));
      })
      .catch(() => {});
  }, []);

  const deleteSent = async (r: SentRow) => {
    if (!(await dialog.confirm(t('proposals.deleteConfirm', { customer: r.customerName }) as string, { danger: true, confirmText: t('common.delete') as string }))) return;
    try { await axios.delete(`${API_URL}/api/proposals/sent/${r.id}`, { headers: authHeaders() }); fetchSent(); }
    catch (e: any) { dialog.alert(e?.response?.data?.error || t('errors.deleteFailed')); }
  };

  // Pass an estimate to build a proposal from it, or null to start a presentation-only proposal
  // (no Zoho estimate) — the rep types the client name instead.
  const openBuilder = (e: Estimate | null) => {
    setSel(e); setBuilderOpen(true); setBlankClientName('');
    setLang(i18n.language?.startsWith('en') ? 'en' : 'fr'); setTitle(''); setLogo(null);
    setPrepared(null); setTo(''); setCc(''); setSubject(''); setBody('');
    generatedEmail.current = { to: '', subject: '', body: '' };
    setOrder([]); setExcludedPages([]); setBranding('name');
    setChainMode(false); setChain(null); setQuoteSource(null);
  };
  const openChainBuilder = async (preselectId?: string) => {
    openBuilder(null);
    setChainMode(true);
    try {
      const r = await axios.get(`${API_URL}/api/proposals/chain-scenarios`, { headers: authHeaders() });
      const list: ChainScenario[] = r.data.scenarios || [];
      setChainScenarios(list);
      // Venu du modélisateur (« Préparer une proposition ») : le scénario est déjà choisi.
      if (preselectId) await pickChainScenario(list.find((x) => x.id === preselectId) || null);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('proposals.chain.loadError')); }
  };
  const pickChain = (id: string) => pickChainScenario(chainScenarios.find((x) => x.id === id) || null);
  const pickChainScenario = async (c: ChainScenario | null) => {
    setChain(c); setPrepared(null);
    if (!c) return;
    // Le nom du marchand du scénario pré-remplit le nom du client (modifiable).
    setBlankClientName(c.merchantName || c.name);
    // Son logo, s'il en a un, passe sur la couverture (le rep peut revenir au nom).
    if (c.hasLogo) {
      try {
        const r = await axios.get(`${API_URL}/api/proposals/chain-scenarios/${c.id}/logo`, { headers: authHeaders() });
        if (r.data?.logo) { setLogo(await toPng(r.data.logo)); setBranding('logo'); }
      } catch { /* sans logo, la couverture porte le nom : rien de bloquant */ }
    } else {
      setLogo(null); setBranding('name');
    }
  };
  const closeBuilder = () => { setBuilderOpen(false); setSel(null); setPrepared(null); setChainMode(false); setChain(null); setQuoteSource(null); };

  // Arrivées directes depuis les autres outils de vente (refonte UI, P2) :
  //   /proposals?chaine=<id>  ← Modélisateur de revenus (scénario enregistré)
  //   state.pricingQuote      ← Guide matériel et prix (le panier devient les pages de soumission)
  const location = useLocation() as { state?: { pricingQuote?: PricingQuote }; search: string; pathname: string };
  const navigate = useNavigate();
  const handledEntry = useRef(false);
  useEffect(() => {
    if (handledEntry.current) return;
    const pq = location.state?.pricingQuote;
    const chaine = new URLSearchParams(location.search).get('chaine');
    if (pq && pq.items?.length) {
      handledEntry.current = true;
      openBuilder(null);
      setQuoteSource({ items: pq.items, billing: pq.billing });
      if (pq.clientName) setBlankClientName(pq.clientName);
      navigate(location.pathname, { replace: true, state: null }); // un rafraîchissement ne rouvre pas
    } else if (chaine && canChain) {
      handledEntry.current = true;
      openChainBuilder(chaine);
      navigate(location.pathname, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canChain]);

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
    setPreparing(true);
    try {
      // Always render the FULL document so every page shows as a thumbnail; the rep then drags to
      // reorder / toggles which pages to actually send (applied at send/download time).
      const r = await axios.post(`${API_URL}/api/proposals/prepare`,
        { estimateId: sel?.estimateId, scenarioId: chain?.id, pricingQuote: !sel && !chain ? quoteSource || undefined : undefined, lang, title: title.trim(), clientName: clientName(), logoBase64: branding === 'logo' ? (logo || undefined) : undefined },
        { headers: authHeaders() });
      const p: Prepared = r.data;
      setPrepared(p);
      // Default: every page included, original order (presentation then estimate).
      const total = p.presentationPageCount + p.estimatePageCount;
      setOrder(Array.from({ length: total }, (_, i) => i + 1));
      setExcludedPages([]);
      const fresh = { to: p.email?.to || '', subject: p.email?.subject || '', body: p.email?.body || '' };
      const prev = generatedEmail.current;
      generatedEmail.current = fresh;
      // The recipient the rep typed always wins. For the text, ask — the new template may be in
      // the other language, so keeping the old text is not always right either. Escape = keep.
      if (to === prev.to) setTo(fresh.to);
      const textEdited = subject !== prev.subject || body !== prev.body;
      if (!textEdited || (await dialog.confirm(t('proposals.replaceEditedEmail') as string, {
        confirmText: t('proposals.replaceEditedEmailYes') as string,
        cancelText: t('proposals.replaceEditedEmailNo') as string,
      }))) {
        setSubject(fresh.subject); setBody(fresh.body);
      }
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('proposals.prepareError')); }
    finally { setPreparing(false); }
  };

  const send = async () => {
    if (!prepared) return;
    if (!to.trim()) { dialog.alert(t('proposals.toRequired')); return; }
    if (!(await dialog.confirm(t('proposals.sendConfirm', { to: to.trim() }) as string, { confirmText: t('proposals.sendBtn') as string }))) return;
    setSending(true);
    try {
      const resp = await axios.post(`${API_URL}/api/proposals/send`,
        { estimateId: sel?.estimateId, scenarioId: chain?.id, pricingQuote: !sel && !chain ? quoteSource || undefined : undefined, lang, title: title.trim(), clientName: clientName(), logoBase64: branding === 'logo' ? (logo || undefined) : undefined, to: to.trim(), cc: cc.trim() || undefined, subject: subject.trim(), body,
          pageOrder: order.filter((n) => !excludedPages.includes(n)) },
        { headers: authHeaders() });
      const note = !chain && resp.data && resp.data.acceptLinkIncluded === false ? '\n\n' + t('proposals.noAcceptLink') : '';
      await dialog.alert(t('proposals.sent', { to: to.trim() }) + note);
      closeBuilder();
      setView('sent'); fetchSent();
    } catch (e: any) {
      const code = e?.response?.data?.error;
      dialog.alert(code === 'smtp_not_configured' ? t('proposals.smtpOff') : (e?.response?.data?.reason || e?.response?.data?.error || t('proposals.sendError')));
    } finally { setSending(false); }
  };

  // Download the EXACT PDF that will be sent — rebuilt server-side with the current page order
  // (so footers are renumbered) + selection.
  const download = async () => {
    if (!prepared) return;
    setDownloading(true);
    try {
      const r = await axios.post(`${API_URL}/api/proposals/prepare`,
        { estimateId: sel?.estimateId, scenarioId: chain?.id, pricingQuote: !sel && !chain ? quoteSource || undefined : undefined, lang, clientName: clientName(),
          logoBase64: branding === 'logo' ? (logo || undefined) : undefined,
          pageOrder: order.filter((n) => !excludedPages.includes(n)) },
        { headers: authHeaders() });
      const blob = new Blob([b64ToBytes(r.data.pdfBase64) as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = r.data.fileName || 'proposition.pdf';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('proposals.downloadFailed')); }
    finally { setDownloading(false); }
  };

  // Preview of the exact email HTML that /send would produce (signature, accept button, chrome),
  // rendered read-only — no side effects (nothing is marked sent, no email goes out).
  const previewEmailContent = async () => {
    setEmailPreview({ html: '', loading: true });
    try {
      const r = await axios.post(`${API_URL}/api/proposals/preview-email`,
        { estimateId: sel?.estimateId, lang, clientName: clientName(), body },
        { headers: authHeaders() });
      setEmailPreview({ html: r.data.html, loading: false });
    } catch (e: any) {
      setEmailPreview(null);
      dialog.alert(e?.response?.data?.error || t('proposals.previewFailed'));
    }
  };

  const inputCls = 'w-full rounded-[10px] border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';
  const money = (n: number, c: string) => `${(n || 0).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c || ''}`.trim();
  const statusBadge = (r: SentRow): { label: string; family: StatusFamily } => {
    if (r.status === 'accepted') return { label: t('proposals.statusAccepted'), family: 'ok' };
    if (r.status === 'declined') return { label: t('proposals.statusDeclined'), family: 'err' };
    if (r.status === 'expired') return { label: t('proposals.statusExpired'), family: 'neutral' };
    if (r.viewed) return { label: t('proposals.statusViewed'), family: 'new' };
    return { label: t('proposals.statusSent'), family: 'wait' };
  };

  return (
    <>
      <PageHeader section={t('sidebar.sections.sales')} title={t('proposals.title')} subtitle={t('proposals.subtitle')}
        actions={<>
          {canChain && (
            <Button size="md" onClick={() => openChainBuilder()}
              icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 21V9l8-5 8 5v12M9 21v-6h6v6" /></svg>}>
              {t('proposals.chain.new')}
            </Button>
          )}
          <Button size="md" variant="primary" onClick={() => openBuilder(null)}
            icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}>
            {t('proposals.blankNew')}
          </Button>
        </>} />

      <Tabs tabs={[{ id: 'pending', label: t('proposals.tabPending') }, { id: 'sent', label: t('proposals.tabSent') }]} value={view} onChange={setView} />

      {view === 'pending' && (
        <div className="mt-4 space-y-4">
          <FilterBar search={q} onSearch={setQ} onSubmit={fetchEstimates} searchPlaceholder={t('proposals.search') as string}>
            <Button size="md" onClick={fetchEstimates}>{t('proposals.refresh')}</Button>
          </FilterBar>
          <DataTable
            rows={estimates}
            rowKey={(e) => e.estimateId}
            loading={loading}
            error={error ? { title: error, onRetry: fetchEstimates } : null}
            empty={{ title: t('proposals.empty') }}
            columns={[
              { key: 'num', header: t('proposals.number'), sortValue: (e) => e.number, render: (e) => <span className="font-bold">{e.number}</span> },
              { key: 'cust', header: t('proposals.customer'), sortValue: (e) => (e.customerName || '').toLowerCase(),
                render: (e) => (
                  <button onClick={() => setEstPreview({ estimateId: e.estimateId, number: e.number, loading: true })}
                    className="text-left font-medium text-accent-ink hover:underline dark:text-accent-ink-dark">{e.customerName}</button>
                ) },
              { key: 'total', header: t('proposals.total'), align: 'right', sortValue: (e) => Number(e.total) || 0,
                render: (e) => <span className="whitespace-nowrap">{money(e.total, e.currency)}</span> },
              { key: 'date', header: t('proposals.date'), sortValue: (e) => e.date || '',
                render: (e) => <span className="whitespace-nowrap text-body dark:text-bodydark2">{formatDateOnly(e.date, i18n.language)}</span> },
              { key: 'act', header: '', align: 'right',
                render: (e) => (
                  <Button size="sm" variant="primary" onClick={() => openBuilder(e)}
                    icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}>
                    {t('proposals.prepare')}
                  </Button>
                ) },
            ]}
          />
        </div>
      )}

      {/* Sent proposals — status board */}
      {view === 'sent' && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('proposals.sentSubtitle')}</p>
            <Button size="md" onClick={fetchSent}>{t('proposals.refresh')}</Button>
          </div>
          <DataTable
            rows={sent}
            rowKey={(r) => r.id}
            loading={sentLoading}
            empty={{ title: t('proposals.sentEmpty') }}
            defaultSort={{ key: 'sentOn', dir: 'desc' }}
            columns={[
              { key: 'cust', header: t('proposals.customer'), sortValue: (r) => (r.customerName || '').toLowerCase(),
                render: (r) => r.estimateId ? (
                  <button onClick={() => setEstPreview({ estimateId: r.estimateId, number: r.number, loading: true })}
                    className="text-left font-medium text-black hover:underline dark:text-white">{r.customerName}</button>
                ) : <span className="font-medium">{r.customerName}</span> },
              { key: 'num', header: t('proposals.number'), render: (r) => <span className="text-body dark:text-bodydark2">{r.number}</span> },
              { key: 'sentOn', header: t('proposals.sentOn'), sortValue: (r) => r.sentAt || '',
                render: (r) => <span className="whitespace-nowrap text-body dark:text-bodydark2">{formatDateOnly(r.sentAt, i18n.language)}</span> },
              { key: 'to', header: t('proposals.to'), render: (r) => <span className="text-body dark:text-bodydark2">{r.toEmail}</span> },
              { key: 'mail', header: t('proposals.colEmail'),
                render: (r) => (
                  <div className="flex flex-col gap-1">
                    {r.emailOpened ? (
                      <div className="flex flex-col gap-0.5">
                        <StatusPill family="ok">✓ {t('proposals.emailOpened')}{r.emailOpenCount > 0 ? ` · ${r.emailOpenCount}×` : ''}</StatusPill>
                        {r.emailOpenedAt && (
                          <span className="text-[11px] text-body dark:text-bodydark2" title={t('proposals.emailFirstOpened') as string}>
                            {new Date(r.emailOpenedAt).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-body dark:text-bodydark2">{t('proposals.emailNotOpened')}</span>
                    )}
                    {r.linkClickCount > 0 && (
                      <div className="flex flex-col gap-0.5">
                        <StatusPill family="new">🔗 {t('proposals.linkClicked')} · {r.linkClickCount}×</StatusPill>
                        {r.linkLastClickAt && (
                          <span className="text-[11px] text-body dark:text-bodydark2" title={t('proposals.linkLastClicked') as string}>
                            {new Date(r.linkLastClickAt).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) },
              { key: 'status', header: t('proposals.colStatus'), sortValue: (r) => r.status || '',
                render: (r) => {
                  const b = statusBadge(r);
                  const detail = r.acceptedDate ? `${t('proposals.acceptedOn')} ${formatDateOnly(r.acceptedDate, i18n.language)}`
                    : r.viewedTime ? `${t('proposals.viewedOn')} ${formatDateOnly(r.viewedTime, i18n.language)}` : '';
                  return (
                    <div className="flex flex-col items-start gap-0.5">
                      <StatusPill family={b.family}>{b.label}</StatusPill>
                      {detail && <span className="text-[11px] text-body dark:text-bodydark2">{detail}</span>}
                    </div>
                  );
                } },
              { key: 'act', header: '', align: 'right',
                render: (r) => (
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setActivityFor({ estimateId: r.estimateId || `blank-${r.id}`, number: r.number })} title={t('activity.title') as string} aria-label={t('activity.title') as string} className="rounded-lg p-1.5 text-body hover:text-black dark:hover:text-white">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </button>
                    {isAdmin && (
                      <button onClick={() => deleteSent(r)} title={t('common.delete') as string} aria-label={t('common.delete') as string} className="rounded-lg p-1.5 text-body hover:text-danger">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                ) },
            ]}
          />
        </div>
      )}

      {/* Activity modal */}
      <Modal open={!!activityFor} onClose={() => setActivityFor(null)} size="md" title={t('activity.title')}
        headerExtra={activityFor ? <span className="text-xs text-body dark:text-bodydark2">{activityFor.number}</span> : null}>
        {activityFor && <ActivityTimeline entityType="proposal" entityId={activityFor.estimateId} />}
      </Modal>

      {/* Estimate PDF preview modal */}
      <Modal open={!!estPreview} onClose={() => setEstPreview(null)} size="xl" title={estPreview?.number || ''}>
        {estPreview && (
          <div className="relative -mx-5 -my-4 h-[75vh] bg-white dark:bg-boxdark">
            {estPreview.loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-boxdark">
                <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            )}
            <iframe
              src={`${API_URL}/api/proposals/estimate/${estPreview.estimateId}/preview?token=${getToken()}`}
              className="h-full w-full border-0"
              title={t('proposals.estimatePreview') as string}
              onLoad={() => setEstPreview((p) => (p ? { ...p, loading: false } : p))}
            />
          </div>
        )}
      </Modal>

      {/* Email preview modal — srcDoc renders the exact HTML /send would email, read-only */}
      <Modal open={!!emailPreview} onClose={() => setEmailPreview(null)} size="xl" title={t('proposals.previewEmail')}>
        {emailPreview && (
          <div className="relative -mx-5 -my-4 h-[75vh] bg-[#eef1f6]">
            {emailPreview.loading ? (
              <div className="flex h-full items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : (
              <iframe srcDoc={emailPreview.html} className="h-full w-full border-0" title={t('proposals.previewEmail') as string} />
            )}
          </div>
        )}
      </Modal>

      {/* Builder modal */}
      {builderOpen && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => { overlayDownRef.current = e.target === e.currentTarget; }}
          onClick={(e) => { if (overlayDownRef.current && e.target === e.currentTarget) closeBuilder(); }}
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-stroke bg-white shadow-2xl dark:border-strokedark dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
              <div>
                <h3 className={CARD_TITLE}>{t('proposals.builderTitle')}</h3>
                <p className={CARD_SUB}>{sel ? `${sel.number} · ${sel.customerName}` : chainMode ? (chain ? `${t('proposals.chain.new')} · ${chain.name}` : t('proposals.chain.new')) : quoteSource ? t('proposals.fromGuide', { count: quoteSource.items.length }) : t('proposals.blankNew')}</p>
              </div>
              <button onClick={closeBuilder} className="rounded-lg p-1.5 text-body hover:bg-gray-1 dark:hover:bg-meta-4"><svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
              {/* Left: form / email */}
              <div className="thin-scrollbar space-y-4 overflow-y-auto p-6">
                {/* Client name — free text, optional when there's no Zoho estimate to pull it from;
                    a generic placeholder fills the cover when left blank. */}
                {chainMode && (
                  <div>
                    <label className={LABEL}>{t('proposals.chain.scenario')}</label>
                    <Select value={chain?.id || ''} onChange={pickChain}
                      options={[{ value: '', label: chainScenarios.length ? (t('proposals.chain.pick') as string) : (t('proposals.chain.none') as string) },
                        ...chainScenarios.map((c) => ({ value: c.id, label: `${c.name}${c.merchantName && c.merchantName !== c.name ? ` — ${c.merchantName}` : ''} · ${t('proposals.chain.locs', { n: c.numLocs })}` }))]} />
                    <p className="mt-1 text-[11px] text-body dark:text-bodydark2">{t('proposals.chain.hint')}</p>
                  </div>
                )}
                {!sel && (
                  <div>
                    <label className={LABEL}>{t('proposals.blankClientName')}</label>
                    <input value={blankClientName} onChange={(e) => { setBlankClientName(e.target.value); setPrepared(null); }}
                      placeholder={t('proposals.blankClientNamePlaceholder') as string} className={inputCls} />
                  </div>
                )}
                {/* Language */}
                <div>
                  <label className={LABEL}>{t('proposals.language')}</label>
                  <div className={SEG}>
                    {(['fr', 'en'] as const).map((l) => (
                      <button key={l} onClick={() => { setLang(l); setPrepared(null); }} className={segBtn(lang === l)}>{l === 'fr' ? 'Français' : 'English'}</button>
                    ))}
                  </div>
                </div>
                {/* Cover co-branding: client name OR client logo (rep's choice) */}
                <div>
                  <label className={LABEL}>{t('proposals.branding')}</label>
                  <div className={SEG}>
                    {(['name', 'logo'] as const).map((m) => (
                      <button key={m} onClick={() => { setBranding(m); setPrepared(null); }}
                        className={segBtn(branding === m)}>
                        {m === 'name' ? t('proposals.brandingName') : t('proposals.brandingLogo')}
                      </button>
                    ))}
                  </div>
                  {branding === 'logo' && (
                    <div className="mt-2 flex items-center gap-2">
                      <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={(e) => { onLogo(e.target.files?.[0]); setPrepared(null); }}
                        className="text-sm text-body file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-bold file:text-[#141414]" />
                      {logo && <button onClick={() => { setLogo(null); if (fileRef.current) fileRef.current.value = ''; }} className="text-xs text-danger hover:underline">{t('common.remove') || 'Retirer'}</button>}
                    </div>
                  )}
                </div>

                <button onClick={prepare} disabled={preparing || (chainMode && !chain)} className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-sm font-bold text-[#141414] hover:bg-[#F79C6A] disabled:opacity-50">
                  {preparing ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#141414] border-t-transparent" />{t('proposals.preparing')}</> : (prepared ? t('proposals.regenerate') : t('proposals.generatePreview'))}
                </button>

                {/* Reordering + page selection now lives on the thumbnails in the preview (right). */}
                {prepared && (prepared.presentationPageCount + prepared.estimatePageCount) > 0 && (
                  <p className="border-t border-stroke pt-4 text-xs text-body dark:text-bodydark2 dark:border-strokedark">
                    {t('proposals.pagesHintThumb', { count: order.filter((n) => !excludedPages.includes(n)).length })}
                  </p>
                )}

                {/* Email draft (after prepare) */}
                {prepared && (
                  <div className="space-y-3 border-t border-stroke pt-4 dark:border-strokedark">
                    <p className="text-sm font-semibold text-black dark:text-white">{t('proposals.emailDraft')}</p>
                    <div><label className={LABEL}>{t('proposals.to')}</label><input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" className={inputCls} /></div>
                    <div><label className={LABEL}>{t('proposals.cc')}</label><input value={cc} onChange={(e) => setCc(e.target.value)} className={inputCls} /></div>
                    <div><label className={LABEL}>{t('proposals.subject')}</label><input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} /></div>
                    <div><label className={LABEL}>{t('proposals.message')}</label><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className={inputCls} /></div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={previewEmailContent} disabled={emailPreview?.loading} className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-stroke bg-white px-4 py-2.5 text-sm font-bold text-body hover:border-primary hover:text-black dark:hover:text-white disabled:opacity-60 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
                        {emailPreview?.loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                        {t('proposals.previewEmail')}
                      </button>
                      <button onClick={download} disabled={downloading} className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-stroke bg-white px-4 py-2.5 text-sm font-bold text-body hover:border-primary hover:text-black dark:hover:text-white disabled:opacity-60 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
                        {downloading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m6 5v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1" /></svg>}
                        {t('proposals.downloadPdf')}
                      </button>
                      <button onClick={send} disabled={sending} className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-sm font-bold text-[#141414] hover:bg-[#F79C6A] hover:bg-opacity-90 disabled:opacity-50">
                        {sending ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#141414] border-t-transparent" />{t('proposals.sending')}</> : <><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>{t('proposals.sendBtn')}</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: drag-to-reorder thumbnail PDF preview (also drives page selection) */}
              <div className="hidden min-h-[400px] border-l border-stroke md:block">
                {prepared ? (
                  <PdfThumbPreview
                    pdfBase64={prepared.pdfBase64}
                    presentationPageCount={prepared.presentationPageCount}
                    order={order} setOrder={setOrder}
                    excludedPages={excludedPages} setExcludedPages={setExcludedPages}
                    onDownload={download} downloading={downloading}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-8 text-center text-sm text-body dark:text-bodydark2">{t('proposals.previewHint')}</div>
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
