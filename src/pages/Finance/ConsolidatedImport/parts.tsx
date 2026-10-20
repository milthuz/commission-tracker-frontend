// Import Excel du budget consolidé — briques communes aux deux fenêtres.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui';
import { TABLE_WRAP } from '../../../components/ui/surface';
import type { Msg } from './api';
import type { FlowError } from './useImportFlow';

export const TH_S = 'whitespace-nowrap border-b border-stroke px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:border-strokedark dark:text-bodydark2';
export const TD_S = 'border-b border-stroke/60 px-2.5 py-1 align-top tabular-nums dark:border-strokedark/60';

// Un bloc de l'aperçu, avec son titre.
export function Block({ title, hint, children }: { title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="m-0 text-[13px] font-bold text-black dark:text-white">{title}</h3>
      {hint && <p className="m-0 text-[12px] text-body dark:text-bodydark2">{hint}</p>}
      {children}
    </section>
  );
}

export function Chip({ tone, children }: { tone: 'add' | 'chg' | 'miss' | 'same'; children: React.ReactNode }) {
  const cls = {
    add: 'bg-[rgba(23,178,106,0.12)] text-[#067647] dark:text-[#57D193]',
    chg: 'bg-[rgba(247,144,9,0.14)] text-[#93370D] dark:text-[#FDB022]',
    miss: 'bg-[rgba(240,68,56,0.10)] text-[#B42318] dark:text-[#F46060]',
    same: 'bg-gray-2 text-body dark:bg-meta-4 dark:text-bodydark2',
  }[tone];
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-bold ${cls}`}>{children}</span>;
}

// Erreurs et avertissements de lecture du classeur (une ligne par anomalie, avec feuille et rang).
export function MessageList({ items, tone }: { items: Msg[]; tone: 'err' | 'warn' }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  const MAX = 40;
  return (
    <div>
      <ul className={`m-0 list-disc space-y-0.5 rounded-lg border px-6 py-2 text-[12.5px] ${tone === 'err'
        ? 'border-[rgba(240,68,56,0.35)] bg-[rgba(240,68,56,0.06)] text-[#B42318] dark:text-[#F46060]'
        : 'border-[rgba(247,144,9,0.35)] bg-[rgba(247,144,9,0.06)] text-[#93370D] dark:text-[#FDB022]'}`}>
        {items.slice(0, MAX).map((m, i) => (
          <li key={i}>
            {m.row > 0 && <span className="font-bold">{t('finance.consolidatedImport.where', { sheet: m.sheet || '', row: m.row })} · </span>}
            {t(`finance.consolidatedImport.msg.${m.code}`, { value: m.value || '', defaultValue: `${m.code}${m.value ? ` (${m.value})` : ''}` })}
          </li>
        ))}
      </ul>
      {items.length > MAX && <p className="mb-0 mt-1 text-[12px] text-body dark:text-bodydark2">{t('finance.consolidatedImport.moreMessages', { n: items.length - MAX })}</p>}
    </div>
  );
}

// Choix du fichier + modèle + erreur du serveur.
export function FileStep({ intro, input, onPick, reading, error, onTemplate, templateLabel }: {
  intro: React.ReactNode;
  input: React.RefObject<HTMLInputElement>;
  onPick: (f: File | undefined) => void;
  reading: boolean;
  error: FlowError | null;
  onTemplate: () => void;
  templateLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <p className="m-0 text-body dark:text-bodydark2">{intro}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[260px] flex-1">
          <span className="mb-1 block text-[12px] font-bold">{t('finance.consolidatedImport.file')}</span>
          <input ref={input} type="file" accept=".xlsx" onChange={(e) => onPick(e.target.files?.[0])}
            className="block w-full text-[13px] file:mr-3 file:rounded-md file:border file:border-stroke file:bg-white file:px-3 file:py-1.5 file:font-bold dark:file:border-strokedark dark:file:bg-boxdark dark:file:text-white" />
        </label>
        <Button size="sm" onClick={onTemplate}>{templateLabel}</Button>
      </div>
      {reading && <p role="status" className="m-0 text-body dark:text-bodydark2">{t('finance.consolidatedImport.reading')}</p>}
      {error && (
        <div role="alert" className="space-y-2">
          <p className="m-0 font-bold text-[#B42318] dark:text-[#F46060]">
            {t(`finance.consolidatedImport.error.${error.code}`, { defaultValue: t('finance.consolidatedImport.error.generic', { code: error.code }) })}
          </p>
          <MessageList items={error.items} tone="err" />
          <MessageList items={error.warnings} tone="warn" />
        </div>
      )}
    </div>
  );
}

export const SimpleTable = ({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) => (
  <div className={`${TABLE_WRAP} max-h-[300px] overflow-y-auto`}>
    <table className="w-full border-collapse text-[12.5px]">
      <thead className="sticky top-0 bg-white dark:bg-boxdark">
        <tr>{head.map((h, i) => <th key={i} className={`${TH_S} ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);
