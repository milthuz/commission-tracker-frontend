// Module Finance — lignes des pages Drivers de revenus et Drivers de COGS, dans l'ordre du
// prototype (design/finance, `drvTop` / `drvBot` / `cogsTop` / `cogsBot`). Le libellé est une clé
// i18n `finance.rows.<l>` ; `key` est la série calculée par model.ts (ou l'input du driver).
import type { Fmt } from './format';

export interface RowDef {
  key: string;
  /** i18n label id under finance.rows. */
  l: string;
  fmt: Fmt;
  kind?: 'line' | 'sub' | 'grand' | 'pct';
  /** Editable driver input (yellow cells). */
  inp?: boolean;
  /** Total 2027 column: 'first' = January (opening balance), 'last' = December (ending balance). */
  fy27?: 'first' | 'last' | 'hwPct';
  /** Read-only payroll line: links to the Salary & Contractors page. */
  payroll?: boolean;
}
export type RowSpec = RowDef | { sec: string };

export const isSec = (r: RowSpec): r is { sec: string } => 'sec' in r;

// Haut de la page des revenus : alimente le Budget maître. Un clic mène au calcul de la ligne.
export const DRV_TOP: RowSpec[] = [
  { sec: 'recurringRevenue' },
  { key: 'totalSub', l: 'subscriptionRevenue', fmt: '$' },
  { key: 'totalPP', l: 'paymentProcessing', fmt: 's' },
  { key: 'resid', l: 'partnerResiduals', fmt: 's' },
  { key: 'recurring', l: 'totalRecurring', fmt: '$', kind: 'sub' },
  { sec: 'transactionRevenue' },
  { key: 'totalHW', l: 'hardwareSales', fmt: '$' },
  { key: 'totalSvc', l: 'serviceFees', fmt: 's' },
  { key: 'lic', l: 'licenceOther', fmt: 's' },
  { key: 'transaction', l: 'totalTransaction', fmt: '$', kind: 'sub' },
  { key: 'total', l: 'totalRevenue', fmt: '$', kind: 'grand' },
];

