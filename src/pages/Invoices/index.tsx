import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL;

interface Invoice {
  invoice_number: string;
  salesperson_name: string;
  date: string;
  total: number;
  commission: number;
  status: 'paid' | 'overdue' | 'pending' | 'draft' | 'void';
}

interface InvoiceStats {
  totalInvoices: number;
  totalAmount: number;
  totalCommission: number;
}

const Invoices = () => {
  useAuth(); // Ensure user is authenticated
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  // User role and salesperson management
  const [isAdmin, setIsAdmin] = useState(false);
  const [salespeople, setSalespeople] = useState<string[]>([]);
  const [selectedSalespeople, setSelectedSalespeople] = useState<string[]>([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(() => {
    // Default to first day of current month
    const date = new Date();
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    // Default to today
    return new Date().toISOString().split('T')[0];
  });
  
  // Quick filters
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  
  // Available years (2023-current year)
  const availableYears = Array.from(
    { length: new Date().getFullYear() - 2022 },
    (_, i) => (2023 + i).toString()
  );
  
  // Months
  const months = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];
  
  // Statuses
  const statuses = ['paid', 'overdue', 'pending', 'draft', 'void'];

  // Decode JWT to get user role
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setIsAdmin(payload.isAdmin || false);
      } catch (error) {
        console.error('Error decoding token:', error);
      }
    }
  }, []);

  // Handle year selection - sets date range to entire year
  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    setSelectedMonth(''); // Clear month
    if (year) {
      setStartDate(`${year}-01-01`);
      setEndDate(`${year}-12-31`);
    }
  };

  // Handle month selection - sets date range to specific month
  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    if (month && selectedYear) {
      const year = selectedYear;
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      setStartDate(`${year}-${month}-01`);
      setEndDate(`${year}-${month}-${lastDay}`);
    }
  };

  // Handle current month button
  const handleCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    setSelectedYear(year);
    setSelectedMonth(month);
    setStartDate(`${year}-${month}-01`);
    setEndDate(now.toISOString().split('T')[0]);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const salespersonDropdown = document.getElementById('salesperson-dropdown');
      const salespersonButton = document.getElementById('salesperson-button');
      const statusDropdown = document.getElementById('status-dropdown');
      const statusButton = document.getElementById('status-button');
      const target = event.target as HTMLElement;
      
      // Close salesperson dropdown
      if (salespersonDropdown && salespersonButton && 
          !salespersonDropdown.contains(target) && !salespersonButton.contains(target)) {
        salespersonDropdown.classList.add('hidden');
      }
      
      // Close status dropdown
      if (statusDropdown && statusButton && 
          !statusDropdown.contains(target) && !statusButton.contains(target)) {
        statusDropdown.classList.add('hidden');
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Background sync function
  const backgroundSync = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Silent sync in background
      await axios.post(`${API_URL}/api/invoices/sync`, { fullSync: false }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setLastSyncTime(new Date());
      
      // Wait 10 seconds then refresh data
      setTimeout(async () => {
        await fetchInvoices();
        await fetchStats();
      }, 10000);
      
    } catch (error) {
      console.error('Background sync error:', error);
    }
  };

  // Auto-sync on component mount
  useEffect(() => {
    // Set current year and month for quick filters
    const now = new Date();
    setSelectedYear(now.getFullYear().toString());
    setSelectedMonth((now.getMonth() + 1).toString().padStart(2, '0'));
    
    // Initial load
    fetchInvoices();
    fetchStats();
    
    // Fetch salespeople if admin
    if (isAdmin) {
      fetchSalespeople();
    }
    
    // Trigger background sync
    backgroundSync();
    
    // Set up periodic sync every hour
    const syncInterval = setInterval(() => {
      console.log('🔄 Running automatic hourly sync...');
      backgroundSync();
    }, 60 * 60 * 1000); // Every hour

    return () => clearInterval(syncInterval);
  }, [isAdmin]);

  // Re-fetch when filters change
  useEffect(() => {
    if (startDate && endDate) {
      fetchInvoices();
      fetchStats();
    }
  }, [startDate, endDate, selectedSalespeople]);

  // Fetch invoices
  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const params = new URLSearchParams();
      if (startDate) params.append('start', startDate);
      if (endDate) params.append('end', endDate);
      if (selectedSalespeople.length > 0) {
        params.append('salesperson', selectedSalespeople.join(','));
      }

      const response = await axios.get(`${API_URL}/api/invoices?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setInvoices(response.data.invoices || []);
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
      
      const params = new URLSearchParams();
      if (startDate) params.append('start', startDate);
      if (endDate) params.append('end', endDate);
      if (selectedSalespeople.length > 0) {
        params.append('salesperson', selectedSalespeople.join(','));
      }

      const response = await axios.get(`${API_URL}/api/invoices/stats?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // Fetch salespeople list (admin only)
  const fetchSalespeople = async () => {
    if (!isAdmin) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/salespeople`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSalespeople(response.data.salespeople || []);
    } catch (error) {
      console.error('Error fetching salespeople:', error);
    }
  };

  // Manual sync (for emergencies or forcing full sync)
  const handleManualSync = async (fullSync = false) => {
    try {
      setSyncing(true);
      const token = localStorage.getItem('token');
      
      await axios.post(`${API_URL}/api/invoices/sync`, { fullSync }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setLastSyncTime(new Date());
      
      const waitTime = fullSync ? 30000 : 10000;
      setTimeout(async () => {
        await fetchInvoices();
        await fetchStats();
        setSyncing(false);
      }, waitTime);
      
    } catch (error) {
      console.error('Error syncing invoices:', error);
      alert('Sync failed. Check console for details.');
      setSyncing(false);
    }
  };

  // Format last sync time
  const formatLastSync = () => {
    if (!lastSyncTime) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - lastSyncTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    return `${diffHours} hours ago`;
  };

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
      paid: {
        class: 'bg-success text-white',
        icon: (
          <svg className="mr-1.5 h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm-2 15l-5-5 1.41-1.41L8 12.17l7.59-7.59L17 6l-9 9z"/>
          </svg>
        )
      },
      overdue: {
        class: 'bg-danger text-white',
        icon: (
          <svg className="mr-1.5 h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9v-2h2v2zm0-4H9V5h2v6z"/>
          </svg>
        )
      },
      pending: {
        class: 'bg-warning text-white',
        icon: (
          <svg className="mr-1.5 h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9v-2h2v2zm0-4H9V5h2v6z"/>
          </svg>
        )
      },
      draft: {
        class: 'bg-secondary text-white',
        icon: null
      },
      void: {
        class: 'bg-meta-1 text-white',
        icon: null
      }
    };

    const badge = badges[status as keyof typeof badges] || { class: 'bg-gray text-black', icon: null };

    return (
      <span className={`inline-flex items-center rounded px-3 py-1 text-xs font-medium ${badge.class}`}>
        {badge.icon}
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
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    
    return date.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Filter invoices by search term
  const filteredInvoices = invoices.filter(invoice => {
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const matchesSearch = 
        invoice.invoice_number.toLowerCase().includes(search) ||
        invoice.salesperson_name.toLowerCase().includes(search);
      if (!matchesSearch) return false;
    }
    
    // Status filter
    if (selectedStatuses.length > 0) {
      if (!selectedStatuses.includes(invoice.status)) return false;
    }
    
    return true;
  });

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            Invoices
          </h2>
          <div className="flex items-center gap-3">
            <p className="text-sm text-body">Manage and track your invoices</p>
            <span className="text-xs text-body">
              • Last synced: {formatLastSync()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right mr-3">
            <p className="text-xs text-body">Auto-sync: Every hour</p>
            <p className="text-xs text-success">✓ Background sync active</p>
          </div>
          
          <button
            onClick={() => handleManualSync(false)}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-stroke bg-white px-4 py-2 text-center text-sm font-medium text-body hover:bg-gray hover:text-primary disabled:opacity-50 dark:border-strokedark dark:bg-boxdark dark:text-white"
          >
            {syncing ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Syncing...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync Now
              </>
            )}
          </button>
          <button
            onClick={() => {
              if (confirm('Force a full sync? This will re-fetch ALL invoices and may take 2-3 minutes.')) {
                handleManualSync(true);
              }
            }}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-meta-5 px-4 py-2 text-center text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
          >
            Full Sync
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6 xl:grid-cols-3 2xl:gap-7.5">
          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-meta-2 dark:bg-meta-4">
              <svg className="fill-primary dark:fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M21.1063 18.0469L19.3875 3.23126C19.2157 1.71876 17.9438 0.584381 16.3969 0.584381H5.56878C4.05628 0.584381 2.78441 1.71876 2.57816 3.23126L0.859406 18.0469C0.756281 18.9063 1.03128 19.7313 1.61566 20.3844C2.20003 21.0375 3.02816 21.3813 3.92191 21.3813H18.0438C18.9375 21.3813 19.7657 21.0031 20.35 20.3844C20.9688 19.7656 21.2094 18.9063 21.1063 18.0469ZM19.2157 19.3531C18.9407 19.6625 18.5625 19.8344 18.1157 19.8344H3.92191C3.47504 19.8344 3.09691 19.6625 2.82191 19.3531C2.54691 19.0438 2.41566 18.6313 2.44691 18.2188L4.16566 3.40314C4.19691 3.02189 4.54066 2.71564 4.95628 2.71564H16.4313C16.8469 2.71564 17.1906 3.05314 17.2219 3.40314L18.9406 18.2531C18.9719 18.6656 18.8406 19.0438 19.2157 19.3531Z" />
                <path d="M14.3345 5.29375C13.922 5.39688 13.647 5.80938 13.7501 6.22188C13.7845 6.42813 13.8189 6.63438 13.8189 6.80625C13.8189 8.35313 12.547 9.625 11.0001 9.625C9.45327 9.625 8.18139 8.35313 8.18139 6.80625C8.18139 6.6 8.21577 6.42813 8.25014 6.22188C8.35327 5.80938 8.07827 5.39688 7.66577 5.29375C7.25327 5.19063 6.84077 5.46563 6.73764 5.87813C6.66889 6.1875 6.63452 6.49688 6.63452 6.80625C6.63452 9.2125 8.5939 11.1719 11.0001 11.1719C13.4064 11.1719 15.3658 9.2125 15.3658 6.80625C15.3658 6.49688 15.3314 6.1875 15.2626 5.87813C15.1595 5.46563 14.747 5.225 14.3345 5.29375Z" />
              </svg>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <h4 className="text-title-md font-bold text-black dark:text-white">
                  {stats.totalInvoices}
                </h4>
                <span className="text-sm font-medium">Total Invoices</span>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-success">
              <svg className="fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 0.5C5.20156 0.5 0.5 5.20156 0.5 11C0.5 16.7984 5.20156 21.5 11 21.5C16.7984 21.5 21.5 16.7984 21.5 11C21.5 5.20156 16.7984 0.5 11 0.5ZM15.3937 9.39062L10.7687 14.0156C10.6312 14.1531 10.4484 14.2219 10.2656 14.2219C10.0828 14.2219 9.9 14.1531 9.7625 14.0156L7.44375 11.6969C7.16875 11.4219 7.16875 10.9688 7.44375 10.6937C7.71875 10.4187 8.17188 10.4187 8.44688 10.6937L10.2656 12.5125L14.3906 8.3875C14.6656 8.1125 15.1187 8.1125 15.3937 8.3875C15.6687 8.6625 15.6687 9.11562 15.3937 9.39062Z" />
              </svg>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <h4 className="text-title-md font-bold text-black dark:text-white">
                  {formatCurrency(stats.totalAmount)}
                </h4>
                <span className="text-sm font-medium">Total Sales</span>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-warning">
              <svg className="fill-white" width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M16.2719 8.52812C15.8594 8.52812 15.5156 8.87187 15.5156 9.28437V14.625C15.5156 15.3469 14.9281 15.9344 14.2062 15.9344H4.125C3.40313 15.9344 2.81562 15.3469 2.81562 14.625V9.28437C2.81562 8.87187 2.47188 8.52812 2.05937 8.52812C1.64687 8.52812 1.30313 8.87187 1.30313 9.28437V14.625C1.30313 16.175 2.575 17.4469 4.125 17.4469H14.2062C15.7562 17.4469 17.0281 16.175 17.0281 14.625V9.28437C17.0281 8.87187 16.6844 8.52812 16.2719 8.52812Z" />
                <path d="M8.40938 12.0719C8.68438 12.3469 9.1375 12.3469 9.4125 12.0719L12.8656 8.61875C13.1406 8.34375 13.1406 7.89063 12.8656 7.61563C12.5906 7.34063 12.1375 7.34063 11.8625 7.61563L9.66875 9.80938V1.51562C9.66875 1.10312 9.325 0.759375 8.9125 0.759375C8.5 0.759375 8.15625 1.10312 8.15625 1.51562V9.80938L5.9625 7.61563C5.6875 7.34063 5.23438 7.34063 4.95938 7.61563C4.68438 7.89063 4.68438 8.34375 4.95938 8.61875L8.4125 12.0719H8.40938Z" />
              </svg>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <h4 className="text-title-md font-bold text-black dark:text-white">
                  {formatCurrency(stats.totalCommission)}
                </h4>
                <span className="text-sm font-medium">Total Commission</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 rounded-sm border border-stroke bg-white px-6 py-5 shadow-default dark:border-strokedark dark:bg-boxdark">
        {/* Quick Filter Buttons */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={handleCurrentMonth}
            className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90"
          >
            Current Month
          </button>
          <button
            onClick={() => {
              const now = new Date();
              const year = now.getFullYear().toString();
              setSelectedYear(year);
              setSelectedMonth('');
              setStartDate(`${year}-01-01`);
              setEndDate(`${year}-12-31`);
            }}
            className="inline-flex rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-white"
          >
            Current Year
          </button>
        </div>

        {/* Filter Row 1 - Search, Year, Month */}
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by invoice # or salesperson..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
            />
          </div>

          {/* Year Filter */}
          <select
            value={selectedYear}
            onChange={(e) => handleYearChange(e.target.value)}
            className="rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
          >
            <option value="">All Years</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          {/* Month Filter */}
          <select
            value={selectedMonth}
            onChange={(e) => handleMonthChange(e.target.value)}
            disabled={!selectedYear}
            className="rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
          >
            <option value="">All Months</option>
            {months.map((month) => (
              <option key={month.value} value={month.value}>{month.label}</option>
            ))}
          </select>
        </div>

        {/* Filter Row 2 - Date Range, Status, Salesperson */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setSelectedYear('');
              setSelectedMonth('');
            }}
            placeholder="Start Date"
            className="rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setSelectedYear('');
              setSelectedMonth('');
            }}
            placeholder="End Date"
            className="rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
          />

          {/* Status Filter */}
          <div className="relative">
            <button
              id="status-button"
              type="button"
              className="w-full min-w-[150px] rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary text-left flex items-center justify-between"
              onClick={() => {
                const dropdown = document.getElementById('status-dropdown');
                if (dropdown) {
                  dropdown.classList.toggle('hidden');
                }
              }}
            >
              <span>
                {selectedStatuses.length === 0 
                  ? 'All Status' 
                  : `${selectedStatuses.length} Selected`}
              </span>
              <svg className="fill-current h-4 w-4" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </button>
            
            <div
              id="status-dropdown"
              className="hidden absolute z-50 w-full mt-1 bg-white dark:bg-boxdark border border-stroke dark:border-strokedark rounded shadow-lg"
            >
              {/* Select All / Clear All */}
              <div className="sticky top-0 bg-gray-2 dark:bg-meta-4 px-4 py-2 border-b border-stroke dark:border-strokedark flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStatuses(statuses)}
                  className="text-xs text-primary hover:underline"
                >
                  Select All
                </button>
                <span className="text-xs text-body">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedStatuses([])}
                  className="text-xs text-danger hover:underline"
                >
                  Clear All
                </button>
              </div>
              
              {/* Checkboxes */}
              {statuses.map((status) => (
                <label
                  key={status}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray dark:hover:bg-meta-4 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(status)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedStatuses([...selectedStatuses, status]);
                      } else {
                        setSelectedStatuses(selectedStatuses.filter(s => s !== status));
                      }
                    }}
                    className="h-4 w-4 flex-shrink-0 rounded border-stroke dark:border-strokedark"
                  />
                  <span className="text-sm text-black dark:text-white capitalize flex-1">{status}</span>
                </label>
              ))}
            </div>
          </div>

        {/* Salesperson Filter (Admin Only) */}
        {isAdmin && (
          <div className="relative">
            <button
              id="salesperson-button"
              type="button"
              className="w-full rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary text-left flex items-center justify-between"
              onClick={() => {
                const dropdown = document.getElementById('salesperson-dropdown');
                if (dropdown) {
                  dropdown.classList.toggle('hidden');
                }
              }}
            >
              <span>
                {selectedSalespeople.length === 0 
                  ? 'All Salespeople' 
                  : `${selectedSalespeople.length} Selected`}
              </span>
              <svg className="fill-current h-4 w-4" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </button>
            
            <div
              id="salesperson-dropdown"
              className="hidden absolute z-50 w-full mt-1 bg-white dark:bg-boxdark border border-stroke dark:border-strokedark rounded shadow-lg max-h-60 overflow-y-auto"
            >
              {/* Select All / Clear All */}
              <div className="sticky top-0 bg-gray-2 dark:bg-meta-4 px-4 py-2 border-b border-stroke dark:border-strokedark flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSalespeople(salespeople)}
                  className="text-xs text-primary hover:underline"
                >
                  Select All
                </button>
                <span className="text-xs text-body">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedSalespeople([])}
                  className="text-xs text-danger hover:underline"
                >
                  Clear All
                </button>
              </div>
              
              {/* Checkboxes */}
              {salespeople.map((person) => (
                <label
                  key={person}
                  className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray dark:hover:bg-meta-4 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSalespeople.includes(person)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedSalespeople([...selectedSalespeople, person]);
                      } else {
                        setSelectedSalespeople(selectedSalespeople.filter(p => p !== person));
                      }
                    }}
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-stroke dark:border-strokedark"
                  />
                  <span className="text-sm text-black dark:text-white flex-1">{person}</span>
                </label>
              ))}
              
              {salespeople.length === 0 && (
                <div className="px-4 py-3 text-sm text-body text-center">
                  No salespeople found
                </div>
              )}
            </div>
          </div>
        )}
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
                  Salesperson
                </th>
                <th className="min-w-[120px] px-4 py-4 font-medium text-black dark:text-white">
                  Date
                </th>
                <th className="min-w-[120px] px-4 py-4 font-medium text-black dark:text-white">
                  Total
                </th>
                <th className="min-w-[120px] px-4 py-4 font-medium text-black dark:text-white">
                  Commission
                </th>
                <th className="min-w-[120px] px-4 py-4 font-medium text-black dark:text-white">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-5">
                    <div className="flex justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-5">
                    <p className="text-body">No invoices found. Click "Sync from Zoho" to import invoices.</p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice, index) => (
                  <tr key={index} className="border-b border-[#eee] dark:border-strokedark">
                    <td className="px-4 py-5">
                      <p className="text-black dark:text-white font-medium">
                        {invoice.invoice_number}
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      <p className="text-black dark:text-white">
                        {invoice.salesperson_name || 'Unassigned'}
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      <p className="text-black dark:text-white">
                        {formatDate(invoice.date)}
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      <p className="text-black dark:text-white font-medium">
                        {formatCurrency(invoice.total)}
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      <p className="text-success font-medium">
                        {formatCurrency(invoice.commission)}
                      </p>
                    </td>
                    <td className="px-4 py-5">
                      {getStatusBadge(invoice.status)}
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
