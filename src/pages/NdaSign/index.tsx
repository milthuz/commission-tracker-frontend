import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ClusterWordmark from '../../components/ClusterWordmark';
import SignaturePad, { type SignaturePadHandle } from '../../components/SignaturePad';
import PdfViewerModal, { type PdfSource } from '../../components/PdfViewerModal';
import { usePassFavicon } from '../Pass/passUi';

const API_URL = import.meta.env.VITE_API_URL;

// Page PUBLIQUE où l'autre partie lit et signe le NDA (/nda-sign?token=…, lien reçu par
// courriel). Aucune session : le jeton est l'autorisation. Marque CLUSTER, pas Sales Hub.
// La langue suit celle de l'entente, avec une bascule FR/EN (getFixedT : la préférence de
// langue enregistrée dans ce navigateur n'est pas réécrite). Même construction que pages/Sign.

interface Info {
  ref: string;
  status: 'viewed' | 'party_signed' | 'completed' | 'declined';
  firstName: string;
  name: string;
  title: string;
  company: string;
  lang: 'en' | 'fr';
  mode: 'template' | 'upload';
  clusterSigner: { name: string; title: string };
  senderName: string | null;
  documents: { key: string; kind: 'nda' | 'sigpage' | 'attachment'; title?: string; pages: number | null }[];
}
type Phase = 'loading' | 'invalid' | 'expired' | 'cancelled' | 'ready' | 'signed' | 'declined' | 'error';

const INPUT =
  'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

