// Module Finance — état partagé des cinq pages : le budget chargé UNE fois, les ajustements de la
// CFO, l'effectif, le calcul (model.ts) et l'enregistrement automatique.
//
// Enregistrement : chaque frappe recalcule tout de suite ; l'envoi au serveur part après une
// courte pause, section par section, avec la version lue (concurrence optimiste). Si quelqu'un a
// enregistré entre-temps (409) ou si le budget vient d'être approuvé (verrou), on recharge plutôt
// que d'écraser son travail.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError, financeApi, type BudgetPayload, type Section } from './api';
import {
  computeAll, computePayroll, payCodesOf,
  type Contractor, type DriverState, type Employee, type OpexState, type PayrollGlobals, type Roster, type Trip,
} from './model';
import { makeFormat } from './format';

const SAVE_DELAY = 700;
type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
type PersonKind = 'employee' | 'contractor';

interface Ctx {
  payload: BudgetPayload;
  drivers: DriverState;
  opex: OpexState;
  trips: Trip[] | null;
  globals: PayrollGlobals;
  roster: Roster | null;
  opexYear: 0 | 1 | 2;
  setOpexYear: (y: 0 | 1 | 2) => void;
  result: ReturnType<typeof computeAll>;
  payrollCalc: ReturnType<typeof computePayroll> | null;
  locked: boolean;
  canEdit: boolean;
  canEditPayroll: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  notice: string | null;
  // drivers
  setDriver: (key: string, month: number, value: number) => void;
  fillDriver: (key: string) => void;
  /** Remplace d'un coup les 12 mois d'un driver (suggestion ou brouillon IA acceptés). */
  applyDriverValues: (key: string, values: number[]) => void;
  resetDrivers: () => void;
  // opex
  setOpexCell: (key: string, month: number, value: number) => void;
  fillOpex: (key: string, value: number) => void;
  setOpexGrowth: (key: string, g: number | null) => void;
  resetOpex: () => void;
  setTrips: (trips: Trip[] | null) => void;
  // paie
  setGlobals: (g: Partial<PayrollGlobals>) => void;
  patchPerson: (kind: PersonKind, id: number, patch: Partial<Employee & Contractor>) => void;
  addPerson: (kind: PersonKind, body: Partial<Employee & Contractor>) => Promise<boolean>;
  removePerson: (kind: PersonKind, id: number) => Promise<boolean>;
  resetPayroll: () => Promise<void>;
  // statut
  approve: () => Promise<void>;
  unlock: () => Promise<void>;
  reload: () => Promise<void>;
  // navigation entre pages avec surlignage de la ligne source
  /** Navigue vers une page ; `focus` = ligne à surligner, `month` (0..11) = colonne à surligner. */
  goTo: (path: string, focus?: string | null, month?: number | null) => void;
  fmt: ReturnType<typeof makeFormat>;
}

const FinanceCtx = createContext<Ctx | null>(null);
export const useFinance = () => {
  const c = useContext(FinanceCtx);
  if (!c) throw new Error('useFinance hors de FinanceProvider');
  return c;
};

const errCode = (e: unknown) => (e instanceof ApiError ? e.body?.error || `http_${e.status}` : 'network');

