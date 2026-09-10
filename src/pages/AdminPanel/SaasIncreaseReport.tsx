import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Printer, AlertTriangle, Info, AlertOctagon } from 'lucide-react';

// Trois lectures d'une campagne, dans un document qu'on imprime et qu'on envoie.
//
// Elles ne s'adressent pas aux mêmes gens et ne répondent pas à la même question :
//   • la MONTÉE est pour la direction financière — quand l'argent entre réellement, mois par
//     mois. Le total d'un scénario est un régime de croisière, pas un encaissement immédiat, et
//     c'est l'erreur qu'on fait en citant « 42 939 $ × 12 ».
//   • les CHAÎNES sont pour la préparation des appels — un propriétaire de 43 restaurants
//     compare ses factures entre elles.
//   • les CONTRÔLES sont pour la dernière relecture avant l'envoi.
//
// Tous les chiffres viennent du serveur (/report), calculés par les mêmes fonctions que la
// poussée et les courriels. Rien n'est recalculé ici : cette vue ne peut pas diverger.

const API_URL = import.meta.env.VITE_API_URL;
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

type Row = {
  sub: string; name: string; org: string; plan: string;
  currentPeriod: number | null; newPeriod: number | null; cadence: number;
  pct: number | null; mrrAdd: number; status: string | null;
  effectiveDate: string | null; detail: string | null;
};
type Check = { code: string; severity: 'critical' | 'warning' | 'info'; label: string; why: string; count: number; rows: Row[] };
type Chain = {
  key: string; label: string; locations: number; orgs: string[];
  currentPeriodTotal: number; mrrAdd: number; rates: string[];
  consistent: boolean; consistentWithinPlan: boolean;
  firstEffective: string | null; lastEffective: string | null;
  members: { sub: string; name: string; org: string; plan: string; currentPeriod: number | null; newPeriod: number | null; pct: number | null; cadence: number; mrrAdd: number; effectiveDate: string | null }[];
};
type Report = {
  scenario: { id: number; name: string; targetMrr: number };
  generatedAt: string;
  totals: { items: number; mrrAdd: number; firstYearCash: number; withoutEffectiveDate: number; notified: number; pushed: number };
  ramp: { month: string; count: number; mrrAdded: number; cumulativeMrr: number }[];
  chains: Chain[];
  checks: Check[];
};

const money0 = (n: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n || 0);
const money2 = (n: number) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n || 0);

const moisLong = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });
};

const ICONE = { critical: AlertOctagon, warning: AlertTriangle, info: Info };
const TON = {
  critical: 'border-red-300 bg-red-50 text-red-700',
  warning: 'border-amber-300 bg-amber-50 text-amber-800',
  info: 'border-slate-300 bg-slate-50 text-slate-600',
};

