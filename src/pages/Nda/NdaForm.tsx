import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../components/Select';
import DateField from '../../components/DateField';
import { API_URL, authHeaders, scrollToTop, type NdaData, type NdaDetail, type NdaMeta, type NdaMode } from './types';

// Fiche d'un NDA (brouillon). Deux modes, choisis à la création et figés ensuite :
//   - « Gabarit Cluster » : notre NDA mutuel, généré à partir de ces champs ;
//   - « Leur NDA » : l'autre partie impose son texte → on joindra son PDF dans la fiche, et
//     Sales Hub y ajoutera une page de signature.

const INPUT =
  'w-full rounded-[10px] border border-stroke bg-transparent px-4 py-2.5 text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const LABEL = 'mb-1.5 block text-sm font-medium text-black dark:text-white';
const SELECT_CLS =
  'w-full rounded-[10px] border border-stroke bg-transparent px-4 py-2.5 text-left text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const CARD = 'rounded-2xl border border-stroke bg-white p-5 dark:border-strokedark dark:bg-boxdark sm:p-6';

const EMPTY: NdaData = {
  mode: 'template', lang: 'en',
  company: { legalName: '', address: '', city: '', province: '', postalCode: '', country: 'Canada' },
  signer: { firstName: '', lastName: '', title: '', email: '' },
  purpose: '', effectiveDate: '', team: '', notes: '',
};

