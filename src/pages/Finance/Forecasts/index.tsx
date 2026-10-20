// Module Finance — lot C : Prévision des ventes · BvA, Prévision des paiements, Trésorerie Holdco,
// Investissement en ressources (V2 | Paiements). Pages rendues DANS le FinanceProvider de
// src/pages/Finance/index.tsx (useFinance() : format, navigation, modèle de drivers FY2027).
//
// Les traductions (i18n/forecasts.json) sont ajoutées au dictionnaire ici, sans écraser une clé
// déjà fusionnée dans en.json / fr.json.
import i18n from 'i18next';
import strings from '../i18n/forecasts.json';
import SalesForecast from './SalesForecast';
import PaymentsForecast from './PaymentsForecast';
import HoldcoCash from './HoldcoCash';
import ResourceInvestment from './ResourceInvestment';

for (const lng of ['en', 'fr'] as const) i18n.addResourceBundle(lng, 'translation', (strings as Record<string, object>)[lng], true, false);

export const InvestmentV2 = () => <ResourceInvestment program="v2" />;
export const InvestmentPayments = () => <ResourceInvestment program="payments" />;
export { SalesForecast, PaymentsForecast, HoldcoCash, ResourceInvestment };

/** Sous-routes de /finance/* (chemin relatif, page, permission de lecture côté serveur). */
export const FORECAST_ROUTES = [
  { path: 'sales-forecast', element: <SalesForecast />, perm: 'finance:forecasts' },
  { path: 'payments-forecast', element: <PaymentsForecast />, perm: 'finance:forecasts' },
  { path: 'holdco-cash', element: <HoldcoCash />, perm: 'finance:cash' },
  { path: 'investment/v2', element: <InvestmentV2 />, perm: 'finance:investment' },
  { path: 'investment/payments', element: <InvestmentPayments />, perm: 'finance:investment' },
];

export default FORECAST_ROUTES;
