import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL, authHeaders, employerLogoUrl, type Employer } from './types';

// Employeurs du contrat. Cluster est intégré (non modifiable) ; les autres (OSP…) s'ajoutent
// ici avec leur nom légal, leur nom court, leur site et leur logo. Le contrat, la page de
// signature et les courriels au candidat passent alors au nom et au logo de l'employeur choisi
// dans la fiche. Un employeur est figé dans un dossier au moment de l'envoi.

const INPUT =
  'w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';

// `logo` : undefined = inchangé (le serveur garde l'existant), null = retiré, string = nouveau.
type Row = { key?: string; legalName: string; shortName: string; website: string; hasLogo: boolean; logo?: string | null };

const MAX_LOGO = 600 * 1024;

const EmployersEditor = ({ initial, onSaved }: { initial: Employer[]; onSaved: (list: Employer[]) => void }) => {
  const { t } = useTranslation();
  const builtIn = initial.filter((e) => e.builtIn);
  const [rows, setRows] = useState<Row[]>(initial.filter((e) => !e.builtIn).map((e) => ({ key: e.key, legalName: e.legalName, shortName: e.shortName, website: e.website, hasLogo: e.hasLogo })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const pickLogo = (i: number, file: File) => {
    setError(null);
    if (!/^image\/(png|jpeg)$/.test(file.type)) { setError(t('hr.employers.logoType') as string); return; }
    if (file.size > MAX_LOGO) { setError(t('hr.employers.logoSize') as string); return; }
    const reader = new FileReader();
    reader.onload = () => set(i, { logo: String(reader.result), hasLogo: true });
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/hr/employers`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ employers: rows.filter((r) => r.legalName.trim() || r.shortName.trim()).map(({ hasLogo, ...r }) => r) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'error');
      onSaved(data.employers);
    } catch (e: any) {
      setError(`${t('hr.managers.saveFailed')} ${e?.message || ''}`);
    } finally { setSaving(false); }
  };

  // Nouveau logo choisi = aperçu local ; logo déjà enregistré = URL publique ; retiré = rien.
  const logoPreview = (r: Row) => (typeof r.logo === 'string' ? r.logo : r.hasLogo && r.key && r.logo !== null ? employerLogoUrl(r.key) : null);

  return (
    <div className="mb-5 rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark sm:p-6">
      <h3 className="font-semibold text-black dark:text-white">{t('hr.employers.title')}</h3>
      <p className="mb-4 mt-1 text-sm text-bodydark2">{t('hr.employers.hint')}</p>

      {builtIn.map((e) => (
        <div key={e.key} className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-stroke bg-gray-2 px-4 py-3 text-sm dark:border-strokedark dark:bg-meta-4">
          <span className="text-black dark:text-white"><b>{e.shortName}</b> — {e.legalName} · {e.website}</span>
          <span className="text-xs text-bodydark2">{t('hr.employers.builtIn')}</span>
        </div>
      ))}

      <div className="space-y-3">
        {rows.map((r, i) => {
          const preview = logoPreview(r);
          return (
            <div key={i} className="grid gap-3 rounded border border-stroke p-3 dark:border-strokedark md:grid-cols-[1fr_1.4fr_1fr_auto_auto] md:items-end">
              <div>
                <label className="mb-1 block text-xs font-medium text-bodydark2">{t('hr.employers.shortName')}</label>
                <input className={INPUT} value={r.shortName} onChange={(e) => set(i, { shortName: e.target.value })} placeholder="OSP" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-bodydark2">{t('hr.employers.legalName')}</label>
                <input className={INPUT} value={r.legalName} onChange={(e) => set(i, { legalName: e.target.value })} placeholder={t('hr.employers.legalNamePh') as string} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-bodydark2">{t('hr.employers.website')}</label>
                <input className={INPUT} value={r.website} onChange={(e) => set(i, { website: e.target.value })} placeholder="exemple.com" />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-24 items-center justify-center overflow-hidden rounded border border-stroke bg-white dark:border-strokedark">
                  {preview ? <img src={preview} alt="" className="max-h-9 max-w-[88px] object-contain" /> : <span className="text-[11px] text-bodydark2">{t('hr.employers.noLogo')}</span>}
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
                    {t('hr.employers.pickLogo')}
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && pickLogo(i, e.target.files[0])} />
                  </label>
                  {preview && <button type="button" className="text-left text-xs text-danger hover:underline" onClick={() => set(i, { logo: null, hasLogo: false })}>{t('common.remove')}</button>}
                </div>
              </div>
              <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                className="justify-self-end rounded px-2 py-1 text-bodydark2 hover:text-danger" aria-label={t('common.remove') as string}>✕</button>
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => setRows((x) => [...x, { legalName: '', shortName: '', website: '', hasLogo: false }])}
        className="mt-3 text-sm font-medium text-primary hover:underline">+ {t('hr.employers.add')}</button>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={save} disabled={saving} className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
};

export default EmployersEditor;
