import React, { useEffect, useMemo, useRef, useState } from 'react';
import PasswordInput from '../../components/PasswordInput';
import Select from '../../components/Select';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';
import { useAuth } from '../../context/AuthContext';
import { RefreshCw, Download, Search, ChevronDown, ChevronRight, Layers, Percent, Wallet, TrendingUp, Plus, CheckCheck, X, Trash2, Settings, Sparkles, Gauge, Info } from 'lucide-react';

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
  // currentMonthly is the BASE PLAN price (what an increase applies to and what gets pushed).
  // totalMonthly is what the customer actually pays, plan + addons. They differ whenever the
  // subscription carries addons, and baseVerified is false until the insights scan has split them.
  totalMonthly: number;
  addonsMonthly: number | null;
  baseVerified: boolean;
}
type SortBy = 'name' | 'oldest' | 'newest' | 'mrr';
// How an increase is expressed. 'target' sets an absolute price ("everyone to $169") rather than
// a delta — the only mode that actually normalizes legacy price drift, since a % increase
// preserves the spread forever and a flat $ shifts every price point by the same amount.
type IncreaseMode = 'percent' | 'flat' | 'target';
interface ScenarioSummary {
  id: number; name: string; targetMrr: number; status: string; itemCount: number; mrrDelta: number;
}
interface ScenarioItem {
  id: number; orgId: string;
  subscriptionNumber: string; customerName: string; planName: string; currentMonthly: number;
  increaseType: IncreaseMode; increaseValue: number;
  newMonthly: number; status: string; pushError: string | null;
  notifyTo: string | null; notifySubject: string | null; notifyBody: string | null;
  notifyStatus: string; notifyError: string | null;
}
interface EmailTemplate { id: number; name: string; subjectEn: string; bodyEn: string; subjectFr: string; bodyFr: string; isDefault: boolean }
interface CalibrationBucket { sizeBucket: string; tenureBucket: string; n: number; churned: number; stillLive: number; observedRate: number | null; insufficientData: boolean }
interface Calibration { buckets: CalibrationBucket[]; baseline: CalibrationBucket; minSample: number; computedAt: string }
// `selected` (checkbox — drives bulk-apply targeting + the footer's "N selected" count) is
// deliberately independent from "included" (derived as increaseValue > 0) — matches the design
// handoff's model, where you can select a batch of rows first, then bulk-apply a rule to them,
// without needing to type a value into each one first.
interface RowEdit { selected: boolean; increaseType: IncreaseMode; increaseValue: number }
interface NotifyDraft { to: string; subject: string; body: string }

// Local state (edits, saved items, suggestion tracking) is keyed by ORG + number, never the
// number alone: Zoho subscription numbers are unique per organisation, so two different
// customers can share one. Keying on the number alone made them share a single edit — typing
// an increase on one silently moved the other's price too.
const rowKey = (s?: { orgId: string; subscriptionNumber: string } | null) =>
  s ? `${s.orgId}||${s.subscriptionNumber}` : '';
const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'CAD' }).format(n || 0);

// i18next's own interpolation syntax is also {{token}} — the placeholderHint string below
// contains literal {{customerName}} etc. as text to show the admin, so those tokens must be
// passed back in as values (each equal to its own literal text) or i18next silently blanks them
// out trying to interpolate a value we never provided.
const PLACEHOLDER_HINT_VARS = { customerName: '{{customerName}}', planName: '{{planName}}', currentMonthly: '{{currentMonthly}}', newMonthly: '{{newMonthly}}', effectiveDate: '{{effectiveDate}}' };

// Cosmetic-only "POS" categorization for the design's colored dot — derived from keywords in the
// plan name (matching the design handoff's seed data), falling back to the Zoho Billing org name
// when nothing matches. Not a stored field — purely a client-side display heuristic.
const POS_KEYWORDS: { match: RegExp; label: string; color: string }[] = [
  { match: /cluster os/i, label: 'Cluster OS', color: '#608EFA' },
  { match: /zpos/i, label: 'ZPOS', color: '#9F79FF' },
  { match: /xpos/i, label: 'XPOS', color: '#57D193' },
  { match: /wesbo/i, label: 'Wesbo', color: '#CCC37A' },
  { match: /xperio/i, label: 'Xperio POS', color: '#F58345' },
];
const posLabelFor = (planName: string, orgName: string) => {
  for (const k of POS_KEYWORDS) if (k.match.test(planName)) return { label: k.label, color: k.color };
  return { label: orgName || '—', color: '#999AA7' };
};

