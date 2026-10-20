// Module Finance, lot A — pages exportées (routes à câbler dans src/pages/Finance/index.tsx) :
//   cluster-budget          → <ClusterBudget />        finance:entity_budgets
//   xperio-budget           → <XperioBudget />         finance:entity_budgets
//   departmental-budgets    → <DepartmentalBudgets />  finance:dept_budgets
// Chaque page charge ses propres données (./api.ts) ; le serveur décide des capacités.
import EntityBudget from './EntityBudget';
import DeptBudgets from './DeptBudgets';

export const ClusterBudget = () => <EntityBudget key="cluster" entity="cluster" />;
export const XperioBudget = () => <EntityBudget key="xperio" entity="xperio" />;
export const DepartmentalBudgets = DeptBudgets;

export default ClusterBudget;