const NdaForm = ({ meta, initial, onCancel, onSaved }: {
  meta: NdaMeta;
  initial: NdaDetail | null;
  onCancel: () => void;
  onSaved: (d: NdaDetail) => void;
}) => {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState<NdaData>(initial ? initial.nda : { ...EMPTY, lang: i18n.language?.startsWith('fr') ? 'fr' : 'en' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const isUpload = form.mode === 'upload';

  const setCompany = (k: keyof NdaData['company']) => (v: string) => setForm((f) => ({ ...f, company: { ...f.company, [k]: v } }));
  const setSigner = (k: keyof NdaData['signer']) => (v: string) => setForm((f) => ({ ...f, signer: { ...f.signer, [k]: v } }));
  const ring = (k: string) => (bad.includes(k) ? ' !border-danger' : '');

  const field = (key: string, label: string, value: string, onChange: (v: string) => void, opts: { type?: string; required?: boolean; placeholder?: string; className?: string } = {}) => (
    <div className={opts.className}>
      <label className={LABEL}>{label}{opts.required && <span className="text-danger"> *</span>}</label>
      <input type={opts.type || 'text'} className={INPUT + ring(key)} value={value} placeholder={opts.placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );

  const submit = async () => {
    setSaving(true); setError(null); setBad([]);
    try {
      const url = initial ? `${API_URL}/api/nda/agreements/${initial.id}` : `${API_URL}/api/nda/agreements`;
      const res = await fetch(url, { method: initial ? 'PUT' : 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) {
        if (data?.fields) { setBad(data.fields); throw new Error(t('nda.form.fixFields') as string); }
        throw new Error(data?.message || data?.error || 'error');
      }
      onSaved(data);
    } catch (e: any) {
      setError(e?.message || (t('nda.form.saveFailed') as string));
      scrollToTop();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold leading-tight tracking-[-0.01em] text-black dark:text-white">{initial ? t('nda.form.editTitle') : t('nda.form.newTitle')}</h2>
        <p className="mt-1 text-sm text-bodydark2">{t('nda.form.subtitle', { name: meta.signer.name })}</p>
      </div>
      {error && <div className="rounded border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {/* Type d'entente */}
      <div className={CARD}>
        <h3 className="mb-4 font-semibold text-black dark:text-white">{t('nda.form.kind')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['template', 'upload'] as NdaMode[]).map((m) => {
            const on = form.mode === m;
            return (
              <button key={m} type="button" disabled={!!initial} onClick={() => setForm((f) => ({ ...f, mode: m }))}
                className={`rounded-xl border p-4 text-left transition ${on ? 'border-primary bg-primary/5' : 'border-stroke hover:border-primary/60 dark:border-strokedark'} ${initial && !on ? 'opacity-50' : ''}`}>
                <span className="block text-sm font-bold text-black dark:text-white">{t(`nda.form.mode.${m}`)}</span>
                <span className="mt-1 block text-xs text-bodydark2">{t(`nda.form.mode.${m}Hint`)}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL}>{t('nda.form.lang')}</label>
            <Select value={form.lang} onChange={(v) => setForm((f) => ({ ...f, lang: v as 'en' | 'fr' }))} buttonClassName={SELECT_CLS}
              options={[{ value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }]} />
            <p className="mt-1 text-xs text-bodydark2">{t(isUpload ? 'nda.form.langHintUpload' : 'nda.form.langHint')}</p>
          </div>
          {field('team', t('nda.form.team'), form.team, (v) => setForm((f) => ({ ...f, team: v })), { placeholder: t('nda.form.teamPh') as string })}
        </div>
      </div>

      {/* Autre partie */}
      <div className={CARD}>
        <h3 className="mb-4 font-semibold text-black dark:text-white">{t('nda.form.company')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('company.legalName', t('nda.form.legalName'), form.company.legalName, setCompany('legalName'), { required: true, placeholder: t('nda.form.legalNamePh') as string, className: 'sm:col-span-2' })}
          {field('company.address', t('nda.form.address'), form.company.address, setCompany('address'), { required: !isUpload, className: 'sm:col-span-2' })}
          {field('company.city', t('nda.form.city'), form.company.city, setCompany('city'), { required: !isUpload })}
          {field('company.province', t('nda.form.province'), form.company.province, setCompany('province'))}
          {field('company.postalCode', t('nda.form.postalCode'), form.company.postalCode, setCompany('postalCode'))}
          {field('company.country', t('nda.form.country'), form.company.country, setCompany('country'))}
        </div>
      </div>

      {/* Signataire de l'autre partie */}
      <div className={CARD}>
        <h3 className="mb-1 font-semibold text-black dark:text-white">{t('nda.form.signer')}</h3>
        <p className="mb-4 text-xs text-bodydark2">{t('nda.form.signerHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('signer.firstName', t('nda.form.firstName'), form.signer.firstName, setSigner('firstName'), { required: true })}
          {field('signer.lastName', t('nda.form.lastName'), form.signer.lastName, setSigner('lastName'), { required: true })}
          {field('signer.title', t('nda.form.title'), form.signer.title, setSigner('title'), { required: true, placeholder: t('nda.form.titlePh') as string })}
          {field('signer.email', t('nda.form.email'), form.signer.email, setSigner('email'), { type: 'email', required: true })}
        </div>
      </div>

      {/* Objet et date — gabarit Cluster seulement */}
      {!isUpload && (
        <div className={CARD}>
          <h3 className="mb-4 font-semibold text-black dark:text-white">{t('nda.form.terms')}</h3>
          <div className="space-y-4">
            <div>
              <label className={LABEL}>{t('nda.form.purpose')}</label>
              <textarea rows={2} className={INPUT} value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                placeholder={meta.defaultPurpose[form.lang]} />
              <p className="mt-1 text-xs text-bodydark2">{t('nda.form.purposeHint', { purpose: meta.defaultPurpose[form.lang] })}</p>
            </div>
            <div className="max-w-xs">
              <label className={LABEL}>{t('nda.form.effectiveDate')}</label>
              <DateField value={form.effectiveDate} onChange={(v) => setForm((f) => ({ ...f, effectiveDate: v }))} className={INPUT} placeholderText={t('nda.form.effectiveDatePh') as string} />
              <p className="mt-1 text-xs text-bodydark2">{t('nda.form.effectiveDateHint')}</p>
            </div>
          </div>
        </div>
      )}

      <div className={CARD}>
        <label className={LABEL}>{t('nda.form.notes')}</label>
        <textarea rows={3} className={INPUT} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder={t('nda.form.notesPh') as string} />
        {isUpload && <p className="mt-3 text-xs text-bodydark2">{t('nda.form.nextStepUpload')}</p>}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-md border border-stroke px-5 py-2.5 text-sm font-medium text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">{t('common.cancel')}</button>
        <button type="button" onClick={submit} disabled={saving} className="rounded-[10px] bg-primary px-6 py-2.5 text-sm font-bold text-[#141414] hover:bg-[#F79C6A] disabled:opacity-60">
          {saving ? t('nda.form.saving') : initial ? t('nda.form.save') : t('nda.form.create')}
        </button>
      </div>
    </div>
  );
};

export default NdaForm;
