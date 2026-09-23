import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL, authHeaders, type Manager } from './types';

// Liste des gestionnaires proposés dans « Relève de » (et « Superviseur » de l'entente), avec
// leur titre en français et en anglais. Saisie une fois ici, elle évite de retaper le titre à
// chaque embauche — et deux dossiers ne peuvent plus écrire le même titre de deux façons.

const INPUT =
  'w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';

const ManagersEditor = ({ initial, onClose, onSaved }: {
  initial: Manager[];
  onClose: () => void;
  onSaved: (list: Manager[]) => void;
}) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Manager[]>(initial.length ? initial.map((m) => ({ ...m })) : [{ name: '', titleEn: '', titleFr: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, k: keyof Manager, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/hr/managers`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ managers: rows.filter((r) => r.name.trim()) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'error');
      onSaved(data.managers);
    } catch (e: any) {
      setError(`${t('hr.managers.saveFailed')} ${e?.message || ''}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="mb-5 rounded-sm border border-primary/40 bg-white p-5 shadow-default dark:border-primary/40 dark:bg-boxdark sm:p-6">
      <h3 className="font-semibold text-black dark:text-white">{t('hr.managers.title')}</h3>
      <p className="mb-4 mt-1 text-sm text-bodydark2">{t('hr.managers.hint')}</p>

      <div className="hidden gap-2 px-1 pb-1 text-xs font-medium text-bodydark2 md:grid md:grid-cols-[1fr_1fr_1fr_auto]">
        <span>{t('hr.managers.name')}</span><span>{t('hr.managers.titleFr')}</span><span>{t('hr.managers.titleEn')}</span><span className="w-8" />
      </div>
      <div className="space-y-3 md:space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 rounded border border-stroke p-3 dark:border-strokedark md:grid-cols-[1fr_1fr_1fr_auto] md:border-0 md:p-0">
            <input className={INPUT} value={r.name} onChange={(e) => set(i, 'name', e.target.value)} placeholder={t('hr.managers.name') as string} />
            <input className={INPUT + (r.name && !r.titleFr ? ' !border-warning' : '')} value={r.titleFr} onChange={(e) => set(i, 'titleFr', e.target.value)} placeholder={t('hr.managers.titleFrPh') as string} />
            <input className={INPUT + (r.name && !r.titleEn ? ' !border-warning' : '')} value={r.titleEn} onChange={(e) => set(i, 'titleEn', e.target.value)} placeholder={t('hr.managers.titleEnPh') as string} />
            <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
              className="justify-self-end rounded px-2 py-1 text-bodydark2 hover:text-danger" aria-label={t('common.remove') as string}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setRows((x) => [...x, { name: '', titleEn: '', titleFr: '' }])}
        className="mt-3 text-sm font-medium text-primary hover:underline">+ {t('hr.managers.add')}</button>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
          {t('common.cancel')}
        </button>
        <button type="button" onClick={save} disabled={saving} className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
};

export default ManagersEditor;