const NdaSign = () => {
  usePassFavicon();
  const { i18n } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [lang, setLang] = useState<'en' | 'fr'>(i18n.language?.startsWith('fr') ? 'fr' : 'en');
  const t = i18n.getFixedT(lang);

  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [readAll, setReadAll] = useState(false);
  const [consent, setConsent] = useState(false);
  const [fullName, setFullName] = useState('');
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
        const r = await fetch(`${API_URL}/api/public/nda-sign/${encodeURIComponent(token)}`);
        const d = await r.json().catch(() => ({}));
        if (r.status === 410) { setPhase(d.error === 'cancelled' ? 'cancelled' : 'expired'); return; }
        if (!r.ok) { setPhase(r.status === 404 ? 'invalid' : 'error'); return; }
        setInfo(d);
        setLang(d.lang === 'fr' ? 'fr' : 'en');
        setFullName(d.name || '');
        setTitle(d.title || '');
        setPhase(d.status === 'viewed' ? 'ready' : d.status === 'declined' ? 'declined' : 'signed');
      } catch { setPhase('error'); }
    })();
  }, [token]);

  // « Inc. » en fin de phrase : on retire le point du nom, la phrase fournit le sien.
  const coEnd = (info?.company || '').replace(/\.$/, '');
  const docUrl = (key: string) => `${API_URL}/api/public/nda-sign/${encodeURIComponent(token)}/doc/${key}`;
  const docTitle = (d: Info['documents'][number]) => (d.kind === 'attachment' ? d.title || '' : t(d.kind === 'sigpage' ? 'ndaSign.sigpage' : 'ndaSign.docNda') as string);
  const allOpened = !!info && info.documents.every((d) => opened[d.key]);
  const canSign = readAll && consent && fullName.trim().length > 1 && title.trim().length > 0 && !padEmpty && !busy;

  const submit = async () => {
    const signature = pad.current?.toDataURL();
    if (!signature) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/public/nda-sign/${encodeURIComponent(token)}/sign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), title: title.trim(), signature, consent: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error === 'already_signed' ? (t('sign.alreadySigned') as string) : (t('sign.failed') as string));
      setPhase('signed');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) { setError(e?.message || (t('sign.failed') as string)); } finally { setBusy(false); }
  };
  const decline = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/public/nda-sign/${encodeURIComponent(token)}/decline`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      });
      if (!r.ok) throw new Error();
      setPhase('declined');
    } catch { setError(t('sign.failed') as string); } finally { setBusy(false); }
  };

  const message = (heading: string, body: string, tone: 'ok' | 'warn' = 'warn') => (
    <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl ${tone === 'ok' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-accent-ink'}`}>{tone === 'ok' ? '✓' : '!'}</div>
      <h1 className="mb-2 text-xl font-semibold text-gray-900">{heading}</h1>
      <p className="text-[15px] leading-relaxed text-gray-600">{body}</p>
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
                className={`rounded-full px-3 py-1 transition ${lang === l ? 'bg-white text-gray-900' : 'text-white/80 hover:text-white'}`}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="h-1 bg-primary" />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {phase === 'loading' && <p className="py-20 text-center text-gray-500">{t('sign.loading')}</p>}
        {phase === 'invalid' && message(t('sign.invalidTitle'), t('ndaSign.invalidBody'))}
        {phase === 'expired' && message(t('sign.expiredTitle'), t('ndaSign.expiredBody'))}
        {phase === 'cancelled' && message(t('sign.cancelledTitle'), t('ndaSign.cancelledBody'))}
        {phase === 'error' && message(t('sign.errorTitle'), t('sign.errorBody'))}
        {phase === 'declined' && message(t('sign.declinedTitle'), t('ndaSign.declinedBody'))}
        {phase === 'signed' && info && message(t('ndaSign.signedTitle', { name: info.firstName }), t('ndaSign.signedBody', { name: info.clusterSigner.name }), 'ok')}

        {phase === 'ready' && info && (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-accent-ink">{t('ndaSign.eyebrow')}</p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{t('sign.hello', { name: info.firstName })}</h1>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{t('ndaSign.intro', { company: coEnd, sender: info.senderName || 'Cluster' })}</p>
            </div>

            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
              <h2 className="mb-1 font-semibold">{t('ndaSign.step1')}</h2>
              <p className="mb-4 text-sm text-gray-600">{t('ndaSign.step1Hint')}</p>
              <ul className="space-y-2">
                {info.documents.map((d) => (
                  <li key={d.key}>
                    <button type="button"
                      onClick={() => { setOpened((o) => ({ ...o, [d.key]: true })); setViewer({ url: docUrl(d.key), title: docTitle(d), filename: `Cluster_NDA_${d.key}.pdf` }); }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left transition hover:border-primary hover:bg-orange-50/40">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-bold text-accent-ink">PDF</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-medium">{docTitle(d)}</span>
                          {d.pages && <span className="block text-xs text-gray-500">{t('sign.pages', { n: d.pages, count: d.pages })}</span>}
                        </span>
                      </span>
                      <span className={`shrink-0 text-sm font-medium ${opened[d.key] ? 'text-green-700' : 'text-accent-ink'}`}>{opened[d.key] ? `✓ ${t('sign.opened')}` : t('sign.open')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
              <h2 className="mb-4 font-semibold">{t('sign.step2')}</h2>
              <div className="space-y-4">
                <label className="flex cursor-pointer items-start gap-3 text-[15px]">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={readAll} onChange={(e) => setReadAll(e.target.checked)} />
                  <span>{t('ndaSign.readAll', { company: coEnd })}{!allOpened && <span className="block text-xs text-gray-500">{t('sign.notAllOpened')}</span>}</span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 text-[15px]">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span>{t('sign.consent')}</span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">{t('sign.fullName')}</label>
                    <input className={INPUT} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">{t('ndaSign.title')}</label>
                    <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="organization-title" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('sign.signature')}</label>
                  <SignaturePad ref={pad} clearLabel={t('sign.clear')} placeholder={t('sign.drawHere')} onChange={setPadEmpty} />
                </div>
              </div>
              {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <button type="button" onClick={submit} disabled={!canSign}
                className="mt-5 w-full rounded-xl bg-primary px-6 py-3.5 text-[15px] font-semibold text-[#141414] shadow-sm transition hover:bg-[#F79C6A] disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? t('sign.signing') : t('ndaSign.submit', { company: info.company })}
              </button>
              <p className="mt-3 text-center text-xs leading-relaxed text-gray-500">{t('ndaSign.legal', { company: info.company, name: info.clusterSigner.name })}</p>
            </section>

            <div className="text-center">
              {!declining ? (
                <button type="button" onClick={() => setDeclining(true)} className="text-sm text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline">{t('ndaSign.declineLink')}</button>
              ) : (
                <div className="rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-200">
                  <h3 className="mb-2 font-semibold">{t('ndaSign.declineTitle')}</h3>
                  <textarea rows={3} className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('ndaSign.declinePh') as string} />
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => setDeclining(false)} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">{t('sign.back')}</button>
                    <button type="button" onClick={decline} disabled={busy} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t('ndaSign.declineConfirm')}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <footer className="pb-8 text-center text-xs text-gray-400">© {new Date().getFullYear()} Cluster Systems · clustersystems.com</footer>
    </div>
  );
};

export default NdaSign;
