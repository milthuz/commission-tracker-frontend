import { useEffect, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

// Administration de la bibliothèque de contenu de La Passe (perm `pass:manage`).
// Sous-onglet de la page « La Passe » plutôt qu'un nouveau menu latéral : c'est la
// convention du produit, qui n'imbrique jamais ses menus.
//
// Le membre voit la bibliothèque dans SA langue, donc les deux titres sont exigés — un
// titre manquant laisserait un anglophone devant une ligne vide. Le serveur le revalide.

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-production-b7f9.up.railway.app';
const MAX_BYTES = 10 * 1024 * 1024;

interface Resource {
  id: number;
  title_fr: string;
  title_en: string;
  meta_fr: string;
  meta_en: string;
  file_name: string;
  file_size: number;
  sort_order: number;
}

const PassLibraryAdmin = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Resource[] | null>(null);
  const [form, setForm] = useState({ titleFr: '', titleEn: '', metaFr: '', metaEn: '', sortOrder: '0' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const load = async () => {
    try {
      const r = await fetch(`${API_URL}/api/admin/pass/resources`, { headers: auth() });
      setRows(r.ok ? (await r.json()).resources || [] : []);
    } catch {
      setRows([]);
    }
  };
  useEffect(() => { load(); }, []);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.titleFr.trim() || !form.titleEn.trim()) { setError(t('passOps.lib.titlesRequired')); return; }
    if (!file) { setError(t('passOps.lib.fileRequired')); return; }
    // Contrôlé ici AUSSI : sans ça, un fichier de 40 Mo se téléverse en entier avant que le
    // serveur ne le refuse — plusieurs minutes d'attente pour un refus prévisible.
    if (file.size > MAX_BYTES) { setError(t('passOps.lib.tooLarge')); return; }

    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('file', file);
      const r = await fetch(`${API_URL}/api/admin/pass/resources`, { method: 'POST', headers: auth(), body: fd });
      if (!r.ok) throw new Error();
      setForm({ titleFr: '', titleEn: '', metaFr: '', metaEn: '', sortOrder: '0' });
      setFile(null);
      (document.getElementById('lib-file') as HTMLInputElement | null)?.value && ((document.getElementById('lib-file') as HTMLInputElement).value = '');
      await load();
    } catch {
      setError(t('passOps.lib.failed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Resource) => {
    if (!window.confirm(t('passOps.lib.confirmDelete', { title: r.title_fr }))) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/pass/resources/${r.id}`, { method: 'DELETE', headers: auth() });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError(t('passOps.lib.failed'));
    }
  };

  const kb = (n: number) => `${Math.max(1, Math.round((n || 0) / 1024))} ko`;
  const input =
    'mt-1.5 w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4';
  const label = 'block text-sm font-medium text-black dark:text-white';

  return (
    <>
      <div className="mb-5 rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="text-lg font-semibold text-black dark:text-white">{t('passOps.lib.title')}</h3>
        <p className="mt-1 max-w-[80ch] text-sm text-bodydark2">{t('passOps.lib.sub')}</p>

        <form onSubmit={submit} className="mt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="lib-tfr" className={label}>{t('passOps.lib.titleFr')}</label>
              <input id="lib-tfr" value={form.titleFr} onChange={set('titleFr')} className={input} />
            </div>
            <div>
              <label htmlFor="lib-ten" className={label}>{t('passOps.lib.titleEn')}</label>
              <input id="lib-ten" value={form.titleEn} onChange={set('titleEn')} className={input} />
            </div>
            <div>
              <label htmlFor="lib-mfr" className={label}>{t('passOps.lib.metaFr')}</label>
              <input id="lib-mfr" value={form.metaFr} onChange={set('metaFr')} placeholder={t('passOps.lib.metaHint')} className={input} />
            </div>
            <div>
              <label htmlFor="lib-men" className={label}>{t('passOps.lib.metaEn')}</label>
              <input id="lib-men" value={form.metaEn} onChange={set('metaEn')} placeholder={t('passOps.lib.metaHint')} className={input} />
            </div>
            <div>
              <label htmlFor="lib-file" className={label}>{t('passOps.lib.file')}</label>
              <input id="lib-file" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-1.5 w-full cursor-pointer rounded border border-stroke bg-transparent px-4 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white dark:border-strokedark" />
            </div>
            <div>
              <label htmlFor="lib-order" className={label}>{t('passOps.lib.order')}</label>
              <input id="lib-order" type="number" value={form.sortOrder} onChange={set('sortOrder')} className={input} />
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy}
            className="mt-5 inline-flex items-center gap-2 rounded bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {busy ? t('passOps.lib.adding') : t('passOps.lib.add')}
          </button>
        </form>
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] table-auto">
            <thead>
              <tr className="bg-gray-2 text-left dark:bg-meta-4">
                <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('passOps.lib.titleFr')}</th>
                <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('passOps.lib.titleEn')}</th>
                <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('passOps.lib.file')}</th>
                <th className="whitespace-nowrap px-4 py-4 text-sm font-medium text-black dark:text-white">{t('passOps.lib.order')}</th>
                <th className="sticky right-0 bg-gray-2 px-4 py-4 dark:bg-meta-4" />
              </tr>
            </thead>
            <tbody>
              {rows?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-bodydark2">
                    {t('passOps.lib.empty')}
                  </td>
                </tr>
              )}
              {rows?.map((r) => (
                <tr key={r.id} className="border-t border-stroke dark:border-strokedark">
                  <td className="px-4 py-4">
                    <p className="font-medium text-black dark:text-white">{r.title_fr}</p>
                    {!!r.meta_fr && <p className="mt-0.5 text-xs text-bodydark2">{r.meta_fr}</p>}
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-black dark:text-white">{r.title_en}</p>
                    {!!r.meta_en && <p className="mt-0.5 text-xs text-bodydark2">{r.meta_en}</p>}
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <span className="block max-w-[26ch] truncate text-black dark:text-white">{r.file_name}</span>
                    <span className="mt-0.5 block whitespace-nowrap text-xs text-bodydark2">{kb(r.file_size)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-black dark:text-white">{r.sort_order}</td>
                  <td className="sticky right-0 bg-white px-4 py-4 text-right dark:bg-boxdark">
                    <button type="button" onClick={() => remove(r)}
                      className="whitespace-nowrap rounded border border-stroke px-3 py-1.5 text-xs font-medium hover:border-danger hover:text-danger dark:border-strokedark">
                      {t('passOps.lib.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default PassLibraryAdmin;
