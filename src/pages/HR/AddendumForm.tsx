import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../components/Select';
import { API_URL, authHeaders, scrollToTop, type HireDetail, type HireListItem, type Meta } from './types';

// Fiche d'un ADDENDA : un document que les RH téléversent (modification de salaire, de poste,
// de territoire…) pour un employé DÉJÀ en poste, et qui passe par le même circuit de signature
// qu'une embauche (lien personnel, suivi, contresignature, certificat, copies).
//
// Deux cas :
//   - l'employé a été embauché par Sales Hub → on choisit son dossier signé, qui préremplit la
//     fiche et apparaît comme référence sur la page de signature ;
//   - il a été embauché avant Sales Hub → on saisit son nom et son courriel.
// Le document lui-même se joint à l'étape suivante, dans la fiche (comme une pièce jointe).

const INPUT =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const LABEL = 'mb-1.5 block text-sm font-medium text-black dark:text-white';
const SELECT_CLS =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-left text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const CARD = 'rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark sm:p-6';
const OTHER = '__other__';

interface Form {
  parentId: string | null;
  firstName: string; lastName: string; email: string;
  docTitleFr: string; docTitleEn: string;
  agreementLang: 'fr' | 'en';
  employer: string;
  supervisorName: string;
  notes: string;
}

