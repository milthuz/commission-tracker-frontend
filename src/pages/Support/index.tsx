import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactApexChart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import axios from 'axios';
import Select from '../../components/Select';

const API_URL = import.meta.env.VITE_API_URL;

// Deux teintes distinctes pour « créés » vs « résolus ». Écart validé : ΔE 32,2 en vision
// normale et 28,2 en deutéranopie — la paire reste lisible sans dépendre de la couleur seule
// (la légende et les libellés directs portent l'identité).
const SERIE_CREES = '#3C50E0';
const SERIE_RESOLUS = '#219653';

// Rampe SÉQUENTIELLE pour les tranches de délai : elles sont ORDONNÉES (< 1 h → > 3 j), donc
// une seule teinte du clair au foncé. Des couleurs catégorielles feraient croire à des
// catégories sans ordre, et un beignet détruirait l'ordre complètement.
const RAMPE_DELAI = ['#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1', '#4338CA'];

type Ligne = Record<string, any>;
type Rapport = {
  periode: { de: string; a: string; mois: number; departement: string | null };
  departements: { id: string; name: string; n: number }[];
  copie: {
    billets: number; plusAncien: string | null; plusRecent: string | null;
    derniereSynchro: string | null; rattrapage: string | null; exclu: string;
  };
  total: number; resolus: number; ouverts: number; categorises: number; marchands: number;
  medianeH: string | null; p90H: string | null;
  parMois: { mois: string; crees: number; resolus: number }[];
  parType: Ligne[]; sousTypes: Ligne[]; parCanal: Ligne[]; parLangue: Ligne[];
  parPriorite: Ligne[]; delais: { rang: number; n: number }[];
  parDepartement: Ligne[]; parAgent: Ligne[]; parMarchand: Ligne[];
  motsSujets: { mot: string; n: number }[];
};

type Onglet = 'apercu' | 'problemes' | 'equipe' | 'marchands';

