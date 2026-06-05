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

function ActivationsTab({ data }: { data: any }) {
  const { t } = useTranslation();
  if (!data) return <p className="text-sm text-body">…</p>;
  if (!data.connected) return <NotConnected source="Zoho Forms" />;
  const activations = data.activations || [];
  const byReseller = data.byReseller || [];
  if (activations.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-stroke p-10 text-center dark:border-strokedark">
        <p className="text-sm font-medium text-black dark:text-white">{t('reseller.activations.emptyTitle')}</p>
        <p className="mt-1 text-sm text-body">{t('reseller.activations.emptyDesc')}</p>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {byReseller.map((r: any) => (
          <div key={r.reseller_name} className="rounded-md border border-stroke p-4 dark:border-strokedark">
            <p className="text-sm font-semibold text-black dark:text-white">{r.reseller_name}</p>
            <p className="mt-1 text-xs text-body">
              {r.locations} {t('reseller.activations.locations')} · {r.licenses} {t('reseller.activations.licenses')}
            </p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="bg-gray-2 text-left dark:bg-meta-4">
              <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.cols.reseller')}</th>
              <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.cols.customer')}</th>
              <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.cols.licenses')}</th>
              <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.cols.date')}</th>
            </tr>
          </thead>
          <tbody>
            {activations.map((a: any) => (
              <tr key={a.id} className="border-b border-stroke dark:border-strokedark">
                <td className="px-4 py-3 text-black dark:text-white">{a.reseller_name || '—'}</td>
                <td className="px-4 py-3 text-body">{a.customer_name || '—'}</td>
                <td className="px-4 py-3 text-body">{a.quantity}</td>
                <td className="px-4 py-3 text-body">{a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentsTab({ data }: { data: any }) {
  const { t } = useTranslation();
  if (!data) return <p className="text-sm text-body">…</p>;
  if (!data.connected) return <NotConnected source="Zentact" />;
  const byReseller = data.byReseller || [];
  const sales = data.sales || [];
  if (sales.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-stroke p-10 text-center dark:border-strokedark">
        <p className="text-sm font-medium text-black dark:text-white">{t('reseller.payments.emptyTitle')}</p>
        <p className="mt-1 text-sm text-body">{t('reseller.payments.emptyDesc')}</p>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {byReseller.map((r: any) => (
          <div key={r.reseller_name} className="rounded-md border border-stroke p-4 dark:border-strokedark">
            <p className="text-sm font-semibold text-black dark:text-white">{r.reseller_name}</p>
            <p className="mt-1 text-xs text-body">
              {r.merchants} {t('reseller.payments.merchants')} · {r.active} {t('reseller.payments.active')}
            </p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-sm">
          <thead>
            <tr className="bg-gray-2 text-left dark:bg-meta-4">
              <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.cols.reseller')}</th>
              <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.payments.merchant')}</th>
              <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.payments.status')}</th>
              <th className="px-4 py-3 font-medium text-black dark:text-white">{t('reseller.payments.activatedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s: any, i: number) => (
              <tr key={i} className="border-b border-stroke dark:border-strokedark">
                <td className="px-4 py-3 text-black dark:text-white">{s.reseller_name}</td>
                <td className="px-4 py-3 text-body">{s.business_name || '—'}</td>
                <td className="px-4 py-3 text-body">{s.status || '—'}</td>
                <td className="px-4 py-3 text-body">{s.activated_at ? new Date(s.activated_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
          {tab === 'activations' && <ActivationsTab data={activations} />}
          {tab === 'payments' && <PaymentsTab data={residuals} />}
        </div>
      </div>
    </>
  );
}