const AddendumForm = ({ meta, initial, hires, onCancel, onSaved }: {
  meta: Meta;
  initial: HireDetail | null;
  hires: HireListItem[];
  onCancel: () => void;
  onSaved: (d: HireDetail) => void;
}) => {
  const { t } = useTranslation();
  const managers = meta.managers || [];
  const signed = hires.filter((r) => r.status === 'completed' && (r.kind || 'hire') === 'hire');
  const [form, setForm] = useState<Form>(initial ? {
    parentId: initial.hire.parentId || initial.parentId || null,
    firstName: initial.hire.firstName, lastName: initial.hire.lastName, email: initial.hire.email,
    docTitleFr: initial.hire.docTitleFr || '', docTitleEn: initial.hire.docTitleEn || '',
    agreementLang: initial.hire.agreementLang === 'en' ? 'en' : 'fr',
    employer: initial.hire.employer || 'cluster',
    supervisorName: initial.hire.supervisorName || '',
    notes: initial.hire.notes || '',
  } : {
    parentId: null, firstName: '', lastName: '', email: '', docTitleFr: '', docTitleEn: '',
    agreementLang: 'fr', employer: 'cluster', supervisorName: '', notes: '',
  });
  const [mode, setMode] = useState<'linked' | 'manual'>(initial ? (form.parentId ? 'linked' : 'manual') : (signed.length ? 'linked' : 'manual'));
  const [otherSigner, setOtherSigner] = useState(!!form.supervisorName && !managers.some((m) => m.name === form.supervisorName));
  const [saving, setSaving] = useState(false);
  const [loadingParent, setLoadingParent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bad, setBad] = useState<string[]>([]);

  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const ring = (k: string) => (bad.includes(k) ? ' !border-danger' : '');

  // Choisir un dossier signé préremplit l'employé, l'employeur, la langue et le signataire.
  const pickParent = async (id: string) => {
    set('parentId')(id || null);
    if (!id) return;
    setLoadingParent(true);
    try {
      const res = await fetch(`${API_URL}/api/hr/hires/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const p: HireDetail = await res.json();
      setForm((f) => ({
        ...f, parentId: id,
        firstName: p.hire.firstName, lastName: p.hire.lastName, email: p.hire.email,
        agreementLang: p.hire.agreementLang === 'en' ? 'en' : 'fr',
        employer: p.hire.employer || 'cluster',
        supervisorName: f.supervisorName || p.hire.supervisorName || p.hire.reportsToName || '',
      }));
      setOtherSigner(!!(p.hire.supervisorName || p.hire.reportsToName) && !managers.some((m) => m.name === (p.hire.supervisorName || p.hire.reportsToName)));
    } catch { setError(t('hr.loadFailed') as string); } finally { setLoadingParent(false); }
  };

  const text = (k: keyof Form, label: string, opts: { type?: string; required?: boolean; placeholder?: string; disabled?: boolean } = {}) => (
    <div>
      <label className={LABEL}>{label}{opts.required && <span className="text-danger"> *</span>}</label>
      <input type={opts.type || 'text'} className={INPUT + ring(k) + (opts.disabled ? ' opacity-60' : '')} disabled={opts.disabled}
        value={(form[k] as any) ?? ''} placeholder={opts.placeholder} onChange={(e) => set(k)(e.target.value as any)} />
    </div>
  );

  const submit = async () => {
    setSaving(true); setError(null); setBad([]);
    try {
      const body = { ...form, kind: 'addendum', parentId: mode === 'linked' ? form.parentId : null };
      const url = initial ? `${API_URL}/api/hr/hires/${initial.id}` : `${API_URL}/api/hr/hires`;
      const res = await fetch(url, { method: initial ? 'PUT' : 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        if (data?.fields) { setBad(data.fields); throw new Error(t('hr.form.fixFields') as string); }
        throw new Error(data?.message || data?.error || 'error');
      }
      onSaved(data);
    } catch (e: any) {
      setError(e?.message || (t('hr.form.saveFailed') as string));
      scrollToTop();
    } finally { setSaving(false); }
  };

  const linkedLocked = mode === 'linked' && !!form.parentId;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-title-md2 font-bold text-black dark:text-white">{initial ? t('hr.addendum.editTitle') : t('hr.addendum.newTitle')}</h2>
        <p className="mt-1 text-sm text-bodydark2">{t('hr.addendum.subtitle')}</p>
      </div>
      {error && <div className="rounded border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

      {/* Employé */}
      <div className={CARD}>
        <h3 className="mb-4 font-semibold text-black dark:text-white">{t('hr.addendum.employee')}</h3>
        {!initial && (
          <div className="mb-4 inline-flex flex-wrap rounded-sm border border-stroke p-1 dark:border-strokedark">
            {(['linked', 'manual'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); if (m === 'manual') set('parentId')(null); }}
                className={`rounded-sm px-4 py-2 text-sm font-medium transition-colors ${mode === m ? 'bg-primary text-white' : 'text-bodydark2 hover:text-black dark:hover:text-white'}`}>
                {t(m === 'linked' ? 'hr.addendum.modeLinked' : 'hr.addendum.modeManual')}
              </button>
            ))}
          </div>
        )}
        {mode === 'linked' && (
          <div className="mb-4 max-w-xl">
            <label className={LABEL}>{t('hr.addendum.parent')}<span className="text-danger"> *</span></label>
            {signed.length ? (
              <Select value={form.parentId || ''} onChange={pickParent} buttonClassName={SELECT_CLS + ring('parentId')} placeholder={t('hr.addendum.pickParent') as string}
                disabled={!!initial} options={signed.map((r) => ({ value: r.id, label: `${r.name} — ${r.ref} · ${r.position}` }))} />
            ) : (
              <p className="text-sm text-bodydark2">{t('hr.addendum.noSigned')}</p>
            )}
            {loadingParent && <p className="mt-1 text-xs text-bodydark2">{t('common.loading')}</p>}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {text('firstName', t('hr.form.firstName'), { required: true, disabled: linkedLocked })}
          {text('lastName', t('hr.form.lastName'), { required: true, disabled: linkedLocked })}
          {text('email', t('hr.form.email'), { type: 'email', required: true })}
        </div>
        {linkedLocked && <p className="mt-2 text-xs text-bodydark2">{t('hr.addendum.linkedHint')}</p>}
      </div>

      {/* Document */}
      <div className={CARD}>
        <h3 className="mb-4 font-semibold text-black dark:text-white">{t('hr.addendum.document')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {text('docTitleFr', t('hr.addendum.titleFr'), { required: true, placeholder: t('hr.addendum.titleFrPh') as string })}
          {text('docTitleEn', t('hr.addendum.titleEn'), { placeholder: t('hr.addendum.titleEnPh') as string })}
          <div>
            <label className={LABEL}>{t('hr.addendum.lang')}</label>
            <Select value={form.agreementLang} onChange={(v) => set('agreementLang')(v as 'fr' | 'en')} buttonClassName={SELECT_CLS}
              options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]} />
            <p className="mt-1 text-xs text-bodydark2">{t('hr.addendum.langHint')}</p>
          </div>
          {(meta.employers || []).length > 1 && (
            <div>
              <label className={LABEL}>{t('hr.form.employer')}</label>
              <Select value={form.employer} onChange={(v) => set('employer')(v)} buttonClassName={SELECT_CLS}
                options={(meta.employers || []).map((e) => ({ value: e.key, label: `${e.shortName} — ${e.legalName}` }))} />
            </div>
          )}
          <div>
            <label className={LABEL}>{t('hr.addendum.signer')}<span className="text-danger"> *</span></label>
            <Select value={otherSigner ? OTHER : form.supervisorName} onChange={(v) => { setOtherSigner(v === OTHER); set('supervisorName')(v === OTHER ? '' : v); }}
              buttonClassName={SELECT_CLS + ring('supervisorName')} placeholder={t('hr.form.pickManager') as string}
              options={[...managers.map((m) => ({ value: m.name, label: m.name })), { value: OTHER, label: t('hr.form.otherManager') as string }]} />
            {otherSigner && <input className={INPUT + ' mt-2'} value={form.supervisorName} onChange={(e) => set('supervisorName')(e.target.value)} placeholder={t('hr.form.reportsToNameOther') as string} />}
            <p className="mt-1 text-xs text-bodydark2">{t('hr.addendum.signerHint')}</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-bodydark2">{t('hr.addendum.nextStep')}</p>
      </div>

      <div className={CARD}>
        <label className={LABEL}>{t('hr.form.notes')}</label>
        <textarea rows={3} className={INPUT} value={form.notes} onChange={(e) => set('notes')(e.target.value)} placeholder={t('hr.form.notesPh') as string} />
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-md border border-stroke px-5 py-2.5 text-sm font-medium text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">{t('common.cancel')}</button>
        <button type="button" onClick={submit} disabled={saving || (mode === 'linked' && !form.parentId)} className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
          {saving ? t('hr.form.saving') : initial ? t('hr.form.save') : t('hr.addendum.create')}
        </button>
      </div>
    </div>
  );
};

export default AddendumForm;
