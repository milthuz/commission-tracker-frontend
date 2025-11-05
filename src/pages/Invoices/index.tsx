import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL;

interface Invoice {
  id: number;
  invoice_number: string;
  customer_name: string;
  invoice_date: string;
  due_date: string;
  total: number;
  balance: number;
  status: 'paid' | 'overdue' | 'pending' | 'draft' | 'void';
  sales_rep_name?: string;
  zoho_url: string;
}

interface InvoiceStats {
  total_invoices: number;
  paid_count: number;
  overdue_count: number;
  pending_count: number;
  total_amount: number;
  outstanding_balance: number;
}

const Invoices = () => {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch invoices
  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (searchTerm) params.append('search', searchTerm);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await axios.get(`${API_URL}/api/invoices?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setInvoices(response.data.invoices);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/invoices/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // Sync invoices from Zoho
  const handleSync = async () => {
    try {
      setSyncing(true);
      const token = localStorage.getItem('token');
      
      await axios.post(`${API_URL}/api/invoices/sync`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Refresh data
      await fetchInvoices();
      await fetchStats();
      
      alert('Invoices synced successfully!');
    } catch (error) {
      console.error('Error syncing invoices:', error);
      alert('Failed to sync invoices');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchStats();
  }, [statusFilter, startDate, endDate]);

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (searchTerm !== undefined) {
        fetchInvoices();
      }
    }, 500);

    return () => clearTimeout(delaySearch);
  }, [searchTerm]);

  const getStatusBadge = (status: string) => {
    const badges = {
      paid: 'bg-success text-white',
      overdue: 'bg-danger text-white',
      pending: 'bg-warning text-white',
      draft: 'bg-secondary text-white',
      void: 'bg-meta-1 text-white'
    };

    return (
      <span className={`rounded px-3 py-1 text-xs font-medium ${badges[status as keyof typeof badges] || 'bg-gray text-black'}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            Invoices
          </h2>
          <p className="text-sm text-body">Manage and track your invoices</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-center font-medium text-white hover:bg-opacity-90 disabled:bg-opacity-50"
        >
          {syncing ? (
            <>
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Syncing...
            </>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync from Zoho
            </>
          )}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-4 2xl:gap-7.5">
          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-meta-2 dark:bg-meta-4">
              <svg className="fill-primary dark:fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M21.1063 18.0469L19.3875 3.23126C19.2157 1.71876 17.9438 0.584381 16.3969 0.584381H5.56878C4.05628 0.584381 2.78441 1.71876 2.57816 3.23126L0.859406 18.0469C0.756281 18.9063 1.03128 19.7313 1.61566 20.3844C2.20003 21.0375 3.02816 21.3813 3.92191 21.3813H18.0157C18.8782 21.3813 19.7063 21.0031 20.2907 20.3844C20.875 19.7656 21.15 18.9063 21.1063 18.0469Z" />
              </svg>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <h4 className="text-title-md font-bold text-black dark:text-white">
                  {stats.total_invoices}
                </h4>
                <span className="text-sm font-medium">Total Invoices</span>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-success">
              <svg className="fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 0.5C5.20156 0.5 0.5 5.20156 0.5 11C0.5 16.7984 5.20156 21.5 11 21.5C16.7984 21.5 21.5 16.7984 21.5 11C21.5 5.20156 16.7984 0.5 11 0.5ZM14.9781 9.22656L10.2906 13.9141C10.1531 14.0516 9.97031 14.125 9.7875 14.125C9.60469 14.125 9.42188 14.0516 9.28438 13.9141L7.02188 11.6516C6.74688 11.3766 6.74688 10.9234 7.02188 10.6484C7.29688 10.3734 7.75 10.3734 8.025 10.6484L9.7875 12.4109L13.975 8.22344C14.25 7.94844 14.7031 7.94844 14.9781 8.22344C15.2531 8.49844 15.2531 8.95156 14.9781 9.22656Z" />
              </svg>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <h4 className="text-title-md font-bold text-black dark:text-white">
                  {stats.paid_count}
                </h4>
                <span className="text-sm font-medium">Paid</span>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-danger">
              <svg className="fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 0.5C5.20156 0.5 0.5 5.20156 0.5 11C0.5 16.7984 5.20156 21.5 11 21.5C16.7984 21.5 21.5 16.7984 21.5 11C21.5 5.20156 16.7984 0.5 11 0.5ZM14.2125 13.1656C14.4875 13.4406 14.4875 13.8937 14.2125 14.1687C14.075 14.3062 13.8922 14.375 13.7094 14.375C13.5266 14.375 13.3437 14.3062 13.2063 14.1687L11 11.9625L8.79375 14.1687C8.65625 14.3062 8.47344 14.375 8.29063 14.375C8.10781 14.375 7.925 14.3062 7.7875 14.1687C7.5125 13.8937 7.5125 13.4406 7.7875 13.1656L9.99375 10.9594L7.7875 8.75312C7.5125 8.47812 7.5125 8.025 7.7875 7.75C8.0625 7.475 8.51562 7.475 8.79063 7.75L11 9.95625L13.2063 7.75C13.4813 7.475 13.9344 7.475 14.2094 7.75C14.4844 8.025 14.4844 8.47812 14.2094 8.75312L11.9969 10.9594L14.2125 13.1656Z" />
              </svg>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <h4 className="text-title-md font-bold text-black dark:text-white">
                  {stats.overdue_count}
                </h4>
                <span className="text-sm font-medium">Overdue</span>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-warning">
              <svg className="fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 0.5C5.20156 0.5 0.5 5.20156 0.5 11C0.5 16.7984 5.20156 21.5 11 21.5C16.7984 21.5 21.5 16.7984 21.5 11C21.5 5.20156 16.7984 0.5 11 0.5ZM11.6875 15.125C11.6875 15.4687 11.4125 15.7438 11.0687 15.7438H10.9313C10.5875 15.7438 10.3125 15.4687 10.3125 15.125V10.3125C10.3125 9.96875 10.5875 9.69375 10.9313 9.69375H11.0687C11.4125 9.69375 11.6875 9.96875 11.6875 10.3125V15.125ZM11 8.25C10.4469 8.25 10 7.80312 10 7.25C10 6.69688 10.4469 6.25 11 6.25C11.5531 6.25 12 6.69688 12 7.25C12 7.80312 11.5531 8.25 11 8.25Z" />
              </svg>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <h4 className="text-title-md font-bold text-black dark:text-white">
                  {formatCurrency(Number(stats.outstanding_balance))}
                </h4>
                <span className="text-sm font-medium">Outstanding</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-4 rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark sm:flex-row sm:items-center">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by invoice # or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
        >
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="draft">Draft</option>
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          placeholder="Start Date"
          className="rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
        />

        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder="End Date"
          className="rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
        />
      </div>

      {/* Invoice Table */}
      <div className="rounded-sm border border-stroke bg-white px-5 pt-6 pb-2.5 shadow-default dark:border-strokedark dark:bg-boxdark sm:px-7.5 xl:pb-1">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full table-auto">
            <thead>
              <tr className="bg-gray-2 text-left dark:bg-meta-4">
                <th className="min-w-[150px] px-4 py-4 font-medium text-black dark:text-white">
                  Invoice #
                </th>
                <th className="min-w-[200px] px-4 py-4 font-medium text-black dark:text-white">
                  Customer
                </th>
                <th className="min-w-[120px] px-4 py-4 font-medium text-black dark:text-white">
                  Date
                </th>
                <th className="min-w-[120px] px-4 py-4 font-medium text-black dark:text-white">
                  Due Date
                </th>
                <th className="min-w-[120px] px-4 py-4 font-medium text-black dark:text-white">
                  Amount
                </th>
                <th className="min-w-[120px] px-4 py-4 font-medium text-black dark:text-white">
                  Balance
                </th>
                <th className="min-w-[120px] px-4 py-4 font-medium text-black dark:text-white">
                  Status
                </th>
                <th className="px-4 py-4 font-medium text-black dark:text-white">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-5">
                    <div className="flex justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
                    </div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5">
                    <p className="text-body">No invoices found. Click "Sync from Zoho" to import invoices.</p>
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-[#eee] dark:border-strokedark">
                    <td className="px-4 py-5">
                      <p className="text-black dark:text-white font-medium">
                        {invoice.invoice_number}
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      <p className="text-black dark:text-white">
                        {invoice.customer_name}
                      </p>
                      {invoice.sales_rep_name && (
                        <p className="text-sm text-body">Rep: {invoice.sales_rep_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-5">
                      <p className="text-black dark:text-white">
                        {formatDate(invoice.invoice_date)}
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      <p className="text-black dark:text-white">
                        {formatDate(invoice.due_date)}
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      <p className="text-black dark:text-white font-medium">
                        {formatCurrency(invoice.total)}
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      <p className="text-black dark:text-white font-medium">
                        {formatCurrency(invoice.balance)}
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td className="px-4 py-5">
                      <a
                        href={invoice.zoho_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-md border border-primary px-4 py-2 text-center font-medium text-primary hover:bg-opacity-90"
                      >
                        View in Zoho
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Invoices;
