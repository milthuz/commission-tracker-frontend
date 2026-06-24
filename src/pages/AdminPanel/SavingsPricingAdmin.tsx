import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

interface Tpl { id: number; name: string; is_default: boolean; active: boolean; config: any }
interface Editing {
  id?: number; name: string; isDefault: boolean; active: boolean;
  rates: Record<'debit' | 'credit' | 'amex', { ratePct: number; perTrx: number }>;
  fixedUnit: Record<'terminalS1F2' | 'terminalWired' | 'pci' | 'acctOnFile' | 'batch' | 'lte', number>;
  costs: { perTrx: number; discountPct: number; t1Pct: number; monthlyFixed: number; terminalS1F2: number; terminalWired: number };
}

const blank = (): Editing => ({
  name: '', isDefault: false, active: true,
  rates: { debit: { ratePct: 0, perTrx: 0.05 }, credit: { ratePct: 0.15, perTrx: 0.05 }, amex: { ratePct: 0.15, perTrx: 0.05 } },
  fixedUnit: { terminalS1F2: 25, terminalWired: 25, pci: 7.5, acctOnFile: 9, batch: 7, lte: 0 },
  costs: { perTrx: 0.035, discountPct: 0.05, t1Pct: 0.01, monthlyFixed: 5.5, terminalS1F2: 34.72, terminalWired: 27.5 },
});

const toEditing = (t: Tpl): Editing => {
  const c = t.config || {};
  const r = c.rates || {}; const fu = c.fixedUnit || {}; const co = c.costs || {};
  const rp = (x: any) => ({ ratePct: (x?.rate || 0) * 100, perTrx: x?.perTrx || 0 });
  return {
    id: t.id, name: t.name, isDefault: t.is_default, active: t.active,
    rates: { debit: rp(r.debit), credit: rp(r.credit), amex: rp(r.amex) },
    fixedUnit: { terminalS1F2: fu.terminalS1F2 || 0, terminalWired: fu.terminalWired || 0, pci: fu.pci || 0, acctOnFile: fu.acctOnFile || 0, batch: fu.batch || 0, lte: fu.lte || 0 },
    costs: { perTrx: co.perTrx || 0, discountPct: (co.discountRate || 0) * 100, t1Pct: (co.t1Rate || 0) * 100, monthlyFixed: co.monthlyFixed || 0, terminalS1F2: co.terminalS1F2 || 0, terminalWired: co.terminalWired || 0 },
  };
};
const toConfig = (e: Editing) => ({
  rates: {
    debit: { rate: num(e.rates.debit.ratePct) / 100, perTrx: num(e.rates.debit.perTrx) },
    credit: { rate: num(e.rates.credit.ratePct) / 100, perTrx: num(e.rates.credit.perTrx) },
    amex: { rate: num(e.rates.amex.ratePct) / 100, perTrx: num(e.rates.amex.perTrx) },
  },
  fixedUnit: { ...e.fixedUnit },
  costs: { perTrx: num(e.costs.perTrx), discountRate: num(e.costs.discountPct) / 100, t1Rate: num(e.costs.t1Pct) / 100, monthlyFixed: num(e.costs.monthlyFixed), terminalS1F2: num(e.costs.terminalS1F2), terminalWired: num(e.costs.terminalWired) },
});