export const DRV_BOT: RowSpec[] = [
  { sec: 'posDrivers' },
  { key: 'canBeg', l: 'canBeg', fmt: 'n', fy27: 'first' },
  { key: 'intAdds', l: 'intAdds', fmt: 'n', inp: true },
  { key: 'resAdds', l: 'resAdds', fmt: 'n', inp: true },
  { key: 'xpAdds', l: 'xpAdds', fmt: 'n', inp: true },
  { key: 'canChurn', l: 'churned', fmt: 'n', inp: true },
  { key: 'canEnd', l: 'canEnd', fmt: 'n', kind: 'sub', fy27: 'last' },
  { key: 'usaBeg', l: 'usaBeg', fmt: 'n', fy27: 'first' },
  { key: 'usaChurn', l: 'churned', fmt: 'n', inp: true },
  { key: 'usaEnd', l: 'usaEnd', fmt: 'n', kind: 'sub', fy27: 'last' },
  { key: 'xpBeg', l: 'xpBeg', fmt: 'n', fy27: 'first' },
  { key: 'xpChurn', l: 'churned', fmt: 'n', inp: true },
  { key: 'xpEnd', l: 'xpEnd', fmt: 'n', kind: 'sub', fy27: 'last' },
  { key: 'totEnd', l: 'totEnd', fmt: 'n', kind: 'sub', fy27: 'last' },
  { key: 'newAdds', l: 'newAdds', fmt: 'n' },
  { key: 'netRoof', l: 'netRoof', fmt: 'n' },
  { key: 'canArpu', l: 'canArpu', fmt: '$2' },
  { key: 'canArpuG', l: 'arpuGrowth', fmt: '%', inp: true },
  { key: 'usaArpu', l: 'usaArpu', fmt: '$2' },
  { key: 'usaArpuG', l: 'arpuGrowth', fmt: '%', inp: true },
  { key: 'xpArpu', l: 'xpArpu', fmt: '$2' },
  { key: 'xpArpuG', l: 'arpuGrowth', fmt: '%', inp: true },
  { sec: 'posSubscription' },
  { key: 'canSub', l: 'canSub', fmt: '$' },
  { key: 'usaSub', l: 'usaSub', fmt: 's' },
  { key: 'xpSub', l: 'xpSub', fmt: 's' },
  { key: 'contracts', l: 'contracts', fmt: 's' },
  { key: 'contractsG', l: 'contractsG', fmt: '%', inp: true },
  { key: 'totalSub', l: 'totalSub', fmt: '$', kind: 'sub' },
  { key: 'resid', l: 'partnerResiduals', fmt: 's' },
  { key: 'residG', l: 'residG', fmt: '%', inp: true },
  { sec: 'paymentsDrivers' },
  { key: 'adyenBeg', l: 'adyenBeg', fmt: 'n', fy27: 'first' },
  { key: 'convPct', l: 'convPct', fmt: '%', inp: true },
  { key: 'adyenNetNew', l: 'adyenNetNew', fmt: 'n' },
  { key: 'adyenExist', l: 'adyenExist', fmt: 'n' },
  { key: 'adyenResAdds', l: 'resAdds', fmt: 'n', inp: true },
  { key: 'adyenXpAdds', l: 'xpAdds', fmt: 'n', inp: true },
  { key: 'adyenChurn', l: 'churned', fmt: 'n', inp: true },
  { key: 'adyenEnd', l: 'adyenEnd', fmt: 'n', kind: 'sub', fy27: 'last' },
  { key: 'adyenTarget', l: 'adyenTarget', fmt: 'n', inp: true },
  { key: 'adyenArpu', l: 'adyenArpu', fmt: '$2' },
  { key: 'adyenArpuG', l: 'arpuGrowth', fmt: '%', inp: true },
  { key: 'conv', l: 'conv', fmt: 'n', fy27: 'last' },
  { sec: 'paymentsRevenue' },
  { key: 'clusterPP', l: 'clusterPP', fmt: '$' },
  { key: 'partnerPay', l: 'partnerPayFull', fmt: 's' },
  { key: 'partnerPayG', l: 'partnerPayG', fmt: '%', inp: true },
  { key: 'xpPartner', l: 'xpPartnerFull', fmt: 's' },
  { key: 'xpPartnerG', l: 'xpPartnerG', fmt: '%', inp: true },
  { key: 'totalPP', l: 'totalPP', fmt: '$', kind: 'sub' },
  { key: 'convRev', l: 'convRev', fmt: 's' },
  { sec: 'hardware' },
  { key: 'newClientPct', l: 'newClientPct', fmt: '%', inp: true },
  { key: 'newCl', l: 'newCl', fmt: 'n' },
  { key: 'hwPerNew', l: 'hwPerNew', fmt: 'n', inp: true },
  { key: 'newHW', l: 'newHW', fmt: '$' },
  { key: 'existClients', l: 'existClients', fmt: 'n', inp: true },
  { key: 'hwPerExist', l: 'hwPerExist', fmt: 'n', inp: true },
  { key: 'existHW', l: 'existHW', fmt: 's' },
  { key: 'xpHw', l: 'xpHw', fmt: 's', inp: true },
  { key: 'cpHw', l: 'cpHw', fmt: 's', inp: true },
  { key: 'totalHW', l: 'totalHW', fmt: '$', kind: 'sub' },
  { sec: 'service' },
  { key: 'newCl2', l: 'newCl', fmt: 'n' },
  { key: 'installPrice', l: 'installPrice', fmt: 'n', inp: true },
  { key: 'discount', l: 'discount', fmt: 'n', inp: true },
  { key: 'install', l: 'install', fmt: '$' },
  { key: 'onsite', l: 'onsite', fmt: 's', inp: true },
  { key: 'xpService', l: 'xpService', fmt: 's', inp: true },
  { key: 'totalSvc', l: 'totalSvc', fmt: '$', kind: 'sub' },
  { sec: 'licence' },
  { key: 'lic', l: 'licenceOther', fmt: 's' },
  { key: 'licG', l: 'licG', fmt: '%', inp: true },
];

