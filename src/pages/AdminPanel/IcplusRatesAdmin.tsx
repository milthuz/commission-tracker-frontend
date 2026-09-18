import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Save, AlertTriangle, Check } from 'lucide-react';
import Select from '../../components/Select';
import { ContentLoader } from '../../common/Loader';

// Tables de taux de référence IC+ — l'écran qui remplace l'édition d'un fichier JS.
//
// ⚠️ LA SAISIE EST EN POURCENTAGE, LE STOCKAGE EN DÉCIMAL. C'est le piège n°1 de cet écran :
// 1,42 % se stocke 0.0142. Personne ne tape « 0,0142 » en lisant une carte de taux, donc on
// saisit ce qu'on lit et la conversion se fait ici, à un seul endroit. Le serveur refuse
// quand même tout taux > 1 — il ne corrige pas, il refuse : diviser par 100 en devinant,
// c'est deviner sur de l'argent.
//
// ⚠️ LA SOURCE EST OBLIGATOIRE. Un taux décide si un frais est « Conforme » ou « SUSPECT »
// sur un document remis à un client. Sans provenance, une ligne contestée remonte à « l'app
// le dit » plutôt qu'à un document. La liste vient du serveur, pas de saisie libre.

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

interface Entry {
  cat: string;
  rate: number;
  weak?: boolean;
  src: string;
  note?: string;
  updated_by?: string;
  updated_at?: string;
}

type Problem = { index: number; cat: string; errors: { field: string; code: string; value?: number }[] };

