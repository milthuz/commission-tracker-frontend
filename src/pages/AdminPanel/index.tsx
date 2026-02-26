import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import packageJson from '../../../package.json';

const API_URL = import.meta.env.VITE_API_URL;

interface Salesperson {
  name: string;
  isActive: boolean;
  commissionRate: number;
  invoiceCount: number;
}

interface Release {
  id: number;
  version: string;
  name: string;
  notes: string;
  date: string;
  url: string;
}

interface ExcludedCustomer {
  id: number;
  customer_name: string;
  excluded_by: string;
  created_at: string;
}

interface CustomerSearchResult {
  name: string;
  invoiceCount: number;
  totalSpent: number;
}

const AdminPanel = () => {
  useAuth();
  const navigate = useNavigate();
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<any>(null);
  const location = useLocation();
  const pathParts = location.pathname.split('/');
  const activeTab = pathParts[2] || 'sync'; // /admin/sync, /admin/salespeople, etc.

  // Release management state
  const [releases, setReleases] = useState<Release[]>([]);
  const [newVersion, setNewVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [releaseStatus, setReleaseStatus] = useState<string | null>(null);
  const [_workflowStatus, setWorkflowStatus] = useState<any>(null);
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [commitCount, setCommitCount] = useState(0);
  const [sinceTag, setSinceTag] = useState('');

  // Excluded customers state
  const [excludedCustomers, setExcludedCustomers] = useState<ExcludedCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const adminStatus = payload.isAdmin || false;
        setIsAdmin(adminStatus);
        
        if (!adminStatus) {
          // Not admin, redirect to dashboard
          navigate('/');
        }
      } catch (error) {
        console.error('Error decoding token:', error);
        navigate('/');
      }
    }
  }, [navigate]);

  // Fetch all salespeople
  const fetchSalespeople = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await axios.get(`${API_URL}/api/salespeople/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSalespeople(response.data.salespeople || []);
    } catch (error) {
      console.error('Error fetching salespeople:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchSalespeople();
      fetchSyncStatus();
      fetchReleases();
      fetchExcludedCustomers();
    }
  }, [isAdmin]);

  // Fetch excluded customers
  const fetchExcludedCustomers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/excluded-customers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setExcludedCustomers(response.data.excludedCustomers || []);
    } catch (err) {
      console.error('Error fetching excluded customers:', err);
    }
  };

  // Search customers API call
  const doCustomerSearch = async (query: string) => {
    if (query.length < 2) {
      setCustomerResults([]);
      return;
    }
    try {
      setSearchingCustomers(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/customers/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustomerResults(response.data.customers || []);
    } catch (err) {
      console.error('Error searching customers:', err);
    } finally {
      setSearchingCustomers(false);
    }
  };

  // Exclude a customer
  const excludeCustomer = async (name: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/excluded-customers`,
        { customerName: name },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchExcludedCustomers();
      setCustomerSearch('');
      setCustomerResults([]);
    } catch (err) {
      console.error('Error excluding customer:', err);
    }
  };

  // Re-include a customer
  const reincludeCustomer = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/excluded-customers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchExcludedCustomers();
    } catch (err) {
      console.error('Error re-including customer:', err);
    }
  };

  // Debounce customer search
  useEffect(() => {
    if (customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(() => {
      doCustomerSearch(customerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  // Fetch releases from GitHub
  const fetchReleases = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/releases`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReleases(response.data.releases || []);

      // Suggest next version based on latest
      if (response.data.releases?.length > 0) {
        const latest = response.data.releases[0].version.replace('v', '');
        const parts = latest.split('.').map(Number);
        parts[2] = (parts[2] || 0) + 1;
        setNewVersion(parts.join('.'));
      } else {
        // Fallback to package.json version + 1
        const parts = packageJson.version.split('.').map(Number);
        parts[2] = (parts[2] || 0) + 1;
        setNewVersion(parts.join('.'));
      }
    } catch (err) {
      console.error('Error fetching releases:', err);
    }
  };

  // Auto-generate release notes from commits
  const generateNotes = async () => {
    try {
      setGeneratingNotes(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/releases/generate-notes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReleaseNotes(response.data.notes || '');
      setCommitCount(response.data.commitCount || 0);
      setSinceTag(response.data.sinceTag || '');
    } catch (err) {
      console.error('Error generating notes:', err);
      setReleaseNotes('## ✨ New Features\n- \n\n## 🎨 UI Improvements\n- \n\n## 🔧 Bug Fixes\n- \n');
    } finally {
      setGeneratingNotes(false);
    }
  };

  // Open release form and auto-generate notes
  const openReleaseForm = async () => {
    setShowReleaseForm(true);
    await generateNotes();
  };

  // Push a new release
  const pushRelease = async () => {
    if (!newVersion.trim() || !releaseNotes.trim()) {
      alert('Please enter a version number and release notes.');
      return;
    }
    if (!confirm(`Push release v${newVersion}? This will:\n\n• Bump package.json to v${newVersion}\n• Create a git tag\n• Create a GitHub Release\n• Trigger Netlify deployment\n\nContinue?`)) return;

    try {
      setReleaseStatus('pushing');
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/releases/create`,
        { version: newVersion, releaseNotes },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setReleaseStatus('triggered');
      setShowReleaseForm(false);
      setReleaseNotes('');

      // Poll workflow status
      const pollInterval = setInterval(async () => {
        try {
          const token = localStorage.getItem('token');
          const statusRes = await axios.get(`${API_URL}/api/releases/workflow-status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setWorkflowStatus(statusRes.data);
          if (statusRes.data.status === 'completed') {
            clearInterval(pollInterval);
            setReleaseStatus(statusRes.data.conclusion === 'success' ? 'success' : 'failed');
            fetchReleases();
            setTimeout(() => setReleaseStatus(null), 8000);
          }
        } catch (e) { /* keep polling */ }
      }, 10000);

      // Stop polling after 10 minutes
      setTimeout(() => clearInterval(pollInterval), 600000);
    } catch (err: any) {
      console.error('Release error:', err);
      setReleaseStatus('error');
      alert(err.response?.data?.error || 'Failed to create release');
      setTimeout(() => setReleaseStatus(null), 5000);
    }
  };

  // Fetch sync status
  const fetchSyncStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/sync/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSyncInfo(response.data);
      if (response.data.syncStatus === 'syncing') {
        setSyncStatus('bulk_started');
        startPolling();
      }
    } catch (err) {
      console.error('Error fetching sync status:', err);
    }
  };

  // Poll for sync completion
  const startPolling = () => {
    const pollInterval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const statusRes = await axios.get(`${API_URL}/api/sync/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSyncInfo(statusRes.data);
        if (statusRes.data.syncStatus !== 'syncing') {
          clearInterval(pollInterval);
          setSyncStatus('bulk_done');
          fetchSalespeople();
          setTimeout(() => setSyncStatus(null), 5000);
        }
      } catch (e) { /* keep polling */ }
    }, 15000);
  };

  // Full bulk import
  const triggerBulkImport = async () => {
    if (!confirm('This will re-import ALL invoices from Zoho Books. This runs in the background and may take 10-20 minutes. Continue?')) return;
    try {
      setSyncStatus('bulk_importing');
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/invoices/bulk-import`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.status === 'already_syncing') {
        setSyncStatus('already_syncing');
        setTimeout(() => setSyncStatus(null), 3000);
      } else {
        setSyncStatus('bulk_started');
        startPolling();
      }
    } catch (err) {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(null), 3000);
    }
  };

  // Quick incremental sync
  const triggerQuickSync = async () => {
    try {
      setSyncStatus('syncing');
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/invoices/incremental-sync`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.needsBulkImport) {
        setSyncStatus('needs_import');
        setTimeout(() => setSyncStatus(null), 3000);
      } else {
        setSyncStatus(`done_${response.data.totalSynced || 0}`);
        fetchSyncStatus();
        fetchSalespeople();
        setTimeout(() => setSyncStatus(null), 3000);
      }
    } catch (err) {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(null), 3000);
    }
  };

  // Format date helper
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleString();
  };

  // Toggle salesperson active status
  const toggleSalesperson = async (name: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem('token');
      
      await axios.put(
        `${API_URL}/api/salespeople/${encodeURIComponent(name)}/status`,
        { isActive: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSalespeople(prev =>
        prev.map(person =>
          person.name === name
            ? { ...person, isActive: !currentStatus }
            : person
        )
      );
    } catch (error) {
      console.error('Error updating salesperson status:', error);
      alert('Failed to update salesperson status');
    }
  };

  const updateCommissionRate = async (name: string, rate: number) => {
    try {
      const token = localStorage.getItem('token');
      
      await axios.put(
        `${API_URL}/api/salespeople/${encodeURIComponent(name)}/commission-rate`,
        { commissionRate: rate },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSalespeople(prev =>
        prev.map(person =>
          person.name === name
            ? { ...person, commissionRate: rate }
            : person
        )
      );
    } catch (error) {
      console.error('Error updating commission rate:', error);
      alert('Failed to update commission rate');
    }
  };

  // Filter salespeople by search
  const filteredSalespeople = salespeople
    .filter(person => person.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));

  const activePeople = filteredSalespeople.filter(p => p.isActive);
  const inactivePeople = filteredSalespeople.filter(p => !p.isActive);

  if (!isAdmin) {
    return null; // Will redirect via useEffect
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            {activeTab === 'sync' ? 'Zoho Books Sync' :
             activeTab === 'salespeople' ? 'Manage Salespeople' :
             activeTab === 'customers' ? 'Customers' :
             activeTab === 'releases' ? 'Release Management' :
             'Admin Panel'}
          </h2>
          <p className="text-sm text-body">
            {activeTab === 'sync' ? 'Import and sync invoices from Zoho Books' :
             activeTab === 'salespeople' ? 'Toggle salespeople on/off to control who appears in invoice filters and commission reports' :
             activeTab === 'customers' ? 'Exclude customers from appearing in the dashboard Top Customers list' :
             activeTab === 'releases' ? `Current version: v${packageJson.version}` :
             'Manage system settings and configurations'}
          </p>
        </div>
        {activeTab === 'releases' && (
          <button
            onClick={showReleaseForm ? () => setShowReleaseForm(false) : openReleaseForm}
            className="inline-flex items-center gap-2 rounded-md bg-[#8B5CF6] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            New Release
          </button>
        )}
      </div>

      {/* Content */}
          {activeTab === 'sync' && (
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <h3 className="text-lg font-semibold text-black dark:text-white">Zoho Books Sync</h3>
                <p className="text-sm text-body mt-1">Import and sync invoices from Zoho Books</p>
              </div>
              <div className="p-7">
                {/* Sync Status Info */}
                <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs font-medium uppercase text-body">Status</p>
                    <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                      {syncInfo?.syncStatus === 'syncing' ? (
                        <span className="inline-flex items-center gap-1.5 text-warning">
                          <span className="h-2 w-2 rounded-full bg-warning animate-pulse"></span>
                          Syncing...
                        </span>
                      ) : syncInfo?.syncStatus === 'error' ? (
                        <span className="text-danger">Error</span>
                      ) : (
                        <span className="text-success">Idle</span>
                      )}
                    </p>
                  </div>
                  <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs font-medium uppercase text-body">Invoices in Database</p>
                    <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                      {syncInfo?.totalInvoicesInDb?.toLocaleString() || '—'}
                    </p>
                  </div>
                  <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs font-medium uppercase text-body">Last Sync</p>
                    <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                      {formatDate(syncInfo?.lastIncrementalSync || syncInfo?.lastFullSync)}
                    </p>
                  </div>
                </div>

                {/* Sync Buttons */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={triggerBulkImport}
                    disabled={syncStatus === 'bulk_importing' || syncStatus === 'bulk_started' || syncStatus === 'syncing'}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
                  >
                    <svg className={`h-4 w-4 ${syncStatus === 'bulk_started' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {syncStatus === 'bulk_started' ? 'Importing...' :
                     syncStatus === 'bulk_importing' ? 'Starting...' :
                     syncStatus === 'already_syncing' ? 'Already running' :
                     syncStatus === 'bulk_done' ? '✓ Import complete' :
                     'Full Import'}
                  </button>

                  <button
                    onClick={triggerQuickSync}
                    disabled={syncStatus === 'syncing' || syncStatus === 'bulk_started'}
                    className="inline-flex items-center gap-2 rounded-md border border-stroke bg-white px-5 py-2.5 text-sm font-medium text-black shadow-sm hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:text-white dark:hover:bg-meta-4 disabled:opacity-50"
                  >
                    <svg className={`h-4 w-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {syncStatus === 'syncing' ? 'Syncing...' :
                     syncStatus?.startsWith('done_') ? `✓ ${syncStatus.split('_')[1]} synced` :
                     syncStatus === 'needs_import' ? 'Run Full Import first' :
                     syncStatus === 'error' ? 'Sync failed' :
                     'Quick Sync'}
                  </button>

                  <button
                    onClick={fetchSyncStatus}
                    className="inline-flex items-center gap-2 rounded-md border border-stroke bg-white px-5 py-2.5 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4"
                  >
                    Refresh Status
                  </button>
                </div>

                {syncStatus === 'bulk_started' && (
                  <div className="mt-4 rounded-md bg-warning bg-opacity-10 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-warning border-t-transparent"></div>
                      <p className="text-sm font-medium text-warning">
                        Full import is running in the background. This may take 10-20 minutes. You can leave this page — the import will continue.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== SALESPEOPLE ==================== */}
          {activeTab === 'salespeople' && (
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <h3 className="text-lg font-semibold text-black dark:text-white">Manage Salespeople</h3>
                <p className="text-sm text-body mt-1">Toggle salespeople on/off to control who appears in invoice filters and commission reports</p>
              </div>

              {/* Stats Row */}
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <div className="flex flex-wrap gap-6">
                  <div>
                    <span className="text-2xl font-bold text-black dark:text-white">{salespeople.length}</span>
                    <span className="ml-2 text-sm text-body">Total</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-success">{activePeople.length}</span>
                    <span className="ml-2 text-sm text-body">Active</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-danger">{inactivePeople.length}</span>
                    <span className="ml-2 text-sm text-body">Inactive</span>
                  </div>
                </div>
              </div>

              {/* Search Bar */}
              <div className="px-7 py-4 border-b border-stroke dark:border-strokedark">
                <input
                  type="text"
                  placeholder="Search salespeople..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
                </div>
              ) : (
                <div className="p-7">
                  <div className="max-h-[600px] overflow-y-auto">
                    <table className="w-full table-auto">
                      <thead>
                        <tr className="bg-gray-2 text-left dark:bg-meta-4">
                          <th className="px-4 py-4 font-medium text-black dark:text-white">Name</th>
                          <th className="px-4 py-4 font-medium text-black dark:text-white">Invoices</th>
                          <th className="px-4 py-4 font-medium text-black dark:text-white">Commission %</th>
                          <th className="px-4 py-4 font-medium text-black dark:text-white">Status</th>
                          <th className="px-4 py-4 font-medium text-black dark:text-white">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSalespeople.map((person) => (
                          <tr key={person.name} className="border-b border-stroke dark:border-strokedark">
                            <td className="px-4 py-5">
                              <p className="text-black dark:text-white">{person.name}</p>
                            </td>
                            <td className="px-4 py-5">
                              <p className="text-body">{person.invoiceCount} invoices</p>
                            </td>
                            <td className="px-4 py-5">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  defaultValue={person.commissionRate}
                                  onBlur={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val !== person.commissionRate) {
                                      updateCommissionRate(person.name, val);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                  }}
                                  className={`w-16 rounded border border-stroke bg-transparent px-2 py-1 text-center text-sm font-medium outline-none transition focus:border-primary dark:border-form-strokedark dark:bg-form-input ${
                                    person.commissionRate !== 10 ? 'text-[#8B5CF6] border-[#8B5CF6] border-opacity-50' : 'text-black dark:text-white'
                                  }`}
                                />
                                <span className="text-xs text-body">%</span>
                                {person.commissionRate !== 10 && (
                                  <span className="text-xs text-[#8B5CF6] font-medium">Override</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-5">
                              {person.isActive ? (
                                <span className="inline-flex rounded-full bg-success bg-opacity-10 px-3 py-1 text-sm font-medium text-success">Active</span>
                              ) : (
                                <span className="inline-flex rounded-full bg-danger bg-opacity-10 px-3 py-1 text-sm font-medium text-danger">Inactive</span>
                              )}
                            </td>
                            <td className="px-4 py-5">
                              <button
                                onClick={() => toggleSalesperson(person.name, person.isActive)}
                                className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-center text-sm font-medium transition ${
                                  person.isActive
                                    ? 'bg-danger text-white hover:bg-opacity-90'
                                    : 'bg-success text-white hover:bg-opacity-90'
                                }`}
                              >
                                {person.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredSalespeople.length === 0 && (
                      <div className="py-12 text-center">
                        <p className="text-body">No salespeople found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== CUSTOMER EXCLUSIONS ==================== */}
          {activeTab === 'customers' && (
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <h3 className="text-lg font-semibold text-black dark:text-white">Top Customers — Exclusions</h3>
                <p className="text-sm text-body mt-1">Exclude customers from appearing in the dashboard Top Customers list</p>
              </div>
              <div className="p-7">
                {/* Search to add exclusion */}
                <div className="mb-5 relative">
                  <label className="mb-2 block text-sm font-medium text-black dark:text-white">
                    Search & Exclude a Customer
                  </label>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Type customer name to search..."
                    className="w-full rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
                  />
                  {searchingCustomers && (
                    <div className="absolute right-4 top-[42px]">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    </div>
                  )}

                  {/* Search Results Dropdown */}
                  {customerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-stroke bg-white shadow-lg dark:border-strokedark dark:bg-boxdark max-h-60 overflow-y-auto">
                      {customerResults.map((customer) => (
                        <div
                          key={customer.name}
                          className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-meta-4 cursor-pointer border-b border-stroke dark:border-strokedark last:border-b-0"
                          onClick={() => excludeCustomer(customer.name)}
                        >
                          <div>
                            <p className="text-sm font-medium text-black dark:text-white">{customer.name}</p>
                            <p className="text-xs text-body">{customer.invoiceCount} invoices · ${customer.totalSpent.toLocaleString('en-CA', { minimumFractionDigits: 2 })}</p>
                          </div>
                          <span className="text-xs font-medium text-danger">Exclude</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Excluded Customers List */}
                {excludedCustomers.length === 0 ? (
                  <p className="text-sm text-body py-4">No customers excluded. All customers are visible in the Top Customers list.</p>
                ) : (
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-black dark:text-white">
                      Excluded ({excludedCustomers.length})
                    </h4>
                    <div className="space-y-2">
                      {excludedCustomers.map((customer) => (
                        <div
                          key={customer.id}
                          className="flex items-center justify-between rounded-md border border-stroke px-4 py-3 dark:border-strokedark"
                        >
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-danger bg-opacity-10">
                              <svg className="h-4 w-4 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            </span>
                            <div>
                              <p className="text-sm font-medium text-black dark:text-white">{customer.customer_name}</p>
                              <p className="text-xs text-body">Excluded {new Date(customer.created_at).toLocaleDateString('en-CA')}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => reincludeCustomer(customer.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-50 hover:text-success dark:border-strokedark dark:hover:bg-meta-4"
                          >
                            Re-include
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== RELEASE MANAGEMENT ==================== */}
          {activeTab === 'releases' && (
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="p-7">
                {/* Status Banners */}
                {releaseStatus === 'triggered' && (
                  <div className="mb-4 rounded-md bg-[#8B5CF6] bg-opacity-10 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#8B5CF6] border-t-transparent"></div>
                      <p className="text-sm font-medium text-[#8B5CF6]">
                        Release workflow triggered! GitHub Actions is building v{newVersion}. Netlify will auto-deploy when done.
                      </p>
                    </div>
                  </div>
                )}
                {releaseStatus === 'success' && (
                  <div className="mb-4 rounded-md bg-success bg-opacity-10 p-4">
                    <p className="text-sm font-medium text-success">✓ Release created and deployed successfully!</p>
                  </div>
                )}
                {releaseStatus === 'failed' && (
                  <div className="mb-4 rounded-md bg-danger bg-opacity-10 p-4">
                    <p className="text-sm font-medium text-danger">✕ Release workflow failed. Check GitHub Actions for details.</p>
                  </div>
                )}

                {/* New Release Form */}
                {showReleaseForm && (
                  <div className="mb-6 rounded-lg border border-[#8B5CF6] border-opacity-30 bg-[#8B5CF6] bg-opacity-5 p-6">
                    <h4 className="mb-4 text-sm font-semibold text-black dark:text-white">Push New Release</h4>

                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-black dark:text-white">Version Number</label>
                      <input
                        type="text"
                        value={newVersion}
                        onChange={(e) => setNewVersion(e.target.value)}
                        placeholder="e.g. 0.2.6"
                        className="w-full max-w-xs rounded border-[1.5px] border-stroke bg-transparent px-4 py-2.5 text-sm font-medium outline-none transition focus:border-[#8B5CF6] dark:border-form-strokedark dark:bg-form-input"
                      />
                    </div>

                    <div className="mb-4">
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-sm font-medium text-black dark:text-white">
                          Release Notes <span className="text-xs text-body">(auto-generated from commits, editable)</span>
                        </label>
                        <div className="flex items-center gap-2">
                          {commitCount > 0 && sinceTag && (
                            <span className="text-xs text-body">{commitCount} commits since {sinceTag}</span>
                          )}
                          <button
                            onClick={generateNotes}
                            disabled={generatingNotes}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#8B5CF6] hover:underline disabled:opacity-50"
                          >
                            <svg className={`h-3 w-3 ${generatingNotes ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {generatingNotes ? 'Generating...' : 'Regenerate'}
                          </button>
                        </div>
                      </div>
                      {generatingNotes ? (
                        <div className="flex items-center justify-center py-8 rounded border-[1.5px] border-stroke dark:border-form-strokedark">
                          <div className="flex items-center gap-3">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#8B5CF6] border-t-transparent"></div>
                            <span className="text-sm text-body">Fetching commits and generating notes...</span>
                          </div>
                        </div>
                      ) : (
                        <textarea
                          value={releaseNotes}
                          onChange={(e) => setReleaseNotes(e.target.value)}
                          rows={12}
                          placeholder={"## ✨ New Features\n- Feature one\n\n## 🎨 UI Improvements\n- Improvement one\n\n## 🔧 Bug Fixes\n- Fix one"}
                          className="w-full rounded border-[1.5px] border-stroke bg-transparent px-4 py-3 text-sm outline-none transition focus:border-[#8B5CF6] dark:border-form-strokedark dark:bg-form-input font-mono"
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={pushRelease}
                        disabled={releaseStatus === 'pushing' || !newVersion.trim() || !releaseNotes.trim()}
                        className="inline-flex items-center gap-2 rounded-md bg-[#8B5CF6] px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
                      >
                        {releaseStatus === 'pushing' ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            Pushing...
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Push Release v{newVersion}
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setShowReleaseForm(false)}
                        className="rounded-md border border-stroke px-5 py-2.5 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Release History */}
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-black dark:text-white">Release History</h4>
                  {releases.length === 0 ? (
                    <p className="text-sm text-body py-4">No releases found. Push your first release above!</p>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {releases.map((release) => (
                        <div
                          key={release.id}
                          className="flex items-start justify-between rounded-md border border-stroke p-4 dark:border-strokedark"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex rounded-full bg-[#8B5CF6] bg-opacity-10 px-3 py-0.5 text-xs font-bold text-[#8B5CF6]">
                                {release.version}
                              </span>
                              <span className="text-xs text-body">
                                {new Date(release.date).toLocaleDateString('en-CA', {
                                  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                })}
                              </span>
                            </div>
                            {release.notes && (
                              <p className="mt-1.5 text-xs text-body line-clamp-2 whitespace-pre-line">
                                {release.notes.replace(/^#+\s/gm, '').replace(/\*\*/g, '').substring(0, 150)}
                                {release.notes.length > 150 ? '...' : ''}
                              </p>
                            )}
                          </div>
                          <a
                            href={release.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-3 flex-shrink-0 text-xs font-medium text-primary hover:underline"
                          >
                            View →
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
    </div>
  );
};

export default AdminPanel;
