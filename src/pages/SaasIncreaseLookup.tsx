import { useEffect, useRef, useState } from 'react';
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

export default function SaasIncreaseLookup() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEmail, setOpenEmail] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  // Les frais d'integration demandent un appel Zoho par abonnement, donc on ne les charge que
  // sur demande et une seule fois. L'etat 'loading' evite le double appel au re-rendu.
  const [fees, setFees] = useState<Record<string, Fees | 'loading' | 'error'>>({});
  // Une opportunite creee ne se cree pas deux fois : on garde le resultat par abonnement.
  const [deal, setDeal] = useState<Record<string,
    { state: 'loading' } | { state: 'done'; id: string; name: string; stage: string }
    | { state: 'dup'; existing: { module: string; company: string; id: string }[] }
    | { state: 'error'; msg: string }>>({});

  const creerOpportunite = async (h: Hit, force = false) => {
    const cle = h.subscriptionNumber;
    if (deal[cle]?.state === 'loading' || deal[cle]?.state === 'done') return;
    setDeal(d => ({ ...d, [cle]: { state: 'loading' } }));
    const f = fees[cle];
    try {
      const r = await fetch(`${API_URL}/api/saas-increase/lookup/deal`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: h.orgId, subscriptionNumber: h.subscriptionNumber, createAnyway: force,
          // Les chiffres deja affiches a l'agent partent avec l'opportunite : le vendeur qui
          // rappelle dans trois jours n'aura pas cet ecran sous les yeux.
          ...(typeof f === 'object'
            ? { paymentFees: f.paymentFees, monthlySaving: f.monthlySaving } : {}),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.duplicate) {
        setDeal(d => ({ ...d, [cle]: { state: 'dup', existing: data.existing || [] } }));
      } else if (r.ok && data.ok) {
        setDeal(d => ({ ...d, [cle]: { state: 'done', id: data.dealId, name: data.dealName, stage: data.stage } }));
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
    if (term.trim().length < 2) { setHits(null); setError(null); setLoading(false); return; }
    setLoading(true);
    minuterie.current = setTimeout(() => search(term), 350);
  };

  const search = async (term: string) => {
    if (term.trim().length < 2) { setHits(null); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/saas-increase/lookup?q=${encodeURIComponent(term.trim())}`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setHits(d.results || []);
    } catch {
      setError(t('csLookup.error') as string);
      setHits(null);
    } finally { setLoading(false); }
  };

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
        <p className={`mt-2 px-1 text-xs ${textQuat}`}>{t('csLookup.searchHint')}</p>
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

      {hits?.map((h) => (
        <div key={h.id} className={`${card} mb-3 p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`text-base font-semibold ${textPri}`}>{h.customerName}</div>
              <div className={`mt-0.5 font-mono text-[11px] ${textQuat}`}>
                {h.subscriptionNumber}{h.merchantAccountId ? ` · ${h.merchantAccountId}` : ''} · {h.orgName}
              </div>
            </div>
            {noticeBadge(h)}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: t('csLookup.plan'), value: h.planName || '—' },
              { label: t('csLookup.currentPrice'), value: money(h.currentPrice) },
              { label: t('csLookup.newPrice'), value: money(h.newPrice), strong: true },
              { label: t('csLookup.effective'), value: fmtDate(h.effectiveDate, i18n.language) },
            ].map((f) => (
              <div key={String(f.label)}>
                <div className={`text-[11px] font-semibold uppercase tracking-wider ${textQuat}`}>{f.label}</div>
                <div className={`mt-1 text-sm ${f.strong ? `font-semibold ${textPri}` : textSec}`}>{f.value}</div>
              </div>
            ))}
          </div>

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
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#fe6523]/30 bg-[#fe6523]/[0.07] px-3 py-2 text-sm">
              <CreditCard className="h-4 w-4 shrink-0 text-[#fe6523]" />
              <span className="font-semibold text-[#c44d18] dark:text-[#fe8f5c]">
                {t('csLookup.pay.opportunity')}
              </span>
              <span className={`text-[11px] ${textQuat}`}>{t('csLookup.pay.notFoundHint')}</span>

              {/* L'argument concret. Un marchand qui appelle pour se plaindre d'une hausse de
                  20 $ entend mal « c'est ainsi » ; il entend tres bien « et vous economisez
                  45 $ par mois en passant chez nous ». Les frais viennent de Zoho en direct,
                  donc on les charge a la demande plutot qu'a chaque recherche. */}
              <span className="basis-full" />
              {/* Repli : quand la recherche rend beaucoup de resultats, le chargement
                  automatique se retire et l'agent demande la fiche qui l'interesse. */}
              {!fees[h.subscriptionNumber] && (
                <button onClick={() => chargerFrais(h)}
                  className="rounded border border-[#fe6523]/40 px-2 py-0.5 text-xs font-medium text-[#c44d18] hover:bg-[#fe6523]/10 dark:text-[#fe8f5c]">
                  {t('csLookup.pay.checkFees')}
                </button>
              )}
              {fees[h.subscriptionNumber] === 'loading' && (
                <span className={`text-xs ${textQuat}`}>{t('csLookup.pay.checkingFees')}</span>
              )}
              {fees[h.subscriptionNumber] === 'error' && (
                <span className="text-xs text-red-600 dark:text-red-400">{t('csLookup.pay.feesError')}</span>
              )}
              {/* Le geste utile. L'agent est au telephone : l'occasion meurt avec l'appel
                  si personne n'ouvre rien. Un clic, et un vendeur rappellera. */}
              <span className="basis-full" />
              {(() => {
                const d = deal[h.subscriptionNumber];
                if (!d) return (
                  <button onClick={() => creerOpportunite(h)}
                    className="rounded-lg bg-[#fe6523] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#e2571c]">
                    {t('csLookup.pay.createDeal')}
                  </button>
                );
                if (d.state === 'loading') return <span className={`text-xs ${textQuat}`}>{t('csLookup.pay.creating')}</span>;
                if (d.state === 'done') return (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    {t('csLookup.pay.dealCreated', { stage: d.stage })}
                  </span>
                );
                // Zoho a deja une fiche pour ce marchand. En creer une deuxieme coupe
                // l'historique en deux et fausse l'attribution : on montre ce qui existe et on
                // laisse l'agent decider, plutot que de dupliquer en silence.
                if (d.state === 'dup') return (
                  <div className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                    <div className="font-semibold">{t('csLookup.pay.dupTitle')}</div>
                    <ul className="mt-1 space-y-0.5">
                      {d.existing.map(x => <li key={x.id}>{x.module} — {x.company}</li>)}
                    </ul>
                    <button onClick={() => { setDeal(z => { const c = { ...z }; delete c[h.subscriptionNumber]; return c; }); creerOpportunite(h, true); }}
                      className="mt-1.5 rounded border border-amber-400 px-2 py-0.5 font-medium hover:bg-amber-100 dark:hover:bg-amber-500/20">
                      {t('csLookup.pay.dupCreateAnyway')}
                    </button>
                  </div>
                );
                return <span className="text-xs text-red-600 dark:text-red-400">{d.msg}</span>;
              })()}

              {typeof fees[h.subscriptionNumber] === 'object' && (() => {
                const f = fees[h.subscriptionNumber] as Fees;
                if (!f.paymentFees.length) {
                  return <span className={`text-xs ${textQuat}`}>{t('csLookup.pay.noFees')}</span>;
                }
                return (
                  <div className="w-full">
                    <div className="text-sm font-semibold text-[#c44d18] dark:text-[#fe8f5c]">
                      {t('csLookup.pay.saving', {
                        month: money(f.monthlySaving), year: money(f.yearlySaving),
                      })}
                    </div>
                    <ul className={`mt-1 space-y-0.5 text-xs ${textQuat}`}>
                      {f.paymentFees.map(l => (
                        <li key={l.code}>{l.name} — {money(l.monthly)}/mois</li>
                      ))}
                    </ul>
                    {/* Les autres integrations NE disparaissent PAS : le dire evite qu'un agent
                        les compte dans l'economie annoncee au client. */}
                    {f.addons.some(a => !a.isPayment) && (
                      <p className={`mt-1.5 text-[11px] ${textQuat}`}>
                        {t('csLookup.pay.otherAddons', {
                          list: f.addons.filter(a => !a.isPayment).map(a => a.name).join(', '),
                        })}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

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
      ))}

      {/* ------------------------------------------------------------------------ FAQ */}
      <div className={`${card} mt-6 p-5`}>
        <h3 className={`text-sm font-semibold ${textPri}`}>{t('csLookup.faqTitle')}</h3>
        <p className={`mt-1 text-xs ${textQuat}`}>{t('csLookup.faqSubtitle')}</p>
        <div className="mt-3 divide-y divide-gray-100 dark:divide-[#161616]">
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
    </div>
  );
}
