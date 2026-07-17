import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface Subscription {
  orgId: string;
  orgName: string;
  subscriptionNumber: string;
  customerId: string | null;
  customerName: string;
  merchantAccountId: string | null;
  planCode: string;
  planName: string;
  status: string;
  currentMonthly: number;
  activatedAt: string | null;
  lastPriceChangeAt: string | null;
  lastPriceBefore: number | null;
  lastPriceAfter: number | null;
  pricePointsChecked: number | null;
  insightsCheckedAt: string | null;
}
type SortBy = 'name' | 'oldest' | 'newest' | 'mrr';
interface ScenarioSummary {
  id: number; name: string; targetMrr: number; status: string; itemCount: number; mrrDelta: number;
}
interface ScenarioItem {
  id: number;
  subscriptionNumber: string; customerName: string; planName: string; currentMonthly: number;
  increaseType: 'percent' | 'flat'; increaseValue: number;
  newMonthly: number; status: string; pushError: string | null;
  notifyTo: string | null; notifySubject: string | null; notifyBody: string | null;
  notifyStatus: string; notifyError: string | null;
}
interface RowEdit { included: boolean; increaseType: 'percent' | 'flat'; increaseValue: number }
interface NotifyDraft { to: string; subject: string; body: string }

const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD' }).format(n || 0);

