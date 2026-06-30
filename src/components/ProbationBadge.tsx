import { useTranslation } from 'react-i18next';

type Probation = { inProbation: boolean; endDate: string | null; daysLeft: number | null } | null | undefined;

// Amber "Probation · until DD/MM" pill. Renders nothing unless the rep is currently in probation.
export default function ProbationBadge({ probation, className = '' }: { probation?: Probation; className?: string }) {
  const { t, i18n } = useTranslation();
  if (!probation?.inProbation) return null;
  const end = probation.endDate ? new Date(probation.endDate).toLocaleDateString(i18n.language) : '';
  return (
    <span
      title={t('probation.tooltip') as string}
      className={`inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-[#9D5425] dark:text-warning ${className}`}
    >
      ⏳ {t('probation.badge')}{end ? ` · ${t('probation.until', { date: end })}` : ''}
    </span>
  );
}