export function FinanceProvider({ payload: initial, onReload, children }: { payload: BudgetPayload; onReload: () => Promise<BudgetPayload | null>; children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fmt = useMemo(() => makeFormat(i18n.language), [i18n.language]);

  const [payload, setPayload] = useState(initial);
  const fromPayload = (p: BudgetPayload) => ({
    drivers: { drv: { ...(p.state.drivers?.data?.drv || {}) } } as DriverState,
    opex: { opx: { ...(p.state.opex?.data?.opx || {}) }, opxG: { ...(p.state.opex?.data?.opxG || {}) } } as OpexState,
    trips: (p.state.trips?.data?.trips ?? null) as Trip[] | null,
    globals: { ...p.payrollGlobals },
    roster: p.roster ? { employees: [...p.roster.employees], contractors: [...p.roster.contractors] } : null,
    versions: Object.fromEntries((['drivers', 'opex', 'trips', 'payroll'] as Section[]).map((s) => [s, p.state[s]?.version || 0])) as Record<Section, number>,
  });
  const init = fromPayload(initial);
  const [drivers, setDrivers] = useState(init.drivers);
  const [opex, setOpex] = useState(init.opex);
  const [trips, setTripsState] = useState(init.trips);
  const [globals, setGlobalsState] = useState(init.globals);
  const [roster, setRoster] = useState(init.roster);
  const [opexYear, setOpexYear] = useState<0 | 1 | 2>(1);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const versions = useRef(init.versions);
  const pending = useRef<Partial<Record<Section, unknown>>>({});
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);
  const personPending = useRef<Record<string, { kind: PersonKind; id: number; patch: Record<string, unknown> }>>({});
  const personTimer = useRef<number | null>(null);

  const locked = payload.budget.status === 'approved';
  const canEdit = payload.caps.canEdit && !locked;
  const canEditPayroll = canEdit && payload.caps.canPayroll && !!roster;

  const applyPayload = useCallback((p: BudgetPayload) => {
    const s = fromPayload(p);
    setPayload(p);
    setDrivers(s.drivers); setOpex(s.opex); setTripsState(s.trips); setGlobalsState(s.globals); setRoster(s.roster);
    versions.current = s.versions;
    pending.current = {};
    personPending.current = {};
  }, []);

  const reload = useCallback(async () => {
    const p = await onReload();
    if (p && !p.empty) applyPayload(p);
  }, [onReload, applyPayload]);

  // Une réponse « on ne peut pas enregistrer » : verrou ou travail de quelqu'un d'autre → on recharge.
  const handleWriteError = useCallback(async (e: unknown) => {
    const code = errCode(e);
    if (code === 'locked') { setNotice(t('finance.notice.lockedMeanwhile')); await reload(); setSaveStatus('idle'); return; }
    if (code === 'conflict') { setNotice(t('finance.notice.conflict')); await reload(); setSaveStatus('idle'); return; }
    setSaveStatus('error');
    setSaveError(code);
  }, [reload, t]);

  const flush = useCallback(async () => {
    if (inFlight.current) return;
    const entries = Object.entries(pending.current) as [Section, unknown][];
    if (!entries.length) return;
    pending.current = {};
    inFlight.current = true;
    setSaveStatus('saving');
    try {
      for (const [section, data] of entries) {
        const r = await financeApi.saveState(payload.budget.id, section, data, versions.current[section]);
        versions.current[section] = r.version;
      }
      setSaveStatus(Object.keys(pending.current).length ? 'pending' : 'saved');
      setSaveError(null);
    } catch (e) {
      await handleWriteError(e);
    } finally {
      inFlight.current = false;
      if (Object.keys(pending.current).length) timer.current = window.setTimeout(flush, SAVE_DELAY);
    }
  }, [payload.budget.id, handleWriteError]);

  const queue = useCallback((section: Section, data: unknown) => {
    pending.current[section] = data;
    setSaveStatus('pending');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  }, [flush]);

  // Quitter la page avec un envoi en attente : on l'envoie tout de suite.
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); flush(); }, [flush]);
  useEffect(() => {
    const warn = (ev: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || Object.keys(personPending.current).length || inFlight.current) { ev.preventDefault(); ev.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // ---------------------------------------------------------------- drivers
  const defaults = payload.reference.drvDefaults;
  const setDriver = useCallback((key: string, month: number, value: number) => {
    if (!canEdit) return;
    setDrivers((d) => {
      const cur = d.drv[key] ? [...d.drv[key]] : Array(12).fill(defaults[key]);
      cur[month] = value;
      const next = { drv: { ...d.drv, [key]: cur } };
      queue('drivers', next);
      return next;
    });
  }, [canEdit, defaults, queue]);
  const fillDriver = useCallback((key: string) => {
    if (!canEdit) return;
    setDrivers((d) => {
      const jan = d.drv[key] ? d.drv[key][0] : defaults[key];
      const next = { drv: { ...d.drv, [key]: Array(12).fill(jan) } };
      queue('drivers', next);
      return next;
    });
  }, [canEdit, defaults, queue]);
  // Applique d'un coup les 12 valeurs mensuelles d'un driver (suggestion ou brouillon IA acceptés).
  const applyDriverValues = useCallback((key: string, values: number[]) => {
    if (!canEdit || values.length !== 12 || !values.every((v) => Number.isFinite(v))) return;
    setDrivers((d) => {
      const next = { drv: { ...d.drv, [key]: [...values] } };
      queue('drivers', next);
      return next;
    });
  }, [canEdit, queue]);
  const resetDrivers = useCallback(() => { if (!canEdit) return; const next = { drv: {} }; setDrivers(next); queue('drivers', next); }, [canEdit, queue]);

  // ---------------------------------------------------------------- opex
  const setOpexCell = useCallback((key: string, month: number, value: number) => {
    if (!canEdit) return;
    setOpex((o) => { const next = { ...o, opx: { ...o.opx, [key]: { ...(o.opx[key] || {}), [month]: value } } }; queue('opex', next); return next; });
  }, [canEdit, queue]);
  const fillOpex = useCallback((key: string, value: number) => {
    if (!canEdit) return;
    setOpex((o) => { const cells: Record<string, number> = {}; for (let i = 0; i < 12; i++) cells[i] = value; const next = { ...o, opx: { ...o.opx, [key]: cells } }; queue('opex', next); return next; });
  }, [canEdit, queue]);
  const setOpexGrowth = useCallback((key: string, g: number | null) => {
    if (!canEdit) return;
    setOpex((o) => { const opxG = { ...o.opxG }; if (g == null || g === 0) delete opxG[key]; else opxG[key] = g; const next = { ...o, opxG }; queue('opex', next); return next; });
  }, [canEdit, queue]);
  const resetOpex = useCallback(() => {
    if (!canEdit) return;
    const next = { opx: {}, opxG: {} }; setOpex(next); queue('opex', next);
    setTripsState(null); queue('trips', { trips: null });
  }, [canEdit, queue]);
  const setTrips = useCallback((tr: Trip[] | null) => { if (!canEdit) return; setTripsState(tr); queue('trips', { trips: tr }); }, [canEdit, queue]);

  // ---------------------------------------------------------------- paie
  const setGlobals = useCallback((g: Partial<PayrollGlobals>) => {
    if (!canEditPayroll) return;
    setGlobalsState((cur) => { const next = { ...cur, ...g }; queue('payroll', next); return next; });
  }, [canEditPayroll, queue]);

  const flushPeople = useCallback(async () => {
    const items = Object.values(personPending.current);
    personPending.current = {};
    if (!items.length) return;
    setSaveStatus('saving');
    try {
      for (const it of items) {
        if (it.kind === 'employee') await financeApi.editEmployee(payload.budget.id, it.id, it.patch as Partial<Employee>);
        else await financeApi.editContractor(payload.budget.id, it.id, it.patch as Partial<Contractor>);
      }
      setSaveStatus('saved'); setSaveError(null);
    } catch (e) { await handleWriteError(e); }
  }, [payload.budget.id, handleWriteError]);

  const patchPerson = useCallback((kind: PersonKind, id: number, patch: Partial<Employee & Contractor>) => {
    if (!canEditPayroll) return;
    setRoster((r) => {
      if (!r) return r;
      if (kind === 'employee') return { ...r, employees: r.employees.map((e) => (e.id === id ? { ...e, ...patch } as Employee : e)) };
      return { ...r, contractors: r.contractors.map((c) => (c.id === id ? { ...c, ...patch } as Contractor : c)) };
    });
    const k = `${kind}:${id}`;
    personPending.current[k] = { kind, id, patch: { ...(personPending.current[k]?.patch || {}), ...patch } };
    setSaveStatus('pending');
    if (personTimer.current) window.clearTimeout(personTimer.current);
    personTimer.current = window.setTimeout(flushPeople, SAVE_DELAY);
  }, [canEditPayroll, flushPeople]);
  useEffect(() => () => { if (personTimer.current) window.clearTimeout(personTimer.current); flushPeople(); }, [flushPeople]);

  const addPerson = useCallback(async (kind: PersonKind, body: Partial<Employee & Contractor>) => {
    if (!canEditPayroll) return false;
    try {
      if (kind === 'employee') {
        const r = await financeApi.addEmployee(payload.budget.id, body);
        setRoster((ro) => (ro ? { ...ro, employees: [...ro.employees, r.employee] } : ro));
      } else {
        const r = await financeApi.addContractor(payload.budget.id, body);
        setRoster((ro) => (ro ? { ...ro, contractors: [...ro.contractors, r.contractor] } : ro));
      }
      return true;
    } catch (e) { await handleWriteError(e); return false; }
  }, [canEditPayroll, payload.budget.id, handleWriteError]);

  const removePerson = useCallback(async (kind: PersonKind, id: number) => {
    if (!canEditPayroll) return false;
    try {
      delete personPending.current[`${kind}:${id}`];
      if (kind === 'employee') await financeApi.removeEmployee(payload.budget.id, id);
      else await financeApi.removeContractor(payload.budget.id, id);
      setRoster((ro) => (ro ? (kind === 'employee' ? { ...ro, employees: ro.employees.filter((e) => e.id !== id) } : { ...ro, contractors: ro.contractors.filter((c) => c.id !== id) }) : ro));
      return true;
    } catch (e) { await handleWriteError(e); return false; }
  }, [canEditPayroll, payload.budget.id, handleWriteError]);

  const resetPayroll = useCallback(async () => {
    if (!canEditPayroll) return;
    try {
      // Les saisies en attente partent d'abord : la réinitialisation passe après elles.
      await flushPeople();
      delete pending.current.payroll;
      const r = await financeApi.resetPayroll(payload.budget.id);
      setRoster(r.roster); setGlobalsState(r.payrollGlobals); versions.current.payroll = r.version;
    } catch (e) { await handleWriteError(e); }
  }, [canEditPayroll, payload.budget.id, flushPeople, handleWriteError]);

  // ---------------------------------------------------------------- statut
  const approve = useCallback(async () => {
    try {
      if (timer.current) window.clearTimeout(timer.current);
      await flush(); await flushPeople();
      const r = await financeApi.approve(payload.budget.id);
      setPayload((p) => ({ ...p, budget: r.budget }));
    } catch (e) { await handleWriteError(e); }
  }, [payload.budget.id, flush, flushPeople, handleWriteError]);
  const unlock = useCallback(async () => {
    try { const r = await financeApi.unlock(payload.budget.id); setPayload((p) => ({ ...p, budget: r.budget })); }
    catch (e) { await handleWriteError(e); }
  }, [payload.budget.id, handleWriteError]);

  // ---------------------------------------------------------------- calcul
  const payCodes = useMemo(() => payCodesOf(payload.reference), [payload.reference]);
  const payrollCalc = useMemo(() => (roster ? computePayroll(roster, globals, payCodes) : null), [roster, globals, payCodes]);
  const result = useMemo(() => computeAll({
    ref: payload.reference, drivers, opex, trips,
    // Sans `finance:payroll`, les totaux de paie calculés par le serveur.
    payroll: payrollCalc || payload.payroll,
  }, opexYear), [payload.reference, payload.payroll, drivers, opex, trips, payrollCalc, opexYear]);

  const goTo = useCallback((path: string, focus?: string | null, month?: number | null) => {
    navigate(path, { state: { focus: focus || null, month: month ?? null, at: Date.now() } });
  }, [navigate]);

  const value: Ctx = {
    payload, drivers, opex, trips, globals, roster, opexYear, setOpexYear, result, payrollCalc,
    locked, canEdit, canEditPayroll, saveStatus, saveError, notice,
    setDriver, fillDriver, applyDriverValues, resetDrivers, setOpexCell, fillOpex, setOpexGrowth, resetOpex, setTrips,
    setGlobals, patchPerson, addPerson, removePerson, resetPayroll, approve, unlock, reload, goTo, fmt,
  };
  return <FinanceCtx.Provider value={value}>{children}</FinanceCtx.Provider>;
}

// Ligne à surligner et faire défiler, transmise par un lien d'une autre page (goTo).
export function useFocusRow() {
  const location = useLocation();
  const st = (location.state || {}) as { focus?: string | null; month?: number | null; at?: number };
  const focus = st.focus || null;
  const month = typeof st.month === 'number' ? st.month : null;
  useEffect(() => {
    if (!focus) return;
    const h = window.setTimeout(() => {
      const el = document.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - 160;
      window.scrollTo({ top: y, behavior: 'smooth' });
      // La page défile dans le conteneur du gabarit, pas toujours dans la fenêtre.
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // Le tableau défile aussi de côté : amener la colonne du mois cliqué dans la vue.
      if (month != null) el.querySelector(`[data-month="${month}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }, 60);
    return () => window.clearTimeout(h);
  }, [focus, month, st.at]);
  return focus;
}

/** Mois (0..11) à surligner dans la ligne ciblée, transmis par le même lien que `useFocusRow`. */
export function useFocusMonth(): number | null {
  const st = (useLocation().state || {}) as { month?: number | null };
  return typeof st.month === 'number' ? st.month : null;
}
