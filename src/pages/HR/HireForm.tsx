import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../components/Select';
import DateField from '../../components/DateField';
import { API_URL, authHeaders, scrollToTop, type HireData, type HireDetail, type Meta, type Plan, type Terms, type Tier } from './types';

// Fiche d'embauche. Trois blocs qui correspondent aux deux documents générés :
//   - candidat + poste + conditions → l'OFFRE D'EMPLOI (champs du gabarit Word) ;
//   - plan de commission → l'ENTENTE DE RÉMUNÉRATION v7.7.
// Le plan part des valeurs du MOTEUR de commissions ; tout écart est signalé en orange,
// parce qu'une entente signée qui diverge du calcul réel de la paie est un problème à venir.

const INPUT =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const LABEL = 'mb-1.5 block text-sm font-medium text-black dark:text-white';
const SELECT_CLS =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-left text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const CARD = 'rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark sm:p-6';

const PROVINCES = ['QC', 'ON', 'NB', 'NS', 'PE', 'NL', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU'];

const blankHire = (): HireData => ({
  firstName: '', lastName: '', email: '', phone: '',
  addressLine1: '', city: 'Montreal', province: 'QC', postalCode: '', country: 'Canada',
  position: 'Sales Representative', positionFr: 'Représentant(e) des ventes',
  startDate: '', offerDate: new Date().toISOString().slice(0, 10),
  reportsToTitle: '', reportsToTitleFr: '', reportsToName: '', supervisorName: '',
  annualSalary: null, agreementLang: 'fr', includeAgreement: true, notes: '',
});

type PlanNumKey = Exclude<keyof Plan, 'version' | 'monthlyTiers' | 'annualTiers'>;

const HireForm = ({ meta, initial, onCancel, onSaved }: {
  meta: Meta;
  initial: HireDetail | null;
  onCancel: () => void;
  onSaved: (d: HireDetail) => void;
}) => {
  const { t } = useTranslation();
  const [hire, setHire] = useState<HireData>(initial ? { ...initial.hire } : blankHire());
  const [terms, setTerms] = useState<Terms>(initial ? { ...initial.terms } : { ...meta.terms });
  const [plan, setPlan] = useState<Plan>(initial ? structuredClone(initial.plan) : structuredClone(meta.defaults));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bad, setBad] = useState<string[]>([]);

  const setH = <K extends keyof HireData>(k: K) => (v: HireData[K]) => setHire((h) => ({ ...h, [k]: v }));
  const setT = <K extends keyof Terms>(k: K) => (v: Terms[K]) => setTerms((x) => ({ ...x, [k]: v }));
  const setP = (k: PlanNumKey) => (v: string) => setPlan((p) => ({ ...p, [k]: v === '' ? ('' as any) : Number(v) }));

  // Comparaison canonique : un plan relu de la base (JSONB) rend ses paliers { bonus, points },
  // l'ordre inverse du moteur — un JSON.stringify direct verrait un écart qui n'existe pas.
  const canon = (v: unknown): string => (Array.isArray(v)
    ? `[${v.map(canon).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v).sort().map((k) => `${k}:${canon((v as any)[k])}`).join(',')}}`
      : String(Number(v)));
  const differs = (k: keyof Plan) => canon(plan[k]) !== canon(meta.defaults[k]);
  const anyDiff = (Object.keys(meta.defaults) as (keyof Plan)[]).some((k) => k !== 'version' && differs(k));
  const invalid = (k: string) => bad.includes(k);
  const ring = (k: string) => (invalid(k) ? ' !border-danger' : '');

  const text = (k: keyof HireData, label: string, opts: { type?: string; required?: boolean; placeholder?: string } = {}) => (
    <div>
      <label className={LABEL}>{label}{opts.required && <span className="text-danger"> *</span>}</label>
      <input
        type={opts.type || 'text'}
        className={INPUT + ring(k)}
        value={(hire[k] as any) ?? ''}
        placeholder={opts.placeholder}
        onChange={(e) => setH(k)(e.target.value as any)}
      />
    </div>
  );

  const planNum = (k: PlanNumKey, label: string, unit?: string) => (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="relative">
        <input
          type="number" inputMode="decimal" step="any"
          className={INPUT + (unit ? ' pr-10' : '') + (differs(k) ? ' !border-warning' : '') + ring(`plan.${k}`)}
          value={plan[k] as any}
          onChange={(e) => setP(k)(e.target.value)}
        />
        {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-bodydark2">{unit}</span>}
      </div>
    </div>
  );

  const tiersEditor = (key: 'monthlyTiers' | 'annualTiers', label: string) => {
    const rows = plan[key];
    const update = (i: number, field: keyof Tier, v: string) => setPlan((p) => ({
      ...p, [key]: p[key].map((r, j) => (j === i ? { ...r, [field]: v === '' ? ('' as any) : Number(v) } : r)),
    }));
    return (
      <div className={differs(key) ? 'rounded border border-warning/60 p-3' : ''}>
        <p className={LABEL}>{label}</p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="number" className={INPUT} value={r.points as any} onChange={(e) => update(i, 'points', e.target.value)} aria-label={t('hr.form.tierPoints') as string} />
              <span className="shrink-0 text-sm text-bodydark2">{t('hr.form.pointsArrow')}</span>
              <div className="relative w-full">
                <input type="number" className={INPUT + ' pr-8'} value={r.bonus as any} onChange={(e) => update(i, 'bonus', e.target.value)} aria-label={t('hr.form.tierBonus') as string} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-bodydark2">$</span>
              </div>
              <button
                type="button"
                disabled={rows.length <= 1}
                onClick={() => setPlan((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) }))}
                className="shrink-0 rounded px-2 py-1 text-bodydark2 hover:text-danger disabled:opacity-30"
                aria-label={t('hr.form.removeTier') as string}
              >✕</button>
            </div>
          ))}
        </div>
        {rows.length < 6 && (
          <button
            type="button"
            onClick={() => setPlan((p) => ({ ...p, [key]: [...p[key], { points: (p[key][p[key].length - 1]?.points || 0) + 5, bonus: 0 }] }))}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >+ {t('hr.form.addTier')}</button>
        )}
      </div>
    );
  };

  const submit = async () => {
    setSaving(true); setError(null); setBad([]);
    try {
      const url = initial ? `${API_URL}/api/hr/hires/${initial.id}` : `${API_URL}/api/hr/hires`;
      const res = await fetch(url, {
        method: initial ? 'PUT' : 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...hire, terms, plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.fields) { setBad(data.fields); throw new Error(t('hr.form.fixFields') as string); }
        throw new Error(data?.message || data?.error || 'error');
      }
      onSaved(data);
    } catch (e: any) {
      setError(e?.message || (t('hr.form.saveFailed') as string));
      scrollToTop();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-title-md2 font-bold text-black dark:text-white">{initial ? t('hr.form.editTitle') : t('hr.form.newTitle')}</h2>
          <p className="mt-1 text-sm text-bodydark2">{t('hr.form.subtitle')}</p>
        </div>
      </div>

      {error && <div className="rounded border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {/* Candidat */}
      <div className={CARD}>
        <h3 className="mb-4 font-semibold text-black dark:text-white">{t('hr.form.candidate')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {text('firstName', t('hr.form.firstName'), { required: true })}
          {text('lastName', t('hr.form.lastName'), { required: true })}
          {text('email', t('hr.form.email'), { type: 'email', required: true })}
          {text('phone', t('hr.form.phone'), { type: 'tel' })}
          <div className="sm:col-span-2">{text('addressLine1', t('hr.form.address'))}</div>
          {text('city', t('hr.form.city'))}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>{t('hr.form.province')}</label>
              <Select value={hire.province} onChange={setH('province')} options={PROVINCES.map((p) => ({ value: p, label: p }))} buttonClassName={SELECT_CLS} />
            </div>
            {text('postalCode', t('hr.form.postalCode'))}
          </div>
        </div>
      </div>

      {/* Poste */}
      <div className={CARD}>
        <h3 className="mb-4 font-semibold text-black dark:text-white">{t('hr.form.position')}</h3>
        {/* Une seule langue pour les DEUX documents (offre + entente). En anglais, la version
            française est quand même générée et remise au candidat (Charte, art. 55). */}
        <div className="mb-5 max-w-md">
          <label className={LABEL}>{t('hr.form.docLang')}</label>
          <Select value={hire.agreementLang} onChange={(v) => setH('agreementLang')(v as 'en' | 'fr')} buttonClassName={SELECT_CLS}
            options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]} />
          <p className="mt-1 text-xs text-bodydark2">{t(hire.agreementLang === 'en' ? 'hr.form.docLangHintEn' : 'hr.form.docLangHintFr')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {text('positionFr', t('hr.form.positionFr'), { required: true })}
          {text('position', t('hr.form.positionEn'), { required: true })}
          <div>
            <label className={LABEL}>{t('hr.form.startDate')}<span className="text-danger"> *</span></label>
            <DateField value={hire.startDate} onChange={setH('startDate')} className={INPUT + ring('startDate')} />
          </div>
          <div>
            <label className={LABEL}>{t('hr.form.offerDate')}</label>
            <DateField value={hire.offerDate} onChange={setH('offerDate')} className={INPUT + ring('offerDate')} />
          </div>
          <div className="sm:col-span-2">{text('reportsToName', t('hr.form.reportsToName'), { required: true, placeholder: 'Jerome Stroobants' })}</div>
          {text('reportsToTitleFr', t('hr.form.reportsToTitleFr'), { placeholder: t('hr.form.reportsToTitleFrPh') as string })}
          {text('reportsToTitle', t('hr.form.reportsToTitle'), { required: true, placeholder: t('hr.form.reportsToTitlePh') as string })}
          <div className="sm:col-span-2">
            {text('supervisorName', t('hr.form.supervisorName'), { placeholder: hire.reportsToName || '' })}
            <p className="mt-1 text-xs text-bodydark2">{t('hr.form.supervisorHint')}</p>
          </div>
        </div>
      </div>

      {/* Conditions de l'offre */}
      <div className={CARD}>
        <h3 className="mb-4 font-semibold text-black dark:text-white">{t('hr.form.compensation')}</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={LABEL}>{t('hr.form.annualSalary')}<span className="text-danger"> *</span></label>
            <div className="relative">
              <input type="number" inputMode="decimal" className={INPUT + ' pr-14' + ring('annualSalary')} value={hire.annualSalary ?? ''}
                onChange={(e) => setH('annualSalary')(e.target.value === '' ? null : Number(e.target.value))} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-bodydark2">CAD</span>
            </div>
          </div>
          <div>
            <label className={LABEL}>{t('hr.form.carAllowance')}</label>
            <input type="number" className={INPUT} value={terms.carAllowance as any} onChange={(e) => setT('carAllowance')(e.target.value === '' ? ('' as any) : Number(e.target.value))} />
          </div>
          <div>
            <label className={LABEL}>{t('hr.form.phoneAllowance')}</label>
            <input type="number" className={INPUT} value={terms.phoneAllowance as any} onChange={(e) => setT('phoneAllowance')(e.target.value === '' ? ('' as any) : Number(e.target.value))} />
          </div>
          <div>
            <label className={LABEL}>{t('hr.form.vacationWeeks')}</label>
            <input type="number" className={INPUT} value={terms.vacationWeeks as any} onChange={(e) => setT('vacationWeeks')(e.target.value === '' ? ('' as any) : Number(e.target.value))} />
          </div>
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-black dark:text-white">
          <input type="checkbox" checked={terms.commissionEligible} onChange={(e) => setT('commissionEligible')(e.target.checked)} />
          {t('hr.form.commissionEligible')}
        </label>
        <p className="mt-3 text-xs text-bodydark2">{t('hr.form.offerNote')}</p>
      </div>

      {/* Entente de rémunération */}
      <div className={CARD}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-black dark:text-white">{t('hr.form.agreement')}</h3>
            <p className="mt-1 text-xs text-bodydark2">{t('hr.form.agreementHint', { version: plan.version })}</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-black dark:text-white">
            <input type="checkbox" checked={hire.includeAgreement} onChange={(e) => setH('includeAgreement')(e.target.checked)} />
            {t('hr.form.includeAgreement')}
          </label>
        </div>

        {hire.includeAgreement && (
          <>
            {anyDiff ? (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-black dark:text-white">
                <span>{t('hr.form.planDiffers')}</span>
                <button type="button" onClick={() => setPlan(structuredClone(meta.defaults))} className="whitespace-nowrap font-medium text-primary hover:underline">
                  {t('hr.form.resetPlan')}
                </button>
              </div>
            ) : (
              <p className="mb-5 text-xs text-bodydark2">{t('hr.form.planMatches')}</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {planNum('monthlyQuota', t('hr.plan.monthlyQuota'), 'pts')}
              {planNum('pointsInbound', t('hr.plan.pointsInbound'), 'pts')}
              {planNum('pointsOutbound', t('hr.plan.pointsOutbound'), 'pts')}
              {planNum('pointsProcessing', t('hr.plan.pointsProcessing'), 'pts')}
              {planNum('hardwareRate', t('hr.plan.hardwareRate'), '%')}
              {planNum('hardwareReducedRate', t('hr.plan.hardwareReducedRate'), '%')}
              {planNum('discountThreshold', t('hr.plan.discountThreshold'), '%')}
              {planNum('saasFirstMonthPct', t('hr.plan.saasFirstMonthPct'), '%')}
              {planNum('signupBonus', t('hr.plan.signupBonus'), '$')}
              {planNum('processingCap', t('hr.plan.processingCap'), '$')}
              {planNum('biAnnualMinMargin', t('hr.plan.biAnnualMinMargin'), '$')}
              {planNum('rampDays', t('hr.plan.rampDays'), t('hr.plan.days') as string)}
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {tiersEditor('monthlyTiers', t('hr.plan.monthlyTiers'))}
              {tiersEditor('annualTiers', t('hr.plan.annualTiers'))}
            </div>
          </>
        )}
      </div>

      <div className={CARD}>
        <label className={LABEL}>{t('hr.form.notes')}</label>
        <textarea rows={3} className={INPUT} value={hire.notes} onChange={(e) => setH('notes')(e.target.value)} placeholder={t('hr.form.notesPh') as string} />
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-md border border-stroke px-5 py-2.5 text-sm font-medium text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
          {t('common.cancel')}
        </button>
        <button type="button" onClick={submit} disabled={saving} className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
          {saving ? t('hr.form.saving') : initial ? t('hr.form.save') : t('hr.form.create')}
        </button>
      </div>
    </div>
  );
};

export default HireForm;
