import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentLoader } from '../../common/Loader';
import ManagersEditor from '../HR/ManagersEditor';
import EmployersEditor from '../HR/EmployersEditor';
import SignedCcEditor from '../HR/SignedCcEditor';
import { API_URL, authHeaders, type Employer, type Manager } from '../HR/types';

// Admin → RH (perm hr:manage) : les RÉGLAGES de la section Embauches. Même partage que les
// pistes : le travail quotidien (dossiers d'embauche) vit dans le menu principal, la
// configuration ici :
//   - les gestionnaires (« Relève de » / « Superviseur ») avec titres FR/EN et courriel — le
//     gestionnaire du poste reçoit une copie du dossier signé ;
//   - « Toujours en copie du dossier signé » (ex. Jen) ;
//   - les employeurs du contrat (Cluster intégré, OSP…) avec nom légal et logo.
// Les avis RH (candidat signé, refusé…) restent aussi dans Admin → Notifications.

const HrAdmin = () => {
  const { t } = useTranslation();
  const [managers, setManagers] = useState<Manager[] | null>(null);
  const [employers, setEmployers] = useState<Employer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/hr/managers`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch(`${API_URL}/api/hr/employers`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
    ])
      .then(([m, e]) => { setManagers(m.managers || []); setEmployers(e.employers || []); })
      .catch(() => setError(t('hr.loadFailed') as string));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  if (error) return <div className="rounded border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>;
  if (!managers || !employers) return <ContentLoader />;

  return (
    <>
      {saved && <div className="mb-4 rounded border border-success/40 bg-success/5 px-4 py-3 text-sm text-black dark:text-white">{saved}</div>}
      <ManagersEditor
        key={`m-${JSON.stringify(managers)}`}
        initial={managers}
        onSaved={(list) => { setManagers(list); setSaved(t('hr.managers.saved') as string); }}
      />
      <SignedCcEditor />
      <EmployersEditor
        key={`e-${JSON.stringify(employers)}`}
        initial={employers}
        onSaved={(list) => { setEmployers(list); setSaved(t('hr.employers.saved') as string); }}
      />
    </>
  );
};

export default HrAdmin;
