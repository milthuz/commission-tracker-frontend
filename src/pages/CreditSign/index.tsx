import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ClusterWordmark from '../../components/ClusterWordmark';
import SignaturePad, { type SignaturePadHandle } from '../../components/SignaturePad';
import PdfViewerModal, { type PdfSource } from '../../components/PdfViewerModal';
import { usePassFavicon } from '../Pass/passUi';

const API_URL = import.meta.env.VITE_API_URL;

// Page PUBLIQUE où le marchand REMPLIT et signe son entente de crédit de compensation
// (/credit-sign?token=…, lien reçu par courriel). Aucune session : le jeton est l'autorisation.
//
// Demande de David (2026-09-29) : le client doit pouvoir tout remplir lui-même. La page reprend
// donc le formulaire section par section, en champs web : infos du marchand (préremplies par le
// rep, modifiables), montant offert (fixé par Cluster, en lecture seule), conditions, pièces
// justificatives qu'il peut joindre ici, puis nom, titre et signature. Le PDF final est le même
// gabarit que celui de David, rempli avec CE que le client a saisi ; « Aperçu » le montre avant de signer.
//
// Marque CLUSTER, pas Sales Hub : le marchand fait affaire avec Cluster (même règle que la page de
// signature RH, La Passe et le portail partenaire). La langue suit celle choisie par le rep, avec
// une bascule FR/EN ; getFixedT plutôt que changeLanguage, pour ne pas réécrire la préférence
// enregistrée dans ce navigateur.

interface Doc { id: number; filename: string; size: number }
interface Info {
  ref: string;
  lang: 'fr' | 'en';
  status: 'sent' | 'viewed' | 'signed' | 'declined';
  legalName: string;
  contactPerson: string;
  phone: string;
  email: string;
  amount: number;
  repName: string | null;
  signedAt: string | null;
  commitmentMonths: number;
  docs?: Doc[];
}

type Phase = 'loading' | 'invalid' | 'expired' | 'cancelled' | 'ready' | 'signed' | 'declined' | 'error';
type Field = 'legalName' | 'contactPerson' | 'phone' | 'email';

const INPUT =
  'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 outline-none transition focus:border-[#f26b21] focus:ring-2 focus:ring-[#f26b21]/20';
const INPUT_BAD = ' border-red-400 focus:border-red-500 focus:ring-red-200';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DOC = 10 * 1024 * 1024;

// Mêmes règles que le serveur (clientFields) : un champ refusé ici l'aurait été là-bas.
const invalid = (f: Record<Field, string>): Field[] => {
  const out: Field[] = [];
  if (f.legalName.trim().length < 2) out.push('legalName');
  if (f.contactPerson.trim().length < 2) out.push('contactPerson');
  if (f.phone.replace(/\D/g, '').length < 7) out.push('phone');
  if (!EMAIL_RE.test(f.email.trim())) out.push('email');
  return out;
};

const Section = ({ n, title, children }: { n?: number; title: string; children: React.ReactNode }) => (
  <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
    <h2 className="mb-3 flex items-center gap-3 font-semibold">
      {n != null && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f26b21] text-sm font-bold text-white">{n}</span>}
      {title}
    </h2>
    {children}
  </section>
);

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="flex gap-2.5 text-[15px] leading-relaxed text-gray-700"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#f26b21]" /><span>{children}</span></li>
);

