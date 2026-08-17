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
// Le PIPELINE d'affaires — distinct de l'entonnoir d'adoption ci-dessus, qui mesure l'usage du
// portail. Ici on mesure ce que les partenaires RAPPORTENT.
//
// ⚠️ `won` (étape « Closed Won ») et `deposits` (date de dépôt Zoho, ce qui déclenche le versement)
// sont deux choses différentes, à 4× d'écart dans les données réelles. Les colonnes restent
// séparées et nommées séparément — les additionner ou les confondre donnerait un taux faux.
interface Pipeline {
  partnerId: number; partner: string;
  submitted: number; submitted30d: number; withLead: number; withDeal: number;
  open: number; won: number; lost: number; noStage: number;
  deposits: number; paid: number;
}
interface Mois { month: string; submitted: number; won: number; lost: number; open: number }
interface Etape { stage: string; count: number }
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
  const [pipeline, setPipeline] = useState<Pipeline[]>([]);
  const [byMonth, setByMonth] = useState<Mois[]>([]);
  const [byStage, setByStage] = useState<Etape[]>([]);

  useEffect(() => {
    axios.get(`${API_URL}/api/admin/partner-stats`,
      { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then((r) => {
        setFunnel(r.data.funnel || []); setLogins(r.data.logins || []);
        setSubmissions(r.data.submissions || []); setDormant(r.data.dormant || []);
        setTopUsers(r.data.topUsers || []);
        setPipeline(r.data.pipeline || []); setByMonth(r.data.byMonth || []);
        setByStage(r.data.byStage || []);
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

  // Totaux du pipeline, recalculés depuis les lignes — même raison que l'entonnoir plus haut :
  // une seule source, donc l'en-tête ne peut pas contredire le tableau.
  const pip = pipeline.reduce((a, p) => ({
    submitted: a.submitted + p.submitted, submitted30d: a.submitted30d + p.submitted30d,
    withLead: a.withLead + p.withLead, withDeal: a.withDeal + p.withDeal,
    open: a.open + p.open, won: a.won + p.won, lost: a.lost + p.lost,
    noStage: a.noStage + p.noStage, deposits: a.deposits + p.deposits, paid: a.paid + p.paid,
  }), { submitted: 0, submitted30d: 0, withLead: 0, withDeal: 0, open: 0, won: 0, lost: 0, noStage: 0, deposits: 0, paid: 0 });

  // Le taux se calcule sur les dossiers TRANCHÉS, pas sur tous les dossiers soumis. Rapporter
  // 94 gagnés à 675 soumis donnerait 14 % et laisserait croire à une mauvaise performance, alors
  // que 288 dossiers n'ont simplement aucune étape lue et que 101 sont encore ouverts. Le
  // dénominateur est affiché à côté du taux pour qu'il ne soit pas à deviner.
  const tranches = pip.won + pip.lost;
  const tauxReussite = tranches ? Math.round((1000 * pip.won) / tranches) / 10 : null;
  const couverture = pip.submitted ? Math.round((100 * pip.noStage) / pip.submitted) : 0;

  const moisPipeline = byMonth.map((m) => m.month);
  const libelleMois = (m: string) => {
    const [a, mo] = m.split('-');
    return new Date(Number(a), Number(mo) - 1, 1)
      .toLocaleDateString(i18n.language, { month: 'short', year: '2-digit' });
  };

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
      {/* ─────────── PIPELINE D'AFFAIRES ───────────
          Ce que les partenaires rapportent. Placé AVANT l'usage du portail : « combien de leads
          et lesquels convertissent » passe avant « combien de gens se connectent ». */}
      <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-1 text-sm font-semibold text-black dark:text-white">{t('admin.partnerStats.pipelineTitle')}</h3>
        <p className="mb-4 text-xs text-body">{t('admin.partnerStats.pipelineHint')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ['submitted', pip.submitted, 'text-black dark:text-white', pip.submitted30d],
            ['withDeal', pip.withDeal, 'text-black dark:text-white', null],
            ['open', pip.open, 'text-primary', null],
            ['won', pip.won, 'text-green-700 dark:text-success', null],
            ['lost', pip.lost, 'text-danger', null],
            ['noStage', pip.noStage, 'text-gray-400', null],
          ] as const).map(([cle, valeur, couleur, extra]) => (
            <div key={cle} className="rounded-lg border border-stroke p-3 dark:border-strokedark">
              <div className={`text-2xl font-bold ${couleur}`}>{valeur}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-body">
                {t(`admin.partnerStats.pipe.${cle}`)}
                {/* Les 30 derniers jours collés au total : « 675 » seul ne dit pas si ça vit encore. */}
                {extra != null && extra > 0 && <span className="ml-1 font-semibold text-primary">+{extra}</span>}
              </div>
            </div>
          ))}
        </div>
        {/* Le taux ET son dénominateur, ensemble. Un pourcentage sans dénominateur dans un écran
            où 43 % des dossiers n'ont pas d'étape lue serait trompeur. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-stroke pt-3 text-xs dark:border-strokedark">
          {tauxReussite !== null && (
            <span className="text-body">
              <span className="text-base font-bold text-black dark:text-white">{tauxReussite}%</span>
              {' '}{t('admin.partnerStats.winRate', { won: pip.won, decided: tranches })}
            </span>
          )}
          <span className="text-body">{t('admin.partnerStats.payoutsLine', { deposits: pip.deposits, paid: pip.paid })}</span>
          {pip.noStage > 0 && (
            <span className="text-gray-400">{t('admin.partnerStats.coverage', { n: pip.noStage, pct: couverture })}</span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Volume et issue par mois de SOUMISSION (vue par cohorte) : la hauteur de la barre est
            le volume du mois, sa composition dit ce que ce volume est devenu. */}
        <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-1 text-sm font-semibold text-black dark:text-white">{t('admin.partnerStats.monthTitle')}</h3>
          <p className="mb-3 text-xs text-body">{t('admin.partnerStats.monthHint')}</p>
          {byMonth.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">{t('admin.partnerStats.noSubmissions')}</p>
          ) : (
            <ReactApexChart type="bar" height={260}
              series={[
                { name: t('admin.partnerStats.pipe.won') as string, data: byMonth.map((m) => m.won) },
                { name: t('admin.partnerStats.pipe.open') as string, data: byMonth.map((m) => m.open) },
                { name: t('admin.partnerStats.pipe.lost') as string, data: byMonth.map((m) => m.lost) },
                { name: t('admin.partnerStats.pipe.noStage') as string,
                  data: byMonth.map((m) => m.submitted - m.won - m.open - m.lost) },
              ]}
              options={{ ...commun,
                colors: ['#219653', '#3C50E0', '#D34053', '#D1D5DB'],
                chart: { ...commun.chart, stacked: true },
                legend: { position: 'top', horizontalAlign: 'left', fontSize: '11px', markers: { radius: 3 } },
                xaxis: { categories: moisPipeline.map(libelleMois), labels: { rotate: -45, style: { fontSize: '10px' } } },
                yaxis: { labels: { formatter: (v: number) => String(Math.round(v)) } },
                plotOptions: { bar: { borderRadius: 2, columnWidth: '65%' } } }} />
          )}
        </div>

        {/* « Ce qui est en cours », la question posée telle quelle. Les états terminés sont exclus :
            les mélanger noierait les dossiers vivants sous les dossiers clos. */}
        <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
          <h3 className="mb-1 text-sm font-semibold text-black dark:text-white">{t('admin.partnerStats.stageTitle')}</h3>
          <p className="mb-3 text-xs text-body">{t('admin.partnerStats.stageHint', { n: pip.open })}</p>
          {byStage.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">{t('admin.partnerStats.stageNone')}</p>
          ) : (
            <ReactApexChart type="bar" height={260}
              series={[{ name: t('admin.partnerStats.pipe.open') as string, data: byStage.map((s) => s.count) }]}
              options={{ ...commun,
                xaxis: { categories: byStage.map((s) => s.stage) },
                // Sur un histogramme horizontal les libellés sont sur l'axe Y, et Apex les rogne à
                // une largeur par défaut trop courte : « Deposit Information Recei… ». Mesuré.
                yaxis: { labels: { maxWidth: 210, style: { fontSize: '11px' } } },
                plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: '65%' } },
                dataLabels: { enabled: true, style: { fontSize: '11px' } } }} />
          )}
        </div>
      </div>

      {/* Par partenaire : un TABLEAU et pas un graphique comparé. Il n'y a qu'un partenaire
          aujourd'hui — un histogramme à une barre ne dit rien, un tableau reste lisible à une
          ligne et monte à N sans être redessiné. */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-sm font-semibold text-black dark:text-white">{t('admin.partnerStats.byPartnerPipeline')}</h3>
          <p className="mt-0.5 text-xs text-body">{t('admin.partnerStats.byPartnerPipelineHint')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stroke dark:border-strokedark">
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.colPartner')}</th>
                {(['submitted', 'withDeal', 'open', 'won', 'lost', 'noStage'] as const).map((c) => (
                  <th key={c} className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-body">{t(`admin.partnerStats.pipe.${c}`)}</th>
                ))}
                <th className="whitespace-nowrap px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partnerStats.colWinRate')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partnerStats.colPaid')}</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.map((p) => {
                const d = p.won + p.lost;
                return (
                  <tr key={p.partnerId} className="border-b border-stroke last:border-0 dark:border-strokedark">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-black dark:text-white">
                      {p.partner}
                      {p.submitted30d > 0 && (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {t('admin.partnerStats.last30', { n: p.submitted30d })}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold text-black dark:text-white">{p.submitted}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-body">{p.withDeal}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-primary">{p.open}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold text-green-700 dark:text-success">{p.won}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-body">{p.lost}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-400">{p.noStage}</td>
                    {/* Un tiret plutôt que « 0 % » quand rien n'est tranché : 0 % se lit comme un
                        échec, alors qu'il n'y a simplement rien à mesurer encore. */}
                    <td className="px-3 py-3 text-right tabular-nums text-body">
                      {d ? `${Math.round((1000 * p.won) / d) / 10}%` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-body">{p.paid}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <h3 className="mt-2 px-1 text-sm font-semibold text-black dark:text-white">{t('admin.partnerStats.usageSection')}</h3>

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
