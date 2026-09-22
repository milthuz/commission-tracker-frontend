import { useEffect, useRef, useState } from 'react';
import Select from '../components/Select';
import { useTranslation } from 'react-i18next';
import { Search, ChevronDown, Mail, Check, Clock, AlertTriangle, CreditCard } from 'lucide-react';

// The support desk's page. A merchant calls, an agent types whatever the caller gave them — a
// name, a subscription number, a merchant id — and gets that one account's facts. Read-only by
// design and on its own permission: answering a call must never require the ability to build a
// scenario, email anyone, or write to Zoho.
//
// The FAQ lives on the same page rather than in a document somewhere. An agent with a customer on
// the line does not go looking for a second tab.

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface Hit {
  id: number;
  customerName: string;
  subscriptionNumber: string;
  merchantAccountId: string | null;
  orgId: string;
  orgName: string;
  planName: string;
  currentPrice: number | null;
  newPrice: number | null;
  effectiveDate: string | null;
  pushStatus: string;
  pushedAt: string | null;
  // La case cochee dans Zoho, et l'etat de la ligne dans la campagne. Les deux peuvent differer
  // le temps d'un passage du pilote : la case fait foi, c'est l'engagement pris au marchand.
  priceFrozen?: boolean;
  excluded?: boolean;
  notifyStatus: string;
  notifyTo: string | null;
  notifiedAt: string | null;
  notifySubject: string | null;
  notifyBody: string | null;
  scenarioName: string;
  // null = aucun compte de paiement TROUVE. Ce n'est pas la meme chose que « ce marchand n'a
  // pas le paiement » : le rapprochement se fait surtout par nom.
  payments: {
    merchantAccountId: string | null;
    businessName: string | null;
    status: string;
    since: string | null;
    matchedBy: 'link' | 'name';
  } | null;
}

// Les options facturees a ce marchand. Pas en base : un appel Zoho par abonnement.
type Fees = {
  cadenceMonths: number;
  addons: { code: string; name: string; quantity: number; pricePeriod: number; monthly: number; isPayment: boolean }[];
  paymentFees: { code: string; name: string; monthly: number }[];
  monthlySaving: number;
  yearlySaving: number;
  // Le prix a annoncer si le marchand passe au paiement Cluster : le nouveau prix moins les
  // frais d'integration qu'il paie aujourd'hui. null quand il n'en paie aucun.
  withPayments: {
    periodPrice: number; monthlyPrice: number; belowZero: boolean;
    newPrice: number; currentPrice: number; feesPeriod: number;
  } | null;
};

const money = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD' }).format(n);

// Parsed into local parts: new Date('2026-09-17') is UTC midnight and renders as the 16th in every
// North American timezone — the same off-by-one that once put the wrong date in customer emails.
const fmtDate = (raw: string | null, locale: string) => {
  if (!raw) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
};

const FAQ_KEYS = ['why', 'howMuch', 'when', 'notice', 'refuse', 'cancel', 'noNotice', 'escalate'];

// Le Select partage remplace son habillage quand on lui passe `buttonClassName` : on reprend
// l'allure du champ de recherche au-dessus, en plus discret.
const FILTRE = 'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-left text-sm '
  + 'outline-none transition focus:border-primary dark:border-[#242424] dark:bg-[#0A0A0A] dark:text-white';

