import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '../../components/ui';
import Select from '../../components/Select';
import DateField from '../../components/DateField';
import { dialog } from '../../lib/dialog';
import { fmtMoney } from '../../lib/format';

// Editing a rep (audit UX, P2 — « Représentants : édition dans un panneau avec Enregistrer »).
//
// Before: twelve fields on the card, each saved the moment it lost focus — a stray Tab changed a
// quota, and nothing showed what had been changed. Now the card is a summary; this panel holds a
// DRAFT, Save sends only the fields that differ, and any change to money (commission %, base
// salary, signup / review bonus) is listed old → new in ONE confirmation first.
//
// The writes are the panel's parent functions, unchanged (same endpoints, same error alerts);
// each returns true/false so the panel knows what actually saved.

export interface RepDraftSource {
  name: string;
  email?: string | null;
  resolvedLoginEmail?: string | null;
  commissionRate: number;
  baseSalary: number;
  aliases: string[];
  signupBonusAmount: number;
  signupBonusEnabled: boolean;
  reviewBonusEnabled: boolean;
  reviewBonusAmount: number;
  monthlyQuota: number | null;
  hireDate?: string | null;
  quotaGateEnabled?: boolean;
  processingBonusEnabled?: boolean;
  annualBonusEnabled?: boolean;
  teamId: number | null;
}

export interface RepWrites {
  email: (name: string, v: string) => Promise<boolean>;
  hireDate: (name: string, v: string) => Promise<boolean>;
  commissionRate: (name: string, v: number) => Promise<boolean>;
  baseSalary: (name: string, v: number) => Promise<boolean>;
  quota: (name: string, v: number | null) => Promise<boolean>;
  quotaGate: (name: string, v: boolean) => Promise<boolean>;
  processingBonus: (name: string, v: boolean) => Promise<boolean>;
  annualBonus: (name: string, v: boolean) => Promise<boolean>;
  signupBonus: (name: string, amount: number, enabled: boolean) => Promise<boolean>;
  reviewBonus: (name: string, amount: number, enabled: boolean) => Promise<boolean>;
  aliases: (name: string, v: string[]) => Promise<boolean>;
  team: (name: string, teamId: number | null) => Promise<boolean>;
}

interface Draft {
  email: string; hireDate: string; commissionRate: string; baseSalary: string; quota: string;
  quotaGate: boolean; processingBonus: boolean; annualBonus: boolean;
  signupEnabled: boolean; signupAmount: string; reviewEnabled: boolean; reviewAmount: string;
  aliases: string; teamId: string;
}

const fromPerson = (p: RepDraftSource): Draft => ({
  email: p.email || '',
  hireDate: p.hireDate || '',
  commissionRate: String(p.commissionRate),
  baseSalary: String(p.baseSalary || 0),
  quota: p.monthlyQuota == null ? '' : String(p.monthlyQuota),
  quotaGate: p.quotaGateEnabled !== false,
  processingBonus: p.processingBonusEnabled !== false,
  annualBonus: p.annualBonusEnabled !== false,
  signupEnabled: !!p.signupBonusEnabled,
  signupAmount: String(p.signupBonusAmount ?? 100),
  reviewEnabled: !!p.reviewBonusEnabled,
  reviewAmount: String(p.reviewBonusAmount || 0),
  aliases: (p.aliases || []).join(', '),
  teamId: p.teamId != null ? String(p.teamId) : '',
});