const SavingsPricingAdmin: React.FC = () => {
  const { t } = useTranslation();
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [users, setUsers] = useState<{ email: string; displayName?: string | null }[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [tr, ar, ur] = await Promise.all([
      axios.get(`${API_URL}/api/savings/templates`, { headers: authHeaders() }),
      axios.get(`${API_URL}/api/savings/assignments`, { headers: authHeaders() }),
      axios.get(`${API_URL}/api/admin/users`, { headers: authHeaders() }),
    ]);
    setTpls(tr.data.templates || []);
    const map: Record<string, number> = {};
    (ar.data.assignments || []).forEach((a: any) => { map[a.rep_email.toLowerCase()] = a.template_id; });
    setAssignments(map);
    setUsers(ur.data.users || []);
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const save = async () => {
    if (!editing || !editing.name.trim()) { dialog.alert(t('savingsPricing.nameRequired') as string); return; }
    setSaving(true);
    try {
      const body = { name: editing.name.trim(), isDefault: editing.isDefault, active: editing.active, config: toConfig(editing) };
      if (editing.id) await axios.put(`${API_URL}/api/savings/templates/${editing.id}`, body, { headers: authHeaders() });
      else await axios.post(`${API_URL}/api/savings/templates`, body, { headers: authHeaders() });
      setEditing(null); await load();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };
  const del = async (tpl: Tpl) => {
    if (!(await dialog.confirm(t('savingsPricing.confirmDelete', { name: tpl.name }) as string))) return;
    try { await axios.delete(`${API_URL}/api/savings/templates/${tpl.id}`, { headers: authHeaders() }); await load(); }
    catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };
  const assign = async (email: string, templateId: number | null) => {
    try {
      await axios.put(`${API_URL}/api/savings/assignments`, { repEmail: email, templateId }, { headers: authHeaders() });
      setAssignments(m => { const n = { ...m }; if (templateId == null) delete n[email.toLowerCase()]; else n[email.toLowerCase()] = templateId; return n; });
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
  };

  const inp = 'w-full rounded border border-stroke bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';
  const card = 'rounded-xl border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark';

  return (
    <div className="space-y-5">
      {/* Templates list */}
      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-black dark:text-white">{t('savingsPricing.templates')}</h3>
          <button onClick={() => setEditing(blank())} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90">+ {t('savingsPricing.newTemplate')}</button>
        </div>
        <div className="space-y-2">
          {tpls.map(tp => (
            <div key={tp.id} className="flex items-center justify-between rounded-lg border border-stroke px-3 py-2 dark:border-strokedark">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-black dark:text-white">{tp.name}</span>
                {tp.is_default && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">{t('savingsPricing.default')}</span>}
                {!tp.active && <span className="rounded-full bg-gray-2 px-2 py-0.5 text-[11px] text-body dark:bg-meta-4">{t('savingsPricing.inactive')}</span>}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setEditing(toEditing(tp))} className="text-sm font-medium text-primary hover:underline">{t('common.edit')}</button>
                <button onClick={() => del(tp)} className="text-sm font-medium text-danger hover:underline">{t('common.delete')}</button>
              </div>
            </div>
          ))}
          {tpls.length === 0 && <p className="text-sm text-gray-400">{t('savingsPricing.none')}</p>}
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <div className={card}>
          <h3 className="mb-3 text-sm font-semibold text-black dark:text-white">{editing.id ? t('savingsPricing.editTemplate') : t('savingsPricing.newTemplate')}</h3>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <input className={`${inp} max-w-xs`} placeholder={t('savingsPricing.templateName') as string} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-body"><input type="checkbox" checked={editing.isDefault} onChange={e => setEditing({ ...editing, isDefault: e.target.checked })} />{t('savingsPricing.setDefault')}</label>
            <label className="flex items-center gap-2 text-sm text-body"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} />{t('savingsPricing.activeLabel')}</label>
          </div>

          {/* Rates */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('savingsPricing.clusterRates')}</p>
          <div className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead><tr className="text-left text-xs text-gray-500"><th className="pb-1">{t('savingsCalc.category')}</th><th className="pb-1">{t('savingsCalc.ratePct')}</th><th className="pb-1">{t('savingsCalc.perTrx')}</th></tr></thead>
              <tbody>
                {(['debit', 'credit', 'amex'] as const).map(c => (
                  <tr key={c}>
                    <td className="py-1 pr-2 font-medium text-black dark:text-white">{t(`savingsCalc.${c}`)}</td>
                    <td className="py-1 pr-2"><input type="number" step="0.001" className={inp} value={editing.rates[c].ratePct} onChange={e => setEditing({ ...editing, rates: { ...editing.rates, [c]: { ...editing.rates[c], ratePct: num(e.target.value) } } })} /></td>
                    <td className="py-1"><input type="number" step="0.001" className={inp} value={editing.rates[c].perTrx} onChange={e => setEditing({ ...editing, rates: { ...editing.rates, [c]: { ...editing.rates[c], perTrx: num(e.target.value) } } })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Fixed unit prices */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('savingsPricing.fixedUnitPrices')}</p>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {([['terminalS1F2', 'termS1F2'], ['terminalWired', 'termWired'], ['pci', 'pci'], ['acctOnFile', 'acctOnFile'], ['batch', 'batch'], ['lte', 'lte']] as const).map(([k, lbl]) => (
              <div key={k}><label className="block text-xs text-gray-500">{t(`savingsCalc.${lbl}`)} ($)</label><input type="number" step="0.01" className={`${inp} mt-1`} value={(editing.fixedUnit as any)[k]} onChange={e => setEditing({ ...editing, fixedUnit: { ...editing.fixedUnit, [k]: num(e.target.value) } })} /></div>
            ))}
          </div>

          {/* Costs */}
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('savingsPricing.internalCosts')}</p>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {([['perTrx', t('savingsPricing.costPerTrx') + ' ($)'], ['discountPct', t('savingsPricing.costDiscount') + ' (%)'], ['t1Pct', t('savingsPricing.costT1') + ' (%)'], ['monthlyFixed', t('savingsPricing.costMonthlyFixed') + ' ($)'], ['terminalS1F2', t('savingsPricing.costTermS1F2') + ' ($)'], ['terminalWired', t('savingsPricing.costTermWired') + ' ($)']] as const).map(([k, lbl]) => (
              <div key={k}><label className="block text-xs text-gray-500">{lbl}</label><input type="number" step="0.0001" className={`${inp} mt-1`} value={(editing.costs as any)[k]} onChange={e => setEditing({ ...editing, costs: { ...editing.costs, [k]: num(e.target.value) } })} /></div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark">{t('common.cancel')}</button>
            <button onClick={save} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">{saving ? '…' : t('common.save')}</button>
          </div>
        </div>
      )}

      {/* Assignments */}
      <div className={card}>
        <h3 className="mb-1 text-sm font-semibold text-black dark:text-white">{t('savingsPricing.assignments')}</h3>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t('savingsPricing.assignmentsHint')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead><tr className="text-left text-xs text-gray-500"><th className="pb-2">{t('savingsPricing.user')}</th><th className="pb-2">{t('savingsPricing.assignedTemplate')}</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.email} className="border-t border-stroke dark:border-strokedark">
                  <td className="py-2 pr-3 text-black dark:text-white">{u.displayName || u.email}{u.displayName && <span className="ml-1 text-xs text-gray-400">({u.email})</span>}</td>
                  <td className="py-2">
                    <select className={`${inp} max-w-[240px]`} value={assignments[u.email.toLowerCase()] ?? ''} onChange={e => assign(u.email, e.target.value ? parseInt(e.target.value, 10) : null)}>
                      <option value="">{t('savingsPricing.useDefault')}</option>
                      {tpls.map(tp => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SavingsPricingAdmin;
