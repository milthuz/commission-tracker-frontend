import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ClusterWordmark from '../../components/ClusterWordmark';
import SignaturePad, { type SignaturePadHandle } from '../../components/SignaturePad';
import PdfViewerModal, { type PdfSource } from '../../components/PdfViewerModal';
import { usePassFavicon } from '../Pass/passUi';

const API_URL = import.meta.env.VITE_API_URL;

// Page PUBLIQUE où le marchand lit et signe son entente de crédit de compensation
// (/credit-sign?token=…, lien reçu par courriel). Aucune session : le jeton est l'autorisation.
//
// Marque CLUSTER, pas Sales Hub : le marchand fait affaire avec Cluster (même règle que la page de
// signature RH, La Passe et le portail partenaire). La langue suit celle choisie par le rep, avec
// une bascule FR/EN ; getFixedT plutôt que changeLanguage, pour ne pas réécrire la préférence
// enregistrée dans ce navigateur.

interface Info {
  ref: string;
  lang: 'fr' | 'en';
  status: 'sent' | 'viewed' | 'signed' | 'declined';
  legalName: string;
  contactPerson: string;
  amount: number;
  repName: string | null;
  signedAt: string | null;
  commitmentMonths: number;
}

type Phase = 'loading' | 'invalid' | 'expired' | 'cancelled' | 'ready' | 'signed' | 'declined' | 'error';

const INPUT =
  'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 outline-none transition focus:border-[#f26b21] focus:ring-2 focus:ring-[#f26b21]/20';