export const COGS_TOP: RowSpec[] = [
  { key: 'recCogs', l: 'recCogs', fmt: '$', kind: 'sub' },
  { key: 'supportWages', l: 'supportWages', fmt: 's', payroll: true },
  { key: 'supportContr', l: 'supportContr', fmt: 's', payroll: true },
  { key: 'supportSw', l: 'supportSw', fmt: 's' },
  { key: 'merchantFees', l: 'merchantFees', fmt: 's' },
  { key: 'platformFees', l: 'platformFees', fmt: 's' },
  // Ordre de la CFO (SH-48) : l'hébergement avant les versements récurrents.
  { key: 'hosting', l: 'hosting', fmt: 's' },
  { key: 'payout', l: 'payout', fmt: 's' },
  { key: 'hwCogs', l: 'hwCogs', fmt: '$', kind: 'sub' },
  { key: 'svcCogs', l: 'svcCogs', fmt: '$', kind: 'sub' },
  { key: 'nnWages', l: 'nnWages', fmt: 's', payroll: true },
  { key: 'exWages', l: 'exWages', fmt: 's', payroll: true },
  { key: 'svcContr', l: 'svcContr', fmt: 's' },
  { key: 'travel', l: 'svcTravel', fmt: 's' },
  { key: 'svcSw', l: 'svcSw', fmt: 's' },
  { key: 'licCogs', l: 'licCogs', fmt: '$', kind: 'sub' },
  { key: 'totCogs', l: 'totCogs', fmt: '$', kind: 'grand' },
];

export const COGS_BOT: RowSpec[] = [
  { sec: 'recurringCogsDrivers' },
  { key: 'supportWages', l: 'supportWages', fmt: 's', payroll: true },
  { key: 'supportContr', l: 'supportContr', fmt: 's', payroll: true },
  { key: 'supportSw', l: 'supportSw', fmt: 's', inp: true },
  { key: 'merchantFees', l: 'merchantFees', fmt: 's', inp: true },
  { key: 'platformFees', l: 'platformFees', fmt: 's', inp: true },
  { key: 'hosting', l: 'hosting', fmt: 's' },
  { key: 'hostingG', l: 'hostingG', fmt: '%', inp: true },
  { key: 'resellerSaas', l: 'resellerSaas', fmt: '$' },
  { key: 'resellerSaasG', l: 'resellerSaasG', fmt: '%', inp: true },
  { key: 'revShare', l: 'revShare', fmt: '%', inp: true },
  { key: 'payout', l: 'payoutGl', fmt: '$', kind: 'sub' },
  { sec: 'hardwareCogsDrivers' },
  { key: 'clHwRev', l: 'clHwRev', fmt: '$' },
  { key: 'clusterHwPct', l: 'clusterHwPct', fmt: '%', inp: true },
  { key: 'clHwCogs', l: 'clHwCogs', fmt: '$' },
  { key: 'xpHw2', l: 'xpHwRev', fmt: '$' },
  { key: 'xperioHwPct', l: 'xperioHwPct', fmt: '%', inp: true },
  { key: 'xpHwCogs', l: 'xpHwCogs', fmt: '$' },
  { key: 'hwCogs', l: 'totalHwCogs', fmt: '$', kind: 'sub' },
  { key: 'hwCogsPct', l: 'hwCogsPct', fmt: '%', kind: 'pct', fy27: 'hwPct' },
  { sec: 'serviceCogsDrivers' },
  { key: 'nnWages', l: 'nnWages', fmt: 's', payroll: true },
  { key: 'exWages', l: 'exWages', fmt: 's', payroll: true },
  { key: 'halukPct', l: 'halukPct', fmt: '%', inp: true },
  { key: 'halukJobs', l: 'halukJobs', fmt: 'n' },
  { key: 'onsites', l: 'onsites', fmt: 'n', inp: true },
  { key: 'jobCost', l: 'jobCost', fmt: 'n', inp: true },
  { key: 'jobsCost', l: 'jobsCost', fmt: '$' },
  { key: 'buffer', l: 'buffer', fmt: '$', inp: true },
  { key: 'svcContr', l: 'svcContr', fmt: '$', kind: 'sub' },
  { key: 'travel', l: 'svcTravel', fmt: 's', inp: true },
  { key: 'svcSw', l: 'svcSw', fmt: 's', inp: true },
  { sec: 'licenceCogsDrivers' },
  { key: 'lic2', l: 'licRevenue', fmt: '$' },
  { key: 'licPct', l: 'licPct', fmt: '%', inp: true },
  { key: 'licCogs', l: 'totalLicCogs', fmt: '$', kind: 'sub' },
];

// Lien du haut de page → ligne de calcul (prototype : JUMP).
export const JUMP: Record<string, string> = { recurring: 'totalSub', transaction: 'totalHW', total: 'canBeg', recCogs: 'supportWages', svcCogs: 'svcContr', totCogs: 'supportWages' };
export const COGS_KEYS = new Set([...COGS_TOP, ...COGS_BOT].filter((r) => !isSec(r)).map((r) => (r as RowDef).key));