// Admin tool: simulate SaaS price increases across every live Zoho Billing subscription, build
// a scenario aimed at a target MRR add, then save it (Phase A — read-only simulation; pushing
// the increase into Zoho is a separate, more tightly gated step landing in a later phase).
const SaasIncrease: React.FC = () => {
  const { t } = useTranslation();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<number | null>(null);
  const [savedItems, setSavedItems] = useState<Record<string, ScenarioItem>>({});
  const [scenarioName, setScenarioName] = useState('');
  const [targetMrr, setTargetMrr] = useState(100000);

  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [groupByPlan, setGroupByPlan] = useState(false);
  const [refreshingInsights, setRefreshingInsights] = useState(false);

  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [bulkType, setBulkType] = useState<'percent' | 'flat'>('percent');
  const [bulkValue, setBulkValue] = useState(10);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [notifyEdits, setNotifyEdits] = useState<Record<number, NotifyDraft>>({});
  const [notifySelected, setNotifySelected] = useState<Set<number>>(new Set());
  const [expandedNotifyId, setExpandedNotifyId] = useState<number | null>(null);
  const [notifyBusyIds, setNotifyBusyIds] = useState<Set<number>>(new Set());
  const [emailPreview, setEmailPreview] = useState<{ loading: boolean; html: string } | null>(null);

  const loadSubs = async (fresh = false) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/subscriptions${fresh ? '?fresh=1' : ''}`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setSubs(data.subscriptions || []);
      setOrgs(data.orgs || []);
    } catch {
      setError(t('saasIncrease.error') as string);
    } finally { setLoading(false); }
  };

  const loadScenarios = async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setScenarios(data.scenarios || []);
      if (!activeScenarioId && data.scenarios?.length) setActiveScenarioId(data.scenarios[0].id);
    } catch { /* non-fatal — scenario picker just stays empty */ }
  };

  useEffect(() => { loadSubs(false); loadScenarios(); }, []);

  const loadScenarioDetail = async (id: number) => {
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${id}`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setTargetMrr(Number(data.scenario.targetMrr) || 100000);
      const byNum: Record<string, ScenarioItem> = {};
      const nextEdits: Record<string, RowEdit> = {};
      const nextNotify: Record<number, NotifyDraft> = {};
      for (const it of data.items as ScenarioItem[]) {
        byNum[it.subscriptionNumber] = it;
        nextEdits[it.subscriptionNumber] = { included: true, increaseType: it.increaseType, increaseValue: it.increaseValue };
        nextNotify[it.id] = { to: it.notifyTo || '', subject: it.notifySubject || '', body: it.notifyBody || '' };
      }
      setSavedItems(byNum);
      setEdits(nextEdits);
      setNotifyEdits(nextNotify);
    } catch { dialog.alert(t('saasIncrease.error') as string); }
  };

  useEffect(() => { if (activeScenarioId) loadScenarioDetail(activeScenarioId); }, [activeScenarioId]);

  const createScenario = async () => {
    const name = scenarioName.trim();
    if (!name) return;
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, targetMrr }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setScenarioName('');
      await loadScenarios();
      setActiveScenarioId(data.scenario.id);
    } catch { dialog.alert(t('saasIncrease.error') as string); }
  };

  const plans = useMemo(() => Array.from(new Set(subs.map(s => s.planName).filter(Boolean))).sort(), [subs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = subs.filter(s =>
      (!q || s.customerName.toLowerCase().includes(q) || s.subscriptionNumber.toLowerCase().includes(q) || (s.merchantAccountId || '').toLowerCase().includes(q)) &&
      (!orgFilter || s.orgId === orgFilter) &&
      (!planFilter || s.planName === planFilter)
    );
    const time = (d: string | null) => d ? new Date(d).getTime() : null;
    return [...list].sort((a, b) => {
      if (sortBy === 'oldest' || sortBy === 'newest') {
        const ta = time(a.activatedAt), tb = time(b.activatedAt);
        if (ta == null && tb == null) return 0;
        if (ta == null) return 1; // unknown tenure sorts last regardless of direction
        if (tb == null) return -1;
        return sortBy === 'oldest' ? ta - tb : tb - ta;
      }
      if (sortBy === 'mrr') return b.currentMonthly - a.currentMonthly;
      return a.customerName.localeCompare(b.customerName);
    });
  }, [subs, search, orgFilter, planFilter, sortBy]);

  // Group-by-plan view: same filtered+sorted rows, just bucketed under a plan header instead
  // of one flat list. null when the toggle is off (flat rendering).
  const groupedFiltered = useMemo(() => {
    if (!groupByPlan) return null;
    const groups = new Map<string, Subscription[]>();
    for (const s of filtered) {
      const key = s.planName || (t('saasIncrease.noPlan') as string);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, groupByPlan, t]);

  const setEdit = (num: string, patch: Partial<RowEdit>) => {
    setEdits(prev => {
      const base: RowEdit = prev[num] || { included: true, increaseType: 'percent', increaseValue: 10 };
      return { ...prev, [num]: { ...base, ...patch } };
    });
  };

  const applyBulkToSelected = () => {
    setEdits(prev => {
      const next = { ...prev };
      for (const s of filtered) {
        if (next[s.subscriptionNumber]?.included) {
          next[s.subscriptionNumber] = { included: true, increaseType: bulkType, increaseValue: bulkValue };
        }
      }
      return next;
    });
  };

  const newMonthlyFor = (s: Subscription, e?: RowEdit) => {
    if (!e) return s.currentMonthly;
    return e.increaseType === 'flat' ? s.currentMonthly + (Number(e.increaseValue) || 0) : s.currentMonthly * (1 + (Number(e.increaseValue) || 0) / 100);
  };

  const includedCount = Object.values(edits).filter(e => e.included).length;
  const mrrDelta = subs.reduce((sum, s) => {
    const e = edits[s.subscriptionNumber];
    if (!e?.included) return sum;
    return sum + (newMonthlyFor(s, e) - s.currentMonthly);
  }, 0);
  const pct = targetMrr > 0 ? Math.min(100, (mrrDelta / targetMrr) * 100) : 0;
  const barColor = `hsl(${Math.round(Math.max(0, Math.min(100, pct)) * 1.2)}, 72%, 45%)`;

  const saveScenario = async () => {
    if (!activeScenarioId) return;
    const items = subs
      .filter(s => edits[s.subscriptionNumber]?.included)
      .map(s => {
        const e = edits[s.subscriptionNumber];
        return {
          orgId: s.orgId, subscriptionNumber: s.subscriptionNumber, customerId: s.customerId, customerName: s.customerName,
          merchantAccountId: s.merchantAccountId, planCode: s.planCode, planName: s.planName,
          currentMonthly: s.currentMonthly, increaseType: e.increaseType, increaseValue: e.increaseValue,
        };
      });
    if (!items.length) { dialog.alert(t('saasIncrease.noRowsSelected') as string); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${activeScenarioId}/items`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) throw new Error(String(r.status));
      await loadScenarioDetail(activeScenarioId);
      await loadScenarios();
    } catch { dialog.alert(t('saasIncrease.error') as string); }
    finally { setSaving(false); }
  };

  const exportScenario = async () => {
    if (!activeScenarioId) return;
    setExporting(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${activeScenarioId}/export`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `saas-increase-${activeScenarioId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { dialog.alert(t('saasIncrease.error') as string); }
    finally { setExporting(false); }
  };

  const refreshInsights = async () => {
    setRefreshingInsights(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/insights/refresh`, { method: 'POST', headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      dialog.alert(t('saasIncrease.insights.refreshStarted') as string);
    } catch { dialog.alert(t('saasIncrease.error') as string); }
    finally { setRefreshingInsights(false); }
  };

  const toggleNotifySelected = (id: number) => {
    setNotifySelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const markNotifyBusy = (ids: number[], busy: boolean) => {
    setNotifyBusyIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => busy ? next.add(id) : next.delete(id));
      return next;
    });
  };

  const draftNotifications = async (itemIds: number[]) => {
    if (!activeScenarioId || !itemIds.length) return;
    markNotifyBusy(itemIds, true);
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${activeScenarioId}/notifications/draft`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      const items = data.items as ScenarioItem[];
      setSavedItems(prev => {
        const next = { ...prev };
        for (const it of items) next[it.subscriptionNumber] = it;
        return next;
      });
      setNotifyEdits(prev => {
        const next = { ...prev };
        for (const it of items) next[it.id] = { to: it.notifyTo || '', subject: it.notifySubject || '', body: it.notifyBody || '' };
        return next;
      });
    } catch { dialog.alert(t('saasIncrease.error') as string); }
    finally { markNotifyBusy(itemIds, false); }
  };

  const previewNotification = async (itemId: number) => {
    if (!activeScenarioId) return;
    const draft = notifyEdits[itemId];
    if (!draft) return;
    setEmailPreview({ loading: true, html: '' });
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${activeScenarioId}/notifications/preview`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.body }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setEmailPreview({ loading: false, html: data.html });
    } catch {
      setEmailPreview(null);
      dialog.alert(t('saasIncrease.error') as string);
    }
  };

  const sendNotifications = async (itemIds: number[]) => {
    if (!activeScenarioId || !itemIds.length) return;
    if (!(await dialog.confirm(t('saasIncrease.notify.confirmSend', { count: itemIds.length }) as string))) return;
    markNotifyBusy(itemIds, true);
    try {
      const items = itemIds.map(id => ({ itemId: id, ...(notifyEdits[id] || { to: '', subject: '', body: '' }) }));
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${activeScenarioId}/notifications/send`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) throw new Error(String(r.status));
      await loadScenarioDetail(activeScenarioId);
    } catch { dialog.alert(t('saasIncrease.error') as string); }
    finally { markNotifyBusy(itemIds, false); }
  };

  return (
    <div>
      {/* Scenario picker */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t('saasIncrease.scenario')}</label>
          <select
            value={activeScenarioId ?? ''}
            onChange={(e) => setActiveScenarioId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
          >
            <option value="">{t('saasIncrease.selectScenario')}</option>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name} ({s.itemCount})</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t('saasIncrease.newScenarioName')}</label>
          <input
            value={scenarioName} onChange={(e) => setScenarioName(e.target.value)}
            placeholder={t('saasIncrease.newScenarioPlaceholder') as string}
            className="rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t('saasIncrease.targetMrr')}</label>
          <input
            type="number" value={targetMrr} onChange={(e) => setTargetMrr(Number(e.target.value) || 0)}
            className="w-32 rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
          />
        </div>
        <button onClick={createScenario} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90">
          {t('saasIncrease.createScenario')}
        </button>
      </div>

      {/* Progress toward target */}
      {activeScenarioId && (
        <div className="mb-4 rounded-xl border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="text-2xl font-bold" style={{ color: barColor }}>{money(mrrDelta)}</span>
              <span className="ml-2 text-sm text-gray-500">/ {money(targetMrr)} {t('saasIncrease.mrrTarget')}</span>
            </div>
            <span className="text-sm text-gray-500">{t('saasIncrease.rowsIncluded', { count: includedCount })}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-meta-4">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={t('saasIncrease.searchPlaceholder') as string}
          className="min-w-[220px] flex-1 rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
        />
        <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} className="rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark">
          <option value="">{t('saasIncrease.allOrgs')}</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark">
          <option value="">{t('saasIncrease.allPlans')}</option>
          {plans.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div className="flex items-end gap-2">
          <select value={bulkType} onChange={(e) => setBulkType(e.target.value as 'percent' | 'flat')} className="rounded-lg border border-stroke bg-transparent px-2 py-2 text-sm dark:border-strokedark dark:bg-boxdark">
            <option value="percent">%</option>
            <option value="flat">$</option>
          </select>
          <input
            type="number" value={bulkValue} onChange={(e) => setBulkValue(Number(e.target.value) || 0)}
            className="w-20 rounded-lg border border-stroke bg-transparent px-2 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
          />
          <button onClick={applyBulkToSelected} className="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4">
            {t('saasIncrease.applyToSelected')}
          </button>
        </div>
        <button onClick={() => loadSubs(true)} disabled={loading} className="rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4">
          {t('saasIncrease.refresh')}
        </button>
      </div>

      {/* Grouping / sort / insights controls — separate row since they act on the whole list, not a filter */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-stroke bg-white p-4 shadow-default dark:border-strokedark dark:bg-boxdark">
        <label className="flex items-center gap-2 text-sm text-body dark:text-bodydark">
          <input type="checkbox" checked={groupByPlan} onChange={(e) => setGroupByPlan(e.target.checked)} />
          {t('saasIncrease.groupByPlan')}
        </label>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t('saasIncrease.sortBy')}</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark">
            <option value="name">{t('saasIncrease.sortName')}</option>
            <option value="oldest">{t('saasIncrease.sortOldest')}</option>
            <option value="newest">{t('saasIncrease.sortNewest')}</option>
            <option value="mrr">{t('saasIncrease.sortMrr')}</option>
          </select>
        </div>
        <button onClick={refreshInsights} disabled={refreshingInsights} className="ml-auto rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4">
          {refreshingInsights ? t('saasIncrease.insights.refreshing') : t('saasIncrease.insights.refresh')}
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

      {/* Subscriptions table */}
      <div className="overflow-hidden rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-stroke text-left text-xs text-gray-500 dark:border-strokedark">
                <th className="px-4 py-2 font-medium"></th>
                <th className="px-4 py-2 font-medium">{t('saasIncrease.colCustomer')}</th>
                <th className="px-4 py-2 font-medium">{t('saasIncrease.colPlan')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('saasIncrease.colCurrent')}</th>
                <th className="px-4 py-2 font-medium">{t('saasIncrease.colIncrease')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('saasIncrease.colNew')}</th>
                <th className="px-4 py-2 font-medium">{t('saasIncrease.colActivated')}</th>
                <th className="px-4 py-2 font-medium">{t('saasIncrease.colLastPriceChange')}</th>
                <th className="px-4 py-2 font-medium">{t('saasIncrease.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const renderRow = (s: Subscription) => {
                  const e = edits[s.subscriptionNumber];
                  const saved = savedItems[s.subscriptionNumber];
                  const nm = newMonthlyFor(s, e);
                  const priceChangeLabel = s.lastPriceChangeAt
                    ? new Date(s.lastPriceChangeAt).toLocaleDateString()
                    : !s.insightsCheckedAt ? t('saasIncrease.notYetChecked')
                    : (s.pricePointsChecked != null && s.pricePointsChecked < 2) ? t('saasIncrease.notEnoughHistory')
                    : t('saasIncrease.noRecentChange');
                  const priceChangeTitle = (s.lastPriceBefore != null && s.lastPriceAfter != null)
                    ? `${money(s.lastPriceBefore)} → ${money(s.lastPriceAfter)}` : '';
                  return (
                    <tr key={s.subscriptionNumber} className="border-b border-stroke last:border-0 dark:border-strokedark">
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={!!e?.included} onChange={(ev) => setEdit(s.subscriptionNumber, { included: ev.target.checked })} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium text-black dark:text-white">{s.customerName}</div>
                        <div className="text-xs text-gray-400">{s.subscriptionNumber}{s.merchantAccountId ? ` · ${s.merchantAccountId}` : ''}</div>
                      </td>
                      <td className="px-4 py-2 text-body dark:text-bodydark">{s.planName}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-body dark:text-bodydark">{money(s.currentMonthly)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <select
                            value={e?.increaseType || 'percent'}
                            onChange={(ev) => setEdit(s.subscriptionNumber, { increaseType: ev.target.value as 'percent' | 'flat' })}
                            className="rounded border border-stroke bg-transparent px-1 py-1 text-xs dark:border-strokedark"
                          >
                            <option value="percent">%</option>
                            <option value="flat">$</option>
                          </select>
                          <input
                            type="number" value={e?.increaseValue ?? ''}
                            onChange={(ev) => setEdit(s.subscriptionNumber, { increaseValue: Number(ev.target.value) || 0 })}
                            className="w-20 rounded border border-stroke bg-transparent px-2 py-1 text-xs dark:border-strokedark"
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-black dark:text-white">{e?.included ? money(nm) : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-body dark:text-bodydark">{s.activatedAt ? new Date(s.activatedAt).toLocaleDateString() : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-body dark:text-bodydark" title={priceChangeTitle}>{priceChangeLabel}</td>
                      <td className="px-4 py-2">
                        {saved && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${saved.status === 'pushed' ? 'bg-success/10 text-success' : saved.status === 'push_failed' ? 'bg-danger/10 text-danger' : 'bg-gray-100 text-gray-600 dark:bg-meta-4 dark:text-gray-300'}`} title={saved.pushError || ''}>
                            {t(`saasIncrease.status.${saved.status}`)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                };
                if (groupedFiltered) {
                  return groupedFiltered.flatMap(([planName, rows]) => [
                    <tr key={`group-${planName}`} className="bg-gray-50 dark:bg-meta-4/40">
                      <td colSpan={9} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {planName} · {t('saasIncrease.groupCount', { count: rows.length })} · {money(rows.reduce((sum, r) => sum + r.currentMonthly, 0))}
                      </td>
                    </tr>,
                    ...rows.map(renderRow),
                  ]);
                }
                return filtered.map(renderRow);
              })()}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">{t('saasIncrease.none')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeScenarioId && (
        <div className="mt-4 flex justify-end gap-3">
          <button onClick={exportScenario} disabled={exporting} className="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4">
            {exporting ? t('saasIncrease.exporting') : t('saasIncrease.exportCsv')}
          </button>
          <button onClick={saveScenario} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
            {saving ? t('saasIncrease.saving') : t('saasIncrease.saveDraft')}
          </button>
        </div>
      )}

      {/* Scenario items & merchant notifications — the communication engine. Deliberately
          separate from the simulator table above (which mixes in not-yet-saved rows); this
          only lists rows already saved to the active scenario. */}
      {activeScenarioId && Object.keys(savedItems).length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke px-5 py-3 dark:border-strokedark">
            <div>
              <h4 className="text-sm font-semibold text-black dark:text-white">{t('saasIncrease.notify.title')}</h4>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t('saasIncrease.notify.subtitle')}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => draftNotifications(Array.from(notifySelected))}
                disabled={notifySelected.size === 0}
                className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4"
              >
                {t('saasIncrease.notify.draftSelected', { count: notifySelected.size })}
              </button>
              <button
                onClick={() => sendNotifications(Array.from(notifySelected))}
                disabled={notifySelected.size === 0}
                className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90 disabled:opacity-50"
              >
                {t('saasIncrease.notify.sendSelected', { count: notifySelected.size })}
              </button>
            </div>
          </div>
          <div className="divide-y divide-stroke dark:divide-strokedark">
            {Object.values(savedItems).map(item => {
              const draft = notifyEdits[item.id] || { to: '', subject: '', body: '' };
              const expanded = expandedNotifyId === item.id;
              const busy = notifyBusyIds.has(item.id);
              return (
                <div key={item.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={notifySelected.has(item.id)} onChange={() => toggleNotifySelected(item.id)} />
                    <button type="button" onClick={() => setExpandedNotifyId(expanded ? null : item.id)} className="flex flex-1 items-center justify-between gap-3 text-left">
                      <div>
                        <div className="font-medium text-black dark:text-white">{item.customerName}</div>
                        <div className="text-xs text-gray-400">{item.subscriptionNumber} · {money(item.currentMonthly)} → {money(item.newMonthly)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.notifyStatus === 'sent' ? 'bg-success/10 text-success' :
                            item.notifyStatus === 'send_failed' ? 'bg-danger/10 text-danger' :
                            item.notifyStatus === 'drafted' ? 'bg-primary/10 text-primary' :
                            'bg-gray-100 text-gray-600 dark:bg-meta-4 dark:text-gray-300'
                          }`}
                          title={item.notifyError || ''}
                        >
                          {t(`saasIncrease.notify.status.${item.notifyStatus}`)}
                        </span>
                        <svg className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </button>
                  </div>
                  {expanded && (
                    <div className="mt-3 space-y-2 rounded-lg border border-stroke p-3 dark:border-strokedark">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t('saasIncrease.notify.to')}</label>
                        <input
                          value={draft.to} onChange={(e) => setNotifyEdits(prev => ({ ...prev, [item.id]: { ...draft, to: e.target.value } }))}
                          placeholder="client@example.com" className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t('saasIncrease.notify.subject')}</label>
                        <input
                          value={draft.subject} onChange={(e) => setNotifyEdits(prev => ({ ...prev, [item.id]: { ...draft, subject: e.target.value } }))}
                          className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{t('saasIncrease.notify.body')}</label>
                        <textarea
                          value={draft.body} onChange={(e) => setNotifyEdits(prev => ({ ...prev, [item.id]: { ...draft, body: e.target.value } }))}
                          rows={7} className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm dark:border-strokedark dark:bg-boxdark"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => draftNotifications([item.id])} disabled={busy} className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4">
                          {t('saasIncrease.notify.draft')}
                        </button>
                        <button onClick={() => previewNotification(item.id)} disabled={busy || !draft.body} className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4">
                          {t('saasIncrease.notify.preview')}
                        </button>
                        <button onClick={() => sendNotifications([item.id])} disabled={busy || !draft.to || !draft.subject} className="rounded-lg bg-success px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
                          {busy ? t('saasIncrease.notify.sending') : t('saasIncrease.notify.send')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Email preview modal — srcDoc renders the exact HTML /send would email, read-only */}
      {emailPreview && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black bg-opacity-60 p-4" onClick={() => setEmailPreview(null)}>
          <div className="flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-stroke px-5 py-3 dark:border-strokedark">
              <p className="font-semibold text-black dark:text-white">{t('saasIncrease.notify.previewTitle')}</p>
              <button onClick={() => setEmailPreview(null)} className="text-body transition hover:text-danger">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="relative flex-1 overflow-y-auto bg-[#eef1f6]">
              {emailPreview.loading ? (
                <div className="flex h-full items-center justify-center">
                  <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : (
                <iframe srcDoc={emailPreview.html} className="h-full w-full border-0" title="Email preview" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SaasIncrease;
