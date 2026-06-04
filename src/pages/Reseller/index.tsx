import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

type Tab = 'activations' | 'payments';

// Empty/placeholder card shown until a data source is wired (phase 2/3).
function NotConnected({ source }: { source: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-dashed border-stroke p-10 text-center dark:border-strokedark">
      <p className="text-sm font-medium text-black dark:text-white">{t('reseller.notConnectedTitle')}</p>
      <p className="mt-1 text-sm text-body">{t('reseller.notConnectedDesc', { source })}</p>
    </div>
  );
}

export default function Reseller() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('activations');
  const [activations, setActivations] = useState<any>(null);
  const [residuals, setResiduals] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    axios.get(`${API_URL}/api/resellers/pos-activations`, { headers })
      .then((r) => setActivations(r.data)).catch(() => setActivations({ connected: false, activations: [] }));
    axios.get(`${API_URL}/api/resellers/residuals`, { headers })
      .then((r) => setResiduals(r.data)).catch(() => setResiduals({ connected: false, residuals: [] }));
  }, []);

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`border-b-2 px-4 py-3 text-sm font-medium ${
        tab === id
          ? 'border-primary text-primary'
          : 'border-transparent text-body hover:text-black dark:hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="mb-6">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">{t('reseller.title')}</h2>
        <p className="mt-1 text-sm text-body">{t('reseller.subtitle')}</p>
      </div>

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex gap-2 border-b border-stroke px-4 dark:border-strokedark">
          {tabBtn('activations', t('reseller.tabs.activations'))}
          {tabBtn('payments', t('reseller.tabs.payments'))}
        </div>

        <div className="p-6">
          {tab === 'activations' && (
            activations?.connected
              ? <div className="text-sm text-body">{/* phase 2: activations table */}</div>
              : <NotConnected source="Zoho Forms" />
          )}
          {tab === 'payments' && (
            residuals?.connected
              ? <div className="text-sm text-body">{/* phase 3: residuals table */}</div>
              : <NotConnected source="Zentact" />
          )}
        </div>
      </div>
    </>
  );
}
