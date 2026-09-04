import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import Select from '../../components/Select';

const API_URL = import.meta.env.VITE_API_URL;

type Marchand = {
  nom: string; revenu: number; saas: number; rep: string | null;
  billets: number; ouverts: number; lents: number;
  mediane_h: string | null; dernier: string | null; type_dominant: string | null;
  revenu_par_billet: number | null;
};
type Motif = { motif: string; marchands: number; moy12: number; med12: number; moy3: number; moy_lents: number };
type Donnees = {
  resume: { clients: number; apparies: number; revenu: number; billets: number; lents: number };
  marchands: Marchand[];
  exclus: string[];
  churn: {
    parMotif: Motif[];
    temoin: { marchands: number; moy12: number; med12: number; moy3: number; moy_lents: number };
    motifs: { motif: string; n: number }[];
  } | null;
};

function Carte({ titre, sous, children }: { titre: string; sous?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-5 py-4 dark:border-strokedark">
        <h3 className="text-base font-semibold text-black dark:text-white">{titre}</h3>
        {sous && <p className="mt-0.5 text-xs text-body">{sous}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function SupportMerchants({ canManageExclusions }: { canManageExclusions: boolean }) {
  const { t, i18n } = useTranslation();
  const [mois, setMois] = useState('12');
  const [revenuMin, setRevenuMin] = useState('0');
  const [data, setData] = useState<Donnees | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [nouvelExclu, setNouvelExclu] = useState('');
  const [gereExclus, setGereExclus] = useState(false);

  const jeton = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const charger = async () => {
    setChargement(true); setErreur('');
    try {
      const r = await axios.get(
        `${API_URL}/api/support/merchants?months=${mois}&minRevenue=${revenuMin}`, jeton());
      setData(r.data);
    } catch (e: any) {
      setErreur(e?.response?.data?.error || 'Erreur');
    } finally { setChargement(false); }
  };
  useEffect(() => { charger(); }, [mois, revenuMin]);

  const argent = (v: number | null) =>
    v == null ? '—' : v.toLocaleString(i18n.language, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  const duree = (h: string | number | null) => {
    const v = Number(h);
    if (h == null || !isFinite(v)) return '—';
    if (v < 1) return `${Math.round(v * 60)} min`;
    if (v < 48) return `${v.toFixed(1)} h`;
    return `${(v / 24).toFixed(1)} ${t('support.jours')}`;
  };
  const dateCourte = (v: string | null) =>
    v ? new Date(v).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: '2-digit' }) : '—';

  const ajouterExclu = async () => {
    const nom = nouvelExclu.trim();
    if (!nom) return;
    await axios.post(`${API_URL}/api/support/excluded-accounts`, { name: nom }, jeton());
    setNouvelExclu(''); charger();
  };
  const retirerExclu = async (nom: string) => {
    await axios.delete(`${API_URL}/api/support/excluded-accounts?name=${encodeURIComponent(nom)}`, jeton());
    charger();
  };

  if (chargement) {
    return <div className="flex h-40 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>;
  }
  if (erreur) {
    return <div className="rounded-sm border border-stroke bg-white p-8 text-center text-sm text-danger dark:border-strokedark dark:bg-boxdark">{erreur}</div>;
  }
  if (!data) return null;

  const ch = data.churn;
  const temoin = ch?.temoin;
  // Le rapport au groupe temoin : c'est ce chiffre qui dit s'il y a un signal, ou pas.
  const ratio = (v: number, base?: number) => (base && base > 0 ? v / base : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Select value={mois} onChange={setMois} options={[
            { value: '3', label: t('support.periodes.m3') as string },
            { value: '6', label: t('support.periodes.m6') as string },
            { value: '12', label: t('support.periodes.m12') as string },
            { value: '24', label: t('support.periodes.m24') as string },
          ]} />
        </div>
        <div className="w-56">
          <Select value={revenuMin} onChange={setRevenuMin} options={[
            { value: '0', label: t('support.rev.tous') as string },
            { value: '1000', label: t('support.rev.min', { n: '1 000' }) as string },
            { value: '5000', label: t('support.rev.min', { n: '5 000' }) as string },
            { value: '15000', label: t('support.rev.min', { n: '15 000' }) as string },
          ]} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-sm border border-stroke bg-white px-5 py-4 shadow-default dark:border-strokedark dark:bg-boxdark">
          <p className="text-xs font-medium uppercase tracking-wide text-body">{t('support.rev.apparies')}</p>
          <p className="mt-1 text-title-md font-bold text-black dark:text-white">
            {data.resume.apparies.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-body">
            {t('support.rev.surClients', { n: data.resume.clients.toLocaleString() })}
          </p>
        </div>
        <div className="rounded-sm border border-stroke bg-white px-5 py-4 shadow-default dark:border-strokedark dark:bg-boxdark">
          <p className="text-xs font-medium uppercase tracking-wide text-body">{t('support.rev.revenu')}</p>
          <p className="mt-1 text-title-md font-bold text-black dark:text-white">{argent(data.resume.revenu)}</p>
        </div>
        <div className="rounded-sm border border-stroke bg-white px-5 py-4 shadow-default dark:border-strokedark dark:bg-boxdark">
          <p className="text-xs font-medium uppercase tracking-wide text-body">{t('support.billets')}</p>
          <p className="mt-1 text-title-md font-bold text-black dark:text-white">{data.resume.billets.toLocaleString()}</p>
        </div>
        <div className="rounded-sm border border-stroke bg-white px-5 py-4 shadow-default dark:border-strokedark dark:bg-boxdark">
          <p className="text-xs font-medium uppercase tracking-wide text-body">{t('support.rev.lents')}</p>
          <p className="mt-1 text-title-md font-bold text-black dark:text-white">{data.resume.lents.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-body">{t('support.rev.lentsNote')}</p>
        </div>
      </div>

      {/* ── LE SIGNAL DE DEPART ─────────────────────────────────────────────────
          Ce tableau vient AVANT le classement : sans lui, un lecteur conclut que
          « beaucoup de billets = client a risque », ce que les donnees contredisent. */}
      {ch && temoin && ch.parMotif.length > 0 && (
        <Carte titre={t('support.churn.titre') as string} sous={t('support.churn.sous') as string}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-body">
                  <th className="pb-2 pr-4 font-medium">{t('support.churn.motif')}</th>
                  <th className="pb-2 pr-4 text-right font-medium">{t('support.churn.marchands')}</th>
                  <th className="pb-2 pr-4 text-right font-medium">{t('support.churn.moy12')}</th>
                  <th className="pb-2 pr-4 text-right font-medium">{t('support.churn.moy3')}</th>
                  <th className="pb-2 text-right font-medium">{t('support.churn.lents')}</th>
                </tr>
              </thead>
              <tbody>
                {ch.parMotif.map((m, i) => {
                  const r = ratio(m.moy_lents, temoin.moy_lents);
                  return (
                    <tr key={i} className="border-t border-stroke dark:border-strokedark">
                      <td className="py-2 pr-4 text-black dark:text-white">{m.motif}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{m.marchands.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{m.moy12?.toFixed(1)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{m.moy3?.toFixed(1)}</td>
                      <td className="py-2 text-right tabular-nums font-medium text-black dark:text-white">
                        {m.moy_lents?.toFixed(2)}
                        {r && r >= 1.5 && (
                          <span className="ml-1.5 text-xs font-semibold text-danger">×{r.toFixed(1)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-stroke bg-gray-50 dark:border-strokedark dark:bg-meta-4">
                  <td className="py-2 pr-4 font-semibold text-black dark:text-white">{t('support.churn.temoin')}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{temoin.marchands.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{temoin.moy12?.toFixed(1)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{temoin.moy3?.toFixed(1)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-black dark:text-white">
                    {temoin.moy_lents?.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 rounded-md bg-primary bg-opacity-5 px-4 py-3 text-sm text-body">
            {t('support.churn.lecture')}
          </p>
          {ch.motifs.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {ch.motifs.slice(0, 8).map((m, i) => (
                <span key={i} className="rounded-full bg-stroke px-3 py-1 text-xs text-black dark:bg-meta-4 dark:text-white">
                  {m.motif} · {m.n.toLocaleString()}
                </span>
              ))}
            </div>
          )}
        </Carte>
      )}

      <Carte titre={t('support.rev.titre') as string} sous={t('support.rev.sous') as string}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-body">
                <th className="pb-2 pr-3 font-medium">{t('support.marchands.nom')}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t('support.rev.revenu')}</th>
                <th className="pb-2 pr-3 font-medium">{t('support.rev.rep')}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t('support.billets')}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t('support.ouverts')}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t('support.rev.lentsCourt')}</th>
                <th className="pb-2 pr-3 text-right font-medium">{t('support.medianeCourt')}</th>
                <th className="pb-2 pr-3 font-medium">{t('support.types.type')}</th>
                <th className="pb-2 text-right font-medium">{t('support.marchands.dernier')}</th>
              </tr>
            </thead>
            <tbody>
              {data.marchands.filter((m) => m.billets > 0).map((m, i) => (
                <tr key={i} className="border-t border-stroke dark:border-strokedark">
                  <td className="max-w-[220px] truncate py-2 pr-3 text-black dark:text-white" title={m.nom}>{m.nom}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{argent(m.revenu)}</td>
                  <td className="max-w-[130px] truncate py-2 pr-3 text-body" title={m.rep || ''}>{m.rep || '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.billets}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.ouverts || '—'}</td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums text-black dark:text-white">{m.lents || '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{duree(m.mediane_h)}</td>
                  <td className="max-w-[130px] truncate py-2 pr-3 text-body">{m.type_dominant || '—'}</td>
                  <td className="py-2 text-right text-body">{dateCourte(m.dernier)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Carte>

      <Carte titre={t('support.exclus.titre') as string} sous={t('support.exclus.sous') as string}>
        <div className="flex flex-wrap gap-2">
          {data.exclus.map((n) => (
            <span key={n} className="inline-flex items-center gap-1.5 rounded-full bg-stroke px-3 py-1 text-xs text-black dark:bg-meta-4 dark:text-white">
              {n}
              {gereExclus && canManageExclusions && (
                <button onClick={() => retirerExclu(n)} className="text-danger hover:opacity-70" title={t('support.exclus.retirer') as string}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {canManageExclusions && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!gereExclus ? (
              <button onClick={() => setGereExclus(true)}
                className="rounded-md border border-stroke bg-white px-4 py-2 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
                {t('support.exclus.gerer')}
              </button>
            ) : (
              <>
                <input value={nouvelExclu} onChange={(e) => setNouvelExclu(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') ajouterExclu(); }}
                  placeholder={t('support.exclus.nom') as string}
                  className="w-72 rounded-md border border-stroke bg-transparent px-4 py-2 text-sm outline-none focus:border-primary dark:border-strokedark" />
                <button onClick={ajouterExclu}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90">
                  {t('support.exclus.ajouter')}
                </button>
                <button onClick={() => setGereExclus(false)} className="px-2 text-sm text-body hover:underline">
                  {t('support.exclus.termine')}
                </button>
              </>
            )}
          </div>
        )}
      </Carte>
    </div>
  );
}