const CreditSign = () => {
  usePassFavicon();
  const { i18n } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [lang, setLang] = useState<'en' | 'fr'>(i18n.language?.startsWith('en') ? 'en' : 'fr');
  const t = i18n.getFixedT(lang);

  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [fields, setFields] = useState<Record<Field, string>>({ legalName: '', contactPerson: '', phone: '', email: '' });
  const [touched, setTouched] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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

  const base = `${API_URL}/api/public/credit-sign/${encodeURIComponent(token)}`;

  useEffect(() => {
    document.title = 'Cluster';
    if (!token) { setPhase('invalid'); return; }
    (async () => {
      try {
        const r = await fetch(base);
        const d = await r.json().catch(() => ({}));
        if (r.status === 410) { setPhase(d.error === 'cancelled' ? 'cancelled' : 'expired'); return; }
        if (!r.ok) { setPhase(r.status === 404 ? 'invalid' : 'error'); return; }
        setInfo(d);
        setLang(d.lang === 'en' ? 'en' : 'fr');
        setFields({ legalName: d.legalName || '', contactPerson: d.contactPerson || '', phone: d.phone || '', email: d.email || '' });
        setPrintName(d.contactPerson || '');
        setDocs(d.docs || []);
        setPhase(d.status === 'signed' ? 'signed' : d.status === 'declined' ? 'declined' : 'ready');
      } catch { setPhase('error'); }
    })();
  }, [token]);

  // Le viewer lit une URL ; l'aperçu est un POST → on lui passe une URL blob, libérée à la fermeture.
  useEffect(() => () => { if (viewer?.url.startsWith('blob:')) URL.revokeObjectURL(viewer.url); }, [viewer]);

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));
  const bad = invalid(fields);
  const money = (v: number) => v.toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = (() => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; })();
  // Le bouton s'active dès que la signature est complète ; si des infos du marchand manquent, le
  // clic les signale (bordure rouge) et remonte jusqu'à elles plutôt que de rester muet.
  const canClick = consent && printName.trim().length > 1 && title.trim().length > 0 && !padEmpty && !busy;
  const body = () => ({ legalName: fields.legalName.trim(), contactPerson: fields.contactPerson.trim(), phone: fields.phone.trim(), email: fields.email.trim() });
  const cls = (k: Field) => INPUT + (touched && bad.includes(k) ? INPUT_BAD : '');

  const preview = async () => {
    setError(null);
    try {
      const r = await fetch(`${base}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()) });
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob());
      setViewer({ url, title: t('creditSign.docTitle') as string, filename: `Cluster_${info?.ref || 'credit'}.pdf` });
    } catch { setError(t('creditSign.previewFailed') as string); }
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setDocError(null);
    for (const file of Array.from(files)) {
      if (file.size > MAX_DOC) { setDocError(t('creditSign.docTooLarge', { name: file.name }) as string); continue; }
      setUploading(true);
      try {
        const fd = new FormData(); fd.append('file', file);
        const r = await fetch(`${base}/docs`, { method: 'POST', body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setDocError(t(d.error === 'bad_type' ? 'creditSign.docBadType' : d.error === 'too_many' ? 'creditSign.docTooMany' : d.error === 'file_too_large' ? 'creditSign.docTooLarge' : 'creditSign.docFailed', { name: file.name }) as string);
        } else setDocs(d.docs || []);
      } catch { setDocError(t('creditSign.docFailed', { name: file.name }) as string); } finally { setUploading(false); }
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const removeDoc = async (id: number) => {
    const r = await fetch(`${base}/docs/${id}`, { method: 'DELETE' }).catch(() => null);
    const d = r && r.ok ? await r.json().catch(() => null) : null;
    if (d) setDocs(d.docs || []); else setDocError(t('creditSign.docFailed', { name: '' }) as string);
  };

  const submit = async () => {
    setTouched(true);
    if (bad.length) { document.getElementById('merchant-info')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const signature = pad.current?.toDataURL();
    if (!signature) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${base}/sign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body(), printName: printName.trim(), title: title.trim(), signature, consent: true }),
      });
      if (!r.ok) throw new Error();
      setPhase('signed');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { setError(t('creditSign.failed') as string); } finally { setBusy(false); }
  };

  const decline = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${base}/decline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      if (!r.ok) throw new Error();
      setPhase('declined');
    } catch { setError(t('creditSign.failed') as string); } finally { setBusy(false); }
  };

  const message = (heading: string, text: string, tone: 'ok' | 'warn' = 'warn', withPdf = false) => (
    <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl ${tone === 'ok' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-[#f26b21]'}`}>
        {tone === 'ok' ? '✓' : '!'}
      </div>
      <h1 className="mb-2 text-xl font-semibold text-gray-900">{heading}</h1>
      <p className="text-[15px] leading-relaxed text-gray-600">{text}</p>
      {withPdf && (
        <button type="button" onClick={() => setViewer({ url: `${base}/pdf`, title: t('creditSign.docTitle') as string, filename: `Cluster_${info?.ref || 'credit'}.pdf` })}
          className="mt-5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-[#f26b21] hover:text-[#f26b21]">
          {t('creditSign.viewSigned')}
        </button>
      )}
    </div>
  );

  const label = (k: string, htmlFor?: string) => <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-800">{t(k)}</label>;

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
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-[#f26b21]">{t('creditSign.eyebrow')}</p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{t('creditSign.formTitle')}</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{t('creditSign.formIntro')}</p>
            </div>

            <section id="merchant-info" className="scroll-mt-4 rounded-2xl border-l-4 border-[#f26b21] bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-[#f26b21]">{t('creditSign.merchantInfo')}</h2>
              <p className="mb-4 text-sm text-gray-500">{t('creditSign.merchantInfoHint')}</p>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    {label('creditSign.legalName', 'cs-legal')}
                    <input id="cs-legal" className={cls('legalName')} value={fields.legalName} onChange={set('legalName')} autoComplete="organization" />
                  </div>
                  <div>
                    {label('creditSign.contactPerson', 'cs-contact')}
                    <input id="cs-contact" className={cls('contactPerson')} value={fields.contactPerson} onChange={set('contactPerson')} autoComplete="name" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    {label('creditSign.phone', 'cs-phone')}
                    <input id="cs-phone" type="tel" inputMode="tel" className={cls('phone')} value={fields.phone} onChange={set('phone')} autoComplete="tel" />
                  </div>
                  <div>
                    {label('creditSign.email', 'cs-email')}
                    <input id="cs-email" type="email" inputMode="email" className={cls('email')} value={fields.email} onChange={set('email')} autoComplete="email" />
                  </div>
                </div>
                {touched && bad.length > 0 && <p className="text-sm text-red-600">{t('creditSign.missingFields')}</p>}
              </div>
            </section>

            <Section n={1} title={t('creditSign.s1Title')}>
              <ul className="space-y-2"><Bullet>{t('creditSign.s1a')}</Bullet><Bullet>{t('creditSign.s1b')}</Bullet></ul>
            </Section>

            <Section n={2} title={t('creditSign.s2Title')}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-orange-50/60 px-4 py-3">
                <span className="text-sm font-medium text-gray-700">{t('creditSign.amountLabel')}</span>
                <span className="text-3xl font-bold text-[#f26b21]">{money(info.amount)} <span className="text-base font-semibold text-gray-700">CAD</span></span>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-gray-700">{t('creditSign.s2Body')}</p>
            </Section>

            <Section n={3} title={t('creditSign.s3Title')}>
              <p className="rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3 text-[15px] leading-relaxed text-gray-800">{t('creditSign.s3Body', { months: info.commitmentMonths })}</p>
            </Section>

            <Section n={4} title={t('creditSign.s4Title')}>
              <ul className="space-y-2"><Bullet>{t('creditSign.s4a')}</Bullet><Bullet>{t('creditSign.s4b')}</Bullet></ul>
              <p className="mt-3 text-sm text-gray-600">{t('creditSign.s4c')}</p>
              <div className="mt-3 space-y-2">
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">✓ {d.filename}</span>
                    <button type="button" onClick={() => removeDoc(d.id)} className="shrink-0 text-gray-500 hover:text-red-600">{t('creditSign.docRemove')}</button>
                  </div>
                ))}
                <input ref={fileInput} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
                <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-4 text-[15px] font-medium text-gray-700 transition hover:border-[#f26b21] hover:text-[#f26b21] disabled:opacity-50">
                  {uploading ? t('creditSign.docUploading') : `＋ ${t('creditSign.docAdd')}`}
                </button>
                <p className="text-xs text-gray-500">{t('creditSign.docHint')}</p>
                {docError && <p className="text-sm text-red-600">{docError}</p>}
              </div>
            </Section>

            <Section title={t('creditSign.ackTitle')}>
              <p className="mb-4 text-[15px] leading-relaxed text-gray-700">{t('creditSign.ackBody')}</p>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    {label('creditSign.printName', 'cs-name')}
                    <input id="cs-name" className={INPUT} value={printName} onChange={(e) => setPrintName(e.target.value)} autoComplete="name" />
                  </div>
                  <div>
                    {label('creditSign.title', 'cs-title')}
                    <input id="cs-title" className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="organization-title" />
                  </div>
                  <div>
                    {label('creditSign.date')}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[15px] text-gray-700">{today}</div>
                  </div>
                </div>
                <div>
                  {label('creditSign.signature')}
                  <SignaturePad ref={pad} clearLabel={t('creditSign.clear')} placeholder={t('creditSign.drawHere')} onChange={setPadEmpty} />
                </div>
                <label className="flex cursor-pointer items-start gap-3 text-[15px]">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[#f26b21]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>{t('creditSign.consent')}</span>
                </label>
              </div>

              {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={preview}
                  className="rounded-xl border border-gray-300 px-5 py-3.5 text-[15px] font-medium text-gray-700 transition hover:border-[#f26b21] hover:text-[#f26b21] sm:w-auto">
                  {t('creditSign.preview')}
                </button>
                <button type="button" onClick={submit} disabled={!canClick}
                  className="flex-1 rounded-xl bg-[#f26b21] px-6 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#dc5a14] disabled:cursor-not-allowed disabled:opacity-40">
                  {busy ? t('creditSign.signing') : t('creditSign.submit')}
                </button>
              </div>
              <p className="mt-3 text-center text-xs leading-relaxed text-gray-500">{t('creditSign.legal')}</p>
            </Section>

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
      <footer className="pb-8 text-center text-xs text-gray-400">
        {t('creditSign.confidential')} © {new Date().getFullYear()} Cluster Systems · clusterpos.com
      </footer>
    </div>
  );
};

export default CreditSign;
