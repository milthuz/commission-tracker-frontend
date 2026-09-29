import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Check, FileText, Paperclip, Plus, RefreshCw, Search, Send, Trash2, Upload, X } from 'lucide-react';
import { ContentLoader } from '../../common/Loader';
import { dialog } from '../../lib/dialog';
import PdfViewerModal, { type PdfSource } from '../../components/PdfViewerModal';

// Crédits processeur marchand (/credits).
//
// Le rep crée un dossier à partir d'un marchand ZENTACT (seule source permise, demande de David), téléverse les pièces exigées par la
// clause 4 du formulaire (facture de pénalité, preuve de paiement), puis l'envoie au client, qui
// signe en ligne. L'approbateur approuve le dossier signé : la note de crédit est alors créée dans
// Zoho Books. Tout est décidé par le serveur (permissions, statuts, verrous) — l'écran ne fait
// qu'afficher ce que l'API permet.

const API_URL = import.meta.env.VITE_API_URL || '';
const token = () => localStorage.getItem('token') || '';
const authHeaders = (json = true): Record<string, string> => ({
  Authorization: `Bearer ${token()}`, ...(json ? { 'Content-Type': 'application/json' } : {}),
});

type Status = 'draft' | 'sent' | 'viewed' | 'signed' | 'approved' | 'rejected' | 'declined' | 'cancelled' | 'expired';
interface Credit {
  id: string; ref: string; status: Status; lang: 'fr' | 'en';
  repEmail: string; repName: string | null; customerId: string | null; merchantId: string | null;
  legalName: string; contactPerson: string; phone: string; email: string; amount: number; note: string | null;
  tokenExpiresAt: string | null; sentAt: string | null; viewedAt: string | null; signedAt: string | null;
  signerName: string | null; signerTitle: string | null; commitmentEnd: string | null; declineReason: string | null;
  approvedBy: string | null; approvedAt: string | null; rejectedBy: string | null; rejectedAt: string | null; rejectReason: string | null;
  creditnoteId: string | null; creditnoteNumber: string | null; booksError: string | null;
  docCount: number; createdAt: string; updatedAt: string;
  // Reprise (clause 3) : départ détecté avant la fin des 36 mois, puis décision.
  clawback: { status: 'flagged' | 'reclaimed' | 'waived'; flaggedAt: string; zentactStatus: string; decidedBy: string | null; decidedAt: string | null; note: string | null } | null;
}
interface Doc { id: number; filename: string; mime: string; size: number; uploadedBy: string; uploadedAt: string }
interface Detail { credit: Credit; docs: Doc[]; events: { type: string; description: string; actor: string; at: string }[]; canApprove: boolean; canEdit: boolean }
interface Meta { canSend: boolean; canViewAll: boolean; canApprove: boolean; commitmentMonths: number }
interface Customer { id: string; name: string; company: string; email: string; phone: string }
interface ZMerchant { id: string; name: string; email: string; status: string; rep: string }

const CARD = 'rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark';
const INPUT = 'w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';
const BTN = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-stroke px-3 py-2 text-sm text-black hover:border-primary hover:text-primary disabled:opacity-50 dark:border-strokedark dark:text-white';
const BTN_PRIMARY = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50';

const STATUS_CLS: Record<Status, string> = {
  draft: 'bg-gray-2 text-body dark:bg-meta-4 dark:text-bodydark',
  sent: 'bg-primary/10 text-primary',
  viewed: 'bg-primary/10 text-primary',
  signed: 'bg-warning/15 text-warning',
  approved: 'bg-success/15 text-success',
  rejected: 'bg-danger/10 text-danger',
  declined: 'bg-danger/10 text-danger',
  cancelled: 'bg-gray-2 text-body dark:bg-meta-4 dark:text-bodydark',
  expired: 'bg-gray-2 text-body dark:bg-meta-4 dark:text-bodydark',
};
const FILTERS: Record<string, Status[] | null> = {
  all: null,
  open: ['draft', 'sent', 'viewed', 'expired'],
  toApprove: ['signed'],
  done: ['approved', 'rejected', 'declined', 'cancelled'],
  clawback: null, // filtre à part : reprise possible, non tranchée
};
const isClawback = (c: Credit) => c.clawback?.status === 'flagged';
const matchFilter = (k: string, c: Credit) => (k === 'clawback' ? isClawback(c) : !FILTERS[k] || FILTERS[k]!.includes(c.status));

