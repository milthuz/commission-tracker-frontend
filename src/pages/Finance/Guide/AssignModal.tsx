// Guide — assignation en LOT des comptes du grand livre à un responsable et un département.
// Aucune devinette : un compte sans responsable reste dans « à assigner » jusqu'à ce que la CFO
// l'assigne ici. Optionnel : rattacher à une ligne d'OPEX du budget (comparaison budget / réel).
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../../components/Select';
import { Button, InlineError, Modal, toast } from '../../../components/ui';
import { INPUT, LABEL, SEG, segBtn, TABLE, TABLE_WRAP, TD, TH, THEAD_ROW } from '../../../components/ui/surface';
import { useFinance } from '../FinanceContext';
import { errCode, guideApi, type AccountRow, type Department } from './api';
import { fmtUnit, useL } from './shared';

const DEPTS: Department[] = ['sales', 'support_ops', 'accounting', 'rnd', 'other'];

export function AssignModal({ open, onClose, accounts, knownOwners, onSaved }: {
  open: boolean; onClose: () => void; accounts: AccountRow[]; knownOwners: string[]; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const L = useL();
  const { payload, fmt } = useFinance();
  const [show, setShow] = useState<'unassigned' | 'all'>('unassigned');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [owner, setOwner] = useState('');
  const [dept, setDept] = useState<Department>('accounting');
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lignes d'OPEX modifiables (celles que le serveur accepte : sans paie ni voyages).
  const lineOpts = useMemo(() => {
    const travel = new Set(['smTravel', 'rdTravel', 'gaTravel']);
    return [{ value: '', label: L('assign.noLine') }, ...payload.reference.opex
      .filter((it) => it.t === 'line' && it.key && !it.pay && !travel.has(it.key))
      .map((it) => ({ value: `opx:${it.key}`, label: it.name }))];
  }, [payload.reference.opex, L]);

  const rows = accounts.filter((a) => show === 'all' || !a.assigned);
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.accountKey));
  const toggleAll = () => setSel(allOn ? new Set() : new Set(rows.map((r) => r.accountKey)));

  const run = async (clear: boolean) => {
    setBusy(true); setError(null);
    try {
      const keys = [...sel];
      if (clear) await guideApi.assign([], keys);
      else await guideApi.assign(keys.map((accountKey) => ({ accountKey, owner: owner.trim(), department: dept, budgetLine: line || null })));
      toast.success(L(clear ? 'assign.cleared' : 'assign.done', { n: keys.length }));
      setSel(new Set());
      onSaved();
    } catch (e) { setError(errCode(e)); } finally { setBusy(false); }
  };
  const errText = error ? (t(`finance.guide.errors.${error}`, { defaultValue: t('finance.guide.errors.generic', { code: error }) }) as string) : null;
  const canApply = sel.size > 0 && owner.trim().length > 0 && owner.trim().length <= 80;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={L('assign.title')}
      footer={<Button variant="secondary" onClick={onClose}>{L('assign.close')}</Button>}
    >
      <p className="m-0 mb-3 text-[13px] text-body dark:text-bodydark2">{L('assign.intro')}</p>
      {errText && <InlineError title={errText} className="mb-3" />}
      <div className="mb-3 grid gap-3 md:grid-cols-4">
        <div>
          <label className={LABEL} htmlFor="assign-owner">{L('assign.owner')}</label>
          <input id="assign-owner" className={`${INPUT} w-full`} list="assign-owners" maxLength={80} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={L('assign.ownerPlaceholder')} />
          <datalist id="assign-owners">{knownOwners.map((o) => <option key={o} value={o} />)}</datalist>
        </div>
        <div>
          <label className={LABEL}>{L('assign.department')}</label>
          <Select value={dept} onChange={(v) => setDept(v as Department)} options={DEPTS.map((d) => ({ value: d, label: L(`dept.${d}`) }))} />
        </div>
        <div className="md:col-span-2">
          <label className={LABEL}>{L('assign.line')}</label>
          <Select value={line} onChange={setLine} options={lineOpts} />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className={SEG} role="group" aria-label={L('assign.show')}>
          <button type="button" aria-pressed={show === 'unassigned'} className={segBtn(show === 'unassigned')} onClick={() => setShow('unassigned')}>{L('assign.showUnassigned', { n: accounts.filter((a) => !a.assigned).length })}</button>
          <button type="button" aria-pressed={show === 'all'} className={segBtn(show === 'all')} onClick={() => setShow('all')}>{L('assign.showAll', { n: accounts.length })}</button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-body dark:text-bodydark2">{L('assign.selected', { n: sel.size })}</span>
          <Button size="sm" variant="primary" disabled={!canApply || busy} onClick={() => run(false)}>{L('assign.apply')}</Button>
          <Button size="sm" variant="secondary" disabled={!sel.size || busy} onClick={() => run(true)}>{L('assign.clear')}</Button>
        </div>
      </div>
      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <thead>
            <tr className={THEAD_ROW}>
              <th className={TH}><input type="checkbox" aria-label={L('assign.selectAll')} checked={allOn} onChange={toggleAll} /></th>
              <th className={`${TH} text-left`}>{L('assign.account')}</th>
              <th className={`${TH} text-left`}>{L('assign.section')}</th>
              <th className={`${TH} text-right`}>{L('assign.total')}</th>
              <th className={`${TH} text-left`}>{L('assign.current')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.accountKey}>
                <td className={TD}><input type="checkbox" aria-label={a.accountName} checked={sel.has(a.accountKey)} onChange={() => toggle(a.accountKey)} /></td>
                <td className={TD}>{a.accountName}</td>
                <td className={`${TD} text-[12px] text-body dark:text-bodydark2`}>{a.section || '—'}</td>
                <td className={`${TD} text-right tabular-nums`}>{fmtUnit(fmt, a.windowTotal, 'cad')}</td>
                <td className={TD}>{a.assigned ? `${a.owner} · ${a.department ? L(`dept.${a.department}`) : ''}${a.budgetLine ? ` · ${a.budgetLine.slice(4)}` : ''}` : <span className="text-body dark:text-bodydark2">{L('assign.none')}</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td className={TD} colSpan={5}>{L('assign.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