export default function IcplusRatesAdmin() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState<Record<string, Entry[]>>({});
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string>('');
  const [draft, setDraft] = useState<Entry[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/icplus/rates`, { headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      setTables(d.tables);
      setTableNames(d.tableNames);
      setSources(d.sources);
      const first = active || d.tableNames[0];
      setActive(first);
      setDraft((d.tables[first] || []).map((e: Entry) => ({ ...e })));
      setDirty(false);
    } catch {
      setError(t('icplusRates.loadError') as string);
    } finally {
      setLoading(false);
    }
  }

  function switchTable(name: string) {
    if (dirty && !window.confirm(t('icplusRates.discardChanges') as string)) return;
    setActive(name);
    setDraft((tables[name] || []).map((e) => ({ ...e })));
    setProblems([]);
    setDirty(false);
    setSaved(false);
  }

  const update = (i: number, patch: Partial<Entry>) => {
    setDraft((d) => d.map((e, k) => (k === i ? { ...e, ...patch } : e)));
    setDirty(true);
    setSaved(false);
  };

  const addRow = () => {
    setDraft((d) => [...d, { cat: '', rate: 0, src: '' }]);
    setDirty(true);
  };

  const removeRow = (i: number) => {
    setDraft((d) => d.filter((_, k) => k !== i));
    setDirty(true);
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    setProblems([]);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/api/icplus/rates/${active}`, {
        method: 'PUT',
        headers: authHeaders(),
        // Le taux repart en DÉCIMAL : la saisie était en pourcentage.
        body: JSON.stringify({ entries: draft.map((e) => ({ ...e, rate: Number(e.rate) })) }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        if (d.problems) setProblems(d.problems);
        else setError(d.error || (t('icplusRates.saveError') as string));
        return;
      }
      setTables((prev) => ({ ...prev, [active]: draft }));
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError(t('icplusRates.saveError') as string);
    } finally {
      setSaving(false);
    }
  }

  const problemFor = (i: number) => problems.find((p) => p.index === i);

  const sourceOptions = useMemo(
    () => [{ value: '', label: t('icplusRates.pickSource') as string },
      ...Object.keys(sources).map((k) => ({ value: k, label: k }))],
    [sources, t]
  );

  if (loading) return <ContentLoader />;

  const filled = tableNames.filter((n) => (tables[n] || []).length > 0).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-body dark:text-bodydark">
          {t('icplusRates.coverage', { filled, total: tableNames.length })}
        </p>
      </div>

      {/* ⚠️ Rappel permanent de la conversion. C'est l'erreur qui coûte le plus cher ici et
          elle ne se voit pas : un taux 100× trop grand passe pour une saisie normale. */}
      <div className="mb-4 flex items-start gap-3 rounded-sm border border-warning bg-warning/10 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p className="text-sm text-black dark:text-white">{t('icplusRates.percentWarning')}</p>
      </div>

      {/* Onglets par table, avec le compte d'entrées — on voit d'un coup d'œil ce qui est vide */}
      <div className="mb-4 flex flex-wrap gap-2">
        {tableNames.map((n) => {
          const count = (tables[n] || []).length;
          return (
            <button key={n} onClick={() => switchTable(n)}
              className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                active === n ? 'bg-primary text-white'
                  : count === 0 ? 'border border-warning/50 bg-warning/5 text-body dark:text-bodydark'
                  : 'border border-stroke text-black hover:border-primary dark:border-strokedark dark:text-white'}`}>
              {n} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {error && <div className="mb-4 rounded-sm border border-danger bg-danger/10 p-3 text-sm text-danger">{error}</div>}

      {problems.length > 0 && (
        <div className="mb-4 rounded-sm border border-danger bg-danger/10 p-3 text-sm text-danger">
          <p className="font-medium">{t('icplusRates.nothingWritten')}</p>
          <ul className="mt-1 list-inside list-disc">
            {problems.map((p, i) => (
              <li key={i}>
                {p.cat || t('icplusRates.unnamedRow')} — {p.errors.map((e) => t(`icplusRates.err.${e.code}`, { defaultValue: e.code })).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-stroke text-left text-xs text-body dark:border-strokedark">
              <th className="py-2">{t('icplusRates.cat')}</th>
              <th className="w-32 py-2 text-right">{t('icplusRates.ratePct')}</th>
              <th className="w-20 py-2 text-center">{t('icplusRates.weak')}</th>
              <th className="w-56 py-2">{t('icplusRates.source')}</th>
              <th className="w-40 py-2">{t('icplusRates.lastChange')}</th>
              <th className="w-10 py-2" />
            </tr>
          </thead>
          <tbody>
            {draft.map((e, i) => {
              const bad = problemFor(i);
              return (
                <tr key={i} className={`border-b border-stroke dark:border-strokedark ${bad ? 'bg-danger/5' : ''}`}>
                  <td className="py-1.5 pr-2">
                    <input value={e.cat} onChange={(ev) => update(i, { cat: ev.target.value })}
                      placeholder={t('icplusRates.catPlaceholder') as string}
                      className="w-full rounded border border-stroke bg-transparent px-2 py-1 outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input" />
                  </td>
                  <td className="py-1.5 pr-2">
                    {/* Saisie en POURCENTAGE, stockage en décimal — conversion aux deux bords. */}
                    <input type="number" step="0.0001" value={+(e.rate * 100).toFixed(6)}
                      onChange={(ev) => update(i, { rate: (Number(ev.target.value) || 0) / 100 })}
                      className="w-full rounded border border-stroke bg-transparent px-2 py-1 text-right outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input" />
                  </td>
                  <td className="py-1.5 text-center">
                    <input type="checkbox" checked={!!e.weak} onChange={(ev) => update(i, { weak: ev.target.checked })}
                      title={t('icplusRates.weakHelp') as string} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Select value={e.src || ''} onChange={(v) => update(i, { src: v })} options={sourceOptions} />
                  </td>
                  <td className="py-1.5 text-xs text-body">
                    {e.updated_by ? `${e.updated_by}${e.updated_at ? ` · ${String(e.updated_at).slice(0, 10)}` : ''}` : '—'}
                  </td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => removeRow(i)} className="rounded p-1 text-body hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {draft.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-body dark:text-bodydark">{t('icplusRates.emptyTable')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={addRow}
          className="flex items-center gap-2 rounded border border-stroke px-3 py-2 text-sm font-medium text-black hover:border-primary dark:border-strokedark dark:text-white">
          <Plus className="h-4 w-4" />{t('icplusRates.addRow')}
        </button>
        <button onClick={save} disabled={!dirty || saving}
          className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
          <Save className="h-4 w-4" />{saving ? '…' : t('icplusRates.save')}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success"><Check className="h-4 w-4" />{t('icplusRates.savedOk')}</span>
        )}
        {dirty && !saving && <span className="text-sm text-warning">{t('icplusRates.unsaved')}</span>}
      </div>

      <p className="mt-4 text-xs text-body dark:text-bodydark">{t('icplusRates.auditNote')}</p>
    </div>
  );
}
