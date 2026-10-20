// Module Finance — lot H : « Guide du budget ». Route /finance/guide, permission finance:guide.
// Trois volets : questions aux gestionnaires, pistes d'économies (réels), règle des 40 et repères.
// Rendu DANS le FinanceProvider (il lit le modèle FY2027 via useFinance) ; les trois volets
// chargent eux-mêmes leurs données (notes, réels, repères).
import { useTranslation } from 'react-i18next';
import PageTitle from '../../../components/PageTitle';
import { PageHeader, Tabs, useUrlTab } from '../../../components/ui';
import { useFinance } from '../FinanceContext';
import { BenchmarksTab } from './BenchmarksTab';
import { QuestionsTab } from './QuestionsTab';
import { SavingsTab } from './SavingsTab';

const TABS = ['questions', 'savings', 'benchmarks'] as const;

export function GuidePage() {
  const { t } = useTranslation();
  const { payload } = useFinance();
  const [tab, setTab] = useUrlTab<(typeof TABS)[number]>('questions', TABS);
  return (
    <>
      <PageTitle titleKey="finance.guide.title" />
      <PageHeader
        section={`${t('sidebar.sections.finance')} · FY${payload.budget.fiscalYear}`}
        title={t('finance.guide.title')}
        subtitle={t('finance.guide.subtitle')}
      />
      <div className="mb-4">
        <Tabs
          ariaLabel={t('finance.guide.title')}
          tabs={TABS.map((id) => ({ id, label: t(`finance.guide.tabs.${id}`) }))}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'questions' && <QuestionsTab />}
      {tab === 'savings' && <SavingsTab />}
      {tab === 'benchmarks' && <BenchmarksTab />}
    </>
  );
}

export default GuidePage;