export default function SaasIncreaseReport({ scenarioId, onClose }: { scenarioId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [d, setD] = useState<Report | null>(null);
  const [err, setErr] = useState(false);
  const [onglet, setOnglet] = useState<'ramp' | 'chains' | 'checks'>('ramp');
  const [ouvert, setOuvert] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`${API_URL}/api/admin/saas-increase/scenarios/${scenarioId}/report`, { headers: authH() })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setD).catch(() => setErr(true));
  }, [scenarioId]);

  const critiques = d ? d.checks.filter(c => c.severity === 'critical').reduce((a, c) => a + c.count, 0) : 0;

  return createPortal(
    <div className="report-overlay fixed inset-0 z-[10000] overflow-auto bg-white">
      <style>{`
        /* Isoler par VISIBILITE et non par position dans le DOM : masquer les freres de
           #root efface l'overlay lui-meme, qui est monte en profondeur. */
        @media print {
          body * { visibility: hidden !important; }
          .report-overlay, .report-overlay * { visibility: visible !important; }
          .report-overlay { position: absolute !important; inset: 0 !important; overflow: visible !important; }
          .no-print { display: none !important; }
          /* Chrome retire les fonds a l'impression sans cette ligne : barres et en-tetes vides. */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .page-break { break-before: page; }
          table { break-inside: auto; }
          tr { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex gap-1">
          {(['ramp', 'chains', 'checks'] as const).map(o => (
            <button key={o} onClick={() => setOnglet(o)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${onglet === o ? 'bg-[#1c2434] text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {t(`saasIncrease.report.tab.${o}`)}
              {o === 'checks' && critiques > 0 && (
                <span className="ml-2 rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{critiques}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            <Printer className="h-4 w-4" /> {t('saasIncrease.report.print')}
          </button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
      </div>

      {err && <p className="p-10 text-center text-slate-500">{t('saasIncrease.error')}</p>}
      {!d && !err && <p className="p-10 text-center text-slate-400">{t('saasIncrease.report.loading')}</p>}

      {d && (
        <div className="mx-auto max-w-5xl px-8 py-8">
          <header className="mb-8 border-b-4 border-[#fe6523] pb-5">
            <h1 className="text-2xl font-bold text-[#1c2434]">{t('saasIncrease.report.title')}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {d.scenario.name} · {d.totals.items} {t('saasIncrease.report.subscriptions')} ·{' '}
              {new Date(d.generatedAt).toLocaleString('fr-CA')}
            </p>
          </header>

          {/* ─────────────────────────────── 1. La montée ─────────────────────────────── */}
          {onglet === 'ramp' && (
            <section>
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Tuile libelle={t('saasIncrease.report.cruise') as string} valeur={money2(d.totals.mrrAdd) + ' /mois'}
                  note={money0(d.totals.mrrAdd * 12) + ' ' + t('saasIncrease.report.perYearOnce')} />
                <Tuile libelle={t('saasIncrease.report.firstYear') as string} valeur={money0(d.totals.firstYearCash)}
                  note={`${Math.round(d.totals.firstYearCash / Math.max(1, d.totals.mrrAdd * 12) * 100)} % ${t('saasIncrease.report.ofCruise')}`} accent />
                <Tuile libelle={t('saasIncrease.report.fullyIn') as string}
                  valeur={d.ramp.length ? moisLong(d.ramp[d.ramp.length - 1].month) : '—'}
                  note={t('saasIncrease.report.lastRenewal') as string} />
              </div>

              <p className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {t('saasIncrease.report.rampWarning')}
              </p>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2">{t('saasIncrease.report.month')}</th>
                    <th className="py-2 text-right">{t('saasIncrease.report.subsTakingEffect')}</th>
                    <th className="py-2 text-right">{t('saasIncrease.report.mrrAdded')}</th>
                    <th className="py-2 text-right">{t('saasIncrease.report.cumulative')}</th>
                    <th className="w-2/5 py-2 pl-4">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {d.ramp.map(r => {
                    const part = d.totals.mrrAdd > 0 ? (r.cumulativeMrr / d.totals.mrrAdd) * 100 : 0;
                    return (
                      <tr key={r.month} className="border-b border-slate-100">
                        <td className="py-2 font-medium text-[#1c2434]">{moisLong(r.month)}</td>
                        <td className="py-2 text-right text-slate-600">{r.count}</td>
                        <td className="py-2 text-right text-slate-600">{money2(r.mrrAdded)}</td>
                        <td className="py-2 text-right font-semibold text-[#1c2434]">{money2(r.cumulativeMrr)}</td>
                        <td className="py-2 pl-4">
                          <div className="h-2.5 w-full rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-[#fe6523]" style={{ width: `${part}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {d.totals.withoutEffectiveDate > 0 && (
                <p className="mt-4 text-xs text-slate-500">
                  {t('saasIncrease.report.noDate', { count: d.totals.withoutEffectiveDate })}
                </p>
              )}
            </section>
          )}

          {/* ─────────────────────────────── 2. Les chaînes ─────────────────────────────── */}
          {onglet === 'chains' && (
            <section>
              <p className="mb-5 text-sm text-slate-600">{t('saasIncrease.report.chainsIntro', { count: d.chains.length })}</p>
              {d.chains.map(c => (
                <div key={c.key} className="mb-3 rounded-lg border border-slate-200">
                  <button onClick={() => setOuvert(o => ({ ...o, [c.key]: !o[c.key] }))}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#1c2434]">{c.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {c.locations} {t('saasIncrease.report.locations')} · {c.orgs.join(', ')} · {c.rates.join(' / ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {!c.consistentWithinPlan && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          {t('saasIncrease.report.samePlanConflict')}
                        </span>
                      )}
                      <span className="text-right text-sm font-semibold text-[#1c2434]">{money2(c.mrrAdd)}<span className="text-xs font-normal text-slate-400">/mois</span></span>
                    </div>
                  </button>
                  {ouvert[c.key] && (
                    <table className="w-full border-t border-slate-200 text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left text-slate-500">
                          <th className="px-4 py-1.5">{t('saasIncrease.report.branch')}</th>
                          <th className="px-2 py-1.5">{t('saasIncrease.report.plan')}</th>
                          <th className="px-2 py-1.5 text-right">{t('saasIncrease.report.current')}</th>
                          <th className="px-2 py-1.5 text-right">{t('saasIncrease.report.new')}</th>
                          <th className="px-2 py-1.5 text-right">%</th>
                          <th className="px-4 py-1.5 text-right">{t('saasIncrease.report.effective')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.members.map(m => (
                          <tr key={m.sub} className="border-t border-slate-100">
                            <td className="px-4 py-1.5">{m.name} <span className="text-slate-400">{m.sub}</span></td>
                            <td className="px-2 py-1.5 text-slate-500">{m.plan}</td>
                            <td className="px-2 py-1.5 text-right">{m.currentPeriod != null ? money2(m.currentPeriod) : '—'}</td>
                            <td className="px-2 py-1.5 text-right font-medium">{m.newPeriod != null ? money2(m.newPeriod) : '—'}</td>
                            <td className="px-2 py-1.5 text-right">{m.pct != null ? `${m.pct} %` : '—'}</td>
                            <td className="px-4 py-1.5 text-right text-slate-500">{m.effectiveDate || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* ─────────────────────────────── 3. Les contrôles ─────────────────────────────── */}
          {onglet === 'checks' && (
            <section>
              <p className="mb-5 text-sm text-slate-600">{t('saasIncrease.report.checksIntro')}</p>
              {d.checks.length === 0 && <p className="text-sm text-slate-500">{t('saasIncrease.report.noChecks')}</p>}
              {d.checks.map(c => {
                const I = ICONE[c.severity];
                return (
                  <div key={c.code} className={`mb-3 rounded-lg border ${TON[c.severity]}`}>
                    <button onClick={() => setOuvert(o => ({ ...o, [c.code]: !o[c.code] }))}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left">
                      <I className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{c.label} <span className="font-normal opacity-70">— {c.count}</span></p>
                        <p className="mt-0.5 text-xs opacity-80">{c.why}</p>
                      </div>
                    </button>
                    {ouvert[c.code] && (
                      <div className="overflow-x-auto border-t border-current/20 bg-white">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-left text-slate-500">
                              <th className="px-4 py-1.5">{t('saasIncrease.report.merchant')}</th>
                              <th className="px-2 py-1.5">{t('saasIncrease.report.plan')}</th>
                              <th className="px-2 py-1.5 text-right">{t('saasIncrease.report.current')}</th>
                              <th className="px-2 py-1.5 text-right">{t('saasIncrease.report.new')}</th>
                              <th className="px-2 py-1.5 text-right">%</th>
                              <th className="px-4 py-1.5">{t('saasIncrease.report.detail')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.rows.map((r, i) => (
                              <tr key={`${r.sub}-${i}`} className="border-t border-slate-100">
                                <td className="px-4 py-1.5 text-slate-700">{r.name} <span className="text-slate-400">{r.sub}</span></td>
                                <td className="px-2 py-1.5 text-slate-500">{r.plan}</td>
                                <td className="px-2 py-1.5 text-right">{r.currentPeriod != null ? money2(r.currentPeriod) : '—'}</td>
                                <td className="px-2 py-1.5 text-right font-medium">{r.newPeriod != null ? money2(r.newPeriod) : '—'}</td>
                                <td className="px-2 py-1.5 text-right">{r.pct != null ? `${r.pct} %` : '—'}</td>
                                <td className="px-4 py-1.5 text-slate-500">{r.detail || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {c.count > c.rows.length && (
                          <p className="px-4 py-2 text-xs text-slate-400">
                            {t('saasIncrease.report.truncated', { shown: c.rows.length, total: c.count })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

function Tuile({ libelle, valeur, note, accent }: { libelle: string; valeur: string; note?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? 'border-[#fe6523] bg-orange-50' : 'border-slate-200'}`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{libelle}</p>
      <p className="mt-1 text-2xl font-bold text-[#1c2434]">{valeur}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}
