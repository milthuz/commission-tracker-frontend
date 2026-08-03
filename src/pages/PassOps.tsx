import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Breadcrumb from '../components/Breadcrumbs/Breadcrumb';
import PassLibraryAdmin from './PassLibraryAdmin';
import PassConfigAdmin from './PassConfigAdmin';

// Suivi interne des recommandations de La Passe (écran 06 du deck), permission
// `pass:referrals`. Écran du PRODUIT INTERNE, pas de la marque La Passe : barre latérale,
// thème Sales Hub, conventions de tableaux du projet. Un employé qui traite des dossiers
// est dans son outil de travail, pas sur le portail d'un marchand.
//
// C'est le seul endroit du produit où un clic engage de l'argent : passer un dossier « en
// service » fige un crédit et fait monter un compteur à VIE. D'où la confirmation nommée
// sur les deux actions irréversibles, et rien qui puisse partir par inadvertance.

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-production-b7f9.up.railway.app';
const STATUSES = ['new', 'contacted', 'live', 'credit_applied', 'not_qualified'] as const;

interface Referral {
  id: number;
  refCode: string;
  restaurant: { name: string; contactName: string; city: string; province: string; postalCode: string; contact: string; locale: string; relationship: string | null };
  status: string;
  submittedAt: string;
  contactedAt: string | null;
  liveAt: string | null;
  creditAppliedAt: string | null;
  tierAtSubmission: number | null;
  tierAtLive: number | null;
  creditAmount: number | null;
  certificateCode: string | null;
  possibleDuplicate: boolean;
  crmLeadId: string | null;
  crmLeadError: string | null;
  member: { id: number; email: string; name: string | null; business: string | null; locale: string; lifetimeLiveReferrals: number };
}

interface Summary {
  referrals: { total: number; awaiting_contact: number; live_this_month: number; credit_issued: number; credit_pending: number };
  members: { total: number; active: number };
}

