import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import Select from '../components/Select';
import { ContentLoader } from '../common/Loader';
import { Button, Modal, PageHeader, StateCard, toast, useUrlTab } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../lib/auth';
import { dialog } from '../lib/dialog';
import { fmtDateOnly, fmtMonth } from '../lib/format';
import MonthView, { buildRows } from './PointsTracker/MonthView';
import YearView, { type YearMonth } from './PointsTracker/YearView';
import { type PointsData, UNASSIGNED, monthClock, planMonths, todayYmd } from './PointsTracker/points';

// Suivi des points — refonte d'après le canevas « Sales Hub — refonte UI » : planche « écran
// retenu (mois en cours) » et planche « onglet Année ». Même adresse, mêmes données
// (/api/crm/points) et mêmes droits que l'ancien écran : le serveur décide qui voit quoi.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const VIEWS = ['mois', 'annee'] as const;
type View = (typeof VIEWS)[number];

const CommissionTracker = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;   // identité EFFECTIVE (/api/auth/verify), jamais le JWT brut

  const today = todayYmd();
  const [curYear, curMonth] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const [view, setView] = useUrlTab<View>('mois', VIEWS, 'vue');
  const [period, setPeriod] = useState(`${curYear}-${String(curMonth).padStart(2, '0')}`);
  const year = Number(period.slice(0, 4)), month = Number(period.slice(5, 7));
  const [teamKey, setTeamKey] = useState<string>('all');

  const [data, setData] = useState<PointsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [yearMonths, setYearMonths] = useState<YearMonth[] | null>(null);
  const [yearError, setYearError] = useState('');
  const [activeReps, setActiveReps] = useState<string[]>([]);
  const [missing, setMissing] = useState({ open: false, reference: '', message: '', sending: false });

  const fetchMonth = (y: number, m: number) =>
    axios.get(`${API_URL}/api/crm/points`, { headers: authHeaders(), params: { year: y, month: m } }).then((r) => r.data as PointsData);

  const load = async () => {
    setLoading(true); setError('');
    try { setData(await fetchMonth(year, month)); }
    catch (e: any) { setError(e?.response?.data?.error || (t('errors.loadFailed') as string)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period]);

  // Onglet Année : un appel par mois du plan, en parallèle, seulement quand on l'ouvre. Un mois
  // en erreur laisse sa colonne en « — » au lieu de faire tomber toute la grille.
  const loadYear = async () => {
    setYearError('');
    const months = planMonths(curYear, curMonth);
    const res = await Promise.allSettled(months.map((mo) => fetchMonth(mo.year, mo.month)));
    if (res.every((r) => r.status === 'rejected')) { setYearError(t('errors.loadFailed') as string); return; }
    setYearMonths(months.map((mo, i) => ({ ...mo, data: res[i].status === 'fulfilled' ? (res[i] as PromiseFulfilledResult<PointsData>).value : null })));
  };
  useEffect(() => { if (view === 'annee' && !yearMonths) loadYear(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view]);

  useEffect(() => {
    if (!isAdmin) return;
    axios.get(`${API_URL}/api/salespeople`, { headers: authHeaders() }).then((r) => setActiveReps(r.data.salespeople || [])).catch(() => setActiveReps([]));
  }, [isAdmin]);

  const overrideSource = async (dealId: string, source: string) => {
    try {
      await axios.put(`${API_URL}/api/crm/deals/${encodeURIComponent(dealId)}/source`, { source }, { headers: authHeaders() });
      toast.success(t('pointsTracker.sourceSaved') as string);
      load();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || (t('commissionTracker.overrideSourceFailed') as string)); }
  };
  const assignMerchant = async (merchantId: string, repName: string) => {
    if (!repName) return;
    try {
      await axios.patch(`${API_URL}/api/zentact/merchants/${encodeURIComponent(merchantId)}/rep`, { repName }, { headers: authHeaders() });
      toast.success(t('pointsTracker.unassigned.saved', { name: repName }) as string);
      load();
    } catch { dialog.alert(t('commissionTracker.assignRepFailed') as string); }
  };
  const sendMissing = async () => {
    if (!missing.message.trim()) return;
    setMissing((m) => ({ ...m, sending: true }));
    try {
      await axios.post(`${API_URL}/api/commissions/missing-points-report`, { reference: missing.reference, period, message: missing.message }, { headers: authHeaders() });
      setMissing({ open: false, reference: '', message: '', sending: false });
      toast.success(t('commissionTracker.missing.sent') as string);
    } catch (e: any) {
      setMissing((m) => ({ ...m, sending: false }));
      dialog.alert(e?.response?.data?.error || (t('errors.sendFailed') as string));
    }
  };

  // Mois proposés : de janvier 2025 au mois en cours, le plus récent en premier.
  const periodOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (let y = curYear, m = curMonth; y > 2025 || (y === 2025 && m >= 1);) {
      const label = fmtMonth(y, m);
      out.push({ value: `${y}-${String(m).padStart(2, '0')}`, label: label.charAt(0).toUpperCase() + label.slice(1) });
      m--; if (m < 1) { m = 12; y--; }
    }
    return out;
  }, [curYear, curMonth]);

  // Équipes : « Toutes » + chaque équipe visible + « Sans équipe ». Un représentant sans
  // gestion ne voit que son équipe : pas de sélecteur alors.
  const reps = (data?.reps || []).filter((r) => r.repName !== UNASSIGNED);
  const unassigned = (data?.reps || []).find((r) => r.repName === UNASSIGNED) || null;
  const teams = (data?.teams || []).filter((tm) => reps.some((r) => r.team?.id === tm.teamId));
  const noTeamCount = reps.filter((r) => !r.team).length;
  const chips = [
    { key: 'all', label: t('pointsTracker.allTeams'), count: reps.length },
    ...teams.map((tm) => ({ key: `t-${tm.teamId}`, label: tm.name, count: reps.filter((r) => r.team?.id === tm.teamId).length })),
    ...(noTeamCount ? [{ key: 'none', label: t('pointsTracker.noTeam'), count: noTeamCount }] : []),
  ];
  const activeTeam = chips.some((c) => c.key === teamKey) ? teamKey : 'all';
  const inTeam = (teamId: number | null) =>
    activeTeam === 'all' || (activeTeam === 'none' ? teamId == null : `t-${teamId}` === activeTeam);

  const clock = monthClock(year, month, today);
  const shownReps = reps.filter((r) => inTeam(r.team?.id ?? null));
  const rows = useMemo(() => buildRows(shownReps, clock), [data, activeTeam, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const teamAgg = activeTeam.startsWith('t-') ? teams.find((tm) => `t-${tm.teamId}` === activeTeam) : null;
  const teamPoints = teamAgg ? teamAgg.totalPoints : shownReps.reduce((s, r) => s + r.totalPoints, 0);
  const target = teamAgg ? teamAgg.quotaTarget : shownReps.reduce((s, r) => s + (r.quota || 15), 0);

  const monthLabel = fmtMonth(year, month);
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  const viewSwitch = (
    <div role="tablist" aria-label={t('pointsTracker.viewLabel') as string} className="flex gap-1 rounded-full border border-stroke bg-white p-1 dark:border-strokedark dark:bg-boxdark">
      {VIEWS.map((v) => (
        <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
          className={`h-8 rounded-full px-3.5 text-[13px] font-bold transition ${view === v ? 'bg-primary text-[#141414]' : 'text-[#424242] hover:text-black dark:text-bodydark dark:hover:text-white'}`}>
          {t(v === 'mois' ? 'pointsTracker.tabMonth' : 'pointsTracker.tabYear')}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        section={t('pointsTracker.section')}
        title={view === 'mois' ? t('pointsTracker.titleMonth', { month: monthLabel }) : t('pointsTracker.titleYear')}
        actions={<>
          {viewSwitch}
          <Button variant="secondary" onClick={() => setMissing({ open: true, reference: '', message: '', sending: false })}>
            {t('pointsTracker.reportMissing')}
          </Button>
          {view === 'mois' && (
            <Select value={period} onChange={setPeriod} options={periodOptions} aria-label={t('pointsTracker.monthLabel') as string}
              buttonClassName="h-10 rounded-xl border border-stroke bg-white px-3 text-sm font-bold text-black dark:border-strokedark dark:bg-boxdark dark:text-white" />
          )}
        </>}
      />

      {chips.length > 2 && (
        <div role="tablist" aria-label={t('pointsTracker.teamLabel') as string} className="mb-5 flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const on = c.key === activeTeam;
            return (
              <button key={c.key} type="button" role="tab" aria-selected={on} onClick={() => setTeamKey(c.key)}
                className={`h-9 rounded-full border px-3.5 text-[13px] font-bold transition ${on ? 'border-primary bg-primary text-[#141414]' : 'border-stroke text-[#424242] hover:border-[#C4C4CA] dark:border-strokedark dark:text-bodydark dark:hover:border-[#3A3B40]'}`}>
                {c.label} · {c.count}
              </button>
            );
          })}
        </div>
      )}

      {view === 'mois' ? (
        loading ? <ContentLoader label={t('commissionTracker.loadingPoints') as string} />
          : error ? <StateCard kind="error" title={t('errors.loadFailed')} body={error} onRetry={load} />
            : (
              <MonthView rows={rows} clock={clock} target={target} teamPoints={teamPoints}
                monthLabel={monthLabel} lastDayLabel={fmtDateOnly(lastDay, { day: 'numeric', month: 'long' })}
                isAdmin={isAdmin} leadSourceGroups={data?.leadSourceGroups || []}
                unassigned={unassigned} activeReps={activeReps}
                onOverrideSource={overrideSource} onAssign={assignMerchant} />
            )
      ) : yearError ? (
        <StateCard kind="error" title={t('errors.loadFailed')} body={yearError} onRetry={() => { setYearMonths(null); loadYear(); }} />
      ) : !yearMonths ? (
        <ContentLoader label={t('pointsTracker.year.loading') as string} />
      ) : (
        <YearView months={yearMonths} currentKey={`${curYear}-${String(curMonth).padStart(2, '0')}`} teamFilter={inTeam} />
      )}

      <Modal open={missing.open} onClose={() => !missing.sending && setMissing((m) => ({ ...m, open: false }))}
        size="sm" title={t('commissionTracker.missing.title')} dirty={!!missing.message.trim() && !missing.sending}
        footer={<>
          <Button variant="secondary" onClick={() => setMissing((m) => ({ ...m, open: false }))} disabled={missing.sending}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={sendMissing} disabled={missing.sending || !missing.message.trim()}>
            {missing.sending ? t('commissionTracker.missing.sending') : t('commissionTracker.missing.send')}
          </Button>
        </>}>
        <p className="m-0 text-sm text-body dark:text-bodydark2">{t('commissionTracker.missing.subtitle')}</p>
        <label className="flex flex-col gap-1 text-xs font-medium text-body dark:text-bodydark2">
          {t('commissionTracker.missing.refLabel')}
          <input type="text" value={missing.reference} onChange={(e) => setMissing((m) => ({ ...m, reference: e.target.value }))}
            placeholder={t('commissionTracker.missing.refPlaceholder') as string}
            className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-body dark:text-bodydark2">
          {t('commissionTracker.missing.messageLabel')}
          <textarea rows={4} value={missing.message} onChange={(e) => setMissing((m) => ({ ...m, message: e.target.value }))}
            placeholder={t('commissionTracker.missing.messagePlaceholder') as string}
            className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
        </label>
      </Modal>
    </>
  );
};

export default CommissionTracker;
