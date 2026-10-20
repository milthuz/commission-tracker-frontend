// Module Finance (CFO) — point d'entrée de /finance/* : charge le budget consolidé UNE fois pour les
// pages de la phase 1, puis les sous-routes. Les écrans des phases suivantes (budgets d'entité,
// KPI, prévisions, gestionnaires) chargent chacun leurs propres données via leur API ; le serveur
// décide de ce que l'usager peut voir et modifier.
import { useCallback, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ContentLoader } from '../../common/Loader';
import { InlineError, StateCard } from '../../components/ui';
import { ApiError, financeApi, type BudgetPayload } from './api';
import { FinanceProvider, useFinance } from './FinanceContext';
import MasterBudget from './MasterBudget';
import { CogsDrivers, RevenueDrivers } from './DriverPages';
import Payroll from './Payroll';
import Opex from './Opex';
import { ClusterBudget, XperioBudget, DepartmentalBudgets } from './EntityBudgets';
import KpiPage from './Kpi';
import { FORECAST_ROUTES } from './Forecasts';
import { DeferredRevenue, TerminalAmortization, BooksAccounts } from './Managers';
import { ProgressPage } from './Progress';
import { GuidePage } from './Guide';

export default function Finance() {
  const { t } = useTranslation();
  const [payload, setPayload] = useState<BudgetPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await financeApi.load(2027);
      setError(null);
      setPayload(p);
      return p;
    } catch (e) {
      const code = e instanceof ApiError ? (e.status === 403 ? (e.body?.demo ? 'demo' : 'forbidden') : e.body?.error || `http_${e.status}`) : 'network';
      setError(code);
      return null;
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error === 'forbidden' || error === 'demo') return <StateCard kind="empty" title={t(`finance.errors.${error}`)} />;
  if (error && !payload) return <InlineError title={t('finance.errors.load')} detail={error} onRetry={load} retryLabel={t('finance.retry')} />;
  if (!payload) return <ContentLoader label={t('finance.loading')} />;
  if (payload.empty) return <StateCard kind="empty" title={t('finance.errors.empty')} />;

  return (
    <FinanceProvider payload={payload} onReload={load}>
      <div className="mx-auto max-w-[1800px]">
        <Routes>
          <Route index element={<MasterBudget />} />
          <Route path="revenue-drivers" element={<RevenueDrivers />} />
          <Route path="cogs-drivers" element={<CogsDrivers />} />
          <Route path="payroll" element={<PayrollGate />} />
          <Route path="opex" element={<Opex />} />
          <Route path="cluster-budget" element={<ClusterBudget />} />
          <Route path="xperio-budget" element={<XperioBudget />} />
          <Route path="departmental-budgets" element={<DepartmentalBudgets />} />
          <Route path="kpi" element={<KpiPage />} />
          {FORECAST_ROUTES.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
          <Route path="deferred-revenue" element={<DeferredRevenue />} />
          <Route path="terminal-amortization" element={<TerminalAmortization />} />
          <Route path="books-accounts" element={<BooksAccounts />} />
          <Route path="progress" element={<ProgressPage />} />
          <Route path="guide" element={<GuidePage />} />
          <Route path="*" element={<MasterBudget />} />
        </Routes>
      </div>
    </FinanceProvider>
  );
}

function PayrollGate() {
  const { t } = useTranslation();
  const { payload } = useFinance();
  return payload.caps.canPayroll ? <Payroll /> : <StateCard kind="empty" title={t('finance.payroll.noAccess')} />;
}
