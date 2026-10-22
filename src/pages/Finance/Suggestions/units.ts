// Module Finance — lot F : unité d'affichage de chaque driver (comptes, montants, %). Mêmes clés et
// mêmes types que le catalogue du serveur (services/finance/suggestionsCore.js) : le banc
// (scripts/test-finance-suggestions.cjs) vérifie l'égalité. Aucune donnée de la CFO ici.
import type { Unit } from './api';

const COUNT: Unit = 'count', GROWTH: Unit = 'pct_per_month', SHARE: Unit = 'pct', MONEY: Unit = 'money';

export const CATALOG_UNITS: Record<string, Unit> = {
  intAdds: COUNT, resAdds: COUNT, xpAdds: COUNT, canChurn: COUNT, usaChurn: COUNT, xpChurn: COUNT,
  canArpuG: GROWTH, usaArpuG: GROWTH, xpArpuG: GROWTH, residG: GROWTH, contractsG: GROWTH,
  adyenTarget: COUNT, adyenResAdds: COUNT, adyenXpAdds: COUNT, adyenChurn: COUNT, adyenArpuG: GROWTH,
  convPct: SHARE, partnerPayG: GROWTH, xpPartnerG: GROWTH, newClientPct: SHARE,
  hwPerNew: MONEY, existClients: COUNT, hwPerExist: MONEY, xpHw: MONEY, cpHw: MONEY,
  installPrice: MONEY, discount: MONEY, onsite: MONEY, xpService: MONEY, licG: GROWTH,
  supportSw: MONEY, merchantFees: MONEY, platformFees: MONEY, hostingG: GROWTH, resellerSaasG: GROWTH,
  revShare: SHARE, clusterHwPct: SHARE, xperioHwPct: SHARE, halukPct: SHARE, onsites: COUNT,
  jobCost: MONEY, buffer: MONEY, travel: MONEY, svcSw: MONEY, licPct: SHARE,
  // SH-49 : COGS de service en deux blocs.
  implNnPct: SHARE, svcSwNnPct: SHARE, bufferNnPct: SHARE, nnImplSw: MONEY, exImplSw: MONEY, nnAuto: MONEY, exAuto: MONEY,
};
