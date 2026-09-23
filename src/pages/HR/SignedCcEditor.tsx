import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL, authHeaders } from './types';

// « Toujours en copie du dossier signé » : ces adresses (ex. Jen) reçoivent le PDF signé de
// CHAQUE embauche, en plus du gestionnaire du poste (son courriel est dans la liste des
// gestionnaires). Ils ne reçoivent jamais le lien de signature du candidat.

const INPUT =
  'w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const SignedCcEditor = () => {
  const { t } = useTranslation();
  const [list, setList] = useState<string[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/hr/signed-cc`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setList(d.recipients || []))
      .catch(() => setList([]));
  }, []);

  const save = async (next: string[]) => {
    setError(null); setSaved(false);
    const res = await fetch(`${API_URL}/api/hr/signed-cc`, {
      method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ emails: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(`${t('hr.managers.saveFailed')} ${data?.error || ''}`); return; }
    setList(data.recipients); setSaved(true);
  };

  const add = () => {
    const e = draft.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) { setError(t('hr.signedCc.invalid') as string); return; }
    if (list?.includes(e)) { setDraft(''); return; }
    setDraft('');
    save([...(list || []), e]);
  };

  return (
    <div className="mb-5 rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark sm:p-6">
      <h3 className="font-semibold text-black dark:text-white">{t('hr.signedCc.title')}</h3>
      <p className="mb-4 mt-1 text-sm text-bodydark2">{t('hr.signedCc.hint')}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(list || []).map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5 rounded-full bg-gray-2 px-3 py-1 text-sm text-black dark:bg-meta-4 dark:text-white">
            {e}
            <button type="button" onClick={() => save((list || []).filter((x) => x !== e))} className="text-bodydark2 hover:text-danger" aria-label={t('common.remove') as string}>✕</button>
          </span>
        ))}
        {list && !list.length && <span className="text-sm text-bodydark2">{t('hr.signedCc.empty')}</span>}
      </div>
      <div className="flex max-w-md gap-2">
        <input type="email" className={INPUT} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="jen@clustersystems.com" />
        <button type="button" onClick={add} className="whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90">{t('hr.signedCc.add')}</button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {saved && !error && <p className="mt-2 text-sm text-success">{t('hr.signedCc.saved')}</p>}
    </div>
  );
};

export default SignedCcEditor;
