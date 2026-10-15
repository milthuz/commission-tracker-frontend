import { useEffect, useMemo, useState } from 'react';
import { dialog } from '../lib/dialog';
import Select from '../components/Select';
import { useTranslation } from 'react-i18next';
import PassLibraryAdmin from './PassLibraryAdmin';
import PassConfigAdmin from './PassConfigAdmin';
import { authHeaders } from '../lib/auth';
import { Modal, PageHeader, StatusPill, Tabs, type StatusFamily } from '../components/ui';

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
  creditMax: number | null;
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

  const auth = () => authHeaders();

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
    if (ask && !(await dialog.confirm(ask, next === 'not_qualified' ? { danger: true } : undefined))) return;

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

  // Le palier donne un PLAFOND, pas un montant : on ne sait qu'ici quels services la
  // référence a réellement pris. D'où une saisie, pré-remplie au plafond — le cas le plus
  // fréquent reste le montant plein, et pré-remplir évite de retaper ce qui est déjà juste.
  const [creditFor, setCreditFor] = useState<Referral | null>(null);
  const [creditInput, setCreditInput] = useState('');

  const openCredit = (r: Referral) => {
    setCreditFor(r);
    setCreditInput(String(r.creditMax ?? r.creditAmount ?? ''));
  };

  const applyCredit = async (r: Referral, amount: number) => {
    setBusyId(r.id); setNotice(null); setCreditFor(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/pass/referrals/${r.id}/credit`, {
        method: 'POST',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
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

  const badgeFamily = (s: string): StatusFamily => (
    ({ new: 'neutral', contacted: 'wait', live: 'new', credit_applied: 'ok', not_qualified: 'err' } as Record<string, StatusFamily>)[s] || 'neutral'
  );

  return (
    <>
      <PageHeader section={t('sidebar.sections.ops')} title={t('passOps.title')} subtitle={t('passOps.sub')} />

      <div className="mb-5">
        <Tabs ariaLabel={t('passOps.title') as string} value={tab} onChange={setTab}
          tabs={(['referrals', 'library', 'config'] as const).map((k) => ({ id: k, label: t(`passOps.tabs.${k}`) }))} />
      </div>

      {tab === 'library' && <PassLibraryAdmin />}
      {tab === 'config' && <PassConfigAdmin />}

      {tab === 'referrals' && (
      <>
      {/* Indicateurs */}
      {!!kpis.length && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border border-stroke bg-white px-5 py-4 dark:border-strokedark dark:bg-boxdark">
              <p className="text-sm font-medium text-body dark:text-bodydark2">{k.label}</p>
              <p className="mt-1 text-2xl font-bold leading-tight text-black dark:text-white">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Barre de filtres en CARTE pleine largeur sous le titre — convention maison :
          sélecteurs à gauche, recherche qui s'étire, jamais flottante à côté du titre. */}
      <div className="mb-5 rounded-2xl border border-stroke bg-white p-4 dark:border-strokedark dark:bg-boxdark">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={status} onChange={(v) => setStatus(v)} options={[{ value: '', label: t('pass.ops.filters.all') as string }, ...STATUSES.map((st) => ({ value: st, label: t(`pass.status.${st}`) as string }))]} buttonClassName={'rounded-[10px] border border-stroke bg-transparent px-4 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4'} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('passOps.search')}
            className="min-w-[220px] flex-1 rounded-[10px] border border-stroke bg-transparent px-4 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4"
          />
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === 'ok' ? 'border-success/40 bg-success/10 text-success'
            : notice.tone === 'warn' ? 'border-warning/50 bg-warning/10 text-warning'
            : 'border-danger/40 bg-danger/10 text-danger'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] table-auto">
            <thead>
              <tr className="border-b border-stroke text-left dark:border-strokedark">
                <th className="whitespace-nowrap px-4 py-4 text-xs font-bold text-body dark:text-bodydark2">{t('pass.ops.columns.restaurant')}</th>
                <th className="whitespace-nowrap px-4 py-4 text-xs font-bold text-body dark:text-bodydark2">{t('pass.ops.columns.member')}</th>
                <th className="whitespace-nowrap px-4 py-4 text-xs font-bold text-body dark:text-bodydark2">{t('pass.ops.columns.sent')}</th>
                <th className="whitespace-nowrap px-4 py-4 text-xs font-bold text-body dark:text-bodydark2">{t('pass.ops.columns.status')}</th>
                <th className="whitespace-nowrap px-4 py-4 text-right text-xs font-bold text-body dark:text-bodydark2">{t('pass.ops.columns.credit')}</th>
                {/* En-tete d'actions volontairement vide : la colonne se lit par ses
                    boutons, et un libelle « Actions » n'ajouterait qu'un mot a scanner. */}
                <th className="sticky right-0 bg-white px-4 py-4 dark:bg-boxdark" />
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
                  <td className="px-4 py-4"><StatusPill family={badgeFamily(r.status)}>{t(`pass.status.${r.status}`)}</StatusPill></td>
                  <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-bold text-black dark:text-white">
                    {r.creditAmount === null ? '—' : money(r.creditAmount)}
                  </td>
                  {/* Colonne d'actions collée à droite, fond opaque : sur un écran étroit
                      elle doit rester lisible par-dessus le contenu qui défile dessous. */}
                  <td className="sticky right-0 bg-white px-4 py-4 text-right dark:bg-boxdark">
                    <div className="flex justify-end gap-2">
                      {r.status === 'new' && (
                        <button disabled={busyId === r.id} onClick={() => act(r, 'contacted')}
                          className="whitespace-nowrap rounded-[10px] border border-stroke px-3 py-1.5 text-xs font-bold text-black hover:border-primary disabled:opacity-40 dark:border-strokedark dark:text-white">
                          {t('pass.ops.actions.markContacted')}
                        </button>
                      )}
                      {r.status === 'contacted' && (
                        <button disabled={busyId === r.id} onClick={() => act(r, 'live')}
                          className="whitespace-nowrap rounded-[10px] bg-primary px-3 py-1.5 text-xs font-bold text-[#141414] hover:bg-[#F79C6A] disabled:opacity-40">
                          {t('pass.ops.actions.markLive')}
                        </button>
                      )}
                      {r.status === 'live' && (
                        <button disabled={busyId === r.id} onClick={() => openCredit(r)}
                          title={t('pass.ops.actions.apply')}
                          className="whitespace-nowrap rounded-[10px] bg-success px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-opacity-90 disabled:opacity-40">
                          {t('passOps.applyCredit')}
                        </button>
                      )}
                      {(r.status === 'new' || r.status === 'contacted') && (
                        <button disabled={busyId === r.id} onClick={() => act(r, 'not_qualified')}
                          title={t('passOps.markNotQualified')}
                          aria-label={t('passOps.markNotQualified')}
                          className="whitespace-nowrap rounded-[10px] border border-stroke px-2 py-1.5 text-bodydark2 hover:border-danger hover:text-danger disabled:opacity-40 dark:border-strokedark">
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
      {creditFor && (() => {
        const ceiling = creditFor.creditMax ?? creditFor.creditAmount ?? 0;
        const asked = Number(creditInput);
        // Le serveur borne aussi : ceci n'est qu'un garde-fou de saisie, pas la règle.
        const invalid = !Number.isFinite(asked) || asked <= 0 || asked > ceiling;
        return (
          <Modal open onClose={() => setCreditFor(null)} size="sm" title={t('passOps.creditTitle')}
            footer={<>
              <button onClick={() => setCreditFor(null)}
                className="rounded-[10px] border border-stroke px-4 py-2 text-sm font-bold text-body hover:border-primary hover:text-black dark:border-strokedark dark:text-bodydark2 dark:hover:text-white">
                {t('passOps.cancel')}
              </button>
              <button disabled={invalid} onClick={() => applyCredit(creditFor, asked)}
                className="rounded-[10px] bg-primary px-4 py-2 text-sm font-bold text-[#141414] hover:bg-[#F79C6A] disabled:opacity-50">
                {t('passOps.creditConfirm')}
              </button>
            </>}>
            <p className="m-0 text-sm text-body dark:text-bodydark2">
              {creditFor.restaurant.name} — {creditFor.member.business || creditFor.member.email}
            </p>
            <div>
              <label className="block text-xs font-bold text-body dark:text-bodydark2">{t('passOps.creditAmountLabel')}</label>
              <input
                type="number" min={1} max={ceiling} step="0.01" autoFocus
                value={creditInput}
                onChange={(e) => setCreditInput(e.target.value)}
                className="mt-1 w-full rounded-[10px] border border-stroke bg-transparent px-4 py-2.5 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
              />
              <p className="mt-2 text-xs text-body">{t('passOps.creditCeiling', { amount: money(ceiling) })}</p>
              {invalid && <p className="mt-2 text-xs font-medium text-danger">{t('passOps.creditOutOfRange', { amount: money(ceiling) })}</p>}
            </div>
          </Modal>
        );
      })()}
    </>

  );
};

export default PassOps;