async function api<T = any>(method: string, path: string, body?: any): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(`${API_URL}${path}`, { method, headers: authHeaders(), body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export default function Credits() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-CA' : 'fr-CA';
  const [params, setParams] = useSearchParams();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<Credit[]>([]);
  // Le courriel d'alerte ouvre /credits?filter=clawback.
  const [filter, setFilter] = useState<keyof typeof FILTERS>(params.get('filter') === 'clawback' ? 'clawback' : 'all');
  const [checking, setChecking] = useState(false);
  const [q, setQ] = useState('');
  const [editor, setEditor] = useState<{ credit: Credit | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(params.get('id'));

  const money = (v: number) => v.toLocaleString(locale, { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // « AAAA-MM-JJ » (date sans heure, ex. fin d'engagement) = date LOCALE : new Date('2029-09-29')
  // la lirait à minuit UTC, soit le 28 au soir à Montréal.
  const date = (d: string | null) => {
    if (!d) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
    return dt.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const loadList = async () => {
    const r = await api<{ credits: Credit[] }>('GET', '/api/credits');
    if (r.ok) setCredits(r.data.credits || []);
  };

  useEffect(() => {
    (async () => {
      const m = await api<Meta>('GET', '/api/credits/meta');
      if (m.status === 403) { setFatal(t('credits.noAccess') as string); setLoading(false); return; }
      if (!m.ok) { setFatal(t('credits.loadError') as string); setLoading(false); return; }
      setMeta(m.data);
      await loadList();
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCredit = (id: string | null) => {
    setOpenId(id);
    if (id) setParams({ id }, { replace: true }); else setParams({}, { replace: true });
  };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return credits.filter((c) => matchFilter(filter, c)
      && (!needle || `${c.ref} ${c.legalName} ${c.contactPerson} ${c.repName || ''}`.toLowerCase().includes(needle)));
  }, [credits, filter, q]);
  const counts = useMemo(() => Object.fromEntries(Object.keys(FILTERS).map((k) => [k, credits.filter((c) => matchFilter(k, c)).length])), [credits]);

  const checkNow = async () => {
    setChecking(true);
    const r = await api<{ flagged: number }>('POST', '/api/credits/clawback-check');
    setChecking(false);
    if (!r.ok) { dialog.alert(t('credits.actionError')); return; }
    await loadList();
    dialog.alert(t('credits.clawback.checked', { count: r.data.flagged }));
  };

  if (loading) return <ContentLoader />;
  if (fatal || !meta) return <div className={`${CARD} p-8 text-center text-sm text-danger`}>{fatal}</div>;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">{t('credits.title')}</h2>
        <p className="mt-1 text-sm text-body dark:text-bodydark">{t('credits.subtitle')}</p>
      </div>

      <div className={`${CARD} mb-5 flex flex-wrap items-center gap-3 p-4`}>
        <div className="inline-flex flex-wrap rounded-lg border border-stroke p-1 dark:border-strokedark">
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).filter((k) => k !== 'clawback' || counts.clawback > 0 || filter === 'clawback').map((k) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === k ? 'bg-primary text-white' : k === 'clawback' ? 'text-danger hover:bg-danger/5' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`}>
              {t(`credits.filter.${k}`)} <span className="opacity-70">({counts[k] || 0})</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-body" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('credits.search') as string} className={`${INPUT} pl-9`} />
        </div>
        {meta.canApprove && (
          <button type="button" onClick={checkNow} disabled={checking} title={t('credits.clawback.checkHint') as string} className={BTN}>
            <RefreshCw className="h-4 w-4" />{checking ? t('credits.clawback.checking') : t('credits.clawback.check')}
          </button>
        )}
        {meta.canSend && (
          <button type="button" onClick={() => setEditor({ credit: null })} className={BTN_PRIMARY}>
            <Plus className="h-4 w-4" />{t('credits.new')}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className={`${CARD} p-10 text-center text-sm text-body`}>{credits.length ? t('credits.noneFiltered') : t('credits.none')}</div>
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-2 text-left text-xs text-body dark:bg-meta-4 dark:text-bodydark">
              <tr>
                <th className="px-4 py-3 font-medium">{t('credits.col.ref')}</th>
                <th className="px-4 py-3 font-medium">{t('credits.col.merchant')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('credits.col.amount')}</th>
                <th className="px-4 py-3 font-medium">{t('credits.col.status')}</th>
                <th className="px-4 py-3 font-medium">{t('credits.col.rep')}</th>
                <th className="px-4 py-3 font-medium">{t('credits.col.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} onClick={() => openCredit(c.id)} className="cursor-pointer border-t border-stroke hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4/40">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-black dark:text-white">{c.ref}</td>
                  <td className="px-4 py-3 text-black dark:text-white">
                    {c.legalName || '—'}
                    {c.docCount === 0 && !['cancelled', 'declined', 'rejected'].includes(c.status) && (
                      <span className="ml-2 text-xs text-warning">{t('credits.noDocsBadge')}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-black dark:text-white">{money(c.amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge c={c} t={t as any} />
                    {isClawback(c) && <span className="ml-1.5 inline-block whitespace-nowrap rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger">{t('credits.clawback.badge')}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-body dark:text-bodydark">{c.repName || c.repEmail}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-body dark:text-bodydark">{date(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor && (
        <Editor credit={editor.credit} t={t as any}
          onClose={() => setEditor(null)}
          onSaved={async (c) => { setEditor(null); await loadList(); openCredit(c.id); }} />
      )}
      {openId && (
        <DetailModal id={openId} t={t as any} money={money} date={date} locale={locale}
          onClose={() => openCredit(null)} onChanged={loadList}
          onEdit={(c) => { openCredit(null); setEditor({ credit: c }); }} />
      )}
    </div>
  );
}

function StatusBadge({ c, t }: { c: Credit; t: (k: string, o?: any) => string }) {
  const booksPending = c.status === 'approved' && !c.creditnoteId;
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${booksPending ? 'bg-warning/15 text-warning' : STATUS_CLS[c.status]}`}>
      {booksPending ? t('credits.status.booksPending') : t(`credits.status.${c.status}`)}
    </span>
  );
}

function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const down = useRef(false);
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { down.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (down.current && e.target === e.currentTarget) onClose(); }}>
      <div className={`flex max-h-[92vh] w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} flex-col overflow-hidden rounded-2xl border border-stroke bg-white shadow-2xl dark:border-strokedark dark:bg-boxdark`}>
        <div className="flex items-start justify-between gap-3 border-b border-stroke px-6 py-4 dark:border-strokedark">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-black dark:text-white">{title}</h3>
            {subtitle && <p className="text-xs text-body dark:text-bodydark">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-body hover:bg-gray-1 dark:hover:bg-meta-4"><X className="h-5 w-5" /></button>
        </div>
        <div className="thin-scrollbar flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Création / modification d'un brouillon ──────────────────────────────────────────────
function Editor({ credit, t, onClose, onSaved }: { credit: Credit | null; t: (k: string, o?: any) => string; onClose: () => void; onSaved: (c: Credit) => void }) {
  const [merchantId, setMerchantId] = useState(credit?.merchantId || '');
  const [merchantLabel, setMerchantLabel] = useState(credit?.legalName || '');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ZMerchant[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [f, setF] = useState({
    legalName: credit?.legalName || '', contactPerson: credit?.contactPerson || '', phone: credit?.phone || '',
    email: credit?.email || '', amount: credit ? String(credit.amount || '') : '', lang: credit?.lang || 'fr', note: credit?.note || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Recherche parmi les marchands Zentact, avec un léger délai entre les frappes.
  useEffect(() => {
    const needle = search.trim();
    if (needle.length < 2) { setResults([]); return; }
    const h = window.setTimeout(async () => {
      setSearching(true); setSearchErr(null);
      const r = await api<{ merchants: ZMerchant[] }>('GET', `/api/credits/merchants?q=${encodeURIComponent(needle)}`);
      setSearching(false);
      if (r.ok) setResults(r.data.merchants || []); else setSearchErr(t('credits.actionError'));
    }, 300);
    return () => window.clearTimeout(h);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zentact donne le nom et le courriel ; la personne-ressource et le téléphone se saisissent.
  const pick = (m: ZMerchant) => {
    setMerchantId(m.id); setMerchantLabel(m.name); setResults([]); setSearch('');
    setF((p) => ({ ...p, legalName: m.name || p.legalName, email: m.email || p.email }));
  };

  const save = async () => {
    if (!merchantId) { setErr(t('credits.err.merchant_required')); return; }
    setBusy(true); setErr(null);
    const body = { merchantId, ...f };
    const r = credit ? await api('PUT', `/api/credits/${credit.id}`, body) : await api('POST', '/api/credits', body);
    setBusy(false);
    if (!r.ok) { setErr(t(`credits.err.${(r.data as any).error}`, { defaultValue: t('credits.saveError') })); return; }
    onSaved((r.data as any).credit);
  };

  const field = (k: keyof typeof f, label: string, type = 'text') => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-body dark:text-bodydark">{label}</span>
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={INPUT} />
    </label>
  );

  return (
    <Modal title={credit ? t('credits.editTitle', { ref: credit.ref }) : t('credits.newTitle')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-xs font-medium text-body dark:text-bodydark">{t('credits.merchant')}</span>
          {merchantId && (
            <div className="mb-2 flex items-center justify-between rounded border border-success/40 bg-success/5 px-3 py-2 text-sm">
              <span className="text-black dark:text-white">{merchantLabel}</span>
              <span className="text-xs text-body">Zentact · {merchantId}</span>
            </div>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-body" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t(merchantId ? 'credits.changeMerchant' : 'credits.searchMerchant') as string} className={`${INPUT} pl-9`} />
          </div>
          {searching && <p className="mt-1 text-xs text-body">{t('credits.searching')}</p>}
          {searchErr && <p className="mt-1 text-xs text-danger">{searchErr}</p>}
          {results.length > 0 && (
            <ul className="mt-1 max-h-56 overflow-y-auto rounded border border-stroke dark:border-strokedark">
              {results.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => pick(m)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-1 dark:hover:bg-meta-4">
                    <span className="min-w-0 text-black dark:text-white">{m.name || m.id}{m.rep ? <span className="text-body"> · {m.rep}</span> : null}</span>
                    <span className="shrink-0 text-xs text-body">{m.status === 'ACTIVE' ? m.email : t('credits.zentactStatus', { status: m.status })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {search.trim().length >= 2 && !searching && !searchErr && results.length === 0 && <p className="mt-1 text-xs text-body">{t('credits.noMerchant')}</p>}
        </div>

        {field('legalName', t('credits.f.legalName'))}
        <div className="grid gap-4 sm:grid-cols-3">
          {field('contactPerson', t('credits.f.contactPerson'))}
          {field('phone', t('credits.f.phone'))}
          {field('email', t('credits.f.email'), 'email')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-body dark:text-bodydark">{t('credits.f.amount')}</span>
            <div className="flex items-center rounded border border-stroke focus-within:border-primary dark:border-strokedark">
              <input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="min-w-0 flex-1 bg-transparent px-3 py-2 text-right text-sm text-black outline-none dark:text-white" />
              <span className="pr-3 text-xs text-body">$ CAD</span>
            </div>
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-body dark:text-bodydark">{t('credits.f.lang')}</span>
            <div className="inline-flex rounded-lg border border-stroke p-1 dark:border-strokedark">
              {(['fr', 'en'] as const).map((l) => (
                <button key={l} type="button" onClick={() => setF({ ...f, lang: l })}
                  className={`rounded-md px-4 py-1 text-sm font-medium ${f.lang === l ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`}>
                  {l === 'fr' ? 'Français' : 'English'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-body dark:text-bodydark">{t('credits.f.note')}</span>
          <textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={INPUT} placeholder={t('credits.f.notePh') as string} />
        </label>
        {err && <p className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BTN}>{t('credits.cancelBtn')}</button>
          <button type="button" onClick={save} disabled={busy} className={BTN_PRIMARY}>{busy ? t('credits.saving') : t('credits.saveDraft')}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Dossier ─────────────────────────────────────────────────────────────────────────────
function DetailModal({ id, t, money, date, locale, onClose, onChanged, onEdit }: {
  id: string; t: (k: string, o?: any) => string; money: (v: number) => string; date: (d: string | null) => string; locale: string;
  onClose: () => void; onChanged: () => void; onEdit: (c: Credit) => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewer, setViewer] = useState<PdfSource | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const r = await api<Detail>('GET', `/api/credits/${id}`);
    if (!r.ok) { setErr(t('credits.notFound')); return; }
    setD(r.data);
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key: string, path: string, body?: any, confirmMsg?: string) => {
    if (confirmMsg && !(await dialog.confirm(confirmMsg, { confirmText: t('credits.confirm') }))) return null;
    setBusy(key);
    const r = await api(key === 'delete' ? 'DELETE' : 'POST', path, body);
    setBusy(null);
    if (!r.ok) {
      const e = (r.data as any).error;
      const missing = (r.data as any).missing as string[] | undefined;
      dialog.alert(missing ? t('credits.err.incomplete', { fields: missing.map((m) => t(`credits.f.${m === 'customer' ? 'customerShort' : m}`)).join(', ') })
        : t(`credits.err.${e}`, { defaultValue: t('credits.actionError') }));
      return null;
    }
    onChanged();
    return r.data;
  };

  const upload = async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    setBusy('upload');
    const r = await fetch(`${API_URL}/api/credits/${id}/docs`, { method: 'POST', headers: authHeaders(false), body: fd });
    setBusy(null);
    if (!r.ok) {
      const e = (await r.json().catch(() => ({}))).error;
      dialog.alert(t(`credits.err.${e}`, { defaultValue: t('credits.actionError') }));
      return;
    }
    await load(); onChanged();
  };

  const openDoc = async (doc: Doc) => {
    const r = await fetch(`${API_URL}/api/credits/${id}/docs/${doc.id}`, { headers: authHeaders(false) });
    if (!r.ok) { dialog.alert(t('credits.actionError')); return; }
    const url = URL.createObjectURL(await r.blob());
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  if (err) return <Modal title={t('credits.title')} onClose={onClose}><p className="text-sm text-danger">{err}</p></Modal>;
  if (!d) return <Modal title={t('credits.title')} onClose={onClose}><p className="py-10 text-center text-sm text-body">…</p></Modal>;

  const c = d.credit;
  const locked = ['approved', 'rejected', 'cancelled'].includes(c.status);
  const sendable = ['draft', 'sent', 'viewed', 'expired'].includes(c.status);
  const stamp = (v: string | null) => (v ? new Date(v).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  return (
    <Modal wide title={`${c.ref} · ${c.legalName || '—'}`} subtitle={t('credits.byRep', { rep: c.repName || c.repEmail, date: date(c.createdAt) })} onClose={onClose}>
      {viewer && <PdfViewerModal source={viewer} onClose={() => setViewer(null)} />}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge c={c} t={t} />
            <span className="text-2xl font-bold text-black dark:text-white">{money(c.amount)}</span>
            <span className="text-xs text-body">{c.lang === 'en' ? 'English' : 'Français'}</span>
          </div>

          {c.status === 'approved' && c.creditnoteId && (
            <div className="rounded border border-success/40 bg-success/5 p-3 text-sm text-black dark:text-white">
              <Check className="mr-1 inline h-4 w-4 text-success" />{t('credits.booksDone', { number: c.creditnoteNumber || c.creditnoteId })}
            </div>
          )}
          {c.status === 'approved' && !c.creditnoteId && (
            <div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-medium text-black dark:text-white">{t('credits.booksPendingTitle')}</p>
              <p className="mt-1 text-body dark:text-bodydark">{c.booksError}</p>
              {d.canApprove && (
                <button type="button" disabled={!!busy} onClick={async () => { if (await act('retry', `/api/credits/${c.id}/retry-books`)) load(); }} className={`${BTN} mt-2`}>
                  <RefreshCw className="h-4 w-4" />{t('credits.retryBooks')}
                </button>
              )}
            </div>
          )}
          {c.clawback && <ClawbackPanel c={c} t={t} date={date} canDecide={d.canApprove} onDone={() => { load(); onChanged(); }} />}
          {c.status === 'rejected' && <p className="rounded bg-danger/5 p-3 text-sm text-danger">{t('credits.rejectedBy', { who: c.rejectedBy, reason: c.rejectReason })}</p>}
          {c.status === 'declined' && <p className="rounded bg-danger/5 p-3 text-sm text-danger">{t('credits.declinedBy')}{c.declineReason ? ` — ${c.declineReason}` : ''}</p>}

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {([
              ['f.legalName', c.legalName], ['f.contactPerson', c.contactPerson], ['f.phone', c.phone], ['f.email', c.email],
            ] as const).map(([k, v]) => (
              <div key={k}><dt className="text-xs text-body dark:text-bodydark">{t(`credits.${k}`)}</dt><dd className="text-black dark:text-white">{v || '—'}</dd></div>
            ))}
          </dl>
          {c.note && <p className="rounded bg-gray-2 p-3 text-sm text-body dark:bg-meta-4 dark:text-bodydark">{c.note}</p>}

          <BooksLink c={c} t={t} canLink={(d.canEdit || d.canApprove) && !locked} onLinked={() => { load(); onChanged(); }} />

          {/* Pièces justificatives — clause 4 */}
          <div className="rounded border border-stroke p-4 dark:border-strokedark">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-black dark:text-white"><Paperclip className="mr-1 inline h-4 w-4" />{t('credits.docsTitle')}</h4>
              {d.canEdit && !locked && (
                <>
                  <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
                  <button type="button" disabled={busy === 'upload'} onClick={() => fileRef.current?.click()} className={BTN}>
                    <Upload className="h-4 w-4" />{busy === 'upload' ? t('credits.uploading') : t('credits.addDoc')}
                  </button>
                </>
              )}
            </div>
            <p className="mb-3 text-xs text-body dark:text-bodydark">{t('credits.docsHint')}</p>
            {d.docs.length === 0 ? <p className="text-sm text-warning">{t('credits.noDocs')}</p> : (
              <ul className="space-y-1.5">
                {d.docs.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-2 text-sm">
                    <button type="button" onClick={() => openDoc(doc)} className="truncate text-left text-primary hover:underline">{doc.filename}</button>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-body">
                      {Math.max(1, Math.round(doc.size / 1024))} Ko
                      {d.canEdit && !locked && (
                        <button type="button" title={t('credits.removeDoc')} onClick={async () => {
                          if (!(await dialog.confirm(t('credits.removeDocConfirm', { name: doc.filename }), { danger: true }))) return;
                          const r = await fetch(`${API_URL}/api/credits/${c.id}/docs/${doc.id}`, { method: 'DELETE', headers: authHeaders(false) });
                          if (r.ok) { load(); onChanged(); } else dialog.alert(t('credits.actionError'));
                        }} className="text-body hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <button type="button" onClick={() => setViewer({ url: `${API_URL}/api/credits/${c.id}/pdf`, headers: { Authorization: `Bearer ${token()}` }, title: c.ref, filename: `${c.ref}.pdf` })}
            className={`${BTN} w-full justify-center`}>
            <FileText className="h-4 w-4" />{t(c.signedAt ? 'credits.viewSigned' : c.sentAt ? 'credits.viewSent' : 'credits.preview')}
          </button>

          {d.canEdit && sendable && (
            <div className="space-y-2">
              {c.status === 'draft' && (
                <button type="button" onClick={() => onEdit(c)} className={`${BTN} w-full justify-center`}>{t('credits.edit')}</button>
              )}
              <button type="button" disabled={!!busy}
                onClick={async () => { if (await act('send', `/api/credits/${c.id}/send`, undefined, t(c.sentAt ? 'credits.resendConfirm' : 'credits.sendConfirm', { email: c.email }))) load(); }}
                className={`${BTN_PRIMARY} w-full justify-center`}>
                <Send className="h-4 w-4" />{busy === 'send' ? t('credits.sending') : t(c.sentAt ? 'credits.resend' : 'credits.send')}
              </button>
              {c.docCount === 0 && <p className="text-xs text-warning">{t('credits.sendNoDocsHint')}</p>}
            </div>
          )}

          {d.canApprove && c.status === 'signed' && (
            <div className="space-y-2 rounded border border-warning/40 bg-warning/5 p-3">
              <p className="text-sm font-medium text-black dark:text-white">{t('credits.toApprove')}</p>
              {d.docs.length === 0 && <p className="text-xs text-warning">{t('credits.approveNeedsDocs')}</p>}
              {!c.customerId && <p className="text-xs text-warning">{t('credits.approveNeedsBooks')}</p>}
              <button type="button" disabled={!!busy || d.docs.length === 0 || !c.customerId}
                onClick={async () => { if (await act('approve', `/api/credits/${c.id}/approve`, undefined, t('credits.approveConfirm', { amount: money(c.amount), name: c.legalName }))) load(); }}
                className={`${BTN_PRIMARY} w-full justify-center`}>
                <Check className="h-4 w-4" />{busy === 'approve' ? t('credits.approving') : t('credits.approve')}
              </button>
              {!rejecting ? (
                <button type="button" onClick={() => setRejecting(true)} className={`${BTN} w-full justify-center`}>{t('credits.reject')}</button>
              ) : (
                <div className="space-y-2">
                  <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('credits.rejectReason') as string} className={INPUT} />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setRejecting(false)} className={`${BTN} flex-1 justify-center`}>{t('credits.cancelBtn')}</button>
                    <button type="button" disabled={!reason.trim() || !!busy}
                      onClick={async () => { if (await act('reject', `/api/credits/${c.id}/reject`, { reason })) { setRejecting(false); load(); } }}
                      className={`${BTN} flex-1 justify-center border-danger text-danger`}>{t('credits.rejectConfirm')}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <dl className="space-y-1.5 rounded border border-stroke p-3 text-xs dark:border-strokedark">
            {([
              ['sentAt', stamp(c.sentAt)], ['viewedAt', stamp(c.viewedAt)], ['signedAt', stamp(c.signedAt)],
              ['signer', c.signerName ? `${c.signerName}${c.signerTitle ? ` — ${c.signerTitle}` : ''}` : '—'],
              ['commitmentEnd', c.commitmentEnd ? date(c.commitmentEnd) : '—'],
              ['approvedAt', c.approvedAt ? `${stamp(c.approvedAt)} · ${c.approvedBy}` : '—'],
            ] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-body dark:text-bodydark">{t(`credits.info.${k}`)}</dt><dd className="text-right text-black dark:text-white">{v}</dd></div>
            ))}
          </dl>

          {d.canEdit && !locked && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!busy}
                onClick={async () => { if (await act('cancel', `/api/credits/${c.id}/cancel`, undefined, t('credits.cancelConfirm'))) load(); }}
                className={`${BTN} flex-1 justify-center`}>{t('credits.cancelFile')}</button>
              {c.status === 'draft' && (
                <button type="button" disabled={!!busy}
                  onClick={async () => { if (await act('delete', `/api/credits/${c.id}`, undefined, t('credits.deleteConfirm'))) onClose(); }}
                  className={`${BTN} flex-1 justify-center text-danger`}><Trash2 className="h-4 w-4" />{t('credits.delete')}</button>
              )}
            </div>
          )}

          {d.events.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-body dark:text-bodydark">{t('credits.history')}</h4>
              <ol className="space-y-1.5 text-xs">
                {d.events.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-body dark:text-bodydark">{stamp(e.at)}</span>
                    <span className="text-black dark:text-white">{e.description.replace(/^MC-\d{8}-[0-9A-F]{4} — /, '')}{e.actor && e.actor !== 'client' ? <span className="text-body"> · {e.actor}</span> : null}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Relie le dossier au compte Zoho Books qui recevra la note de crédit. La recherche part du nom
// légal du marchand ; l'approbateur (ou l'auteur) choisit le bon compte.
function BooksLink({ c, t, canLink, onLinked }: { c: Credit; t: (k: string, o?: any) => string; canLink: boolean; onLinked: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(c.legalName || '');
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const needle = q.trim();
    if (needle.length < 2) { setResults([]); return; }
    const h = window.setTimeout(async () => {
      setSearching(true); setErr(null);
      const r = await api<{ customers: Customer[] }>('GET', `/api/credits/customers?q=${encodeURIComponent(needle)}`);
      setSearching(false);
      if (r.ok) setResults(r.data.customers || []); else setErr(t('credits.booksError'));
    }, 350);
    return () => window.clearTimeout(h);
  }, [q, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = async (cust: Customer) => {
    setBusy(true); setErr(null);
    const r = await api('POST', `/api/credits/${c.id}/books-customer`, { customerId: cust.id });
    setBusy(false);
    if (!r.ok) { setErr(t(`credits.err.${(r.data as any).error}`, { defaultValue: t('credits.actionError') })); return; }
    setOpen(false); onLinked();
  };

  return (
    <div className={`rounded border p-4 ${c.customerId ? 'border-stroke dark:border-strokedark' : 'border-warning/40 bg-warning/5'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-black dark:text-white">{t('credits.books.title')}</h4>
          <p className="text-xs text-body dark:text-bodydark">{c.customerId ? t('credits.books.linked', { id: c.customerId }) : t('credits.books.notLinked')}</p>
        </div>
        {canLink && !open && (
          <button type="button" onClick={() => setOpen(true)} className={BTN}>{t(c.customerId ? 'credits.books.change' : 'credits.books.link')}</button>
        )}
      </div>
      {open && (
        <div className="mt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-body" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('credits.books.search') as string} className={`${INPUT} pl-9`} />
          </div>
          {searching && <p className="mt-1 text-xs text-body">{t('credits.searching')}</p>}
          {err && <p className="mt-1 text-xs text-danger">{err}</p>}
          {results.length > 0 && (
            <ul className="mt-1 max-h-48 overflow-y-auto rounded border border-stroke dark:border-strokedark">
              {results.map((cu) => (
                <li key={cu.id}>
                  <button type="button" disabled={busy} onClick={() => link(cu)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-1 disabled:opacity-50 dark:hover:bg-meta-4">
                    <span className="text-black dark:text-white">{cu.name}{cu.company && cu.company !== cu.name ? <span className="text-body"> — {cu.company}</span> : null}</span>
                    <span className="truncate text-xs text-body">{cu.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && !searching && !err && results.length === 0 && <p className="mt-1 text-xs text-body">{t('credits.noCustomer')}</p>}
          <button type="button" onClick={() => setOpen(false)} className="mt-2 text-xs text-body hover:underline">{t('credits.cancelBtn')}</button>
        </div>
      )}
    </div>
  );
}

// Reprise avant 36 mois (clause 3). Signalé par la vérification quotidienne quand le marchand est
// fermé dans Zentact avant la fin de l'engagement ; l'approbateur tranche et c'est tracé.
function ClawbackPanel({ c, t, date, canDecide, onDone }: { c: Credit; t: (k: string, o?: any) => string; date: (d: string | null) => string; canDecide: boolean; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const cb = c.clawback!;
  // Mois d'engagement restants au moment du départ détecté (arrondis au mois supérieur).
  const monthsLeft = (() => {
    if (!c.commitmentEnd) return null;
    const [y, m, d] = c.commitmentEnd.split('-').map(Number);
    const end = new Date(y, m - 1, d);
    const from = new Date(cb.flaggedAt);
    return Math.max(0, Math.ceil((end.getTime() - from.getTime()) / (30.44 * 86400000)));
  })();
  const decide = async (decision: 'reclaimed' | 'waived') => {
    if (!(await dialog.confirm(t(`credits.clawback.confirm_${decision}`), { confirmText: t('credits.confirm') }))) return;
    setBusy(true);
    const r = await api('POST', `/api/credits/${c.id}/clawback`, { decision, note });
    setBusy(false);
    if (!r.ok) { dialog.alert(t('credits.actionError')); return; }
    onDone();
  };
  if (cb.status !== 'flagged') {
    return (
      <div className="rounded border border-stroke p-3 text-sm dark:border-strokedark">
        <p className="font-medium text-black dark:text-white">{t(`credits.clawback.${cb.status}`)}</p>
        <p className="mt-0.5 text-xs text-body dark:text-bodydark">{t('credits.clawback.decidedBy', { who: cb.decidedBy, date: date(cb.decidedAt) })}{cb.note ? ` — ${cb.note}` : ''}</p>
      </div>
    );
  }
  return (
    <div className="rounded border border-danger/40 bg-danger/5 p-4 text-sm">
      <p className="font-semibold text-danger">{t('credits.clawback.title')}</p>
      <p className="mt-1 text-black dark:text-white">
        {t('credits.clawback.body', { status: cb.zentactStatus, flagged: date(cb.flaggedAt), end: date(c.commitmentEnd), months: monthsLeft ?? '—' })}
      </p>
      {canDecide && (
        <div className="mt-3 space-y-2">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('credits.clawback.notePh') as string} className={INPUT} />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => decide('reclaimed')} className={BTN_PRIMARY}>{t('credits.clawback.markReclaimed')}</button>
            <button type="button" disabled={busy} onClick={() => decide('waived')} className={BTN}>{t('credits.clawback.markWaived')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