// ---------------------------------------------------------------------------
// Petits éléments de présentation
// ---------------------------------------------------------------------------
function Carte({ titre, sous, children, className = '' }:
  { titre: string; sous?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark ${className}`}>
      <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
        <h3 className="text-base font-semibold text-black dark:text-white">{titre}</h3>
        {sous && <p className="mt-0.5 text-xs text-body">{sous}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Tuile({ libelle, valeur, note }: { libelle: string; valeur: string; note?: string }) {
  return (
    <div className="rounded-sm border border-stroke bg-white px-5 py-4 shadow-default dark:border-strokedark dark:bg-boxdark">
      <p className="text-xs font-medium uppercase tracking-wide text-body">{libelle}</p>
      <p className="mt-1 text-title-md font-bold text-black dark:text-white">{valeur}</p>
      {note && <p className="mt-0.5 text-xs text-body">{note}</p>}
    </div>
  );
}

// Barres horizontales en HTML : pour un classement à une seule mesure, c'est plus lisible
// qu'un graphique — la valeur est écrite à côté, et le texte garde ses jetons d'encre.
function Classement({ lignes, cle, valeur, couleur = SERIE_CREES, vide }:
  { lignes: Ligne[]; cle: string; valeur: string; couleur?: string; vide: string }) {
  const max = Math.max(1, ...lignes.map((l) => Number(l[valeur]) || 0));
  if (!lignes.length) return <p className="py-6 text-center text-sm text-body">{vide}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {lignes.map((l, i) => (
        <li key={i} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-black dark:text-white xl:w-52" title={String(l[cle])}>
            {String(l[cle])}
          </span>
          <span className="h-2.5 flex-1 rounded-full bg-stroke dark:bg-strokedark">
            <span className="block h-2.5 rounded-full"
              style={{ width: `${Math.max(2, (100 * (Number(l[valeur]) || 0)) / max)}%`, background: couleur }} />
          </span>
          <span className="w-14 shrink-0 text-right text-sm font-medium tabular-nums text-black dark:text-white">
            {(Number(l[valeur]) || 0).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
export default function Support() {
  const { t, i18n } = useTranslation();
  const [mois, setMois] = useState('12');
  const [dept, setDept] = useState('all');
  const [onglet, setOnglet] = useState<Onglet>('apercu');
  const [data, setData] = useState<Rapport | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [estAdmin, setEstAdmin] = useState(false);
  const [synchro, setSynchro] = useState<any>(null);
  const [lance, setLance] = useState(false);

  const jeton = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const charger = async () => {
    setChargement(true); setErreur('');
    try {
      const r = await axios.get(`${API_URL}/api/support/overview?months=${mois}&department=${dept}`, jeton());
      setData(r.data);
    } catch (e: any) {
      setErreur(e?.response?.data?.error || 'Erreur');
    } finally { setChargement(false); }
  };

  useEffect(() => { charger(); }, [mois, dept]);

  // L'état de la synchro n'est visible que des admins — l'endpoint le refuse aux autres, donc
  // un échec ici n'est pas une erreur, juste « pas admin ».
  useEffect(() => {
    axios.get(`${API_URL}/api/auth/verify`, jeton())
      .then((r) => setEstAdmin(r.data?.isAdmin === true))
      .catch(() => setEstAdmin(false));
  }, []);
  useEffect(() => {
    if (!estAdmin) return;
    const lire = () => axios.get(`${API_URL}/api/support/sync-status`, jeton())
      .then((r) => setSynchro(r.data)).catch(() => {});
    lire();
    const h = setInterval(lire, 20000);
    return () => clearInterval(h);
  }, [estAdmin]);

  const lancerRattrapage = async () => {
    setLance(true);
    try { await axios.post(`${API_URL}/api/support/sync`, { mode: 'backfill' }, jeton()); }
    catch { /* 409 = déjà en cours, l'état affiché le dira */ }
  };

  const libelleMois = (m: string) => {
    const [a, mo] = m.split('-');
    return new Date(Number(a), Number(mo) - 1, 1)
      .toLocaleDateString(i18n.language, { month: 'short', year: '2-digit' });
  };
  const dateCourte = (v: string | null) =>
    v ? new Date(v).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  // Un délai s'écrit en heures tant qu'il en reste peu, en jours ensuite : « 187,4 h » ne dit
  // rien à personne.
  const duree = (h: string | number | null) => {
    const v = Number(h);
    if (!h && h !== 0) return '—';
    if (!isFinite(v)) return '—';
    if (v < 1) return `${Math.round(v * 60)} min`;
    if (v < 48) return `${v.toFixed(1)} h`;
    return `${(v / 24).toFixed(1)} ${t('support.jours')}`;
  };

  const commun: ApexOptions = {
    chart: { fontFamily: 'Satoshi, sans-serif', toolbar: { show: false }, zoom: { enabled: false } },
    dataLabels: { enabled: false },
    grid: { borderColor: '#E2E8F0', strokeDashArray: 4 },
    tooltip: { theme: 'light' },
  };

  const tranches = useMemo(() => [
    t('support.delais.t1'), t('support.delais.t2'), t('support.delais.t3'),
    t('support.delais.t4'), t('support.delais.t5'),
  ] as string[], [i18n.language]);

  const optionsDept = useMemo(() => [
    { value: 'all', label: t('support.tousDept') as string },
    ...(data?.departements || []).map((d) => ({ value: d.id, label: `${d.name} (${d.n.toLocaleString()})` })),
  ], [data?.departements, i18n.language]);

  const ongletBtn = (id: Onglet, libelle: string) => (
    <button key={id} onClick={() => setOnglet(id)}
      className={`border-b-2 px-4 py-3 text-sm font-medium transition ${onglet === id
        ? 'border-primary text-primary'
        : 'border-transparent text-body hover:text-black dark:hover:text-white'}`}>
      {libelle}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">{t('support.title')}</h2>
        <p className="mt-1 text-sm text-body">{t('support.subtitle')}</p>
      </div>

      {/* Barre de filtres : carte pleine largeur SOUS le titre — sélecteurs à gauche, action
          épinglée à droite. */}
      <div className="rounded-sm border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-48">
            <Select value={mois} onChange={setMois} options={[
              { value: '3', label: t('support.periodes.m3') as string },
              { value: '6', label: t('support.periodes.m6') as string },
              { value: '12', label: t('support.periodes.m12') as string },
              { value: '24', label: t('support.periodes.m24') as string },
              { value: '60', label: t('support.periodes.tout') as string },
            ]} />
          </div>
          <div className="w-72">
            <Select value={dept} onChange={setDept} options={optionsDept} />
          </div>
          <div className="flex-1" />
          {estAdmin && (
            <div className="flex items-center gap-3">
              {synchro && (
                <span className="text-xs text-body">
                  {synchro.enCours
                    ? `${t('support.synchroEnCours')} ${synchro.avancement || ''}`
                    : `${(synchro.billets || 0).toLocaleString()} ${t('support.billetsCopies')}`}
                </span>
              )}
              <button onClick={lancerRattrapage} disabled={lance || synchro?.enCours}
                className="inline-flex items-center gap-2 rounded-md border border-stroke bg-white px-4 py-2 text-sm font-medium text-body hover:bg-gray-50 disabled:opacity-50 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
                {synchro?.enCours ? t('support.synchroEnCoursCourt') : t('support.rattrapage')}
              </button>
            </div>
          )}
        </div>
      </div>

      {chargement && (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}
      {!chargement && erreur && (
        <div className="rounded-sm border border-stroke bg-white p-8 text-center text-sm text-danger dark:border-strokedark dark:bg-boxdark">
          {erreur}
        </div>
      )}

      {!chargement && !erreur && data && data.total === 0 && (
        <div className="rounded-sm border border-stroke bg-white p-10 text-center dark:border-strokedark dark:bg-boxdark">
          <p className="text-sm font-medium text-black dark:text-white">{t('support.vide')}</p>
          <p className="mt-1 text-sm text-body">{t('support.videAide')}</p>
        </div>
      )}

      {!chargement && !erreur && data && data.total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Tuile libelle={t('support.kpi.total') as string} valeur={data.total.toLocaleString()}
              note={`${(data.total / Math.max(1, data.parMois.length)).toFixed(0)} ${t('support.kpi.parMois')}`} />
            <Tuile libelle={t('support.kpi.resolus') as string} valeur={data.resolus.toLocaleString()}
              note={`${((100 * data.resolus) / data.total).toFixed(0)} %`} />
            <Tuile libelle={t('support.kpi.ouverts') as string} valeur={data.ouverts.toLocaleString()} />
            <Tuile libelle={t('support.kpi.mediane') as string} valeur={duree(data.medianeH)}
              note={t('support.kpi.medianeNote') as string} />
            <Tuile libelle={t('support.kpi.p90') as string} valeur={duree(data.p90H)}
              note={t('support.kpi.p90Note') as string} />
            <Tuile libelle={t('support.kpi.marchands') as string} valeur={data.marchands.toLocaleString()} />
          </div>

          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex flex-wrap gap-1 border-b border-stroke px-4 dark:border-strokedark">
              {ongletBtn('apercu', t('support.onglets.apercu') as string)}
              {ongletBtn('problemes', t('support.onglets.problemes') as string)}
              {ongletBtn('equipe', t('support.onglets.equipe') as string)}
              {ongletBtn('marchands', t('support.onglets.marchands') as string)}
            </div>

            <div className="flex flex-col gap-4 p-4 md:p-6">
              {onglet === 'apercu' && (
                <>
                  <Carte titre={t('support.volume.titre') as string} sous={t('support.volume.sous') as string}>
                    <ReactApexChart type="bar" height={300}
                      series={[
                        { name: t('support.volume.crees') as string, data: data.parMois.map((m) => m.crees) },
                        { name: t('support.volume.resolus') as string, data: data.parMois.map((m) => m.resolus) },
                      ]}
                      options={{
                        ...commun,
                        colors: [SERIE_CREES, SERIE_RESOLUS],
                        legend: { position: 'top', horizontalAlign: 'left', fontSize: '12px', markers: { radius: 3 } },
                        plotOptions: { bar: { columnWidth: '60%', borderRadius: 4, borderRadiusApplication: 'end' } },
                        stroke: { show: true, width: 2, colors: ['transparent'] },
                        xaxis: {
                          categories: data.parMois.map((m) => libelleMois(m.mois)),
                          labels: { rotate: -45, style: { fontSize: '11px' } },
                        },
                        yaxis: { labels: { style: { fontSize: '11px' } } },
                      }} />
                  </Carte>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Carte titre={t('support.delais.titre') as string} sous={t('support.delais.sous') as string}>
                      <ReactApexChart type="bar" height={260}
                        series={[{
                          name: t('support.delais.serie') as string,
                          data: [1, 2, 3, 4, 5].map((r) => data.delais.find((d) => d.rang === r)?.n || 0),
                        }]}
                        options={{
                          ...commun,
                          colors: RAMPE_DELAI,
                          plotOptions: {
                            bar: { columnWidth: '55%', borderRadius: 4, borderRadiusApplication: 'end', distributed: true },
                          },
                          legend: { show: false },
                          xaxis: { categories: tranches, labels: { style: { fontSize: '11px' } } },
                          yaxis: { labels: { style: { fontSize: '11px' } } },
                        }} />
                    </Carte>

                    <Carte titre={t('support.canaux.titre') as string} sous={t('support.canaux.sous') as string}>
                      <Classement lignes={data.parCanal.slice(0, 8)} cle="canal" valeur="n"
                        vide={t('support.aucun') as string} />
                      <div className="mt-5 border-t border-stroke pt-4 dark:border-strokedark">
                        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-body">
                          {t('support.langues')}
                        </p>
                        <Classement lignes={data.parLangue.slice(0, 5)} cle="langue" valeur="n"
                          vide={t('support.aucun') as string} />
                      </div>
                    </Carte>
                  </div>
                </>
              )}

              {onglet === 'problemes' && (
                <>
                  <Carte titre={t('support.types.titre') as string}
                    sous={`${t('support.types.sous')} — ${((100 * data.categorises) / data.total).toFixed(0)} % ${t('support.types.couverture')}`}>
                    <Classement lignes={data.parType} cle="type" valeur="n" vide={t('support.aucun') as string} />
                    {data.parType.length > 0 && (
                      <div className="mt-5 overflow-x-auto border-t border-stroke pt-4 dark:border-strokedark">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs uppercase tracking-wide text-body">
                              <th className="pb-2 pr-4 font-medium">{t('support.types.type')}</th>
                              <th className="pb-2 pr-4 text-right font-medium">{t('support.billets')}</th>
                              <th className="pb-2 text-right font-medium">{t('support.medianeCourt')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.parType.map((l, i) => (
                              <tr key={i} className="border-t border-stroke dark:border-strokedark">
                                <td className="py-2 pr-4 text-black dark:text-white">{l.type}</td>
                                <td className="py-2 pr-4 text-right tabular-nums">{Number(l.n).toLocaleString()}</td>
                                <td className="py-2 text-right tabular-nums">{duree(l.mediane_h)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Carte>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Carte titre={t('support.sousTypes.titre') as string} sous={t('support.sousTypes.sous') as string}>
                      {['POS Software', 'Customer Success'].map((fam) => {
                        const l = data.sousTypes.filter((x) => x.famille === fam).slice(0, 12);
                        if (!l.length) return null;
                        return (
                          <div key={fam} className="mb-5 last:mb-0">
                            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-body">{fam}</p>
                            <Classement lignes={l} cle="valeur" valeur="n" vide={t('support.aucun') as string} />
                          </div>
                        );
                      })}
                    </Carte>

                    <Carte titre={t('support.mots.titre') as string} sous={t('support.mots.sous') as string}>
                      <div className="max-h-[520px] overflow-y-auto pr-1">
                        <Classement lignes={data.motsSujets} cle="mot" valeur="n" vide={t('support.aucun') as string} />
                      </div>
                    </Carte>
                  </div>
                </>
              )}

              {onglet === 'equipe' && (
                <>
                  <Carte titre={t('support.dept.titre') as string} sous={t('support.dept.sous') as string}>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-body">
                            <th className="pb-2 pr-4 font-medium">{t('support.dept.nom')}</th>
                            <th className="pb-2 pr-4 text-right font-medium">{t('support.billets')}</th>
                            <th className="pb-2 pr-4 text-right font-medium">{t('support.ouverts')}</th>
                            <th className="pb-2 text-right font-medium">{t('support.medianeCourt')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.parDepartement.map((l, i) => (
                            <tr key={i} className="border-t border-stroke dark:border-strokedark">
                              <td className="py-2 pr-4 text-black dark:text-white">{l.nom}</td>
                              <td className="py-2 pr-4 text-right tabular-nums">{Number(l.n).toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right tabular-nums">{Number(l.ouverts).toLocaleString()}</td>
                              <td className="py-2 text-right tabular-nums">{duree(l.mediane_h)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Carte>

                  <Carte titre={t('support.agents.titre') as string} sous={t('support.agents.sous') as string}>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-body">
                            <th className="pb-2 pr-4 font-medium">{t('support.agents.nom')}</th>
                            <th className="pb-2 pr-4 text-right font-medium">{t('support.billets')}</th>
                            <th className="pb-2 pr-4 text-right font-medium">{t('support.resolus')}</th>
                            <th className="pb-2 pr-4 text-right font-medium">{t('support.ouverts')}</th>
                            <th className="pb-2 text-right font-medium">{t('support.medianeCourt')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.parAgent.map((l, i) => (
                            <tr key={i} className="border-t border-stroke dark:border-strokedark">
                              <td className="py-2 pr-4 text-black dark:text-white">{l.nom}</td>
                              <td className="py-2 pr-4 text-right tabular-nums">{Number(l.n).toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right tabular-nums">{Number(l.resolus).toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right tabular-nums">{Number(l.ouverts).toLocaleString()}</td>
                              <td className="py-2 text-right tabular-nums">{duree(l.mediane_h)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Carte>
                </>
              )}

              {onglet === 'marchands' && (
                <Carte titre={t('support.marchands.titre') as string} sous={t('support.marchands.sous') as string}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-body">
                          <th className="pb-2 pr-4 font-medium">{t('support.marchands.nom')}</th>
                          <th className="pb-2 pr-4 text-right font-medium">{t('support.billets')}</th>
                          <th className="pb-2 pr-4 text-right font-medium">{t('support.ouverts')}</th>
                          <th className="pb-2 pr-4 text-right font-medium">{t('support.medianeCourt')}</th>
                          <th className="pb-2 text-right font-medium">{t('support.marchands.dernier')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.parMarchand.map((l, i) => (
                          <tr key={i} className="border-t border-stroke dark:border-strokedark">
                            <td className="py-2 pr-4 text-black dark:text-white">{l.nom}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{Number(l.n).toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{Number(l.ouverts).toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{duree(l.mediane_h)}</td>
                            <td className="py-2 text-right text-body">{dateCourte(l.dernier)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Carte>
              )}
            </div>
          </div>

          {/* Ce que la page NE couvre PAS. Écrit sur la page plutôt que caché dans le code :
              un total qui a l'air complet et ne l'est pas est pire qu'un total annoté. */}
          <div className="rounded-sm border border-stroke bg-white px-5 py-4 text-xs text-body shadow-default dark:border-strokedark dark:bg-boxdark">
            <p>
              {t('support.note.copie', {
                n: data.copie.billets.toLocaleString(),
                de: dateCourte(data.copie.plusAncien),
                a: dateCourte(data.copie.plusRecent),
                synchro: data.copie.derniereSynchro
                  ? new Date(data.copie.derniereSynchro).toLocaleString(i18n.language)
                  : '—',
              })}
            </p>
            <p className="mt-1">{t('support.note.exclu')}</p>
            <p className="mt-1">{t('support.note.delai')}</p>
          </div>
        </>
      )}
    </div>
  );
}