const num = (s: string) => { const v = parseFloat(s.replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const aliasList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const input = 'w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';
const label = 'mb-1 block text-xs font-medium text-body dark:text-bodydark';

const Toggle = ({ on, onChange, label: l, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
  <label className="flex items-start justify-between gap-3 py-1.5" title={hint}>
    <span className="text-sm text-black dark:text-white">{l}{hint && <span className="mt-0.5 block text-xs text-body dark:text-bodydark">{hint}</span>}</span>
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${on ? 'bg-primary' : 'bg-stroke dark:bg-meta-4'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  </label>
);

const RepEditPanel = ({ person, teams, defaultQuota, writes, onClose }: {
  person: RepDraftSource;
  teams: { id: number; name: string }[];
  defaultQuota: number;
  writes: RepWrites;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const initial = useMemo(() => fromPerson(person), [person.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const changed = (Object.keys(d) as (keyof Draft)[]).filter((k) => d[k] !== initial[k]);
  const dirty = changed.length > 0;

  const invalid =
    Number.isNaN(num(d.commissionRate)) || num(d.commissionRate) < 0 || num(d.commissionRate) > 100 ? 'commissionRate'
    : Number.isNaN(num(d.baseSalary)) || num(d.baseSalary) < 0 ? 'baseSalary'
    : d.quota.trim() !== '' && (!/^\d+$/.test(d.quota.trim())) ? 'quota'
    : d.signupEnabled && (Number.isNaN(num(d.signupAmount)) || num(d.signupAmount) < 0) ? 'signupAmount'
    : d.reviewEnabled && (Number.isNaN(num(d.reviewAmount)) || num(d.reviewAmount) < 0) ? 'reviewAmount'
    : d.email.trim() !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim()) ? 'email'
    : null;

  const save = async () => {
    if (!dirty || invalid) return;
    const name = person.name;
    // Money first: one confirmation listing every pay change, old → new.
    const money: string[] = [];
    if (d.commissionRate !== initial.commissionRate) money.push(`${t('admin.salespeople.commissionPercent')} : ${initial.commissionRate} % → ${num(d.commissionRate)} %`);
    if (d.baseSalary !== initial.baseSalary) money.push(`${t('admin.salespeople.baseSalary')} : ${fmtMoney(num(initial.baseSalary))} → ${fmtMoney(num(d.baseSalary))}`);
    if (d.signupEnabled !== initial.signupEnabled || (d.signupEnabled && d.signupAmount !== initial.signupAmount)) {
      money.push(`${t('admin.salespeople.signupBonus')} : ${initial.signupEnabled ? fmtMoney(num(initial.signupAmount)) : t('admin.salespeople.signupOff')} → ${d.signupEnabled ? fmtMoney(num(d.signupAmount)) : t('admin.salespeople.signupOff')}`);
    }
    if (d.reviewEnabled !== initial.reviewEnabled || (d.reviewEnabled && d.reviewAmount !== initial.reviewAmount)) {
      money.push(`${t('admin.salespeople.reviewBonus')} : ${initial.reviewEnabled ? fmtMoney(num(initial.reviewAmount)) : t('admin.salespeople.reviewOff')} → ${d.reviewEnabled ? fmtMoney(num(d.reviewAmount)) : t('admin.salespeople.reviewOff')}`);
    }
    if (money.length) {
      const ok = await dialog.confirm(t('admin.repPanel.confirmMoneyBody') as string, {
        title: t('admin.repPanel.confirmMoneyTitle', { name }) as string,
        details: money,
        confirmText: t('common.save') as string,
      });
      if (!ok) return;
    }

    setSaving(true);
    const results: boolean[] = [];
    const run = async (cond: boolean, fn: () => Promise<boolean>) => { if (cond) results.push(await fn()); };
    await run(d.email !== initial.email, () => writes.email(name, d.email.trim().toLowerCase()));
    await run(d.hireDate !== initial.hireDate, () => writes.hireDate(name, d.hireDate));
    await run(d.commissionRate !== initial.commissionRate, () => writes.commissionRate(name, num(d.commissionRate)));
    await run(d.baseSalary !== initial.baseSalary, () => writes.baseSalary(name, num(d.baseSalary)));
    await run(d.quota !== initial.quota, () => writes.quota(name, d.quota.trim() === '' ? null : parseInt(d.quota.trim(), 10)));
    await run(d.quotaGate !== initial.quotaGate, () => writes.quotaGate(name, d.quotaGate));
    await run(d.processingBonus !== initial.processingBonus, () => writes.processingBonus(name, d.processingBonus));
    await run(d.annualBonus !== initial.annualBonus, () => writes.annualBonus(name, d.annualBonus));
    await run(d.signupEnabled !== initial.signupEnabled || d.signupAmount !== initial.signupAmount,
      () => writes.signupBonus(name, num(d.signupAmount) || 0, d.signupEnabled));
    await run(d.reviewEnabled !== initial.reviewEnabled || d.reviewAmount !== initial.reviewAmount,
      () => writes.reviewBonus(name, num(d.reviewAmount) || 0, d.reviewEnabled));
    await run(d.aliases !== initial.aliases, () => writes.aliases(name, aliasList(d.aliases)));
    await run(d.teamId !== initial.teamId, () => writes.team(name, d.teamId === '' ? null : parseInt(d.teamId, 10)));
    setSaving(false);
    // Every write succeeded → close. Otherwise the alert already said which one failed; stay
    // open so nothing typed is lost.
    if (results.every(Boolean)) onClose();
  };

  return (
    <Modal open onClose={onClose} dirty={dirty} title={t('admin.repPanel.title', { name: person.name })} size="lg"
      footer={(
        <>
          {invalid && <span className="mr-auto self-center text-xs font-medium text-danger">{t(`admin.repPanel.invalid.${invalid}`)}</span>}
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={!dirty || !!invalid || saving}>
            {saving ? t('common.saving') : dirty ? t('admin.repPanel.saveN', { count: changed.length }) : t('common.save')}
          </Button>
        </>
      )}>
      <div className="space-y-5">
        <section>
          <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark">{t('admin.repPanel.pay')}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>{t('admin.salespeople.commissionPercent')}</span>
              <div className="flex items-center gap-1.5">
                <input className={input} inputMode="decimal" value={d.commissionRate} onChange={(e) => set('commissionRate', e.target.value)} aria-invalid={invalid === 'commissionRate'} />
                <span className="text-sm text-body">%</span>
              </div>
            </div>
            <div>
              <span className={label}>{t('admin.salespeople.baseSalary')}</span>
              <div className="flex items-center gap-1.5">
                <input className={input} inputMode="decimal" value={d.baseSalary} onChange={(e) => set('baseSalary', e.target.value)} aria-invalid={invalid === 'baseSalary'} />
                <span className="text-sm text-body">$</span>
              </div>
            </div>
            <div>
              <span className={label}>{t('admin.salespeople.signupBonus')}</span>
              <div className="flex items-center gap-2">
                <button type="button" role="switch" aria-checked={d.signupEnabled} aria-label={t('admin.salespeople.signupBonus') as string} onClick={() => set('signupEnabled', !d.signupEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${d.signupEnabled ? 'bg-primary' : 'bg-stroke dark:bg-meta-4'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${d.signupEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                {d.signupEnabled
                  ? <input className={input} inputMode="decimal" value={d.signupAmount} onChange={(e) => set('signupAmount', e.target.value)} aria-invalid={invalid === 'signupAmount'} />
                  : <span className="text-xs italic text-body">{t('admin.salespeople.signupOff')}</span>}
              </div>
            </div>
            <div>
              <span className={label} title={t('admin.salespeople.reviewBonusHint') as string}>{t('admin.salespeople.reviewBonus')}</span>
              <div className="flex items-center gap-2">
                <button type="button" role="switch" aria-checked={d.reviewEnabled} aria-label={t('admin.salespeople.reviewBonus') as string} onClick={() => set('reviewEnabled', !d.reviewEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${d.reviewEnabled ? 'bg-primary' : 'bg-stroke dark:bg-meta-4'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${d.reviewEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                {d.reviewEnabled
                  ? <input className={input} inputMode="decimal" value={d.reviewAmount} onChange={(e) => set('reviewAmount', e.target.value)} aria-invalid={invalid === 'reviewAmount'} />
                  : <span className="text-xs italic text-body">{t('admin.salespeople.reviewOff')}</span>}
              </div>
            </div>
          </div>
          <div className="mt-2 divide-y divide-stroke dark:divide-strokedark">
            <Toggle on={d.processingBonus} onChange={(v) => set('processingBonus', v)} label={t('admin.salespeople.processingBonus')} hint={t('admin.salespeople.processingBonusHint') as string} />
            <Toggle on={d.annualBonus} onChange={(v) => set('annualBonus', v)} label={t('admin.salespeople.annualBonus')} hint={t('admin.salespeople.annualBonusHint') as string} />
          </div>
        </section>

        <section>
          <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark">{t('admin.repPanel.quota')}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className={label} title={t('admin.salespeople.quotaHint') as string}>{t('admin.salespeople.monthlyQuota')}</span>
              <input className={input} inputMode="numeric" value={d.quota} placeholder={String(defaultQuota)} onChange={(e) => set('quota', e.target.value)} aria-invalid={invalid === 'quota'} />
            </div>
            <div>
              <span className={label}>{t('admin.teams.team')}</span>
              <Select value={d.teamId} onChange={(v) => set('teamId', v)}
                options={[{ value: '', label: t('admin.teams.noTeam') as string }, ...teams.map((tm) => ({ value: String(tm.id), label: tm.name }))]}
                buttonClassName={input} />
            </div>
          </div>
          <div className="mt-2">
            <Toggle on={d.quotaGate} onChange={(v) => set('quotaGate', v)} label={t('admin.salespeople.quotaGate')} hint={t('admin.salespeople.quotaGateHint') as string} />
          </div>
        </section>

        <section>
          <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-body dark:text-bodydark">{t('admin.repPanel.identity')}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className={label} title={t('admin.salespeople.emailHint') as string}>{t('admin.salespeople.email')}</span>
              <input className={input} type="email" value={d.email} placeholder={person.resolvedLoginEmail || (t('admin.salespeople.emailPlaceholder') as string)}
                onChange={(e) => set('email', e.target.value)} aria-invalid={invalid === 'email'} />
              {!d.email && person.resolvedLoginEmail && (
                <span className="mt-0.5 block truncate text-[11px] text-success">↳ {t('admin.salespeople.loggedInAs')}: {person.resolvedLoginEmail}</span>
              )}
            </div>
            <div>
              <span className={label} title={t('admin.salespeople.hireDateHint') as string}>{t('admin.salespeople.hireDate')}</span>
              <DateField value={d.hireDate} onChange={(v) => set('hireDate', v)} className={input} />
            </div>
            <div className="sm:col-span-2">
              <span className={label} title={t('admin.salespeople.aliasesHint') as string}>{t('admin.salespeople.aliases')}</span>
              <input className={input} value={d.aliases} placeholder="Gaby, Gabi" onChange={(e) => set('aliases', e.target.value)} />
              <span className="mt-0.5 block text-[11px] text-body dark:text-bodydark">{t('admin.repPanel.aliasesHelp')}</span>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
};

export default RepEditPanel;