// Churn-risk heuristic — deliberately transparent (a small integer score with named reasons)
// rather than a predicted probability. The base scoring below is a hand-picked starting point;
// when enough real history exists (see the churn-history backfill + calibration endpoint), the
// final tier for the size×tenure combination is overridden by the actual observed churn rate
// from Cluster's own book of business instead of the guessed weights — falls back to the
// heuristic below whenever a bucket doesn't have enough samples yet (insufficientData).
type RiskTier = 'low' | 'medium' | 'high';
const RISK_CALIBRATION_HIGH_RATE = 0.30; // observed churn rate above this → high, calibrated override
const RISK_CALIBRATION_MEDIUM_RATE = 0.15;
function saasSizeBucket(pct: number): string { return pct <= 5 ? '0-5' : pct <= 15 ? '5-15' : '15+'; }
function saasTenureBucket(months: number): string { return months < 6 ? '<6' : months < 12 ? '6-12' : '12+'; }
function riskFor(s: Subscription, proposedPct: number, calibration?: Calibration | null): { tier: RiskTier; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (s.status === 'dunning') { score += 2; reasons.push('paymentIssues'); }
  else if (s.status === 'unpaid') { score += 2; reasons.push('unpaid'); }
  else if (s.status === 'non_renewing') { score += 2; reasons.push('alreadyLeaving'); }

  const tenureMonths = s.activatedAt ? (Date.now() - new Date(s.activatedAt).getTime()) / (30 * 24 * 3600 * 1000) : null;
  if (tenureMonths == null) { score += 1; reasons.push('tenureUnknown'); }
  else if (tenureMonths < 6) { score += 2; reasons.push('newCustomer'); }
  else if (tenureMonths < 12) { score += 1; reasons.push('recentCustomer'); }

  if (proposedPct > 15) { score += 2; reasons.push('largeIncrease'); }
  else if (proposedPct > 5) { score += 1; reasons.push('moderateIncrease'); }

  if (s.lastPriceChangeAt) {
    const monthsSince = (Date.now() - new Date(s.lastPriceChangeAt).getTime()) / (30 * 24 * 3600 * 1000);
    if (monthsSince < 6) { score += 2; reasons.push('recentlyChanged'); }
  }

  let tier: RiskTier = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';

  // Calibrated override — only when we have a real, sufficiently-sampled observed rate for this
  // exact size×tenure combination; otherwise the heuristic tier above stands as computed.
  if (calibration && tenureMonths != null && proposedPct > 0) {
    const sizeB = saasSizeBucket(proposedPct);
    const tenureB = saasTenureBucket(tenureMonths);
    const cal = calibration.buckets.find(b => b.sizeBucket === sizeB && b.tenureBucket === tenureB && !b.insufficientData);
    if (cal && cal.observedRate != null) {
      tier = cal.observedRate > RISK_CALIBRATION_HIGH_RATE ? 'high' : cal.observedRate > RISK_CALIBRATION_MEDIUM_RATE ? 'medium' : 'low';
      reasons.push('calibrated');
    }
  }

  return { tier, reasons };
}
const RISK_BADGE_CLS: Record<RiskTier, string> = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-[rgba(87,209,147,0.12)] dark:text-[#57D193]',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  high: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
};
const RISK_DOT_COLOR: Record<RiskTier, string> = { low: '#57D193', medium: '#F59E0B', high: '#ef4444' };
// Candidate percent increases Suggest Scenario tries per subscription, highest first — it picks
// the largest one within the active profile's accepted risk tiers, so safer accounts get a
// bigger increase and borderline ones get a smaller one automatically.
const RATE_CANDIDATES_PCT = [20, 15, 12, 10, 8, 6, 5, 3];
// Named risk-tolerance profiles for Suggest Scenario — each is just which risk tiers a
// subscription is allowed to land in to be auto-included. Conservative never touches a
// medium/high-risk account (may fall short of the target); Balanced (the original default
// behavior) allows medium; Aggressive allows everything, prioritizing filling the target.
type SuggestProfile = 'conservative' | 'balanced' | 'aggressive';
const SUGGEST_PROFILE_TIERS: Record<SuggestProfile, RiskTier[]> = {
  conservative: ['low'],
  balanced: ['low', 'medium'],
  aggressive: ['low', 'medium', 'high'],
};
const SUGGEST_PROFILES: SuggestProfile[] = ['conservative', 'balanced', 'aggressive'];

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
  const [groupView, setGroupView] = useState<'todo' | 'done' | 'all'>('todo');
  // Segment-first view: the page lists org x plan segments, and the individual subscription rows
  // are a drill-down you open per segment. `editingSegment` keeps the segment you're typing in
  // visible even once its value makes it "done", so it can't vanish mid-keystroke.
  const [drilldownKey, setDrilldownKey] = useState<string | null>(null);
  const [openOrgInfo, setOpenOrgInfo] = useState<string | null>(null);
  const [editingSegment, setEditingSegment] = useState<string | null>(null);
  const [refreshingInsights, setRefreshingInsights] = useState(false);
  // Progress of the price-history scan. It can run for the better part of an hour, so it polls
  // while active — otherwise the only way to know whether anything is happening is the server log.
  const [insightsStatus, setInsightsStatus] = useState<{ total: number; verified: number; errors: number; active: boolean; duplicates?: number; byOrg?: { orgId: string; orgName: string; total: number; verified: number; byStatus?: Record<string, { count: number; mrr: number; numbers?: string[] }> }[]; crossOrgCollisions?: number; collisionSample?: string[]; lastScanError?: string | null; topErrors?: { error: string; count: number }[] } | null>(null);

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

  // Notification panel is grouped the same way as the main table (org+plan), collapsed by
  // default, with its own expand state — separate Set from the main table's expandedGroups.
  const [expandedNotifyGroups, setExpandedNotifyGroups] = useState<Set<string>>(new Set());
  const [groupTemplateChoice, setGroupTemplateChoice] = useState<Record<string, number>>({});

  // Admin-editable email template library (server-backed) — used per group instead of one
  // hardcoded copy for everyone.
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [expandedTemplateId, setExpandedTemplateId] = useState<number | 'new' | null>(null);
  const [templateDraft, setTemplateDraft] = useState<{ name: string; subjectEn: string; bodyEn: string; subjectFr: string; bodyFr: string }>({ name: '', subjectEn: '', bodyEn: '', subjectFr: '', bodyFr: '' });
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Push to Zoho — the one action that changes live customer billing, gated on
  // saas_increase:execute + a Sales-Hub-native confirmation PIN (see Profile.tsx).
  const { user } = useAuth();
  const can = (p: string) => {
    const perms = user?.permissions || [];
    return perms.includes('*') || perms.includes(p) || perms.includes(`${p.split(':')[0]}:*`);
  };
  const canExecute = can('saas_increase:execute');
  const [hasPushPin, setHasPushPin] = useState<boolean | null>(null);
  const [pushModal, setPushModal] = useState<{ itemIds: number[]; pin: string; busy: boolean; results: Record<number, { ok: boolean; error?: string }> | null } | null>(null);

  // Churn-risk calibration — observed rates from real history (see the churn-history backfill),
  // used by riskFor() to override its hand-picked weights where there's enough real data.
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [refreshingCalibration, setRefreshingCalibration] = useState(false);
  const loadCalibration = async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/churn-history/calibration`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      setCalibration(await r.json());
    } catch { /* non-fatal — riskFor just falls back to its default heuristic */ }
  };
  const refreshCalibrationData = async () => {
    setRefreshingCalibration(true);
    try {
      await fetch(`${API_URL}/api/admin/saas-increase/churn-history/refresh`, { method: 'POST', headers: authHeaders() });
      dialog.alert(t('saasIncrease.calibration.refreshStarted') as string);
    } catch { dialog.alert(t('saasIncrease.error') as string); }
    finally { setRefreshingCalibration(false); }
  };

  // Suggest Scenario — profile picked in a modal (not a native confirm) so its definition and a
  // live preview (count/$/risk breakdown) are visible before anything gets applied.
  const [suggestModalOpen, setSuggestModalOpen] = useState(false);
  const [suggestProfile, setSuggestProfile] = useState<SuggestProfile>('balanced');
  // Rows currently selected BECAUSE the last Suggest Scenario run put them there — as opposed to
  // rows the user picked/edited by hand. Only these are eligible to be reconsidered/replaced by
  // a later suggestion run (e.g. switching profile and re-applying); any row the user has
  // touched directly is removed from this set and becomes permanently protected from it.
  const [suggestedNumbers, setSuggestedNumbers] = useState<Set<string>>(new Set());
  const [riskDetailOpen, setRiskDetailOpen] = useState(false);

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

  const loadTemplates = async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/email-templates`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setTemplates(data.templates || []);
    } catch { /* non-fatal — template pickers just fall back to the built-in default copy */ }
  };

  useEffect(() => { loadSubs(false); loadScenarios(); loadTemplates(); loadCalibration(); }, []);

  // When the scan finishes, re-fetch the subscriptions too. The counter polls itself but the table
  // rows are only loaded once, so a completed scan otherwise left rows still showing the amber
  // "incl. addons" warning while the counter read 100% — which reads as a bug.
  const scanWasActive = useRef(false);
  useEffect(() => {
    const wasActive = scanWasActive.current;
    scanWasActive.current = !!insightsStatus?.active;
    if (wasActive && !insightsStatus?.active) loadSubs(false);
  }, [insightsStatus?.active]);

  // Poll the scan's progress — tightly while it's actually writing rows, lazily otherwise so an
  // idle page isn't hitting the server every few seconds for an hour.
  useEffect(() => {
    loadInsightsStatus();
    const id = setInterval(loadInsightsStatus, insightsStatus?.active ? 15000 : 120000);
    return () => clearInterval(id);
  }, [insightsStatus?.active]);

  useEffect(() => {
    if (!canExecute) return;
    fetch(`${API_URL}/api/user/push-pin/status`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setHasPushPin(!!d.hasPin)).catch(() => {});
  }, [canExecute]);

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
        byNum[rowKey(it)] = it;
        nextEdits[rowKey(it)] = { selected: true, increaseType: it.increaseType, increaseValue: it.increaseValue };
        nextNotify[it.id] = { to: it.notifyTo || '', subject: it.notifySubject || '', body: it.notifyBody || '' };
      }
      setSavedItems(byNum);
      setEdits(nextEdits);
      setNotifyEdits(nextNotify);
      // Loaded rows came from the DB, not a live suggestion run — never treat them as
      // replaceable by a future Suggest Scenario call in this (now-different) scenario.
      setSuggestedNumbers(new Set());
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

  const deleteScenario = async (id: number) => {
    const scenario = scenarios.find(s => s.id === id);
    if (!(await dialog.confirm(t('saasIncrease.confirmDeleteScenario', { name: scenario?.name || '' }) as string))) return;
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const r2 = await fetch(`${API_URL}/api/admin/saas-increase/scenarios`, { headers: authHeaders() });
      const remaining = r2.ok ? (await r2.json()).scenarios || [] : [];
      setScenarios(remaining);
      if (activeScenarioId === id) {
        if (remaining.length) {
          setActiveScenarioId(remaining[0].id);
        } else {
          setActiveScenarioId(null);
          setSavedItems({});
          setNotifyEdits({});
        }
      }
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

// Org → plan groups (collapsed by default) — with 3500+ subscriptions, a flat list wasn't
  // scannable. Each group key is "org||plan" so same-named plans on different orgs (e.g. two
  // "Premium Monthly" plans under different orgs) don't get merged into one bucket.
  const groupedRows = useMemo(() => {
    const groups = new Map<string, Subscription[]>();
    for (const s of filtered) {
      const key = `${s.orgName}||${s.planName || (t('saasIncrease.noPlan') as string)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, t]);

  const setEdit = (num: string, patch: Partial<RowEdit>) => {
    // Any direct row edit is a manual override — stop treating it as replaceable by a future
    // Suggest Scenario run, even if the value happens to match what a suggestion had set.
    setSuggestedNumbers(prev => { if (!prev.has(num)) return prev; const next = new Set(prev); next.delete(num); return next; });
    setEdits(prev => {
      const base: RowEdit = prev[num] || { selected: false, increaseType: 'percent', increaseValue: 0 };
      const merged = { ...base, ...patch };
      // Typing a real increase value implicitly means "this row is part of my plan" — auto-check
      // it too, so a single-row edit doesn't also require a separate checkbox click to be
      // reflected in the "N selected" footer/bulk count.
      if (patch.increaseValue !== undefined && patch.increaseValue > 0) merged.selected = true;
      // ...and the reverse: unchecking a row is how you undo an applied increase — it wouldn't
      // otherwise clear the typed value, so the row would silently stay "included."
      if (patch.selected === false) merged.increaseValue = 0;
      return { ...prev, [num]: merged };
    });
  };

  // Full undo for a batch of rows (paired with applyBulkToSelected/applyBulkToGroup) — clears
  // both the value and the selection, same as unchecking each row individually.
  const clearRows = (rows: Subscription[]) => {
    setSuggestedNumbers(prev => {
      const next = new Set(prev);
      for (const s of rows) next.delete(rowKey(s));
      return next;
    });
    setEdits(prev => {
      const next = { ...prev };
      for (const s of rows) next[rowKey(s)] = { selected: false, increaseType: 'percent', increaseValue: 0 };
      return next;
    });
  };

  const isIncluded = (num: string) => (edits[num]?.increaseValue ?? 0) > 0;

  // Group-level "done" filter — with dozens of org×plan groups, once an increase has been applied
  // to a group it's just scroll-noise between you and the work that's left. A group counts as done
  // only when EVERY row in it has an increase (a partially-applied group still has work, so it
  // stays under "To do"). Defaults to "todo" so applied groups drop out of view as you go, with
  // one click to review the finished ones.
  const isGroupDone = (rows: Subscription[]) => rows.length > 0 && rows.every(r => isIncluded(rowKey(r)));
  const doneGroupCount = groupedRows.reduce((n, [, rows]) => n + (isGroupDone(rows) ? 1 : 0), 0);
  const todoGroupCount = groupedRows.length - doneGroupCount;
  const visibleGroups = groupView === 'all'
    ? groupedRows
    : groupedRows.filter(([key, rows]) => {
        // A group you've opened is a group you're working in — never yank it out from under the
        // cursor. Without this, typing a value into the last un-set row of an expanded group makes
        // the whole group satisfy "done" mid-keystroke, so it vanishes and the page jumps upward.
        // It drops out of "To do" once you collapse it.
        if (editingSegment === key || drilldownKey === key) return true;
        return groupView === 'done' ? isGroupDone(rows) : !isGroupDone(rows);
      });
  const visibleRowCount = visibleGroups.reduce((n, [, rows]) => n + rows.length, 0);

  // Select-all now lives per-group (the column header only renders inside an expanded group) —
  // "select everything in this group" rather than one global toggle for the whole filtered list.
  const isGroupAllSelected = (rows: Subscription[]) => rows.length > 0 && rows.every(r => edits[rowKey(r)]?.selected);
  const toggleGroupSelectAll = (rows: Subscription[]) => {
    const target = !isGroupAllSelected(rows);
    setEdits(prev => {
      const next = { ...prev };
      for (const s of rows) {
        const base = next[rowKey(s)] || { selected: false, increaseType: 'percent' as const, increaseValue: 0 };
        next[rowKey(s)] = { ...base, selected: target };
      }
      return next;
    });
  };

  const applyBulkToSelected = () => {
    setSuggestedNumbers(prev => {
      const next = new Set(prev);
      for (const s of filtered) if (edits[rowKey(s)]?.selected) next.delete(rowKey(s));
      return next;
    });
    setEdits(prev => {
      const next = { ...prev };
      for (const s of filtered) {
        if (next[rowKey(s)]?.selected) {
          next[rowKey(s)] = { selected: true, increaseType: bulkType, increaseValue: bulkValue };
        }
      }
      return next;
    });
  };

  // Reads a segment's increase back off its own rows — the rows stay the single source of truth
  // (every MRR figure on the page already sums from them), so there's no parallel segment-level
  // state to keep in sync. `mixed` means the rows disagree, which is the NORMAL state after a
  // Suggest run (it assigns each subscription its own risk-adjusted rate) or when a saved
  // scenario only covers part of the segment. Rather than a bare "mixed", the min/max are
  // reported so the box still says something useful about what's underneath it.
  const segmentValueFor = (rows: Subscription[]) => {
    const first = edits[rowKey(rows[0])];
    const type = first?.increaseType || 'percent';
    const value = first?.increaseValue ?? 0;
    let min = Infinity, max = -Infinity, uniform = true;
    for (const r of rows) {
      const e = edits[rowKey(r)];
      const v = e?.increaseValue ?? 0;
      if ((e?.increaseType || 'percent') !== type || v !== value) uniform = false;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { type, value, mixed: !uniform, min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  };

  // Writes one increase across every subscription in a segment. This is now the primary way
  // values get set — per-row editing is reserved for deliberate exceptions in the drill-down.
  const applyToSegment = (rows: Subscription[], patch: Partial<RowEdit>) => {
    setSuggestedNumbers(prev => {
      const next = new Set(prev);
      for (const s of rows) next.delete(rowKey(s));
      return next;
    });
    setEdits(prev => {
      const next = { ...prev };
      for (const s of rows) {
        const base: RowEdit = next[rowKey(s)] || { selected: false, increaseType: 'percent', increaseValue: 0 };
        const merged = { ...base, ...patch };
        merged.selected = (Number(merged.increaseValue) || 0) > 0;
        next[rowKey(s)] = merged;
      }
      return next;
    });
  };

  const newMonthlyFor = (s: Subscription, e?: RowEdit) => {
    if (!e) return s.currentMonthly;
    const v = Number(e.increaseValue) || 0;
    // 'target' is an absolute price, not a delta — a 0 means "not set yet", so fall back to the
    // current price rather than dropping the subscription to zero.
    if (e.increaseType === 'target') return v > 0 ? v : s.currentMonthly;
    return e.increaseType === 'flat' ? s.currentMonthly + v : s.currentMonthly * (1 + v / 100);
  };

  const includedCount = subs.filter(s => isIncluded(rowKey(s))).length;
  const mrrDelta = subs.reduce((sum, s) => {
    if (!isIncluded(rowKey(s))) return sum;
    return sum + (newMonthlyFor(s, edits[rowKey(s)]) - s.currentMonthly);
  }, 0);

  // "Suggest scenario" — ranks not-yet-included live subscriptions by churn risk (using the
  // toolbar's current bulk %/$ as the hypothetical increase), then greedily fills in the safest
  // ones until the target MRR is reached. Never touches a row that's already selected — this is
  // what makes it "adjustable": it fills the gap left by whatever's already set up manually.
  // Pure computation reused by the modal's live preview AND the final Apply — given a profile
  // (which risk tiers a subscription is allowed to land in), returns which subscriptions get
  // picked, at what rate each, and whether the target was fully covered. The toolbar's bulk
  // value is a CEILING, not a fixed rate: for a percent scenario, candidate rates are tried from
  // highest to lowest and the first that falls within the profile's accepted tiers wins — so a
  // long-tenure healthy account can get close to the ceiling while a borderline one gets less.
  // A subscription with NO acceptable rate under this profile is excluded entirely (never
  // force-included at a disallowed risk tier) — that's what makes "Conservative" a real
  // guarantee rather than a leaky one, at the cost of possibly falling short of the target.
  const computeSuggestion = (profile: SuggestProfile) => {
    // Rows from a PRIOR suggestion run don't count toward "already covered" here — they're
    // about to be cleared and recomputed fresh below, so counting their old contribution would
    // make the target look more covered than it actually will be after this run replaces them.
    const mrrDeltaExcludingSuggested = subs.reduce((sum, s) => {
      if (!isIncluded(rowKey(s)) || suggestedNumbers.has(rowKey(s))) return sum;
      return sum + (newMonthlyFor(s, edits[rowKey(s)]) - s.currentMonthly);
    }, 0);
    const remainingToTarget = Math.max(0, targetMrr - mrrDeltaExcludingSuggested);
    const acceptTiers = SUGGEST_PROFILE_TIERS[profile];
    const steps = bulkType === 'flat' ? [bulkValue] : (() => {
      const s = RATE_CANDIDATES_PCT.filter(v => v <= bulkValue);
      return s.length ? s : [bulkValue];
    })();
    const evalRate = (s: Subscription, rate: number) => {
      const hypothetical: RowEdit = { selected: true, increaseType: bulkType, increaseValue: rate };
      const delta = newMonthlyFor(s, hypothetical) - s.currentMonthly;
      const proposedPct = (delta / (s.currentMonthly || 1)) * 100;
      return { rate, delta, risk: riskFor(s, proposedPct, calibration) };
    };

    // A row is eligible if it's not selected at all, OR it's selected only because the LAST
    // suggestion run put it there (still replaceable) — never a row the user picked/edited
    // themselves (see setEdit/clearRows/applyBulkTo* stripping it from suggestedNumbers).
    const candidates = subs
      .filter(s => s.status === 'live' && (!edits[rowKey(s)]?.selected || suggestedNumbers.has(rowKey(s))))
      .map(s => {
        for (const rate of steps) {
          const r = evalRate(s, rate);
          if (acceptTiers.includes(r.risk.tier) && r.delta > 0) return { s, ...r };
        }
        return null;
      })
      .filter((c): c is { s: Subscription; rate: number; delta: number; risk: { tier: RiskTier; reasons: string[] } } => c !== null)
      .sort((a, b) => {
        const rank = (tier: RiskTier) => (tier === 'low' ? 0 : tier === 'medium' ? 1 : 2);
        const diff = rank(a.risk.tier) - rank(b.risk.tier);
        return diff !== 0 ? diff : b.s.currentMonthly - a.s.currentMonthly;
      });

    const chosen: typeof candidates = [];
    let cumulative = 0;
    for (const c of candidates) {
      if (remainingToTarget > 0 && cumulative >= remainingToTarget) break;
      chosen.push(c);
      cumulative += c.delta;
    }
    return {
      chosen, cumulative, remainingToTarget,
      medium: chosen.filter(c => c.risk.tier === 'medium').length,
      high: chosen.filter(c => c.risk.tier === 'high').length,
      coversTarget: cumulative >= remainingToTarget,
    };
  };

  const openSuggestModal = () => {
    const mrrDeltaExcludingSuggested = subs.reduce((sum, s) => {
      if (!isIncluded(rowKey(s)) || suggestedNumbers.has(rowKey(s))) return sum;
      return sum + (newMonthlyFor(s, edits[rowKey(s)]) - s.currentMonthly);
    }, 0);
    if (targetMrr - mrrDeltaExcludingSuggested <= 0) { dialog.alert(t('saasIncrease.targetReached') as string); return; }
    setSuggestModalOpen(true);
  };

  const applySuggestion = () => {
    const { chosen } = computeSuggestion(suggestProfile);
    if (!chosen.length) { dialog.alert(t('saasIncrease.noSuggestable') as string); return; }
    setEdits(prev => {
      const next = { ...prev };
      // Clear every row the LAST suggestion run picked before writing the new one, so switching
      // profile and re-applying replaces the old suggestion instead of being blocked by it (a
      // row the user edited by hand was already removed from suggestedNumbers, so it's untouched).
      for (const num of suggestedNumbers) next[num] = { selected: false, increaseType: 'percent', increaseValue: 0 };
      for (const c of chosen) next[rowKey(c.s)] = { selected: true, increaseType: bulkType, increaseValue: c.rate };
      return next;
    });
    setSuggestedNumbers(new Set(chosen.map(c => rowKey(c.s))));
    setSuggestModalOpen(false);
  };
  const pct = targetMrr > 0 ? Math.min(100, (mrrDelta / targetMrr) * 100) : 0;

  const saveScenario = async () => {
    if (!activeScenarioId) return;
    const items = subs
      .filter(s => isIncluded(rowKey(s)))
      .map(s => {
        const e = edits[rowKey(s)];
        return {
          orgId: s.orgId, subscriptionNumber: s.subscriptionNumber, customerId: s.customerId, customerName: s.customerName,
          merchantAccountId: s.merchantAccountId, planCode: s.planCode, planName: s.planName,
          currentMonthly: s.currentMonthly, increaseType: e.increaseType, increaseValue: e.increaseValue,
        };
      });
    // Saving with nothing included is legitimate — it's how you empty a scenario after clearing
    // every segment. Only block it when there's genuinely nothing to do (nothing set AND nothing
    // saved); otherwise confirm first, since it wipes the scenario's saved increases.
    if (!items.length) {
      const savedCount = Object.keys(savedItems).length;
      if (!savedCount) { dialog.alert(t('saasIncrease.noRowsSelected') as string); return; }
      if (!(await dialog.confirm(t('saasIncrease.confirmClearAll', { count: savedCount }) as string))) return;
    }
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

  const loadInsightsStatus = async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/insights/status`, { headers: authHeaders() });
      if (!r.ok) return;
      setInsightsStatus(await r.json());
    } catch { /* non-fatal — the progress line just doesn't render */ }
  };

  const refreshInsights = async () => {
    setRefreshingInsights(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/insights/refresh-base`, { method: 'POST', headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      dialog.alert(t('saasIncrease.insights.refreshStarted') as string);
      loadInsightsStatus();
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

  const draftNotifications = async (itemIds: number[], templateId?: number) => {
    if (!activeScenarioId || !itemIds.length) return;
    markNotifyBusy(itemIds, true);
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${activeScenarioId}/notifications/draft`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds, templateId }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      const items = data.items as ScenarioItem[];
      setSavedItems(prev => {
        const next = { ...prev };
        for (const it of items) next[rowKey(it)] = it;
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

  // Sends whatever's CURRENTLY in the editor to the acting admin's own inbox — [TEST]-prefixed,
  // never touches notify_status. Works with fully fake/typed text too, so this is the safe way
  // to try a new template or the {{effectiveDate}} placeholder before it ever reaches a real
  // merchant — no real subscription required.
  // Explicit single-item removal. Saving deliberately refuses to auto-delete items already pushed
  // to Zoho or already notified, to protect the audit trail — which left those items with no way
  // out at all. Removing one by hand is a deliberate act, so it's allowed here.
  const deleteScenarioItem = async (item: ScenarioItem) => {
    if (!activeScenarioId) return;
    const protectedItem = item.status === 'pushed' || item.notifyStatus === 'sent';
    const msg = protectedItem
      ? t('saasIncrease.confirmRemoveItemProtected', { name: item.customerName }) as string
      : t('saasIncrease.confirmRemoveItem', { name: item.customerName }) as string;
    if (!(await dialog.confirm(msg))) return;
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${activeScenarioId}/items/${item.id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!r.ok) throw new Error(String(r.status));
      // Drop the local edit too, or the row would simply be re-created by the next Save.
      setEdits(prev => ({ ...prev, [rowKey(item)]: { selected: false, increaseType: 'percent', increaseValue: 0 } }));
      await loadScenarioDetail(activeScenarioId);
    } catch { dialog.alert(t('saasIncrease.error') as string); }
  };

  const testSendNotification = async (itemId: number) => {
    if (!activeScenarioId) return;
    const draft = notifyEdits[itemId];
    if (!draft?.subject || !draft?.body) return;
    markNotifyBusy([itemId], true);
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${activeScenarioId}/notifications/test-send`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: draft.subject, body: draft.body }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.sent) { dialog.alert(t('saasIncrease.error') as string); return; }
      dialog.alert(t('saasIncrease.notify.testSent', { to: data.to }) as string);
    } catch { dialog.alert(t('saasIncrease.error') as string); }
    finally { markNotifyBusy([itemId], false); }
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

  // Opens the confirmation modal for the given saved items — the actual Zoho call only
  // happens once the PIN is submitted via confirmPush.
  const openPushModal = (itemIds: number[]) => {
    if (!itemIds.length) return;
    setPushModal({ itemIds, pin: '', busy: false, results: null });
  };

  const confirmPush = async () => {
    if (!activeScenarioId || !pushModal) return;
    setPushModal(m => m ? { ...m, busy: true } : m);
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/scenarios/${activeScenarioId}/push`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: pushModal.itemIds, pin: pushModal.pin }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPushModal(m => m ? { ...m, busy: false } : m);
        if (data.error === 'invalid_pin') dialog.alert(t('saasIncrease.push.invalidPin') as string);
        else if (data.error === 'no_pin_set') dialog.alert(t('saasIncrease.push.noPinSet') as string);
        else dialog.alert(t('saasIncrease.error') as string);
        return;
      }
      const results: Record<number, { ok: boolean; error?: string }> = {};
      for (const res of data.results || []) results[res.itemId] = { ok: res.ok, error: res.error };
      setPushModal(m => m ? { ...m, busy: false, results } : m);
      await loadScenarioDetail(activeScenarioId);
    } catch {
      setPushModal(m => m ? { ...m, busy: false } : m);
      dialog.alert(t('saasIncrease.error') as string);
    }
  };

  const startNewTemplate = () => {
    setTemplateDraft({ name: '', subjectEn: '', bodyEn: '', subjectFr: '', bodyFr: '' });
    setExpandedTemplateId('new');
  };

  const startEditTemplate = (tpl: EmailTemplate) => {
    setTemplateDraft({ name: tpl.name, subjectEn: tpl.subjectEn, bodyEn: tpl.bodyEn, subjectFr: tpl.subjectFr, bodyFr: tpl.bodyFr });
    setExpandedTemplateId(tpl.id);
  };

  const saveTemplate = async () => {
    if (!templateDraft.name.trim() || !templateDraft.subjectEn.trim() || !templateDraft.bodyEn.trim() || !templateDraft.subjectFr.trim() || !templateDraft.bodyFr.trim()) {
      dialog.alert(t('saasIncrease.templates.incomplete') as string);
      return;
    }
    setSavingTemplate(true);
    try {
      const isNew = expandedTemplateId === 'new';
      const url = isNew
        ? `${API_URL}/api/admin/saas-increase/email-templates`
        : `${API_URL}/api/admin/saas-increase/email-templates/${expandedTemplateId}`;
      const r = await fetch(url, {
        method: isNew ? 'POST' : 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(templateDraft),
      });
      if (!r.ok) throw new Error(String(r.status));
      await loadTemplates();
      setExpandedTemplateId(null);
    } catch { dialog.alert(t('saasIncrease.error') as string); }
    finally { setSavingTemplate(false); }
  };

  const deleteTemplate = async (id: number) => {
    if (!(await dialog.confirm(t('saasIncrease.templates.confirmDelete') as string))) return;
    try {
      const r = await fetch(`${API_URL}/api/admin/saas-increase/email-templates/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        dialog.alert(data.error || t('saasIncrease.error') as string);
        return;
      }
      await loadTemplates();
    } catch { dialog.alert(t('saasIncrease.error') as string); }
  };

  // Hero stat-tile math — derived from the same subs/edits state the table already uses, no new
  // endpoints. mrrDelta/includedCount above already cover "projected add" and "subs included."
  const includedSubs = subs.filter(s => isIncluded(rowKey(s)));
  const avgIncreasePct = includedSubs.length
    ? includedSubs.reduce((sum, s) => {
        const nm = newMonthlyFor(s, edits[rowKey(s)]);
        return sum + ((nm - s.currentMonthly) / (s.currentMonthly || 1)) * 100;
      }, 0) / includedSubs.length
    : 0;
  // The MRR tiles report what customers actually pay (plan + addons), so they stay comparable to
  // the board's official MRR. Only the PLAN line moves, so the new total is simply that plus the
  // delta — summing newMonthlyFor here would silently drop every addon from the total.
  const currentTotal = subs.reduce((sum, s) => sum + (s.totalMonthly ?? s.currentMonthly), 0);
  const newTotal = currentTotal + mrrDelta;
  const remaining = Math.max(0, targetMrr - mrrDelta);
  const selectedRows = subs.filter(s => edits[rowKey(s)]?.selected);
  const selectedDelta = selectedRows.reduce((sum, s) => sum + (newMonthlyFor(s, edits[rowKey(s)]) - s.currentMonthly), 0);

  // "Churn we would lose" — how much of the scenario's projected MRR add rides on accounts
  // riskFor() flags as high-risk, and exactly which ones — shown as a clickable caption under
  // the progress bar so the tradeoff (and the accounts behind it) is visible right next to the
  // number it's weighing against.
  const highRiskIncludedRows = subs
    .filter(s => isIncluded(rowKey(s)))
    .map(s => {
      const nm = newMonthlyFor(s, edits[rowKey(s)]);
      const delta = nm - s.currentMonthly;
      const proposedPct = (delta / (s.currentMonthly || 1)) * 100;
      return { s, nm, delta, risk: riskFor(s, proposedPct, calibration) };
    })
    .filter(r => r.risk.tier === 'high')
    .sort((a, b) => b.delta - a.delta);
  const highRiskIncludedMrr = highRiskIncludedRows.reduce((sum, r) => sum + r.delta, 0);

  // Rows with an increase set that aren't (yet) reflected in the saved scenario — drives the
  // "N pending" hint on the Save button, since nothing before that click is actually persisted.
  const unsavedCount = subs.filter(s => {
    if (!isIncluded(rowKey(s))) return false;
    const e = edits[rowKey(s)];
    const saved = savedItems[rowKey(s)];
    if (!saved) return true;
    return saved.increaseType !== e.increaseType || saved.increaseValue !== e.increaseValue;
  }).length;

  // Style fragments for the Kaizen redesign — near-black grays that don't exist in this app's
  // shared dark-mode palette (boxdark/meta-4 are blue-slate), so they're arbitrary-value Tailwind
  // classes scoped to just this file rather than new shared tokens. Light-mode values are derived
  // from the design handoff's own [data-theme="light"] block in colors_and_type.css.
  const card = 'rounded-2xl border border-gray-200 bg-white dark:border-[#1B1B1B] dark:bg-[#0E0F11]';
  const chipInput = 'rounded-lg border border-gray-300 bg-white text-gray-900 placeholder:text-gray-400 dark:border-[#242424] dark:bg-[#0A0A0A] dark:text-white dark:placeholder:text-[#61646C]';
  const raised = 'rounded-lg border border-gray-200 bg-gray-50 dark:border-[#242424] dark:bg-[#141414]';
  // Neutral "nothing to report yet" pill — a plain soft fill with no border, matching the
  // weight of the colored status pills (emerald/red/amber) instead of `raised`'s boxy
  // border+rounded-lg, which visually clashed with the rounded-full pill shape it was combined
  // with (David's screenshot: a bordered box with wrapped text instead of a clean pill).
  const neutralPill = 'bg-gray-100 text-gray-500 dark:bg-[#1B1B1B] dark:text-[#61646C]';
  const textPri = 'text-gray-900 dark:text-white';
  const textSec = 'text-gray-600 dark:text-[#D1D1D1]';
  const textTer = 'text-gray-500 dark:text-[#999AA7]';
  const textQuat = 'text-gray-400 dark:text-[#61646C]';
  const divider = 'divide-gray-100 dark:divide-[#161616]';
  const btnSecondary = 'inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-[#242424] dark:bg-[#141414] dark:text-[#D1D1D1] dark:hover:bg-[#1B1B1B] dark:hover:text-white';
  const btnPrimary = 'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50';
  const segBtn = (on: boolean) => `rounded-md px-2 py-1 text-xs font-semibold transition-colors ${on ? 'bg-primary text-white' : `${textTer} hover:text-gray-700 dark:hover:text-white`}`;
  // Activated + last-price-change used to be two separate columns — merged into one "History"
  // column (stacked two-line cell) so the table fits on a laptop screen without needing to
  // scroll horizontally to see the Risk/Status columns (David's feedback: 10 columns didn't fit).
  const gridCols = 'grid-cols-[38px_2.2fr_1.8fr_1fr_1.3fr_1.1fr_0.8fr_1fr_0.9fr]';

  return (
    <div className="font-satoshi">
      {/* Page title — self-contained now that this page has its own route (moved out of
          AdminPanel, whose shared header used to supply this for free). */}
      <div className="mb-6">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">{t('saasIncrease.title')}</h2>
        <p className="mt-1 text-sm text-body">{t('saasIncrease.subtitle')}</p>
      </div>

      {/* Header actions — Refresh price history / Export CSV */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {/* Scan progress. Base prices must be separated from addons before anything can be pushed,
            and the scan takes a while, so its state belongs on screen rather than in server logs. */}
        {insightsStatus && insightsStatus.total > 0 && (
          <div className={`mr-auto flex items-center gap-2 text-xs ${insightsStatus.verified < insightsStatus.total ? 'text-amber-600 dark:text-amber-400' : textTer}`}>
            {insightsStatus.active && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            <span>
              {t('saasIncrease.insights.progress', { verified: insightsStatus.verified, total: insightsStatus.total })}
              {insightsStatus.active && ` · ${t('saasIncrease.insights.running')}`}
              {!insightsStatus.active && insightsStatus.verified < insightsStatus.total && ` · ${t('saasIncrease.insights.stalled')}`}
              {insightsStatus.errors > 0 && ` · ${t('saasIncrease.insights.errors', { count: insightsStatus.errors })}`}
            </span>
            {/* The failure itself, not just its count — otherwise a scan failing on every row is
                indistinguishable from one that never started. */}
            {insightsStatus.byOrg && insightsStatus.byOrg.length > 1 && (
              <span className={`whitespace-nowrap text-[11px] ${textQuat}`}>
                {insightsStatus.byOrg.map(o => `${o.orgName} ${o.verified}/${o.total}`).join(' · ')}
              </span>
            )}
            {(insightsStatus.crossOrgCollisions ?? 0) > 0 && (
              <span
                className={`whitespace-nowrap text-[11px] ${textQuat}`}
                title={`${t('saasIncrease.insights.duplicatesHint')}

${(insightsStatus.collisionSample || []).join(', ')}`}
              >
                {t('saasIncrease.insights.collisions', { count: insightsStatus.crossOrgCollisions })}
              </span>
            )}
            {(insightsStatus.duplicates ?? 0) > 0 && (
              <span className="whitespace-nowrap text-[11px] font-medium text-red-600 dark:text-red-400" title={t('saasIncrease.insights.duplicatesHint') as string}>
                {t('saasIncrease.insights.duplicates', { count: insightsStatus.duplicates })}
              </span>
            )}
            {insightsStatus.lastScanError && (
              <span className="max-w-[520px] truncate font-mono text-[11px] text-red-600 dark:text-red-400" title={insightsStatus.lastScanError}>
                {insightsStatus.lastScanError}
              </span>
            )}
            {insightsStatus.topErrors?.[0] && (
              <span className="max-w-[520px] truncate font-mono text-[11px] text-red-600 dark:text-red-400" title={insightsStatus.topErrors.map(e => `${e.count}x  ${e.error}`).join('\n')}>
                {insightsStatus.topErrors[0].error}
              </span>
            )}
          </div>
        )}
        <button onClick={refreshInsights} disabled={refreshingInsights} className={btnSecondary}>
          <RefreshCw className={`h-4 w-4 ${refreshingInsights ? 'animate-spin' : ''}`} />
          {refreshingInsights ? t('saasIncrease.insights.refreshing') : t('saasIncrease.insights.refresh')}
        </button>
        {activeScenarioId && (
          <button onClick={exportScenario} disabled={exporting} className={btnSecondary}>
            <Download className="h-4 w-4" />
            {exporting ? t('saasIncrease.exporting') : t('saasIncrease.exportCsv')}
          </button>
        )}
      </div>

      {/* HERO: scenario progress + stat tiles */}
      {activeScenarioId && (
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="flex flex-col justify-between rounded-2xl border border-orange-100 bg-[linear-gradient(180deg,#FEF3E9,#FFFFFF)] p-6 dark:border-[#2a2320] dark:bg-[linear-gradient(180deg,#151210,#0E0F11)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary dark:text-[#F79C6A]">{t('saasIncrease.activeScenario')}</span>
                <div className="relative">
                  <Select value={activeScenarioId != null ? String(activeScenarioId) : ''} onChange={(v) => setActiveScenarioId(v ? Number(v) : null)} options={scenarios.map((sc) => ({ value: String(sc.id), label: sc.name }))} buttonClassName={'rounded-full border border-orange-200 bg-white py-1.5 pl-3.5 pr-3 text-sm font-medium text-gray-900 outline-none dark:border-[#2a2320] dark:bg-[#0A0A0A] dark:text-white'} />
                </div>
                <button
                  type="button" onClick={() => deleteScenario(activeScenarioId)}
                  title={t('saasIncrease.deleteScenario') as string}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-orange-200 bg-white text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:border-[#2a2320] dark:bg-[#0A0A0A] dark:text-[#999AA7] dark:hover:border-red-500/40 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <span className={`text-xs ${textTer}`}>{t('saasIncrease.subsOfTotal', { included: includedCount, total: subs.length })}</span>
            </div>
            <div className="my-4">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="break-words text-[44px] font-semibold leading-none tracking-tight text-primary dark:text-[#F79C6A]">{money(mrrDelta)}</span>
                <span className={`text-[15px] ${textTer}`}>/ {money(targetMrr)} {t('saasIncrease.mrrTarget')}</span>
              </div>
              <div className={`mt-1.5 text-sm ${textSec}`}>{t('saasIncrease.projectedAdd')} · <span className={textPri + ' font-medium'}>{pct.toFixed(1)}%</span> {t('saasIncrease.ofTarget')}</div>
            </div>
            <div>
              <div className="h-3 overflow-hidden rounded-full border border-gray-200 bg-gray-100 dark:border-[#242424] dark:bg-[#0A0A0A]">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#D16630,#F79C6A)' }} />
              </div>
              <div className={`mt-2 flex justify-between text-xs ${textTer}`}>
                <span>{remaining > 0 ? t('saasIncrease.toGo', { amount: money(remaining) }) : t('saasIncrease.targetReached')}</span>
                <span>{t('saasIncrease.annualized')} · {money(mrrDelta * 12)}</span>
              </div>
              {highRiskIncludedMrr > 0 && (
                <button
                  type="button" onClick={() => setRiskDetailOpen(true)}
                  className="mt-2 text-left text-xs font-medium text-amber-600 underline decoration-dotted underline-offset-2 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                >
                  {t('saasIncrease.riskExposure', { amount: money(highRiskIncludedMrr) })}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={`${raised} min-w-0 p-4`}>
              <div className={`flex items-center gap-1.5 text-xs ${textTer}`}><Layers className="h-3.5 w-3.5 shrink-0" /> {t('saasIncrease.statSubsIncluded')}</div>
              <div className={`mt-2 break-words text-[22px] font-semibold leading-tight tracking-tight ${textPri}`}>{includedCount}</div>
              <div className={`mt-0.5 text-[11px] ${textQuat}`}>{t('saasIncrease.statOfLive', { total: subs.length })}</div>
            </div>
            <div className={`${raised} min-w-0 p-4`}>
              <div className={`flex items-center gap-1.5 text-xs ${textTer}`}><Percent className="h-3.5 w-3.5 shrink-0" /> {t('saasIncrease.statAvgIncrease')}</div>
              <div className={`mt-2 break-words text-[22px] font-semibold leading-tight tracking-tight ${textPri}`}>{includedCount ? `${avgIncreasePct.toFixed(1)}%` : '—'}</div>
              <div className={`mt-0.5 text-[11px] ${textQuat}`}>{t('saasIncrease.statOnIncluded')}</div>
            </div>
            <div className={`${raised} min-w-0 p-4`}>
              <div className={`flex items-center gap-1.5 text-xs ${textTer}`}><Wallet className="h-3.5 w-3.5 shrink-0" /> {t('saasIncrease.statCurrentMrr')}</div>
              <div className={`mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-[18px] font-semibold leading-tight tracking-tight ${textPri}`} title={money(currentTotal)}>{money(currentTotal)}</div>
              <div className={`mt-0.5 text-[11px] ${textQuat}`}>{t('saasIncrease.statAllLive')}</div>
            </div>
            <div className={`${raised} min-w-0 p-4`}>
              <div className={`flex items-center gap-1.5 text-xs ${textTer}`}><TrendingUp className="h-3.5 w-3.5 shrink-0" /> {t('saasIncrease.statNewMrr')}</div>
              <div className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-[18px] font-semibold leading-tight tracking-tight text-emerald-600 dark:text-[#57D193]" title={money(newTotal)}>{money(newTotal)}</div>
              <div className={`mt-0.5 text-[11px] ${textQuat}`}>{t('saasIncrease.statAfterIncreases')}</div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE SCENARIO */}
      <div className={`${card} mb-4 flex flex-wrap items-end gap-3.5 p-4`}>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <label className={`text-[11px] ${textTer}`}>{t('saasIncrease.newScenarioName')}</label>
          <input
            value={scenarioName} onChange={(e) => setScenarioName(e.target.value)}
            placeholder={t('saasIncrease.newScenarioPlaceholder') as string}
            className={`${chipInput} px-3 py-2.5 text-sm focus:border-primary focus:outline-none`}
          />
        </div>
        <div className="flex w-[180px] flex-col gap-1.5">
          <label className={`text-[11px] ${textTer}`}>{t('saasIncrease.targetMrr')}</label>
          <div className={`flex items-center px-3 ${chipInput} focus-within:border-primary`}>
            <span className={`mr-1.5 text-sm ${textTer}`}>CA$</span>
            <input
              type="number" value={targetMrr} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setTargetMrr(Number(e.target.value) || 0)}
              className="w-full border-0 bg-transparent py-2.5 text-sm text-gray-900 outline-none dark:text-white"
            />
          </div>
        </div>
        <button onClick={createScenario} className={btnPrimary}>
          <Plus className="h-4 w-4" /> {t('saasIncrease.createScenario')}
        </button>
      </div>

      {/* Workflow legend — the sequence isn't obvious from the controls alone: set increases on
          rows (or select some + use Bulk), Save persists them as the real scenario, then Notify
          drafts/sends the merchant emails. Purely explanatory, no state tracking. */}
      {activeScenarioId && (
        <div className={`${card} mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3`}>
          <span className={`flex items-center gap-1.5 text-xs font-medium ${textPri}`}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">1</span>
            {t('saasIncrease.stepSetIncreases')}
          </span>
          <ChevronRight className={`h-3.5 w-3.5 ${textQuat}`} />
          <span className={`flex items-center gap-1.5 text-xs ${textSec}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${raised} ${textPri}`}>2</span>
            {t('saasIncrease.stepSave')}
          </span>
          <ChevronRight className={`h-3.5 w-3.5 ${textQuat}`} />
          <span className={`flex items-center gap-1.5 text-xs ${textSec}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${raised} ${textPri}`}>3</span>
            {t('saasIncrease.stepNotify')}
          </span>
        </div>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

      {/* TABLE CARD */}
      <div className={`${card} overflow-hidden`}>
        {/* Segment view tabs — applying an increase to a segment completes it, which moves it out
            of "To do" and into "Done". Deliberately a full-width tab strip rather than one more
            control in the toolbar: this is a change of view, and it needs to read that way. */}
        <div className="flex items-center gap-1 border-b border-gray-100 px-3 dark:border-[#1B1B1B]">
          {([
            ['todo', t('saasIncrease.groupView.todo', { count: todoGroupCount })],
            ['done', t('saasIncrease.groupView.done', { count: doneGroupCount })],
            ['all', t('saasIncrease.groupView.allCount', { count: groupedRows.length })],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setGroupView(id as 'todo' | 'done' | 'all')}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                groupView === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-body hover:text-black dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 border-b border-gray-100 p-3.5 dark:border-[#1B1B1B]">
          <div className={`flex min-w-[240px] max-w-[360px] flex-1 items-center gap-2 px-3 ${chipInput} focus-within:border-primary`}>
            <Search className={`h-4 w-4 ${textTer}`} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t('saasIncrease.searchPlaceholder') as string}
              className="w-full border-0 bg-transparent py-2.5 text-sm text-gray-900 outline-none dark:text-white"
            />
          </div>
          <div className="relative">
            <Select value={orgFilter} onChange={(v) => setOrgFilter(v)} options={orgs.map((o) => ({ value: String(o.id), label: o.name }))} placeholder={t('saasIncrease.allOrgs') as string} buttonClassName={`${chipInput} py-2.5 pl-3 pr-8 text-sm`} />
          </div>
          <div className="relative">
            <Select value={planFilter} onChange={(v) => setPlanFilter(v)} options={plans.map((p) => ({ value: p, label: p }))} placeholder={t('saasIncrease.allPlans') as string} buttonClassName={`${chipInput} py-2.5 pl-3 pr-8 text-sm`} />
          </div>
          <div className="relative">
            <Select value={sortBy} onChange={(v) => setSortBy(v as SortBy)} options={[{ value: "name", label: t('saasIncrease.sortName') as string }, { value: "oldest", label: t('saasIncrease.sortOldest') as string }, { value: "newest", label: t('saasIncrease.sortNewest') as string }, { value: "mrr", label: t('saasIncrease.sortMrr') as string }]} buttonClassName={`${chipInput} py-2.5 pl-3 pr-8 text-sm`} />
          </div>
          <button onClick={() => loadSubs(true)} disabled={loading} title={t('saasIncrease.refresh') as string} className={`${raised} flex h-9 w-9 items-center justify-center ${textSec} hover:text-gray-900 dark:hover:text-white`}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {activeScenarioId && targetMrr > 0 && (
            <button
              onClick={openSuggestModal}
              title={t('saasIncrease.suggestScenarioHint') as string}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-opacity-90"
            >
              <Sparkles className="h-3.5 w-3.5" /> {t('saasIncrease.suggestScenario')}
            </button>
          )}
          <button
            onClick={() => { loadCalibration(); setCalibrationOpen(true); }}
            title={t('saasIncrease.calibration.hint') as string}
            className={`${raised} px-2.5 py-2 text-xs font-medium ${textSec} hover:text-gray-900 dark:hover:text-white`}
          >
            <Gauge className="mr-1.5 inline h-3.5 w-3.5" /> {t('saasIncrease.calibration.title')}
          </button>
          <div className="flex-1" />
          <div className={`flex items-center gap-2 py-1 pl-3 pr-1.5 ${chipInput}`}>
            <span className={`whitespace-nowrap text-xs ${textTer}`}>{t('saasIncrease.bulk')}</span>
            <div className={`inline-flex rounded-lg p-0.5 ${raised}`}>
              <button type="button" onClick={() => setBulkType('percent')} className={segBtn(bulkType === 'percent')}>%</button>
              <button type="button" onClick={() => setBulkType('flat')} className={segBtn(bulkType === 'flat')}>$</button>
            </div>
            <input
              type="number" value={bulkValue} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setBulkValue(Number(e.target.value) || 0)}
              className={`w-14 rounded-md border px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-primary dark:text-white ${raised}`}
            />
            <button
              onClick={applyBulkToSelected}
              disabled={selectedRows.length === 0}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${selectedRows.length > 0 ? 'bg-primary text-white' : `${raised} ${textQuat}`}`}
            >
              <CheckCheck className="h-3.5 w-3.5" /> {t('saasIncrease.applyToSelected', { count: selectedRows.length })}
            </button>
            <button
              onClick={() => clearRows(selectedRows)}
              disabled={selectedRows.length === 0}
              title={t('saasIncrease.clearSelectedHint') as string}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${raised} ${textSec} hover:text-gray-900 dark:hover:text-white`}
            >
              <X className="h-3.5 w-3.5" /> {t('saasIncrease.clearSelected')}
            </button>
          </div>
        </div>

        {/* Segment list — the default view. Individual subscriptions are behind a per-segment
            drill-down, so the page opens on a few dozen decision-sized rows rather than
            thousands of editable ones. */}
        <div>
          {(() => {
                const columnHeader = (rows: Subscription[]) => (
                  <div className={`grid ${gridCols} items-center gap-3 border-b border-gray-100 bg-gray-50 px-4.5 py-2 dark:border-[#1B1B1B] dark:bg-[#0A0A0A]`}>
                    <label className="flex items-center"><input type="checkbox" checked={isGroupAllSelected(rows)} onChange={() => toggleGroupSelectAll(rows)} className="h-4 w-4 accent-primary" /></label>
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.colCustomer')}</span>
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.colPlan')}</span>
                    <span className={`justify-self-end text-right text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.colCurrent')}</span>
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.colIncrease')}</span>
                    <span className={`justify-self-end text-right text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.colNew')}</span>
                    <span className={`justify-self-end text-right text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.colRisk')}</span>
                    <span className={`text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.colHistory')}</span>
                    <span className={`justify-self-end text-right text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.colStatus')}</span>
                  </div>
                );
                const renderRow = (s: Subscription) => {
                  const e = edits[rowKey(s)];
                  const included = isIncluded(rowKey(s));
                  const selected = !!e?.selected;
                  const nm = newMonthlyFor(s, e);
                  const delta = included ? nm - s.currentMonthly : 0;
                  const pos = posLabelFor(s.planName, s.orgName);
                  const priceChangeLabel = s.lastPriceChangeAt
                    ? new Date(s.lastPriceChangeAt).toLocaleDateString()
                    : !s.insightsCheckedAt ? t('saasIncrease.notYetChecked')
                    : (s.pricePointsChecked != null && s.pricePointsChecked < 2) ? t('saasIncrease.notEnoughHistory')
                    : t('saasIncrease.noRecentChange');
                  const activatedLabel = s.activatedAt ? new Date(s.activatedAt).toLocaleDateString() : '—';
                  // Combined into one tooltip rather than a second always-visible line — a
                  // stacked two-line cell here read as cramped next to the rest of the row's
                  // single-line cells (David's feedback), and the activation date is more useful
                  // as supporting detail than as its own always-on line.
                  const historyTitle = [
                    `${t('saasIncrease.colActivated')}: ${activatedLabel}`,
                    (s.lastPriceBefore != null && s.lastPriceAfter != null) ? `${money(s.lastPriceBefore)} → ${money(s.lastPriceAfter)}` : null,
                  ].filter(Boolean).join(' · ');
                  const rowBg = selected ? 'bg-orange-50/60 dark:bg-[rgba(245,131,69,0.06)]' : included ? 'bg-emerald-50/40 dark:bg-[rgba(87,209,147,0.03)]' : '';
                  const proposedPct = ((nm - s.currentMonthly) / (s.currentMonthly || 1)) * 100;
                  const risk = riskFor(s, proposedPct, calibration);
                  const riskTitle = risk.reasons.map(r => t(`saasIncrease.risk.reasons.${r}`)).join(' · ');
                  // Once a row is saved to the scenario, the Status column shows the real push
                  // status (pending/pushed/push_failed) instead of the purely local "increase
                  // set / not set" badge — the real signal only exists after Save.
                  const savedForRow = savedItems[rowKey(s)];
                  return (
                    <div key={rowKey(s)} className={`grid ${gridCols} items-center gap-3 border-b border-gray-100 px-4.5 py-3 hover:bg-gray-50 dark:border-[#161616] dark:hover:bg-[#141416] ${rowBg}`}>
                      <label className="flex items-center"><input type="checkbox" checked={selected} onChange={(ev) => setEdit(rowKey(s), { selected: ev.target.checked })} className="h-4 w-4 accent-primary" /></label>
                      <div className="min-w-0">
                        <div className={`truncate text-sm font-medium ${textPri}`}>{s.customerName}</div>
                        <div className={`mt-0.5 font-mono text-[11px] ${textQuat}`}>{s.subscriptionNumber}{s.merchantAccountId ? ` · ${s.merchantAccountId}` : ''}</div>
                      </div>
                      <div className="min-w-0">
                        <div className={`truncate text-[13px] ${textSec}`}>{s.planName}</div>
                        <div className={`mt-0.5 inline-flex items-center gap-1.5 text-[11px] ${textQuat}`}>
                          <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: pos.color }} />
                          {pos.label}
                        </div>
                      </div>
                      <div className="justify-self-end text-right">
                        <div className={`text-sm tabular-nums ${textPri}`}>{money(s.currentMonthly)}</div>
                        {!s.baseVerified ? (
                          <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-amber-600 dark:text-amber-400" title={t('saasIncrease.baseUnverifiedHint') as string}>
                            {t('saasIncrease.baseUnverified')}
                          </div>
                        ) : (s.addonsMonthly ?? 0) > 0 && (
                          <div className={`mt-0.5 whitespace-nowrap text-[11px] ${textQuat}`} title={t('saasIncrease.addonsHint', { total: money(s.totalMonthly) }) as string}>
                            {t('saasIncrease.addons', { amount: money(s.addonsMonthly || 0) })}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`inline-flex rounded-lg p-0.5 ${chipInput}`}>
                          <button type="button" onClick={() => setEdit(rowKey(s), { increaseType: 'percent' })} className={segBtn((e?.increaseType || 'percent') === 'percent')}>%</button>
                          <button type="button" onClick={() => setEdit(rowKey(s), { increaseType: 'flat' })} className={segBtn(e?.increaseType === 'flat')}>$</button>
                          <button type="button" onClick={() => setEdit(rowKey(s), { increaseType: 'target' })} className={segBtn(e?.increaseType === 'target')} title={t('saasIncrease.setToHint') as string}>=</button>
                        </div>
                        <input
                          type="number" value={e?.increaseValue || ''} placeholder="0"
                          onWheel={(ev) => ev.currentTarget.blur()}
                          onChange={(ev) => setEdit(rowKey(s), { increaseValue: Number(ev.target.value) || 0 })}
                          className={`w-[58px] rounded-lg border bg-white px-2 py-1.5 text-right text-[13px] tabular-nums outline-none focus:border-primary dark:bg-[#0A0A0A] dark:text-white ${included ? 'border-orange-300 dark:border-[#D16630]' : 'border-gray-300 dark:border-[#242424]'}`}
                        />
                      </div>
                      <div className="justify-self-end text-right">
                        <div className={`text-sm font-medium tabular-nums ${included ? textPri : textSec}`}>{money(nm)}</div>
                        {/* A 'set to' price below the current one is a DECREASE — show it as such
                            instead of printing "+-$20". */}
                        {included && delta !== 0 && (
                          <div className={`mt-0.5 text-[11px] ${delta > 0 ? 'text-emerald-600 dark:text-[#57D193]' : 'text-amber-600 dark:text-amber-400'}`}>
                            {delta > 0 ? '+' : '−'}{money(Math.abs(delta))}
                          </div>
                        )}
                      </div>
                      <div className="justify-self-end">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${RISK_BADGE_CLS[risk.tier]}`} title={riskTitle}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: RISK_DOT_COLOR[risk.tier] }} />
                          {t(`saasIncrease.risk.${risk.tier}`)}
                        </span>
                      </div>
                      <div className="min-w-0 truncate text-xs" title={historyTitle}>
                        <span className={textTer}>{priceChangeLabel}</span>
                      </div>
                      <div className="justify-self-end">
                        {savedForRow ? (
                          <span
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${
                              savedForRow.status === 'pushed' ? 'bg-emerald-100 text-emerald-700 dark:bg-[rgba(87,209,147,0.12)] dark:text-[#57D193]' :
                              savedForRow.status === 'push_failed' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' :
                              neutralPill
                            }`}
                            title={savedForRow.pushError || ''}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: savedForRow.status === 'pushed' ? '#57D193' : savedForRow.status === 'push_failed' ? '#ef4444' : '#575A61' }} />
                            {t(`saasIncrease.push.status.${savedForRow.status}`)}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${included ? 'bg-emerald-100 text-emerald-700 dark:bg-[rgba(87,209,147,0.12)] dark:text-[#57D193]' : neutralPill}`}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: included ? '#57D193' : '#575A61' }} />
                            {included ? t('saasIncrease.increaseSet') : t('saasIncrease.notChecked')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                };
                // One row per org x plan SEGMENT — the level pricing decisions actually get made
                // at. Each carries its own increase control that writes through to every
                // subscription underneath it, so a scenario is built in a few dozen keystrokes
                // instead of thousands. Individual subscriptions live behind "View".
                const segCols = 'grid-cols-[2.6fr_1.1fr_1.5fr_1.3fr_1.1fr_auto]';
                const drilldown = drilldownKey ? groupedRows.find(([k]) => k === drilldownKey) : null;
                return (
                  <>
                    <div className={`grid ${segCols} items-center gap-3 border-b border-gray-100 bg-gray-50 px-4.5 py-2 dark:border-[#1B1B1B] dark:bg-[#0A0A0A]`}>
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.segment.colSegment')}</span>
                      <span className={`justify-self-end text-right text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.colCurrent')}</span>
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.colIncrease')}</span>
                      <span className={`justify-self-end text-right text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.colNew')}</span>
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${textTer}`}>{t('saasIncrease.segment.colProgress')}</span>
                      <span />
                    </div>
                    {(() => {
                      // Group the segments under an organisation heading. They were already sorted
                      // by org (the key is org||plan), but nothing said so — the org was repeated
                      // in small text on every row instead, which read as noise rather than
                      // structure.
                      const byOrg = new Map<string, typeof visibleGroups>();
                      for (const g of visibleGroups) {
                        const org = g[0].split('||')[0];
                        if (!byOrg.has(org)) byOrg.set(org, []);
                        byOrg.get(org)!.push(g);
                      }
                      return Array.from(byOrg.entries()).map(([orgName, orgGroups]) => {
                        // Two different numbers, and conflating them is misleading: currentMonthly
                        // is the BASE PLAN price (what an increase acts on), while what the customer
                        // actually pays — and what Zoho's MRR reports — includes addons. Showing
                        // only the former under an org heading read as "this org's MRR" and looked
                        // ~19% short of Zoho.
                        const orgCurrent = orgGroups.reduce((sum, [, rs]) => sum + rs.reduce((a, r) => a + r.currentMonthly, 0), 0);
                        const orgTotal = orgGroups.reduce((sum, [, rs]) => sum + rs.reduce((a, r) => a + (r.totalMonthly ?? r.currentMonthly), 0), 0);
                        // Per-status breakdown in the tooltip. When this total disagrees with
                        // Zoho's dashboard the difference is usually one status bucket, so it's
                        // worth being able to see them without going to the database.
                        const orgStat = insightsStatus?.byOrg?.find(o => o.orgName === orgName);
                        const statusBreakdown = orgStat?.byStatus
                          ? Object.entries(orgStat.byStatus).sort((a, b) => b[1].mrr - a[1].mrr)
                              .map(([st, v]) => `${st}: ${v.count} subs · ${money(v.mrr)}/mo${v.numbers?.length ? `  (${v.numbers.join(', ')})` : ''}`).join('\n')
                          : '';
                        const orgSubs = orgGroups.reduce((sum, [, rs]) => sum + rs.length, 0);
                        return (
                          <div key={`org-${orgName}`}>
                            <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 px-4.5 py-2.5 dark:border-[#242424] ${raised}`}>
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: posLabelFor('', orgName).color }} />
                              <span className={`text-sm font-semibold ${textPri}`}>{orgName}</span>
                              <span className={`text-xs ${textTer}`}>
                                {t('saasIncrease.segment.orgSummary', { segments: orgGroups.length, subs: orgSubs })}
                              </span>
                              <span className={`ml-auto whitespace-nowrap text-xs tabular-nums ${textTer}`}>
                                {t('saasIncrease.segment.orgBase', { amount: money(orgCurrent) })}
                                {orgTotal > orgCurrent && <span className={textQuat}> · {t('saasIncrease.segment.orgTotal', { amount: money(orgTotal) })}</span>}
                              </span>
                              {/* Explicit toggle rather than a bare title attribute — a tooltip on
                                  an unmarked number is undiscoverable. */}
                              <button
                                type="button"
                                onClick={() => setOpenOrgInfo(openOrgInfo === orgName ? null : orgName)}
                                title={t('saasIncrease.segment.orgTotalsHint') as string}
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${chipInput} ${textSec} hover:text-primary`}
                              >
                                <Info className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {openOrgInfo === orgName && (
                              <div className={`border-b border-gray-200 px-4.5 py-3 text-xs dark:border-[#242424] ${raised}`}>
                                <p className={`mb-2 ${textSec}`}>{t('saasIncrease.segment.orgTotalsHint')}</p>
                                {statusBreakdown ? (
                                  <div className={`space-y-1 font-mono ${textTer}`}>
                                    {statusBreakdown.split('\n').map(line => <div key={line}>{line}</div>)}
                                  </div>
                                ) : (
                                  <p className={textQuat}>{t('saasIncrease.segment.orgNoBreakdown')}</p>
                                )}
                              </div>
                            )}
                            {orgGroups.map(([key, rows]) => {
                      const [, planLabel] = key.split('||');
                      const segCurrent = rows.reduce((sum, r) => sum + r.currentMonthly, 0);
                      const segNew = rows.reduce((sum, r) => sum + newMonthlyFor(r, edits[rowKey(r)]), 0);
                      const segDelta = segNew - segCurrent;
                      const setCount = rows.filter(r => isIncluded(rowKey(r))).length;
                      const sv = segmentValueFor(rows);
                      const highCount = rows.filter(r => {
                        const nm = newMonthlyFor(r, edits[rowKey(r)]);
                        const pct = ((nm - r.currentMonthly) / (r.currentMonthly || 1)) * 100;
                        return pct > 0 && riskFor(r, pct, calibration).tier === 'high';
                      }).length;
                      return (
                        <div key={key} className={`grid ${segCols} items-center gap-3 border-b border-gray-100 px-4.5 py-3 hover:bg-gray-50 dark:border-[#161616] dark:hover:bg-[#141416] ${setCount > 0 ? 'bg-emerald-50/40 dark:bg-[rgba(87,209,147,0.03)]' : ''}`}>
                          <div className="min-w-0">
                            <div className={`truncate text-sm font-medium ${textPri}`}>{planLabel}</div>
                            <div className={`mt-0.5 inline-flex items-center gap-1.5 text-[11px] ${textQuat}`}>
                              <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: posLabelFor(planLabel, orgName).color }} />
                              <span className="truncate">{t('saasIncrease.groupCount', { count: rows.length })}</span>
                            </div>
                          </div>
                          <div className={`justify-self-end text-right text-sm tabular-nums ${textPri}`}>{money(segCurrent)}</div>
                          <div className="flex items-center gap-1.5">
                            <div className={`inline-flex rounded-lg p-0.5 ${chipInput}`}>
                              <button type="button" onClick={() => applyToSegment(rows, { increaseType: 'percent' })} className={segBtn(sv.type === 'percent')}>%</button>
                              <button type="button" onClick={() => applyToSegment(rows, { increaseType: 'flat' })} className={segBtn(sv.type === 'flat')}>$</button>
                              <button type="button" onClick={() => applyToSegment(rows, { increaseType: 'target' })} className={segBtn(sv.type === 'target')} title={t('saasIncrease.setToHint') as string}>=</button>
                            </div>
                            <input
                              type="number"
                              placeholder={sv.mixed ? `${sv.min}–${sv.max}` : '0'}
                              title={sv.mixed ? (t('saasIncrease.segment.mixedHint', { min: sv.min, max: sv.max }) as string) : ''}
                              value={sv.mixed ? '' : (sv.value || '')}
                              onWheel={(ev) => ev.currentTarget.blur()}
                              onFocus={() => setEditingSegment(key)}
                              onBlur={() => setEditingSegment(null)}
                              onChange={(ev) => applyToSegment(rows, { increaseValue: Number(ev.target.value) || 0 })}
                              className={`w-[78px] rounded-lg border bg-white px-2 py-1.5 text-right text-[13px] tabular-nums outline-none focus:border-primary dark:bg-[#0A0A0A] dark:text-white ${setCount > 0 ? 'border-orange-300 dark:border-[#D16630]' : 'border-gray-300 dark:border-[#242424]'}`}
                            />
                          </div>
                          <div className="justify-self-end text-right">
                            <div className={`text-sm font-medium tabular-nums ${setCount > 0 ? textPri : textSec}`}>{money(segNew)}</div>
                            {segDelta > 0 && <div className="mt-0.5 text-[11px] text-emerald-600 dark:text-[#57D193]">+{money(segDelta)}</div>}
                          </div>
                          <div className="min-w-0">
                            <div className={`whitespace-nowrap text-xs ${textTer}`}>{t('saasIncrease.segment.setCount', { set: setCount, total: rows.length })}</div>
                            {highCount > 0 && (
                              <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                {t('saasIncrease.segment.highRisk', { count: highCount })}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5 justify-self-end">
                            {setCount > 0 && (
                              <button
                                type="button" onClick={() => clearRows(rows)} title={t('saasIncrease.clearGroupHint') as string}
                                className={`flex h-8 w-8 items-center justify-center rounded-md ${chipInput} ${textSec} hover:text-red-500`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button" onClick={() => setDrilldownKey(key)}
                              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium ${chipInput} ${textSec} hover:text-gray-900 dark:hover:text-white`}
                            >
                              {t('saasIncrease.segment.view')} <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                            })}
                          </div>
                        );
                      });
                    })()}
                    {/* Drill-down — the full per-subscription table for ONE segment, for handling
                        exceptions. Reuses the same row/column renderers the old flat table used. */}
                    {drilldown && (
                      <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black bg-opacity-60 p-4" onClick={() => setDrilldownKey(null)}>
                        <div className={`flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg shadow-xl ${card}`} onClick={(ev) => ev.stopPropagation()}>
                          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3 dark:border-[#1B1B1B]">
                            <div className="min-w-0">
                              <p className={`truncate font-semibold ${textPri}`}>{drilldown[0].split('||')[1]}</p>
                              <p className={`mt-0.5 truncate text-xs ${textTer}`}>
                                {drilldown[0].split('||')[0]} · {t('saasIncrease.groupCount', { count: drilldown[1].length })} · {t('saasIncrease.segment.drilldownHint')}
                              </p>
                            </div>
                            <button onClick={() => setDrilldownKey(null)} className={`${textSec} shrink-0 transition hover:text-red-500`}>
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                          <div className="flex-1 overflow-auto">
                            <div className="min-w-[880px]">
                              {columnHeader(drilldown[1])}
                              {drilldown[1].map(renderRow)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
          {!loading && filtered.length === 0 && (
            <div className={`px-4 py-12 text-center text-sm ${textTer}`}>{t('saasIncrease.none')}</div>
          )}
          {/* Distinguish "your filters match nothing" from "you've applied an increase to every
              group" — the second is success, not an empty result. */}
          {!loading && filtered.length > 0 && visibleGroups.length === 0 && (
            <div className={`px-4 py-12 text-center text-sm ${textTer}`}>
              {groupView === 'todo' ? t('saasIncrease.groupView.allDone') : t('saasIncrease.groupView.noneDone')}
              {' '}
              <button type="button" onClick={() => setGroupView('all')} className="font-medium text-primary underline decoration-dotted underline-offset-2">
                {t('saasIncrease.groupView.showAll')}
              </button>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-4.5 py-3 dark:border-[#1B1B1B] dark:bg-[#0A0A0A]">
          <span className={`text-sm ${textTer}`}>{t('saasIncrease.showingOf', { visible: visibleRowCount, total: subs.length })}</span>
          <span className={`text-sm ${textSec}`}>{t('saasIncrease.selectedCountLabel', { count: selectedRows.length })} · <span className="font-medium text-primary dark:text-[#F79C6A]">{money(selectedDelta)}/mo</span> {t('saasIncrease.added')}</span>
        </div>
      </div>

      {activeScenarioId && (
        <div className="mt-4 flex items-center justify-end">
          <button onClick={saveScenario} disabled={saving} className={btnPrimary}>
            {saving ? t('saasIncrease.saving') : unsavedCount > 0 ? t('saasIncrease.saveDraftWithCount', { count: unsavedCount }) : t('saasIncrease.saveDraft')}
          </button>
        </div>
      )}

      {/* Scenario items & merchant notifications — the communication engine. Deliberately
          separate from the simulator table above (which mixes in not-yet-saved rows); this
          only lists rows already saved to the active scenario. */}
      {activeScenarioId && Object.keys(savedItems).length > 0 && (() => {
        const notifyGroups = new Map<string, ScenarioItem[]>();
        for (const item of Object.values(savedItems)) {
          const key = `${item.orgId}||${item.planName}`;
          if (!notifyGroups.has(key)) notifyGroups.set(key, []);
          notifyGroups.get(key)!.push(item);
        }
        const sortedGroups = Array.from(notifyGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const defaultTemplate = templates.find(tp => tp.isDefault) || templates[0];
        return (
          <div className={`${card} mt-6 overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3 dark:border-[#1B1B1B]">
              <div>
                <h4 className={`text-sm font-semibold ${textPri}`}>{t('saasIncrease.notify.title')}</h4>
                <p className={`mt-0.5 text-xs ${textTer}`}>{canExecute ? t('saasIncrease.push.subtitle') : t('saasIncrease.notify.subtitle')}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { loadTemplates(); setTemplateManagerOpen(true); }} className={`${btnSecondary} px-3 py-1.5 text-xs`}>
                  <Settings className="h-3.5 w-3.5" /> {t('saasIncrease.templates.manage')}
                </button>
                <button
                  onClick={() => draftNotifications(Array.from(notifySelected))}
                  disabled={notifySelected.size === 0}
                  className={`${btnSecondary} px-3 py-1.5 text-xs`}
                >
                  {t('saasIncrease.notify.draftSelected', { count: notifySelected.size })}
                </button>
                <button
                  onClick={() => sendNotifications(Array.from(notifySelected))}
                  disabled={notifySelected.size === 0}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-[#57D193] dark:text-[#0A0A0A] dark:hover:bg-opacity-90"
                >
                  {t('saasIncrease.notify.sendSelected', { count: notifySelected.size })}
                </button>
                {canExecute && (
                  <button
                    onClick={() => openPushModal(Array.from(notifySelected))}
                    disabled={notifySelected.size === 0}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90 disabled:opacity-50"
                  >
                    {t('saasIncrease.push.pushSelected', { count: notifySelected.size })}
                  </button>
                )}
              </div>
            </div>
            <div>
              {sortedGroups.map(([key, items]) => {
                const groupExpanded = expandedNotifyGroups.has(key);
                const [, planLabel] = key.split('||');
                const orgLabel = orgs.find(o => o.id === items[0].orgId)?.name || items[0].orgId;
                const chosenTemplateId = groupTemplateChoice[key] ?? defaultTemplate?.id;
                return (
                  <div key={key} className={`border-b ${divider}`}>
                    <div className={`flex flex-wrap items-center gap-2.5 px-5 py-2.5 ${raised}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedNotifyGroups(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:brightness-95 dark:hover:brightness-110"
                      >
                        <ChevronRight className={`h-4 w-4 shrink-0 ${textQuat} transition-transform ${groupExpanded ? 'rotate-90' : ''}`} />
                        <span className={`truncate text-sm font-medium ${textPri}`}>{planLabel}</span>
                        <span className={`shrink-0 text-[11px] ${textQuat}`}>{orgLabel}</span>
                        <span className={`ml-auto shrink-0 text-xs ${textTer}`}>{t('saasIncrease.groupCount', { count: items.length })}</span>
                      </button>
                      {templates.length > 0 && (
                        <>
                          <Select value={chosenTemplateId != null ? String(chosenTemplateId) : ''} onChange={(v) => setGroupTemplateChoice((prev) => ({ ...prev, [key]: Number(v) }))} options={templates.map((tp) => ({ value: String(tp.id), label: tp.name }))} buttonClassName={`rounded-md px-2 py-1.5 text-xs ${chipInput}`} />
                          <button
                            type="button"
                            onClick={() => draftNotifications(items.map(it => it.id), chosenTemplateId)}
                            className={`${btnSecondary} px-2.5 py-1.5 text-xs`}
                          >
                            {t('saasIncrease.templates.draftGroupWith')}
                          </button>
                        </>
                      )}
                      {canExecute && (
                        <button
                          type="button"
                          onClick={() => openPushModal(items.map(it => it.id))}
                          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-opacity-90"
                        >
                          {t('saasIncrease.push.pushGroup')}
                        </button>
                      )}
                    </div>
                    {groupExpanded && (
                      <div className={`divide-y ${divider}`}>
                        {items.map(item => {
                          const draft = notifyEdits[item.id] || { to: '', subject: '', body: '' };
                          const expanded = expandedNotifyId === item.id;
                          const busy = notifyBusyIds.has(item.id);
                          return (
                            <div key={item.id} className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <input type="checkbox" checked={notifySelected.has(item.id)} onChange={() => toggleNotifySelected(item.id)} className="accent-primary" />
                                <button type="button" onClick={() => setExpandedNotifyId(expanded ? null : item.id)} className="flex flex-1 items-center justify-between gap-3 text-left">
                                  <div>
                                    <div className={`font-medium ${textPri}`}>{item.customerName}</div>
                                    <div className={`text-xs ${textQuat}`}>{item.subscriptionNumber} · {money(item.currentMonthly)} → {money(item.newMonthly)}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                                        item.notifyStatus === 'sent' ? 'bg-emerald-100 text-emerald-700 dark:bg-[rgba(87,209,147,0.12)] dark:text-[#57D193]' :
                                        item.notifyStatus === 'send_failed' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' :
                                        item.notifyStatus === 'drafted' ? 'bg-primary/10 text-primary' :
                                        neutralPill
                                      }`}
                                      title={item.notifyError || ''}
                                    >
                                      {t(`saasIncrease.notify.status.${item.notifyStatus}`)}
                                    </span>
                                    {canExecute && (
                                      <span
                                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                                          item.status === 'pushed' ? 'bg-emerald-100 text-emerald-700 dark:bg-[rgba(87,209,147,0.12)] dark:text-[#57D193]' :
                                          item.status === 'push_failed' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' :
                                          neutralPill
                                        }`}
                                        title={item.pushError || ''}
                                      >
                                        {t(`saasIncrease.push.status.${item.status}`)}
                                      </span>
                                    )}
                                    <ChevronDown className={`h-4 w-4 ${textQuat} transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                  </div>
                                </button>
                                <button
                                  type="button" onClick={() => deleteScenarioItem(item)}
                                  title={t('saasIncrease.removeItem') as string}
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${chipInput} ${textSec} hover:border-red-300 hover:text-red-500`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {expanded && (
                                <div className={`mt-3 space-y-2 rounded-lg border border-gray-200 p-3 dark:border-[#1B1B1B]`}>
                                  <div>
                                    <label className={`mb-1 block text-xs ${textTer}`}>{t('saasIncrease.notify.to')}</label>
                                    <input
                                      value={draft.to} onChange={(e) => setNotifyEdits(prev => ({ ...prev, [item.id]: { ...draft, to: e.target.value } }))}
                                      placeholder="client@example.com" className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`}
                                    />
                                  </div>
                                  <div>
                                    <label className={`mb-1 block text-xs ${textTer}`}>{t('saasIncrease.notify.subject')}</label>
                                    <input
                                      value={draft.subject} onChange={(e) => setNotifyEdits(prev => ({ ...prev, [item.id]: { ...draft, subject: e.target.value } }))}
                                      className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`}
                                    />
                                  </div>
                                  <div>
                                    <label className={`mb-1 block text-xs ${textTer}`}>{t('saasIncrease.notify.body')}</label>
                                    <textarea
                                      value={draft.body} onChange={(e) => setNotifyEdits(prev => ({ ...prev, [item.id]: { ...draft, body: e.target.value } }))}
                                      rows={7} className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`}
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => draftNotifications([item.id])} disabled={busy} className={`${btnSecondary} px-3 py-1.5 text-xs`}>
                                      {t('saasIncrease.notify.draft')}
                                    </button>
                                    <button onClick={() => previewNotification(item.id)} disabled={busy || !draft.body} className={`${btnSecondary} px-3 py-1.5 text-xs`}>
                                      {t('saasIncrease.notify.preview')}
                                    </button>
                                    <button
                                      onClick={() => testSendNotification(item.id)} disabled={busy || !draft.subject || !draft.body}
                                      title={t('saasIncrease.notify.testSendHint') as string}
                                      className={`${btnSecondary} px-3 py-1.5 text-xs`}
                                    >
                                      {t('saasIncrease.notify.testSend')}
                                    </button>
                                    <button onClick={() => sendNotifications([item.id])} disabled={busy || !draft.to || !draft.subject} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-[#57D193] dark:text-[#0A0A0A]">
                                      {busy ? t('saasIncrease.notify.sending') : t('saasIncrease.notify.send')}
                                    </button>
                                    {canExecute && (
                                      <button onClick={() => openPushModal([item.id])} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90">
                                        {t('saasIncrease.push.pushOne')}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Risk detail modal — exactly which included accounts make up the "high-risk MRR"
          caption, and why each one was flagged, so the number is never just a scary total with
          nothing behind it. */}
      {riskDetailOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black bg-opacity-60 p-4" onClick={() => setRiskDetailOpen(false)}>
          <div className={`flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg shadow-xl ${card}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-[#1B1B1B]">
              <div>
                <p className={`font-semibold ${textPri}`}>{t('saasIncrease.riskDetail.title')}</p>
                <p className={`mt-0.5 text-xs ${textTer}`}>
                  {t('saasIncrease.riskDetail.subtitle', { count: highRiskIncludedRows.length, amount: money(highRiskIncludedMrr) })}
                </p>
              </div>
              <button onClick={() => setRiskDetailOpen(false)} className={`${textSec} shrink-0 transition hover:text-red-500`}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className={`flex-1 divide-y overflow-y-auto ${divider}`}>
              {highRiskIncludedRows.map(r => (
                <div key={rowKey(r.s)} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`truncate text-sm font-medium ${textPri}`}>{r.s.customerName}</div>
                      <div className={`mt-0.5 font-mono text-[11px] ${textQuat}`}>{r.s.subscriptionNumber}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-sm font-medium tabular-nums ${textPri}`}>{money(r.s.currentMonthly)} → {money(r.nm)}</div>
                      <div className="mt-0.5 text-[11px] text-emerald-600 dark:text-[#57D193]">+{money(r.delta)}/mo</div>
                    </div>
                  </div>
                  <p className={`mt-1.5 text-xs ${textTer}`}>
                    {r.risk.reasons.map(reason => t(`saasIncrease.risk.reasons.${reason}`)).join(' · ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Suggest Scenario modal — pick a risk-tolerance profile and see a live preview (count,
          $/mo, risk breakdown) before anything is applied. Recomputes on every render while
          open, which is cheap at this data size and keeps the preview always in sync with the
          selected profile / current bulk ceiling. */}
      {suggestModalOpen && (() => {
        const preview = computeSuggestion(suggestProfile);
        return (
          <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black bg-opacity-60 p-4" onClick={() => setSuggestModalOpen(false)}>
            <div className={`w-full max-w-lg overflow-hidden rounded-lg shadow-xl ${card}`} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-[#1B1B1B]">
                <p className={`font-semibold ${textPri}`}>{t('saasIncrease.suggest.title')}</p>
                <button onClick={() => setSuggestModalOpen(false)} className={`${textSec} transition hover:text-red-500`}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 p-5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {SUGGEST_PROFILES.map(p => (
                    <button
                      key={p} type="button" onClick={() => setSuggestProfile(p)}
                      className={`rounded-lg border p-3 text-left transition ${
                        suggestProfile === p
                          ? 'border-primary bg-primary/5 dark:bg-primary/10'
                          : 'border-gray-200 hover:border-gray-300 dark:border-[#242424] dark:hover:border-[#333]'
                      }`}
                    >
                      <div className={`text-sm font-semibold ${suggestProfile === p ? 'text-primary' : textPri}`}>
                        {t(`saasIncrease.suggest.profile.${p}.label`)}
                      </div>
                      <div className={`mt-1 text-xs leading-relaxed ${textTer}`}>
                        {t(`saasIncrease.suggest.profile.${p}.desc`)}
                      </div>
                    </button>
                  ))}
                </div>
                <div className={`rounded-lg p-3 text-sm ${raised}`}>
                  {preview.chosen.length > 0 ? (
                    <>
                      <p className={textPri}>
                        {t('saasIncrease.suggest.preview', {
                          count: preview.chosen.length, delta: money(preview.cumulative),
                          medium: preview.medium, high: preview.high,
                        })}
                      </p>
                      {!preview.coversTarget && (
                        <p className="mt-1.5 text-amber-600 dark:text-amber-400">
                          {t('saasIncrease.suggest.shortfall', { covered: money(preview.cumulative), target: money(preview.remainingToTarget) })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className={textTer}>{t('saasIncrease.noSuggestable')}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={applySuggestion} disabled={!preview.chosen.length} className={btnPrimary}>
                    {t('saasIncrease.suggest.apply')}
                  </button>
                  <button onClick={() => setSuggestModalOpen(false)} className={btnSecondary}>
                    {t('saasIncrease.templates.cancel')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Push-to-Zoho confirmation modal — the one action in this tool that changes live
          customer billing, so it's gated behind a confirmation PIN (see Profile.tsx). Results
          render inline after submit rather than closing immediately, since a batch can partially
          fail (continue-past-failures, same convention as notification sending). */}
      {pushModal && (() => {
        const targetItems = pushModal.itemIds.map(id => Object.values(savedItems).find(it => it.id === id)).filter(Boolean) as ScenarioItem[];
        const totalDelta = targetItems.reduce((sum, it) => sum + (it.newMonthly - it.currentMonthly), 0);
        const alreadyPushedCount = targetItems.filter(it => it.status === 'pushed').length;
        return (
          <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black bg-opacity-60 p-4" onClick={() => !pushModal.busy && setPushModal(null)}>
            <div className={`w-full max-w-md overflow-hidden rounded-lg shadow-xl ${card}`} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-[#1B1B1B]">
                <p className={`font-semibold ${textPri}`}>{t('saasIncrease.push.confirmTitle')}</p>
                <button onClick={() => setPushModal(null)} className={`${textSec} transition hover:text-red-500`}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 p-5">
                {!pushModal.results ? (
                  <>
                    <p className={`text-sm ${textSec}`}>
                      {t('saasIncrease.push.confirmBody', { count: targetItems.length, delta: money(totalDelta) })}
                    </p>
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
                      {t('saasIncrease.push.warning')}
                    </p>
                    {alreadyPushedCount > 0 && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
                        {t('saasIncrease.push.alreadyPushed', { count: alreadyPushedCount })}
                      </p>
                    )}
                    {hasPushPin === false ? (
                      <p className={`text-sm ${textSec}`}>{t('saasIncrease.push.noPinSetInline')}</p>
                    ) : (
                      <div>
                        <label className={`mb-1 block text-xs ${textTer}`}>{t('saasIncrease.push.pinLabel')}</label>
                        <PasswordInput
                           inputMode="numeric" autoFocus value={pushModal.pin}
                          onChange={(e) => setPushModal(m => m ? { ...m, pin: e.target.value.replace(/\D/g, '') } : m)}
                          className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`}
                        />
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={confirmPush}
                        disabled={pushModal.busy || hasPushPin === false || !pushModal.pin}
                        className={btnPrimary}
                      >
                        {pushModal.busy ? t('saasIncrease.push.pushing') : t('saasIncrease.push.confirmSubmit')}
                      </button>
                      <button onClick={() => setPushModal(null)} className={btnSecondary}>{t('saasIncrease.templates.cancel')}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {targetItems.map(it => {
                        const r = pushModal.results![it.id];
                        return (
                          <div key={it.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className={textSec}>{it.customerName}</span>
                            <span className={r?.ok ? 'text-emerald-600 dark:text-[#57D193]' : 'text-red-500'} title={r?.error || ''}>
                              {r?.ok ? t('saasIncrease.push.status.pushed') : t('saasIncrease.push.status.push_failed')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={() => setPushModal(null)} className={btnSecondary}>{t('common.close')}</button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Email preview modal — srcDoc renders the exact HTML /send would email, read-only */}
      {emailPreview && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black bg-opacity-60 p-4" onClick={() => setEmailPreview(null)}>
          <div className={`flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg shadow-xl ${card}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-[#1B1B1B]">
              <p className={`font-semibold ${textPri}`}>{t('saasIncrease.notify.previewTitle')}</p>
              <button onClick={() => setEmailPreview(null)} className={`${textSec} transition hover:text-red-500`}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative flex-1 overflow-y-auto bg-[#eef1f6]">
              {emailPreview.loading ? (
                <div className="flex h-full items-center justify-center">
                  <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : (
                <iframe srcDoc={emailPreview.html} className="h-full w-full border-0" title="Email preview" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Template manager modal — an editable library of merchant-notification email templates,
          so different wording can be applied per plan/org group instead of one hardcoded copy. */}
      {templateManagerOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black bg-opacity-60 p-4" onClick={() => { setTemplateManagerOpen(false); setExpandedTemplateId(null); }}>
          <div className={`flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg shadow-xl ${card}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-[#1B1B1B]">
              <div>
                <p className={`font-semibold ${textPri}`}>{t('saasIncrease.templates.title')}</p>
                <p className={`mt-0.5 text-xs ${textTer}`}>{t('saasIncrease.templates.subtitle')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={startNewTemplate} className={btnSecondary}><Plus className="h-4 w-4" /> {t('saasIncrease.templates.new')}</button>
                <button onClick={() => { setTemplateManagerOpen(false); setExpandedTemplateId(null); }} className={`${textSec} transition hover:text-red-500`}>
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className={`flex-1 divide-y overflow-y-auto ${divider}`}>
              {expandedTemplateId === 'new' && (
                <div className="space-y-2 px-5 py-4">
                  <p className={`text-sm font-medium ${textPri}`}>{t('saasIncrease.templates.new')}</p>
                  <input
                    value={templateDraft.name} onChange={(e) => setTemplateDraft(d => ({ ...d, name: e.target.value }))}
                    placeholder={t('saasIncrease.templates.namePlaceholder') as string}
                    className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`}
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className={`text-xs font-semibold uppercase tracking-wide ${textQuat}`}>English</p>
                      <input value={templateDraft.subjectEn} onChange={(e) => setTemplateDraft(d => ({ ...d, subjectEn: e.target.value }))} placeholder={t('saasIncrease.notify.subject') as string} className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`} />
                      <textarea value={templateDraft.bodyEn} onChange={(e) => setTemplateDraft(d => ({ ...d, bodyEn: e.target.value }))} rows={6} placeholder={t('saasIncrease.notify.body') as string} className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`} />
                    </div>
                    <div className="space-y-2">
                      <p className={`text-xs font-semibold uppercase tracking-wide ${textQuat}`}>Français</p>
                      <input value={templateDraft.subjectFr} onChange={(e) => setTemplateDraft(d => ({ ...d, subjectFr: e.target.value }))} placeholder={t('saasIncrease.notify.subject') as string} className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`} />
                      <textarea value={templateDraft.bodyFr} onChange={(e) => setTemplateDraft(d => ({ ...d, bodyFr: e.target.value }))} rows={6} placeholder={t('saasIncrease.notify.body') as string} className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`} />
                    </div>
                  </div>
                  <p className={`text-[11px] ${textQuat}`}>{t('saasIncrease.templates.placeholderHint', PLACEHOLDER_HINT_VARS)}</p>
                  <div className="flex gap-2">
                    <button onClick={saveTemplate} disabled={savingTemplate} className={btnPrimary}>{savingTemplate ? t('saasIncrease.saving') : t('saasIncrease.templates.save')}</button>
                    <button onClick={() => setExpandedTemplateId(null)} className={btnSecondary}>{t('saasIncrease.templates.cancel')}</button>
                  </div>
                </div>
              )}
              {templates.map(tpl => {
                const expanded = expandedTemplateId === tpl.id;
                return (
                  <div key={tpl.id} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => (expanded ? setExpandedTemplateId(null) : startEditTemplate(tpl))} className="flex flex-1 items-center justify-between gap-3 text-left">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${textPri}`}>{tpl.name}</span>
                          {tpl.isDefault && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{t('saasIncrease.templates.default')}</span>}
                        </div>
                        <ChevronDown className={`h-4 w-4 ${textQuat} transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                      <button type="button" onClick={() => deleteTemplate(tpl.id)} title={t('saasIncrease.templates.delete') as string} className="shrink-0 text-gray-400 hover:text-red-500 dark:hover:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {expanded && (
                      <div className="mt-3 space-y-2">
                        <input
                          value={templateDraft.name} onChange={(e) => setTemplateDraft(d => ({ ...d, name: e.target.value }))}
                          className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`}
                        />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <p className={`text-xs font-semibold uppercase tracking-wide ${textQuat}`}>English</p>
                            <input value={templateDraft.subjectEn} onChange={(e) => setTemplateDraft(d => ({ ...d, subjectEn: e.target.value }))} className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`} />
                            <textarea value={templateDraft.bodyEn} onChange={(e) => setTemplateDraft(d => ({ ...d, bodyEn: e.target.value }))} rows={6} className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`} />
                          </div>
                          <div className="space-y-2">
                            <p className={`text-xs font-semibold uppercase tracking-wide ${textQuat}`}>Français</p>
                            <input value={templateDraft.subjectFr} onChange={(e) => setTemplateDraft(d => ({ ...d, subjectFr: e.target.value }))} className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`} />
                            <textarea value={templateDraft.bodyFr} onChange={(e) => setTemplateDraft(d => ({ ...d, bodyFr: e.target.value }))} rows={6} className={`w-full ${chipInput} px-3 py-2 text-sm focus:border-primary focus:outline-none`} />
                          </div>
                        </div>
                        <p className={`text-[11px] ${textQuat}`}>{t('saasIncrease.templates.placeholderHint', PLACEHOLDER_HINT_VARS)}</p>
                        <div className="flex gap-2">
                          <button onClick={saveTemplate} disabled={savingTemplate} className={btnPrimary}>{savingTemplate ? t('saasIncrease.saving') : t('saasIncrease.templates.save')}</button>
                          <button onClick={() => setExpandedTemplateId(null)} className={btnSecondary}>{t('saasIncrease.templates.cancel')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {templates.length === 0 && expandedTemplateId !== 'new' && (
                <div className={`px-5 py-8 text-center text-sm ${textTer}`}>{t('saasIncrease.templates.none')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Model calibration modal — shows the churn-risk heuristic's observed rates from real
          history (see runSaasChurnHistoryBackfill), so the risk badges above are legible rather
          than a black box: David can see exactly how much real data backs each bucket. */}
      {calibrationOpen && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black bg-opacity-60 p-4" onClick={() => setCalibrationOpen(false)}>
          <div className={`flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg shadow-xl ${card}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-[#1B1B1B]">
              <div>
                <p className={`font-semibold ${textPri}`}>{t('saasIncrease.calibration.title')}</p>
                <p className={`mt-0.5 text-xs ${textTer}`}>{t('saasIncrease.calibration.subtitle')}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={refreshCalibrationData} disabled={refreshingCalibration} className={`${btnSecondary} px-3 py-1.5 text-xs`}>
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshingCalibration ? 'animate-spin' : ''}`} />
                  {refreshingCalibration ? t('saasIncrease.calibration.refreshing') : t('saasIncrease.calibration.refresh')}
                </button>
                <button onClick={() => setCalibrationOpen(false)} className={`${textSec} transition hover:text-red-500`}>
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {!calibration ? (
                <p className={`text-sm ${textTer}`}>{t('saasIncrease.calibration.loading')}</p>
              ) : (
                <>
                  <p className={`mb-3 text-xs ${textQuat}`}>
                    {t('saasIncrease.calibration.computedAt', { date: new Date(calibration.computedAt).toLocaleString() })}
                    {' · '}{t('saasIncrease.calibration.minSample', { n: calibration.minSample })}
                  </p>
                  <div className={`mb-4 rounded-lg border p-3 ${chipInput}`}>
                    <div className={`text-xs font-semibold uppercase tracking-wide ${textQuat}`}>{t('saasIncrease.calibration.baseline')}</div>
                    <div className={`mt-1 text-sm ${textPri}`}>
                      {calibration.baseline.observedRate != null ? `${(calibration.baseline.observedRate * 100).toFixed(1)}%` : '—'}
                      <span className={`ml-2 text-xs ${textTer}`}>
                        {t('saasIncrease.calibration.sampleSize', { n: calibration.baseline.n })}
                        {calibration.baseline.insufficientData && ` · ${t('saasIncrease.calibration.insufficientData')}`}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className={textTer}>
                          <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wide">{t('saasIncrease.calibration.colSize')}</th>
                          <th className="pb-2 pr-3 text-xs font-semibold uppercase tracking-wide">{t('saasIncrease.calibration.colTenure')}</th>
                          <th className="pb-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide">{t('saasIncrease.calibration.colRate')}</th>
                          <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide">{t('saasIncrease.calibration.colSample')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calibration.buckets.map(b => (
                          <tr key={`${b.sizeBucket}|${b.tenureBucket}`} className={`border-t ${divider}`}>
                            <td className={`py-2 pr-3 ${textSec}`}>{b.sizeBucket}%</td>
                            <td className={`py-2 pr-3 ${textSec}`}>{b.tenureBucket} {t('saasIncrease.calibration.months')}</td>
                            <td className={`py-2 pr-3 text-right font-medium ${textPri}`}>{b.observedRate != null ? `${(b.observedRate * 100).toFixed(1)}%` : '—'}</td>
                            <td className={`py-2 text-right text-xs ${b.insufficientData ? 'text-amber-600 dark:text-amber-400' : textTer}`}>
                              {b.n} {b.insufficientData && `· ${t('saasIncrease.calibration.insufficientData')}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {calibration.buckets.length === 0 && (
                      <p className={`py-6 text-center text-sm ${textTer}`}>{t('saasIncrease.calibration.none')}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SaasIncrease;