const CreditSign = () => {
  usePassFavicon();
  const { i18n } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [lang, setLang] = useState<'en' | 'fr'>(i18n.language?.startsWith('en') ? 'en' : 'fr');
  const t = i18n.getFixedT(lang);

  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [opened, setOpened] = useState(false);
  const [consent, setConsent] = useState(false);
  const [printName, setPrintName] = useState('');
  const [title, setTitle] = useState('');
  const [padEmpty, setPadEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const pad = useRef<SignaturePadHandle>(null);
  const [viewer, setViewer] = useState<PdfSource | null>(null);

  useEffect(() => {
    document.title = 'Cluster';
    if (!token) { setPhase('invalid'); return; }
    (async () => {
      try {
        const r = await fetch(`${API_URL}/api/public/credit-sign/${encodeURIComponent(token)}`);
        const d = await r.json().catch(() => ({}));
        if (r.status === 410) { setPhase(d.error === 'cancelled' ? 'cancelled' : 'expired'); return; }
        if (!r.ok) { setPhase(r.status === 404 ? 'invalid' : 'error'); return; }
        setInfo(d);
        setLang(d.lang === 'en' ? 'en' : 'fr');
        setPrintName(d.contactPerson || '');
        setPhase(d.status === 'signed' ? 'signed' : d.status === 'declined' ? 'declined' : 'ready');
      } catch { setPhase('error'); }
    })();
  }, [token]);

  const pdfUrl = `${API_URL}/api/public/credit-sign/${encodeURIComponent(token)}/pdf`;
  const money = (v: number) => v.toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const canSign = opened && consent && printName.trim().length > 1 && title.trim().length > 0 && !padEmpty && !busy;

  const submit = async () => {
    const signature = pad.current?.toDataURL();
    if (!signature) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/public/credit-sign/${encodeURIComponent(token)}/sign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printName: printName.trim(), title: title.trim(), signature, consent: true }),
      });
      if (!r.ok) throw new Error();
      setPhase('signed');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { setError(t('creditSign.failed') as string); } finally { setBusy(false); }
  };

  const decline = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/public/credit-sign/${encodeURIComponent(token)}/decline`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      if (!r.ok) throw new Error();
      setPhase('declined');
    } catch { setError(t('creditSign.failed') as string); } finally { setBusy(false); }
  };

  const message = (heading: string, body: string, tone: 'ok' | 'warn' = 'warn', withPdf = false) => (
    <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl ${tone === 'ok' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-[#f26b21]'}`}>
        {tone === 'ok' ? '✓' : '!'}
      </div>
      <h1 className="mb-2 text-xl font-semibold text-gray-900">{heading}</h1>
      <p className="text-[15px] leading-relaxed text-gray-600">{body}</p>
      {withPdf && (
        <button type="button" onClick={() => setViewer({ url: pdfUrl, title: t('creditSign.docTitle') as string, filename: `Cluster_${info?.ref || 'credit'}.pdf` })}
          className="mt-5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-[#f26b21] hover:text-[#f26b21]">
          {t('creditSign.viewSigned')}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f6f5f3] text-gray-900">
      {viewer && <PdfViewerModal source={viewer} onClose={() => setViewer(null)} tr={(k, o) => t(k, o) as string} />}
      <header className="bg-[#1f1f1f]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <ClusterWordmark tone="dark" className="h-[24px] w-auto" />
          <div className="flex rounded-full bg-white/10 p-0.5 text-xs font-medium">
            {(['fr', 'en'] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)}
                className={`rounded-full px-3 py-1 transition ${lang === l ? 'bg-white text-gray-900' : 'text-white/80 hover:text-white'}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="h-1 bg-[#f26b21]" />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {phase === 'loading' && <p className="py-20 text-center text-gray-500">{t('creditSign.loading')}</p>}
        {phase === 'invalid' && message(t('creditSign.invalidTitle'), t('creditSign.invalidBody'))}
        {phase === 'expired' && message(t('creditSign.expiredTitle'), t('creditSign.expiredBody'))}
        {phase === 'cancelled' && message(t('creditSign.cancelledTitle'), t('creditSign.cancelledBody'))}
        {phase === 'error' && message(t('creditSign.errorTitle'), t('creditSign.errorBody'))}
        {phase === 'declined' && message(t('creditSign.declinedTitle'), t('creditSign.declinedBody'))}
        {phase === 'signed' && info && message(t('creditSign.signedTitle'), t('creditSign.signedBody'), 'ok', true)}

        {phase === 'ready' && info && (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-[#f26b21]">{t('creditSign.eyebrow')}</p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{t('creditSign.hello', { name: info.contactPerson || info.legalName })}</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{t('creditSign.intro', { company: info.legalName })}</p>
            </div>

            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-gray-500">{t('creditSign.amountLabel')}</span>
                <span className="text-3xl font-bold text-[#f26b21]">{money(info.amount)}</span>
              </div>
              <p className="mt-2 text-sm text-gray-600">{t('creditSign.clawback', { months: info.commitmentMonths })}</p>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
              <h2 className="mb-1 font-semibold">{t('creditSign.step1')}</h2>
              <p className="mb-4 text-sm text-gray-600">{t('creditSign.step1Hint')}</p>
              <button type="button"
                onClick={() => { setOpened(true); setViewer({ url: pdfUrl, title: t('creditSign.docTitle') as string, filename: `Cluster_${info.ref}.pdf` }); }}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left transition hover:border-[#f26b21] hover:bg-orange-50/40">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-bold text-[#f26b21]">PDF</span>
                  <span className="min-w-0 truncate text-[15px] font-medium">{t('creditSign.docTitle')}</span>
                </span>
                <span className={`shrink-0 text-sm font-medium ${opened ? 'text-green-700' : 'text-[#f26b21]'}`}>
                  {opened ? `✓ ${t('creditSign.opened')}` : t('creditSign.open')}
                </span>
              </button>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
              <h2 className="mb-4 font-semibold">{t('creditSign.step2')}</h2>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">{t('creditSign.printName')}</label>
                    <input className={INPUT} value={printName} onChange={(e) => setPrintName(e.target.value)} autoComplete="name" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">{t('creditSign.title')}</label>
                    <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="organization-title" />
                  </div>
                </div>
                <label className="flex cursor-pointer items-start gap-3 text-[15px]">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[#f26b21]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>{t('creditSign.consent')}{!opened && <span className="block text-xs text-gray-500">{t('creditSign.notOpened')}</span>}</span>
                </label>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('creditSign.signature')}</label>
                  <SignaturePad ref={pad} clearLabel={t('creditSign.clear')} placeholder={t('creditSign.drawHere')} onChange={setPadEmpty} />
                </div>
              </div>

              {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

              <button type="button" onClick={submit} disabled={!canSign}
                className="mt-5 w-full rounded-xl bg-[#f26b21] px-6 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#dc5a14] disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? t('creditSign.signing') : t('creditSign.submit')}
              </button>
              <p className="mt-3 text-center text-xs leading-relaxed text-gray-500">{t('creditSign.legal')}</p>
            </section>

            <div className="text-center">
              {!declining ? (
                <button type="button" onClick={() => setDeclining(true)} className="text-sm text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline">
                  {t('creditSign.declineLink')}
                </button>
              ) : (
                <div className="rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-200">
                  <h3 className="mb-2 font-semibold">{t('creditSign.declineTitle')}</h3>
                  <textarea rows={3} className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('creditSign.declinePh') as string} />
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setDeclining(false)} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">{t('creditSign.back')}</button>
                    <button type="button" onClick={decline} disabled={busy} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t('creditSign.declineConfirm')}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <footer className="pb-8 text-center text-xs text-gray-400">© {new Date().getFullYear()} Cluster Systems · clusterpos.com</footer>
    </div>
  );
};

export default CreditSign;