const PassOps = () => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');

  const [rows, setRows] = useState<Referral[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  // Sous-onglets en barre de pastilles — le patron des autres pages du panneau admin.
  // La barre latérale du produit n'imbrique jamais ses menus.
  const [tab, setTab] = useState<'referrals' | 'library' | 'config'>('referrals');

  const money = (n: number) =>
    new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n || 0);
  const date = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const load = async () => {
    try {
      const [r, s] = await Promise.all([
        fetch(`${API_URL}/api/admin/pass/referrals?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`, { headers: auth() }),
        fetch(`${API_URL}/api/admin/pass/summary`, { headers: auth() }),
      ]);
      setRows(r.ok ? (await r.json()).referrals || [] : []);
      if (s.ok) setSummary(await s.json());
    } catch {
      setRows([]);
    }
  };

  // Recherche débattue : le filtrage se fait côté serveur, donc taper « Café » ne doit pas
  // déclencher quatre requêtes.
  useEffect(() => {
    const id = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(id);
  }, [status, q]);

  const act = async (r: Referral, next: string) => {
    const member = r.member.business || r.member.email;
    const ask =
      next === 'live' ? t('passOps.confirmLive', { restaurant: r.restaurant.name, member })
      : next === 'not_qualified' ? t('passOps.confirmNotQualified', { restaurant: r.restaurant.name })
      : null;
    if (ask && !window.confirm(ask)) return;

    setBusyId(r.id); setNotice(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/pass/referrals/${r.id}/status`, {
        method: 'PATCH',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setNotice({ tone: 'error', text: t('passOps.actionFailed') });
    } finally {
      setBusyId(null);
    }
  };

  const applyCredit = async (r: Referral) => {
    const member = r.member.business || r.member.email;
    if (!window.confirm(t('passOps.confirmCredit', { amount: money(r.creditAmount || 0), member }))) return;
    setBusyId(r.id); setNotice(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/pass/referrals/${r.id}/credit`, { method: 'POST', headers: auth() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      // Une liste de destinataires vide n'envoie RIEN. Le dire franchement : croire la
      // comptabilité avisée alors qu'elle ne l'est pas, c'est un crédit qui n'arrive jamais.
      setNotice(data.accountingNotified
        ? { tone: 'ok', text: t('passOps.creditSent') }
        : { tone: 'warn', text: t('passOps.creditNoRecipients') });
      await load();
    } catch {
      setNotice({ tone: 'error', text: t('passOps.actionFailed') });
    } finally {
      setBusyId(null);
    }
  };

  const kpis = useMemo(() => {
    if (!summary) return [];
    const s = summary.referrals;
    return [
      { label: t('pass.ops.kpi.total'), value: String(s.total) },
      { label: t('pass.ops.kpi.awaiting'), value: String(s.awaiting_contact) },
      { label: t('pass.ops.kpi.liveMonth'), value: String(s.live_this_month) },
      { label: t('pass.ops.kpi.creditIssued'), value: money(s.credit_issued) },
    ];
  }, [summary, fr]);

  const badge = (s: string) => {
    const tone: Record<string, string> = {
      new: 'bg-bodydark2/15 text-bodydark2 dark:text-bodydark1',
      contacted: 'bg-warning/15 text-warning',
      live: 'bg-primary/15 text-primary',
      credit_applied: 'bg-success/15 text-success',
      not_qualified: 'bg-danger/10 text-danger',
    };
    return `inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${tone[s] || tone.new}`;
  };

  return (
    <>
      <Breadcrumb pageName={t('sidebar.passOps')} />

      <div className="mb-5">
        <h2 className="text-title-md2 font-bold text-black dark:text-white">{t('passOps.title')}</h2>
        <p className="mt-1 text-sm text-bodydark2">{t('passOps.sub')}</p>
      </div>

      <div className="mb-5 inline-flex rounded-sm border border-stroke bg-white p-1 shadow-default dark:border-strokedark dark:bg-boxdark">
        {(['referrals', 'library', 'config'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-sm px-4 py-2 text-sm font-medium transition-colors duration-150 ${
              tab === k ? 'bg-primary text-white' : 'text-bodydark2 hover:text-black dark:hover:text-white'
            }`}
          >
            {t(`passOps.tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === 'library' && <PassLibraryAdmin />}
      {tab === 'config' && <PassConfigAdmin />}

      {tab === 'referrals' && (
      <>
      {/* Indicateurs */}
      {!!kpis.length && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-sm border border-stroke bg-white px-5 py-4 shadow-default dark:border-strokedark dark:bg-boxdark">
              <p className="text-sm text-bodydark2">{k.label}</p>
              <p className="mt-1 text-title-md font-bold text-black dark:text-white">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Barre de filtres en CARTE pleine largeur sous le titre — convention maison :
          sélecteurs à gauche, recherche qui s'étire, jamais flottante à côté du titre. */}
      <div className="mb-5 rounded-sm border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-stroke bg-transparent px-4 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4"
          >
            <option value="">{t('pass.ops.filters.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{t(`pass.status.${s}`)}</option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('passOps.search')}
            className="min-w-[220px] flex-1 rounded border border-stroke bg-transparent px-4 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4"
          />
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`mb-5 rounded-sm border px-4 py-3 text-sm ${
            notice.tone === 'ok' ? 'border-success/40 bg-success/10 text-success'
            : notice.tone === 'warn' ? 'border-warning/50 bg-warning/10 text-warning'
            : 'border-danger/40 bg-danger/10 text-danger'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] table-auto">
            <thead>
              <tr className="bg-gray-2 text-left dark:bg-meta-4">
                <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('pass.ops.columns.restaurant')}</th>
                <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('pass.ops.columns.member')}</th>
                <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('pass.ops.columns.sent')}</th>
                <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('pass.ops.columns.status')}</th>
                <th className="whitespace-nowrap px-4 py-4 text-right text-sm font-medium text-black dark:text-white">{t('pass.ops.columns.credit')}</th>
                {/* En-tete d'actions volontairement vide : la colonne se lit par ses
                    boutons, et un libelle « Actions » n'ajouterait qu'un mot a scanner. */}
                <th className="sticky right-0 bg-gray-2 px-4 py-4 dark:bg-meta-4" />
              </tr>
            </thead>
            <tbody>
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-bodydark2">
                    {status || q ? t('passOps.empty') : t('passOps.emptyAll')}
                  </td>
                </tr>
              )}

              {rows?.map((r) => (
                <tr key={r.id} className="border-t border-stroke dark:border-strokedark">
                  <td className="px-4 py-4">
                    <p className="font-medium text-black dark:text-white">{r.restaurant.name}</p>
                    <p className="mt-0.5 text-xs text-bodydark2">
                      {r.restaurant.city}, {r.restaurant.province} · {r.refCode}
                    </p>
                    {/* Signalements : jamais bloquants, mais visibles avant de payer. */}
                    {(r.possibleDuplicate || r.crmLeadError) && (
                      <p className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.possibleDuplicate && (
                          <span title={t('passOps.duplicateHint')} className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 9v5M12 17.5v.1" /><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
                            {t('passOps.duplicate')}
                          </span>
                        )}
                        {r.crmLeadError && (
                          <span title={r.crmLeadError} className="inline-flex whitespace-nowrap rounded bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium text-danger">
                            {t('passOps.crmFailed')}
                          </span>
                        )}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-black dark:text-white">{r.member.business || r.member.name || r.member.email}</p>
                    <p className="mt-0.5 whitespace-nowrap text-xs text-bodydark2">
                      {t('passOps.lifetime', { n: r.member.lifetimeLiveReferrals })}
                      {' · '}
                      {/* Langue de correspondance du membre — c'est elle qui décide la
                          langue de tout ce qu'on lui envoie. */}
                      {r.member.locale === 'fr-CA' ? 'FR' : 'EN'}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-black dark:text-white">{date(r.submittedAt)}</td>
                  <td className="px-4 py-4"><span className={badge(r.status)}>{t(`pass.status.${r.status}`)}</span></td>
                  <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-black dark:text-white">
                    {r.creditAmount === null ? '—' : money(r.creditAmount)}
                  </td>
                  {/* Colonne d'actions collée à droite, fond opaque : sur un écran étroit
                      elle doit rester lisible par-dessus le contenu qui défile dessous. */}
                  <td className="sticky right-0 bg-white px-4 py-4 text-right dark:bg-boxdark">
                    <div className="flex justify-end gap-2">
                      {r.status === 'new' && (
                        <button disabled={busyId === r.id} onClick={() => act(r, 'contacted')}
                          className="whitespace-nowrap rounded border border-stroke px-3 py-1.5 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-40 dark:border-strokedark">
                          {t('pass.ops.actions.markContacted')}
                        </button>
                      )}
                      {r.status === 'contacted' && (
                        <button disabled={busyId === r.id} onClick={() => act(r, 'live')}
                          className="whitespace-nowrap rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90 disabled:opacity-40">
                          {t('pass.ops.actions.markLive')}
                        </button>
                      )}
                      {r.status === 'live' && (
                        <button disabled={busyId === r.id} onClick={() => applyCredit(r)}
                          title={t('pass.ops.actions.apply')}
                          className="whitespace-nowrap rounded bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90 disabled:opacity-40">
                          {t('passOps.applyCredit')}
                        </button>
                      )}
                      {(r.status === 'new' || r.status === 'contacted') && (
                        <button disabled={busyId === r.id} onClick={() => act(r, 'not_qualified')}
                          title={t('passOps.markNotQualified')}
                          aria-label={t('passOps.markNotQualified')}
                          className="whitespace-nowrap rounded border border-stroke px-2 py-1.5 text-bodydark2 hover:border-danger hover:text-danger disabled:opacity-40 dark:border-strokedark">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                        </button>
                      )}
                      {r.status === 'credit_applied' && r.certificateCode && (
                        <span className="whitespace-nowrap font-mono text-xs text-bodydark2">{r.certificateCode}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </>
  );
};

export default PassOps;