export default function SaasIncreaseLookup() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  // Les fiches que l'agent a BASCULEES par rapport a l'etat par defaut. La page rendait une
  // fiche COMPLETE — prix, frais, statut de paiement, courriel recu, bouton d'opportunite —
  // pour chacun des cinquante marchands de la liste d'ouverture : lourde a charger, illisible
  // a parcourir. Un ensemble de bascules plutot qu'une fiche « ouverte », parce qu'il faut
  // pouvoir REFERMER aussi — y compris sur une recherche etroite ou tout est deplie d'office.
  const [bascule, setBascule] = useState<Set<string>>(new Set());
  const basculer = (n: string) => setBascule((prev) => {
    const copie = new Set(prev);
    if (copie.has(n)) copie.delete(n); else copie.add(n);
    return copie;
  });
  // Cet ecran s'ouvrait sur une page VIDE : il fallait deviner quoi taper pour voir quoi que ce
  // soit. Il s'ouvre desormais sur la LISTE des marchands, et la recherche ne fait que la
  // reduire. `total` dit combien il y en a, pour que « 50 affiches » ne se lise pas « 50 en tout ».
  const [total, setTotal] = useState(0);
  const [suite, setSuite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEmail, setOpenEmail] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  // « Quoi repondre » est le script que l'agent lit AU TELEPHONE. Il vivait tout en bas, sous
  // cinquante lignes de resultats — donc hors de portee au moment ou il sert. Il remonte sous la
  // recherche, replié : une ligne quand on n'en a pas besoin, un clic quand on en a besoin.
  const [faqOuvert, setFaqOuvert] = useState(false);
  const [org, setOrg] = useState('');
  const [avis, setAvis] = useState('');
  const [etat, setEtat] = useState('');
  // Les frais d'integration demandent un appel Zoho par abonnement, donc on ne les charge que
  // sur demande et une seule fois. L'etat 'loading' evite le double appel au re-rendu.
  const [fees, setFees] = useState<Record<string, Fees | 'loading' | 'error'>>({});
  // Une opportunite creee ne se cree pas deux fois : on garde le resultat par abonnement.
  const [deal, setDeal] = useState<Record<string,
    { state: 'loading' }
    | { state: 'done'; id: string; name: string; stage: string; owner: string; noteOk: boolean }
    | { state: 'dup'; existing: { module: string; company: string; id: string; stage?: string; owner?: string }[] }
    // Aucun compte Zoho sur ce nom. On ne cree rien — une opportunite orpheline ne remonte
    // sur la fiche d'aucun marchand — et on rend la main avec les candidats trouves.
    | { state: 'noAccount'; searched: string; candidates: { id: string; name: string; city?: string | null }[] }
    | { state: 'error'; msg: string }>>({});

  const creerOpportunite = async (h: Hit, force = false, accountId?: string) => {
    const cle = h.subscriptionNumber;
    if (deal[cle]?.state === 'loading' || deal[cle]?.state === 'done') return;
    setDeal(d => ({ ...d, [cle]: { state: 'loading' } }));
    const f = fees[cle];
    try {
      const r = await fetch(`${API_URL}/api/saas-increase/lookup/deal`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: h.orgId, subscriptionNumber: h.subscriptionNumber, createAnyway: force,
          ...(accountId ? { accountId } : {}),
          // Les chiffres deja affiches a l'agent partent avec l'opportunite : le vendeur qui
          // rappelle dans trois jours n'aura pas cet ecran sous les yeux.
          ...(typeof f === 'object'
            ? { paymentFees: f.paymentFees, monthlySaving: f.monthlySaving,
                withPayments: f.withPayments } : {}),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.duplicate) {
        setDeal(d => ({ ...d, [cle]: { state: 'dup', existing: data.existing || [] } }));
      } else if (r.ok && data.noAccount) {
        setDeal(d => ({ ...d, [cle]: {
          state: 'noAccount', searched: data.searched || h.customerName || '',
          candidates: data.candidates || [] } }));
      } else if (r.ok && data.ok) {
        setDeal(d => ({ ...d, [cle]: { state: 'done', id: data.dealId, name: data.dealName,
                                       stage: data.stage, owner: data.owner || '',
                                       noteOk: data.noteOk !== false } }));
      } else {
        setDeal(d => ({ ...d, [cle]: { state: 'error', msg: data.error || `HTTP ${r.status}` } }));
      }
    } catch (e) {
      setDeal(d => ({ ...d, [cle]: { state: 'error', msg: String(e) } }));
    }
  };

  // Les frais s'affichent sans qu'on les demande : un agent au telephone n'a pas a deviner
  // qu'un bouton cache l'argument dont il a besoin. Deux bornes, parce que chaque fiche coute
  // un appel Zoho : seulement les marchands SANS paiement chez nous — les autres n'ont rien a
  // economiser — et seulement quand la recherche a converge sur peu de resultats. Au-dela, le
  // bouton reste disponible fiche par fiche.
  // Une recherche qui a converge sur deux ou trois marchands, c'est l'agent au telephone : il
  // veut tout, tout de suite. Une liste de cinquante, c'est quelqu'un qui cherche — il veut
  // d'abord trouver. Meme seuil d'esprit que AUTO_MAX plus bas, qui borne les appels Zoho.
  const DETAIL_MAX = 3;

  const AUTO_MAX = 5;
  useEffect(() => {
    if (!hits || hits.length === 0 || hits.length > AUTO_MAX) return;
    hits.filter(h => !h.payments).forEach(h => { void chargerFrais(h); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits]);

  const chargerFrais = async (h: Hit) => {
    if (fees[h.subscriptionNumber]) return;
    setFees(f => ({ ...f, [h.subscriptionNumber]: 'loading' }));
    try {
      const r = await fetch(
        `${API_URL}/api/saas-increase/lookup/fees?org=${encodeURIComponent(h.orgId)}`
        + `&sub=${encodeURIComponent(h.subscriptionNumber)}`, { headers: authHeaders() });
      const data = r.ok ? ((await r.json()) as Fees) : 'error';
      setFees(f => ({ ...f, [h.subscriptionNumber]: data }));
    } catch { setFees(f => ({ ...f, [h.subscriptionNumber]: 'error' })); }
  };

  // La recherche partait a CHAQUE FRAPPE. Tolerable tant qu'elle ne touchait que Postgres ;
  // plus du tout maintenant que l'affichage des frais appelle Zoho par resultat. On attend que
  // l'agent ait fini de taper.
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saisir = (term: string) => {
    setQ(term);
    if (minuterie.current) clearTimeout(minuterie.current);
    setLoading(true);
    // Effacer la recherche ne vide plus l'ecran : on revient a la liste complete.
    minuterie.current = setTimeout(() => search(term), 350);
  };

  const search = async (term: string, offset = 0) => {
    if (offset === 0) { setLoading(true); setBascule(new Set()); } else setSuite(true);
    setError(null);
    try {
      const mot = term.trim();
      // Les filtres partent au SERVEUR : ils doivent porter sur toute la campagne, pas sur les
      // cinquante lignes deja chargees.
      const r = await fetch(`${API_URL}/api/saas-increase/lookup`
        + `?q=${encodeURIComponent(mot.length >= 2 ? mot : '')}&offset=${offset}`
        + (org ? `&org=${encodeURIComponent(org)}` : '')
        + (avis ? `&notify=${encodeURIComponent(avis)}` : '')
        + (etat ? `&state=${encodeURIComponent(etat)}` : ''),
        { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      // On AJOUTE quand on demande la suite, sinon la liste repartirait du debut a chaque page.
      setHits(prev => (offset > 0 && prev ? [...prev, ...(d.results || [])] : (d.results || [])));
      setTotal(d.total ?? (d.results || []).length);
    } catch {
      setError(t('csLookup.error') as string);
      setHits(null);
    } finally { setLoading(false); setSuite(false); }
  };

  // La liste s'affiche a l'ouverture. Aucun appel Zoho n'en decoule : le chargement automatique
  // des frais reste borne a cinq resultats, donc il ne part qu'apres une recherche qui a
  // converge. C'est ce qui rend cette page sure a ouvrir — l'inverse nous a valu un blocage de
  // quota le 2026-09-15.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void search(''); }, []);

  // Un filtre est un CLIC, pas une frappe : on relance tout de suite, sans attendre 350 ms.
  const premierRendu = useRef(true);
  useEffect(() => {
    if (premierRendu.current) { premierRendu.current = false; return; }
    void search(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, avis, etat]);

  const card = 'rounded-2xl border border-gray-200 bg-white dark:border-[#1B1B1B] dark:bg-[#0E0F11]';
  const textPri = 'text-gray-900 dark:text-white';
  const textSec = 'text-gray-600 dark:text-[#D1D1D1]';
  const textTer = 'text-gray-500 dark:text-[#999AA7]';
  const textQuat = 'text-gray-400 dark:text-[#61646C]';

  // Notice state is the first thing an agent must know: whether this merchant was told, and when.
  // "They were never emailed" changes the whole conversation, so it is a badge, not a footnote.
  const noticeBadge = (h: Hit) => {
    if (h.notifyStatus === 'sent') {
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <Check className="h-3 w-3" />
          {t('csLookup.noticeSent', { date: fmtDate(h.notifiedAt, i18n.language) })}
        </span>
      );
    }
    if (h.notifyStatus === 'send_failed') {
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" /> {t('csLookup.noticeFailed')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
        <Clock className="h-3 w-3" /> {t('csLookup.noticeNotSent')}
      </span>
    );
  };

  // Version courte du badge, pour la liste : un agent qui parcourt veut la couleur et le mot,
  // pas la date. La date est dans la fiche, qui est a un clic.
  const pastilleCourte = (h: Hit) => {
    const base = 'whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium';
    if (h.priceFrozen || h.excluded) {
      return <span className={`${base} bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400`}>
        {t(h.priceFrozen ? 'csLookup.shortFrozen' : 'csLookup.shortExcluded')}</span>;
    }
    if (h.notifyStatus === 'sent') {
      return <span className={`${base} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400`}>
        {t('csLookup.shortSent')}</span>;
    }
    if (h.notifyStatus === 'send_failed') {
      return <span className={`${base} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400`}>
        {t('csLookup.shortFailed')}</span>;
    }
    return <span className={`${base} bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400`}>
      {t('csLookup.shortNotSent')}</span>;
  };

  // Deplie d'office quand la recherche a converge ; l'agent peut replier, et deplier une ligne
  // de la longue liste. `!==` sur deux booleens, c'est le OU exclusif : l'etat par defaut,
  // inverse pour les fiches que l'agent a touchees.
  const parDefautDeplie = hits ? hits.length <= DETAIL_MAX : false;
  const deplie = (h: Hit) => parDefautDeplie !== bascule.has(h.subscriptionNumber);

  return (
    <div className="font-satoshi">
      <div className="mb-6">
        <h2 className={`text-title-md2 font-semibold ${textPri}`}>{t('csLookup.title')}</h2>
        <p className="mt-1 text-sm text-body">{t('csLookup.subtitle')}</p>
      </div>

      <div className={`${card} mb-4 p-4`}>
        <div className="relative">
          <Search className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${textQuat}`} />
          <input
            autoFocus
            value={q}
            onChange={(e) => saisir(e.target.value)}
            placeholder={t('csLookup.placeholder') as string}
            className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-primary dark:border-[#242424] dark:bg-[#0A0A0A] dark:text-white"
          />
        </div>
        {/* Trois filtres, dans la carte de recherche et non flottants a cote du titre. */}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[150px]">
            <label className={`mb-1 block text-xs font-medium ${textTer}`}>{t('csLookup.filterOrg')}</label>
            <Select value={org} onChange={setOrg} buttonClassName={FILTRE}
              options={[{ value: '', label: t('csLookup.filterAll') as string },
                        { value: '697704869', label: 'Cluster Canada' },
                        { value: '802470810', label: 'Cluster USA' },
                        { value: '905113716', label: 'Xperio POS' }]} />
          </div>
          <div className="min-w-[150px]">
            <label className={`mb-1 block text-xs font-medium ${textTer}`}>{t('csLookup.filterNotice')}</label>
            <Select value={avis} onChange={setAvis} buttonClassName={FILTRE}
              options={[{ value: '', label: t('csLookup.filterAll') as string },
                        { value: 'sent', label: t('csLookup.shortSent') as string },
                        { value: 'scheduled', label: t('csLookup.filterScheduled') as string },
                        { value: 'not_sent', label: t('csLookup.shortNotSent') as string },
                        { value: 'send_failed', label: t('csLookup.shortFailed') as string }]} />
          </div>
          <div className="min-w-[170px]">
            <label className={`mb-1 block text-xs font-medium ${textTer}`}>{t('csLookup.filterHike')}</label>
            <Select value={etat} onChange={setEtat} buttonClassName={FILTRE}
              options={[{ value: '', label: t('csLookup.filterAll') as string },
                        { value: 'nohike', label: t('csLookup.filterNoHike') as string }]} />
          </div>
          {(org || avis || etat) && (
            <button type="button" onClick={() => { setOrg(''); setAvis(''); setEtat(''); }}
              className={`pb-2 text-xs font-medium ${textTer} hover:text-primary`}>
              {t('csLookup.filterClear')}
            </button>
          )}
        </div>

        <p className={`mt-3 px-1 text-xs ${textQuat}`}>{t('csLookup.searchHint')}</p>
        {hits && total > 0 && (
          <p className={`mt-1 px-1 text-xs ${textQuat}`}>
            {t('csLookup.showing', { shown: hits.length, total })}
          </p>
        )}
      </div>

      {/* --------------------------------------------------- « Quoi repondre », a portee */}
      <div className={`${card} mb-4`}>
        <button
          type="button"
          onClick={() => setFaqOuvert((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
        >
          <span className="min-w-0">
            <span className={`block text-sm font-semibold ${textPri}`}>{t('csLookup.faqTitle')}</span>
            <span className={`mt-0.5 block truncate text-xs ${textQuat}`}>{t('csLookup.faqSubtitle')}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 ${textQuat} transition-transform ${faqOuvert ? 'rotate-180' : ''}`} />
        </button>
        {faqOuvert && (
          <div className="border-t border-gray-100 px-5 pb-4 dark:border-[#161616]">
            <div className="divide-y divide-gray-100 dark:divide-[#161616]">
              {FAQ_KEYS.map((k) => (
                <div key={k} className="py-2.5">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === k ? null : k)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <span className={`text-sm font-medium ${textSec}`}>{t(`csLookup.faq.${k}.q`)}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 ${textQuat} transition-transform ${openFaq === k ? 'rotate-180' : ''}`} />
                  </button>
                  {openFaq === k && (
                    <p className={`mt-2 max-w-[80ch] whitespace-pre-line text-sm leading-relaxed ${textTer}`}>
                      {t(`csLookup.faq.${k}.a`)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && <div className={`mb-4 text-sm ${textTer}`}>{t('csLookup.searching')}</div>}
      {error && <div className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</div>}

      {hits && hits.length === 0 && (
        <div className={`${card} mb-4 p-6`}>
          <div className={`text-sm font-medium ${textPri}`}>{t('csLookup.noResults')}</div>
          {/* The most common reason for an empty result is not a typo — it is a merchant whose
              price was never changed. Saying so outright prevents an agent from apologising for
              an increase that does not exist. */}
          <p className={`mt-1.5 max-w-[70ch] text-sm ${textTer}`}>{t('csLookup.noResultsHint')}</p>
        </div>
      )}

      {hits?.map((h) => (!deplie(h) ? (
        <button
          key={h.id}
          type="button"
          onClick={() => basculer(h.subscriptionNumber)}
          className={`${card} mb-2 flex w-full items-center gap-3 px-4 py-3 text-left transition hover:border-primary/50`}
        >
          <div className="min-w-0 flex-1">
            <div className={`truncate text-sm font-medium ${textPri}`}>{h.customerName}</div>
            <div className={`mt-0.5 truncate font-mono text-[11px] ${textQuat}`}>
              {h.subscriptionNumber} &middot; {h.orgName}
            </div>
          </div>
          {/* Le prix disparait sur une ligne gelee ou hors campagne : il n'aura pas lieu. */}
          <div className={`hidden shrink-0 text-right text-xs tabular-nums sm:block ${textTer}`}>
            {(h.priceFrozen || h.excluded)
              ? money(h.currentPrice)
              : `${money(h.currentPrice)} \u2192 ${money(h.newPrice)}`}
          </div>
          {pastilleCourte(h)}
          <ChevronDown className={`h-4 w-4 shrink-0 ${textQuat}`} />
        </button>
      ) : (
        <div key={h.id} className={`${card} mb-3 p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            {/* Le nom du marchand EST le bouton de repli : c'est la que la main va, et le chevron
                retourne dit dans quel sens ca ira. Des <span> et non des <div>, un bouton ne
                peut pas contenir de bloc. */}
            <button
              type="button"
              onClick={() => basculer(h.subscriptionNumber)}
              title={t('csLookup.collapse') as string}
              className="flex min-w-0 items-start gap-2 text-left"
            >
              <ChevronDown className={`mt-1 h-4 w-4 shrink-0 rotate-180 ${textQuat}`} />
              <span className="min-w-0">
                <span className={`block text-base font-semibold ${textPri}`}>{h.customerName}</span>
                <span className={`mt-0.5 block font-mono text-[11px] ${textQuat}`}>
                  {h.subscriptionNumber}{h.merchantAccountId ? ` · ${h.merchantAccountId}` : ''} · {h.orgName}
                </span>
              </span>
            </button>
            {noticeBadge(h)}
          </div>

          {(h.priceFrozen || h.excluded) && (
            <div className="mt-3 rounded-lg border border-teal-300 bg-teal-50 px-3.5 py-2.5 dark:border-teal-800 dark:bg-teal-950/40">
              <div className="text-[13px] font-semibold text-teal-900 dark:text-teal-300">
                {t(h.priceFrozen ? 'csLookup.frozenTitle' : 'csLookup.excludedTitle')}
              </div>
              <p className="mt-0.5 max-w-[70ch] text-[12px] leading-relaxed text-teal-800 dark:text-teal-400">
                {t(h.priceFrozen ? 'csLookup.frozenHint' : 'csLookup.excludedHint')}
              </p>
            </div>
          )}

          {/* Le prix « avec le paiement Cluster » prend sa place dans la ligne des prix,
              a cote du nouveau prix : c'est un PRIX, l'agent le lit la ou il lit les autres,
              pas dans un encadre plus bas. Il n'apparait que quand les frais sont connus et
              que la soustraction a un sens — sinon la colonne n'existe pas du tout, plutot
              que d'afficher un tiret qu'on prendrait pour « aucune remise ». */}
          {(() => {
            const fr = fees[h.subscriptionNumber];
            const wp = typeof fr === 'object' ? fr.withPayments : null;
            const avecPrix = wp && !wp.belowZero;
            const cases = [
              { label: t('csLookup.plan'), value: h.planName || '—' },
              { label: t('csLookup.currentPrice'), value: money(h.currentPrice) },
              // Afficher un « nouveau prix » sur une ligne gelee, c'est tendre a l'agent le
              // chiffre exact qu'il ne doit pas annoncer. On met un tiret, le bandeau explique.
              { label: t('csLookup.newPrice'),
                value: (h.priceFrozen || h.excluded) ? '—' : money(h.newPrice),
                strong: !(h.priceFrozen || h.excluded) },
              ...(avecPrix ? [{
                label: t('csLookup.pay.withPriceLabel'),
                value: money(wp!.periodPrice), pay: true,
                // D'ou sort le chiffre : en infobulle plutot qu'en ligne de texte sous le bloc.
                hint: t('csLookup.pay.withPriceHow', {
                  fees: money(wp!.feesPeriod), current: money(wp!.currentPrice),
                }),
              }] : []),
              { label: t('csLookup.effective'), value: fmtDate(h.effectiveDate, i18n.language) },
            ];
            return (
              <div className={`mt-4 grid grid-cols-2 gap-4 ${avecPrix ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
                {cases.map((f: any) => (
                  <div key={String(f.label)} title={f.hint || undefined}>
                    <div className={`text-[11px] font-semibold uppercase tracking-wider ${
                      f.pay ? 'text-emerald-700 dark:text-emerald-400' : textQuat}`}>{f.label}</div>
                    <div className={`mt-1 text-sm ${
                      f.pay ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                            : f.strong ? `font-semibold ${textPri}` : textSec}`}>{f.value}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Le paiement. Un marchand qui appelle pour contester sa hausse est deja au
              telephone : c'est le seul moment ou lui proposer le paiement ne le derange pas.
              Et s'il l'a deja, il ne faut SURTOUT PAS le lui vendre — d'ou une pastille verte
              aussi visible que l'orange. */}
          {h.payments && h.payments.status === 'ACTIVE' ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-500/25 dark:bg-emerald-500/10">
              <CreditCard className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
              <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                {t('csLookup.pay.has')}
              </span>
              <span className="text-emerald-700/80 dark:text-emerald-400/80">
                {h.payments.since ? t('csLookup.pay.since', { date: fmtDate(h.payments.since, i18n.language) }) : ''}
              </span>
              {/* Reconnu par le NOM et non par un lien : on le dit, discretement. */}
              {h.payments.matchedBy === 'name' && (
                <span className={`text-[11px] ${textQuat}`}>{t('csLookup.pay.byName')}</span>
              )}
            </div>
          ) : h.payments ? (
            // Un compte existe mais il est ferme ou revoque : le marchand a DEJA quitte le
            // paiement. Ce n'est pas un prospect neuf, et l'agent doit le savoir avant d'ouvrir
            // la bouche.
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-500/25 dark:bg-amber-500/10">
              <CreditCard className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <span className="font-semibold text-amber-800 dark:text-amber-300">
                {t('csLookup.pay.former', { status: h.payments.status })}
              </span>
            </div>
          ) : (() => {
            // ⚠️ Ce bloc disait la meme chose trois fois : « economie 5 $/mois », « nouveau prix
            // moins les 5 $ de frais », « Payment Processing Integration — 5 $/mois ». Cinq
            // lignes de texte pour deux chiffres, avec le prix desormais affiche en haut de la
            // fiche. Un agent au telephone lit une ligne, pas un paragraphe.
            //
            // Trois etages, dans l'ordre ou l'agent s'en sert : l'ETAT et le GESTE sur une
            // meme ligne, puis les CHIFFRES en etiquette→valeur, puis seulement les panneaux
            // qui demandent une decision.
            const fr = fees[h.subscriptionNumber];
            const f = typeof fr === 'object' ? fr : null;
            const d = deal[h.subscriptionNumber];
            const retirer = () => setDeal(z => { const n = { ...z }; delete n[h.subscriptionNumber]; return n; });
            return (
            <div className="mt-4 rounded-lg border border-[#fe6523]/30 bg-[#fe6523]/[0.07] px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <CreditCard className="h-4 w-4 shrink-0 text-[#fe6523]" />
                  <span className="font-semibold text-[#c44d18] dark:text-[#fe8f5c]">
                    {t('csLookup.pay.opportunity')}
                  </span>
                  <span className={`text-[11px] ${textQuat}`}>{t('csLookup.pay.notFoundHint')}</span>
                </div>
                {/* Le geste utile, a droite de son propre etat. L'occasion meurt avec l'appel
                    si personne n'ouvre rien. */}
                <div className="shrink-0">
                  {!d && (
                    <button onClick={() => creerOpportunite(h)}
                      className="rounded-lg bg-[#fe6523] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e2571c]">
                      {t('csLookup.pay.createDeal')}
                    </button>
                  )}
                  {d?.state === 'loading' && (
                    <span className={`text-xs ${textQuat}`}>{t('csLookup.pay.creating')}</span>
                  )}
                  {d?.state === 'done' && (
                    <span className="flex flex-wrap items-center justify-end gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      {t('csLookup.pay.dealCreated', { stage: d.stage, owner: d.owner })}
                      {/* Les chiffres partent en note : le module Deals n'a pas de champ
                          Description. Si la note a echoue, la fiche existe mais elle est
                          muette — l'agent doit le savoir plutot que de le supposer ecrit. */}
                      {!d.noteOk && (
                        <span className="text-amber-700 dark:text-amber-400">
                          — {t('csLookup.pay.dealNoNote')}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Les frais viennent de Zoho en direct : ils se chargent seuls quand la recherche
                  a converge, et restent a la demande au-dela. */}
              {!fr && (
                <button onClick={() => chargerFrais(h)}
                  className="mt-2 rounded border border-[#fe6523]/40 px-2 py-0.5 text-xs font-medium text-[#c44d18] hover:bg-[#fe6523]/10 dark:text-[#fe8f5c]">
                  {t('csLookup.pay.checkFees')}
                </button>
              )}
              {fr === 'loading' && <div className={`mt-2 text-xs ${textQuat}`}>{t('csLookup.pay.checkingFees')}</div>}
              {fr === 'error' && <div className="mt-2 text-xs text-red-600 dark:text-red-400">{t('csLookup.pay.feesError')}</div>}
              {f && !f.paymentFees.length && (
                <div className={`mt-2 text-xs ${textQuat}`}>{t('csLookup.pay.noFees')}</div>
              )}

              {f && f.paymentFees.length > 0 && (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className={textQuat}>{t('csLookup.pay.savingLabel')}</dt>
                  <dd className="font-semibold text-[#c44d18] dark:text-[#fe8f5c]">
                    {t('csLookup.pay.savingValue', {
                      month: money(f.monthlySaving), year: money(f.yearlySaving),
                    })}
                  </dd>
                  <dt className={textQuat}>{t('csLookup.pay.feesLabel')}</dt>
                  <dd className={textSec}>
                    {f.paymentFees.map(l => `${l.name} — ${money(l.monthly)}`).join(' · ')}
                  </dd>
                  {/* Les autres integrations NE disparaissent PAS : le dire evite qu'un agent
                      les compte dans l'economie annoncee au client. */}
                  {f.addons.some(a => !a.isPayment) && (
                    <>
                      <dt className={textQuat}>{t('csLookup.pay.keptLabel')}</dt>
                      <dd className={textQuat}>
                        {f.addons.filter(a => !a.isPayment).map(a => a.name).join(', ')}
                      </dd>
                    </>
                  )}
                </dl>
              )}

              {/* Frais superieurs au forfait : la soustraction ne veut plus rien dire, et
                  afficher « 0 $ » ferait annoncer la gratuite. On le dit, sans chiffre. */}
              {f?.withPayments?.belowZero && (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                  {t('csLookup.pay.withPriceBelow', {
                    fees: money(f.withPayments.feesPeriod), price: money(f.withPayments.newPrice),
                  })}
                </div>
              )}

              {/* Le marchand vient de la facturation, pas du CRM : son nom ne trouve pas
                  toujours un compte Zoho. Rattacher au MAUVAIS compte enverrait un vendeur
                  rappeler quelqu'un d'autre, alors on s'arrete et on laisse l'agent trancher. */}
              {d?.state === 'noAccount' && (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                  <div className="font-semibold">{t('csLookup.pay.noAccountTitle', { name: d.searched })}</div>
                  <div className="mt-0.5 opacity-80">{t('csLookup.pay.noAccountHint')}</div>
                  {d.candidates.length > 0 && (
                    <>
                      <div className="mt-1.5 font-medium">{t('csLookup.pay.noAccountPick')}</div>
                      <ul className="mt-1 space-y-1">
                        {d.candidates.map(c => (
                          <li key={c.id} className="flex flex-wrap items-center gap-2">
                            <span>{c.name}{c.city ? ` — ${c.city}` : ''}</span>
                            <button onClick={() => { retirer(); creerOpportunite(h, false, c.id); }}
                              className="rounded border border-amber-400 px-2 py-0.5 font-medium hover:bg-amber-100 dark:hover:bg-amber-500/20">
                              {t('csLookup.pay.noAccountUse')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {/* Zoho a deja une opportunite ouverte. En creer une deuxieme coupe l'historique
                  en deux et fausse l'attribution : on montre ce qui existe et on laisse
                  l'agent decider, plutot que de dupliquer en silence. */}
              {d?.state === 'dup' && (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                  <div className="font-semibold">{t('csLookup.pay.dupTitle')}</div>
                  <ul className="mt-1 space-y-0.5">
                    {d.existing.map(x => (
                      <li key={x.id}>
                        {x.company}
                        {x.stage ? ` — ${x.stage}` : ''}
                        {x.owner ? ` (${x.owner})` : ''}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => { retirer(); creerOpportunite(h, true); }}
                    className="mt-1.5 rounded border border-amber-400 px-2 py-0.5 font-medium hover:bg-amber-100 dark:hover:bg-amber-500/20">
                    {t('csLookup.pay.dupCreateAnyway')}
                  </button>
                </div>
              )}

              {d?.state === 'error' && (
                <div className="mt-2 text-xs text-red-600 dark:text-red-400">{d.msg}</div>
              )}
            </div>
            );
          })()}

          <div className={`mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-gray-100 pt-3 text-xs ${textQuat} dark:border-[#161616]`}>
            <span>{t('csLookup.zohoStatus')}: <span className={textSec}>{t(`csLookup.push.${h.pushStatus}`)}</span></span>
            {h.notifyTo && <span>{t('csLookup.sentTo')}: <span className={textSec}>{h.notifyTo}</span></span>}
            <span>{t('csLookup.campaign')}: <span className={textSec}>{h.scenarioName}</span></span>
          </div>

          {/* The exact email that merchant received. An agent contradicting the message the
              customer is reading aloud is worse than having no tool at all. */}
          {h.notifyBody && (
            <>
              <button
                type="button"
                onClick={() => setOpenEmail(openEmail === h.id ? null : h.id)}
                className={`mt-3 inline-flex items-center gap-1.5 text-xs font-medium ${textTer} hover:text-primary`}
              >
                <Mail className="h-3.5 w-3.5" />
                {t('csLookup.showEmail')}
                <ChevronDown className={`h-3 w-3 transition-transform ${openEmail === h.id ? 'rotate-180' : ''}`} />
              </button>
              {openEmail === h.id && (
                <div className="mt-2 rounded-xl bg-gray-50 p-4 dark:bg-[#141414]">
                  <div className={`text-xs font-semibold ${textSec}`}>{h.notifySubject}</div>
                  <div className={`mt-2 whitespace-pre-wrap text-xs leading-relaxed ${textTer}`}>{h.notifyBody}</div>
                </div>
              )}
            </>
          )}
        </div>
      )))}

      {hits && hits.length < total && (
        <div className="mb-6 flex justify-center">
          <button onClick={() => search(q, hits.length)} disabled={suite}
            className={`rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium ${textSec} hover:bg-gray-50 disabled:opacity-50 dark:border-[#242424] dark:hover:bg-[#141414]`}>
            {suite ? t('csLookup.loadingMore') : t('csLookup.loadMore', { count: Math.min(50, total - hits.length) })}
          </button>
        </div>
      )}

    </div>
  );
}
