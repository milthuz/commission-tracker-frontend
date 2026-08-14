import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';

// Meme convention que PartnersAdmin : l URL est lue de l environnement, il n existe pas
// de module de configuration partage dans ce projet.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Statistiques d'usage du portail partenaire.
//
// ⚠️ Ce que cet écran mesure et ce qu'il ne mesure PAS. Connexions, activations et soumissions
// sont des faits côté serveur. Les pages consultées, le temps passé, les parcours : rien n'est
// instrumenté. L'écran ne montre donc que ce qui est réellement enregistré, et le dit — un
// tableau de bord qui laisse croire qu'il sait tout est pire qu'un tableau de bord absent.

interface Funnel {
  partnerId: number; partner: string; active: boolean;
  users: number; invited: number; opened: number; activated: number;
  everLoggedIn: number; active30d: number; disabled: number;
  opportunities: number; opportunities30d: number;
}
interface Serie { day?: string; month?: string; partner: string; count: number }
interface Dormant { email: string; name: string | null; partner: string; role: string; activatedAt: string | null; lastLoginAt: string | null }
interface TopUser { email: string; name: string | null; partner: string; lastLoginAt: string | null; logins: number; submissions: number }

export default function PartnerStats() {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [funnel, setFunnel] = useState<Funnel[]>([]);
  const [logins, setLogins] = useState<Serie[]>([]);
  const [submissions, setSubmissions] = useState<Serie[]>([]);
  const [dormant, setDormant] = useState<Dormant[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);

  useEffect(() => {
    axios.get(`${API_URL}/api/admin/partner-stats`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then((r) => {
        setFunnel(r.data.funnel || []); setLogins(r.data.logins || []);
        setSubmissions(r.data.submissions || []); setDormant(r.data.dormant || []);
        setTopUsers(r.data.topUsers || []);
      })
      .catch((e) => setError(e?.response?.data?.error || 'Failed to load partner statistics'))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (d: string | null) => (d
    ? new Date(d).toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—');

  // Les totaux sont recalculés à partir des lignes plutôt que demandés au serveur : une seule
  // source, donc pas de risque qu'un en-tête contredise le tableau juste en dessous.
  const tot = funnel.reduce((a, f) => ({
    users: a.users + f.users, invited: a.invited + f.invited, opened: a.opened + f.opened,
    activated: a.activated + f.activated, everLoggedIn: a.everLoggedIn + f.everLoggedIn,
    active30d: a.active30d + f.active30d, opportunities30d: a.opportunities30d + f.opportunities30d,
  }), { users: 0, invited: 0, opened: 0, activated: 0, everLoggedIn: 0, active30d: 0, opportunities30d: 0 });

  // Les connexions arrivent par (jour, partenaire) : on additionne par jour pour la courbe, et
  // on remplit les jours SANS connexion — sinon une courbe de 5 points sur 90 jours donne une
  // ligne montante trompeuse.
  const parJour = new Map<string, number>();
  for (const l of logins) {
    const j = String(l.day).slice(0, 10);
    parJour.set(j, (parJour.get(j) || 0) + l.count);
  }
  const jours: string[] = [];
  const valeurs: number[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const cle = d.toISOString().slice(0, 10);
    jours.push(cle); valeurs.push(parJour.get(cle) || 0);
  }
  const aucuneConnexion = valeurs.every((v) => v === 0);

  const parMois = new Map<string, number>();
  for (const sm of submissions) parMois.set(sm.month!, (parMois.get(sm.month!) || 0) + sm.count);
  const mois = [...parMois.keys()].sort();

  const commun: ApexOptions = {
    chart: { fontFamily: 'Satoshi, sans-serif', toolbar: { show: false }, zoom: { enabled: false } },
    colors: ['#3C50E0'],
    dataLabels: { enabled: false },
    grid: { borderColor: '#E2E8F0', strokeDashArray: 4 },
    tooltip: { theme: 'light' },
  };

  if (loading) {
    return <div className="flex h-40 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>;
  }
  if (error) {
    return <div className="rounded-sm border border-stroke bg-white p-8 text-center text-sm text-danger dark:border-strokedark dark:bg-boxdark">{error}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* L'entonnoir en tête : c'est la seule question qui compte au démarrage d'un portail —
          combien de personnes invitées sont réellement entrées. */}
      <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-1 text-sm font-semibold text-black dark:text-white">{t('admin.partnerStats.funnelTitle')}</h3>
        <p className="mb-4 text-xs text-body">{t('admin.partnerStats.funnelHint')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ['users', tot.users, 'text-black dark:text-white'],
            ['invited', tot.invited, 'text-black dark:text-white'],
            ['opened', tot.opened, 'text-primary'],
            ['activated', tot.activated, 'text-green-700 dark:text-success'],
            ['everLoggedIn', tot.everLoggedIn, 'text-green-700 dark:text-success'],
            ['active30d', tot.active30d, 'text-green-700 dark:text-success'],
          ] as const).map(([cle, valeur, couleur]) => (
            <div key={cle} className="rounded-lg border border-stroke p-3 dark:border-strokedark">
              <div className={`text-2xl font-bold ${couleur}`}>{valeur}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-body">{t(`admin.partnerStats.step.${cle}`)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Par partenaire */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-sm font-semibold text-black dark:text-white">{t('admin.partnerStats.byPartner')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stroke dark:border-strokedark">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.colPartner')}</th>
                {(['users', 'invited', 'opened', 'activated', 'active30d'] as const).map((c) => (
                  <th key={c} className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-body">{t(`admin.partnerStats.step.${c}`)}</th>
                ))}
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partnerStats.colOpps')}</th>
              </tr>
            </thead>
            <tbody>
              {funnel.map((f) => (
                <tr key={f.partnerId} className="border-b border-stroke last:border-0 dark:border-strokedark">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-black dark:text-white">
                    {f.partner}
                    {!f.active && <span className="ml-2 rounded-full bg-gray-2 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-500 dark:bg-meta-4">{t('common.inactive')}</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-body">{f.users}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-body">{f.invited}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-body">{f.opened}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-black dark:text-white">{f.activated}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-body">{f.active30d}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-body">
                    {f.opportunities}
                    {f.opportunities30d > 0 && <span className="ml-1 text-[11px] text-primary">+{f.opportunities30d}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Connexions */}
        <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-1 text-sm font-semibold text-black dark:text-white">{t('admin.partnerStats.loginsTitle')}</h3>
          <p className="mb-3 text-xs text-body">{t('admin.partnerStats.loginsHint')}</p>
          {/* Un graphique plat sur 90 jours ne dit rien qu'une phrase ne dise mieux. */}
          {aucuneConnexion ? (
            <p className="py-10 text-center text-sm text-gray-400">{t('admin.partnerStats.noLogins')}</p>
          ) : (
            <ReactApexChart type="area" height={220} series={[{ name: t('admin.partnerStats.logins') as string, data: valeurs }]}
              options={{ ...commun, xaxis: { categories: jours, type: 'datetime', labels: { format: 'dd MMM' } },
                         yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (v: number) => String(Math.round(v)) } },
                         stroke: { curve: 'smooth', width: 2 },
                         fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.02 } } }} />
          )}
        </div>

        {/* Soumissions */}
        <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-1 text-sm font-semibold text-black dark:text-white">{t('admin.partnerStats.submissionsTitle')}</h3>
          <p className="mb-3 text-xs text-body">{t('admin.partnerStats.submissionsHint')}</p>
          {mois.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">{t('admin.partnerStats.noSubmissions')}</p>
          ) : (
            <ReactApexChart type="bar" height={220}
              series={[{ name: t('admin.partnerStats.submissions') as string, data: mois.map((m) => parMois.get(m) || 0) }]}
              options={{ ...commun, xaxis: { categories: mois },
                         plotOptions: { bar: { borderRadius: 3, columnWidth: '55%' } } }} />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Dormants — le signal le plus actionnable de l'écran */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h3 className="text-sm font-semibold text-black dark:text-white">{t('admin.partnerStats.dormantTitle')}</h3>
            <p className="mt-0.5 text-xs text-body">{t('admin.partnerStats.dormantHint')}</p>
          </div>
          {dormant.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">{t('admin.partnerStats.dormantNone')}</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <tbody>
                {dormant.map((d) => (
                  <tr key={d.email} className="border-b border-stroke last:border-0 dark:border-strokedark">
                    <td className="px-4 py-2.5">
                      <div className="max-w-[220px] truncate text-black dark:text-white" title={d.email}>{d.name || d.email}</div>
                      <div className="text-[11px] text-body">{d.partner}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-body">
                      {d.lastLoginAt ? t('admin.partnerStats.lastSeen', { date: fmt(d.lastLoginAt) }) : t('admin.partnerStats.neverReturned')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        {/* Qui fait vivre le portail */}
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <h3 className="text-sm font-semibold text-black dark:text-white">{t('admin.partnerStats.topTitle')}</h3>
            <p className="mt-0.5 text-xs text-body">{t('admin.partnerStats.topHint')}</p>
          </div>
          {topUsers.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">{t('admin.partnerStats.topNone')}</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <tbody>
                {topUsers.map((u) => (
                  <tr key={u.email} className="border-b border-stroke last:border-0 dark:border-strokedark">
                    <td className="px-4 py-2.5">
                      <div className="max-w-[220px] truncate text-black dark:text-white" title={u.email}>{u.name || u.email}</div>
                      <div className="text-[11px] text-body">{u.partner} · {fmt(u.lastLoginAt)}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-body">
                      {t('admin.partnerStats.userCounts', { logins: u.logins, submissions: u.submissions })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      {/* Dire ce qui n'est PAS mesuré vaut mieux que laisser deviner. */}
      <p className="px-1 text-[11px] leading-relaxed text-gray-400">{t('admin.partnerStats.disclaimer')}</p>
    </div>
  );
}
