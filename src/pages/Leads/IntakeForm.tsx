import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../components/Select';
import { authHeaders, LEAD_SOURCES, type DuplicateRecord } from './types';

const API_URL = import.meta.env.VITE_API_URL;

// Le formulaire que l'employé remplit PENDANT l'appel. Deux choix le distinguent d'un
// formulaire d'administration ordinaire :
//
// 1. La détection de doublon est ATTENDUE (le serveur ne répond qu'une fois Zoho interrogé).
//    On a la personne au bout du fil : « on vous connaît déjà, c'est Amy qui vous suit » vaut
//    largement la seconde d'attente, et l'inverse — créer un deuxième dossier pour un marchand
//    qui en a déjà un — coûte cher à réparer.
// 2. Le formulaire ne se ferme PAS tout seul après l'envoi. Il affiche le numéro de dossier à
//    citer au client, le représentant suggéré et les doublons trouvés. Se fermer d'un coup
//    escamoterait exactement ce que l'employé doit lire à voix haute.

const INPUT =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const LABEL = 'mb-2 block text-sm font-medium text-black dark:text-white';
const SELECT_CLS =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-left text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';

const PROVINCES = ['QC', 'ON', 'NB', 'NS', 'PE', 'NL', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU'];

interface Created {
  refCode: string;
  suggestion: { repName: string | null; via: string; ruleName: string | null };
  duplicate: { status: string | null; summary: string | null; records: DuplicateRecord[] } | null;
}

const IntakeForm = ({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) => {
  const { t } = useTranslation();
  const blank = {
    source: 'phone', sourceDetail: '',
    businessName: '', businessType: '', website: '',
    contactFirstName: '', contactLastName: '', contactTitle: '', contactEmail: '', contactPhone: '',
    city: '', province: 'QC', postalCode: '', language: 'fr',
    locationsCount: '', currentPos: '', timeline: '', notes: '',
  };
  const [form, setForm] = useState({ ...blank });
  const [interest, setInterest] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  if (!open) return null;

  const set = (k: keyof typeof blank) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const INTERESTS = ['pos', 'payments', 'both', 'hardware', 'other'];

  const reset = () => { setForm({ ...blank }); setInterest([]); setCreated(null); setError(null); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!form.businessName.trim()) { setError(t('leads.intake.businessRequired')); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/leads`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, interest, locationsCount: form.locationsCount || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'error');
      setCreated({ refCode: data.refCode, suggestion: data.suggestion, duplicate: data.duplicate });
      onCreated();
    } catch (e: any) {
      setError(e?.message || t('leads.intake.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !saving && close()} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative my-auto w-full max-w-3xl rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark"
      >
        <div className="flex items-start justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
          <div>
            <h3 className="text-lg font-semibold text-black dark:text-white">{t('leads.intake.title')}</h3>
            <p className="mt-0.5 text-sm text-bodydark2">{t('leads.intake.subtitle')}</p>
          </div>
          <button type="button" onClick={close} className="text-bodydark2 hover:text-black dark:hover:text-white" aria-label={t('common.close') as string}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Après l'envoi, le formulaire cède la place au compte rendu : numéro de dossier à citer,
            représentant suggéré, doublons trouvés. C'est ce que l'employé doit lire au client. */}
        {created ? (
          <div className="px-6 py-6">
            <div className="rounded-sm border border-success/40 bg-success/10 px-4 py-3">
              <p className="text-sm font-medium text-success">
                {t('leads.intake.created', { ref: created.refCode })}
              </p>
            </div>

            <div className="mt-5">
              <p className={LABEL}>{t('leads.intake.suggestedRep')}</p>
              <p className="text-sm text-black dark:text-white">
                {created.suggestion?.repName
                  ? <>
                      <strong>{created.suggestion.repName}</strong>
                      <span className="text-bodydark2">
                        {' · '}
                        {created.suggestion.via === 'rule'
                          ? t('leads.viaRule', { rule: created.suggestion.ruleName })
                          : t('leads.viaRotation')}
                      </span>
                    </>
                  : <span className="text-warning">{t('leads.intake.noRep')}</span>}
              </p>
              <p className="mt-1 text-xs text-bodydark2">{t('leads.intake.notYetInZoho')}</p>
            </div>

            {!!created.duplicate?.records?.length && (
              <div className="mt-5 rounded-sm border border-warning/50 bg-warning/10 px-4 py-3">
                <p className="text-sm font-medium text-warning">
                  {t('leads.duplicateFound', { n: created.duplicate.records.length })}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-black dark:text-white">
                  {created.duplicate.records.slice(0, 5).map((r) => (
                    <li key={`${r.module}-${r.id}`}>
                      <span className="font-medium">{r.company || r.id}</span>
                      <span className="text-bodydark2"> — {r.module} · {t(`leads.matchedOn.${r.matchedOn}`, { defaultValue: r.matchedOn })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={reset} className="rounded border border-stroke px-5 py-2.5 text-sm font-medium text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
                {t('leads.intake.another')}
              </button>
              <button type="button" onClick={close} className="rounded bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90">
                {t('common.done')}
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
            <p className="mb-4 text-xs uppercase tracking-wide text-bodydark2">{t('leads.intake.sectionBusiness')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={LABEL}>{t('leads.field.businessName')} *</label>
                <input className={INPUT} value={form.businessName} onChange={(e) => set('businessName')(e.target.value)} autoFocus />
              </div>
              <div>
                <label className={LABEL}>{t('leads.field.businessType')}</label>
                <input className={INPUT} value={form.businessType} onChange={(e) => set('businessType')(e.target.value)} placeholder={t('leads.field.businessTypePlaceholder') as string} />
              </div>
              <div>
                <label className={LABEL}>{t('leads.field.website')}</label>
                <input className={INPUT} value={form.website} onChange={(e) => set('website')(e.target.value)} />
              </div>
            </div>

            <p className="mb-4 mt-6 text-xs uppercase tracking-wide text-bodydark2">{t('leads.intake.sectionContact')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>{t('leads.field.firstName')}</label>
                <input className={INPUT} value={form.contactFirstName} onChange={(e) => set('contactFirstName')(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>{t('leads.field.lastName')}</label>
                <input className={INPUT} value={form.contactLastName} onChange={(e) => set('contactLastName')(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>{t('leads.field.phone')}</label>
                <input className={INPUT} value={form.contactPhone} onChange={(e) => set('contactPhone')(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>{t('leads.field.email')}</label>
                <input className={INPUT} type="email" value={form.contactEmail} onChange={(e) => set('contactEmail')(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>{t('leads.field.title')}</label>
                <input className={INPUT} value={form.contactTitle} onChange={(e) => set('contactTitle')(e.target.value)} />
              </div>
              <div>
                {/* La langue commande TOUT ce que le marchand recevra : c'est un champ de
                    correspondance, pas une préférence d'affichage. */}
                <label className={LABEL}>{t('leads.field.language')}</label>
                <Select
                  buttonClassName={SELECT_CLS}
                  value={form.language}
                  onChange={set('language')}
                  options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]}
                />
              </div>
            </div>

            <p className="mb-4 mt-6 text-xs uppercase tracking-wide text-bodydark2">{t('leads.intake.sectionLocation')}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={LABEL}>{t('leads.field.city')}</label>
                <input className={INPUT} value={form.city} onChange={(e) => set('city')(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>{t('leads.field.province')}</label>
                <Select buttonClassName={SELECT_CLS} value={form.province} onChange={set('province')} options={PROVINCES.map((p) => ({ value: p, label: p }))} />
              </div>
              <div>
                <label className={LABEL}>{t('leads.field.postalCode')}</label>
                <input className={INPUT} value={form.postalCode} onChange={(e) => set('postalCode')(e.target.value)} />
              </div>
            </div>

            <p className="mb-4 mt-6 text-xs uppercase tracking-wide text-bodydark2">{t('leads.intake.sectionQualification')}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={LABEL}>{t('leads.field.locationsCount')}</label>
                <input className={INPUT} type="number" min="0" value={form.locationsCount} onChange={(e) => set('locationsCount')(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>{t('leads.field.currentPos')}</label>
                <input className={INPUT} value={form.currentPos} onChange={(e) => set('currentPos')(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>{t('leads.field.timeline')}</label>
                <input className={INPUT} value={form.timeline} onChange={(e) => set('timeline')(e.target.value)} placeholder={t('leads.field.timelinePlaceholder') as string} />
              </div>
            </div>

            <div className="mt-4">
              <label className={LABEL}>{t('leads.field.interest')}</label>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((k) => {
                  const on = interest.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setInterest((cur) => (on ? cur.filter((x) => x !== k) : [...cur, k]))}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                        on ? 'bg-primary text-white' : 'bg-gray-2 text-bodydark2 hover:text-black dark:bg-meta-4 dark:hover:text-white'
                      }`}
                    >
                      {t(`leads.interest.${k}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <label className={LABEL}>{t('leads.field.notes')}</label>
              <textarea className={`${INPUT} min-h-[90px]`} value={form.notes} onChange={(e) => set('notes')(e.target.value)} placeholder={t('leads.field.notesPlaceholder') as string} />
            </div>

            <p className="mb-4 mt-6 text-xs uppercase tracking-wide text-bodydark2">{t('leads.intake.sectionSource')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>{t('leads.field.source')}</label>
                <Select
                  buttonClassName={SELECT_CLS}
                  value={form.source}
                  onChange={set('source')}
                  options={LEAD_SOURCES.filter((s) => s !== 'website').map((s) => ({ value: s, label: t(`leads.source.${s}`) as string }))}
                />
              </div>
              <div>
                <label className={LABEL}>{t('leads.field.sourceDetail')}</label>
                <input className={INPUT} value={form.sourceDetail} onChange={(e) => set('sourceDetail')(e.target.value)} placeholder={t('leads.field.sourceDetailPlaceholder') as string} />
              </div>
            </div>

            {error && (
              <div role="alert" className="mt-5 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={close} disabled={saving} className="rounded border border-stroke px-5 py-2.5 text-sm font-medium text-black hover:bg-gray-2 disabled:opacity-60 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
                {t('common.cancel')}
              </button>
              <button type="button" onClick={submit} disabled={saving} className="rounded bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
                {saving ? t('leads.intake.checking') : t('leads.intake.submit')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IntakeForm;
