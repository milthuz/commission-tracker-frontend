import { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, Eye, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL;

interface Invoice {
  invoice_number: string;
  salesperson_name: string;
  customer_name: string;
  date: string;
  total: number;
  commission: number;
  status: 'paid' | 'overdue' | 'pending' | 'draft' | 'void' | 'partially_paid' | 'sent';
  commissionPaid: boolean;
}

interface InvoiceStats {
  totalInvoices: number;
  paidTotal: number;
  overdueTotal: number;
  totalAmount: number;
  totalCommission: number;
}

const Invoices = () => {
  const { t } = useTranslation();
  useAuth(); // Ensure user is authenticated
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({
    current: 0,
    total: 0,
    percentage: 0,
    message: ''
  });
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  
  // User role and salesperson management
  const [isAdmin, setIsAdmin] = useState(false);
  const [salespeople, setSalespeople] = useState<string[]>([]);
  const [selectedSalespeople, setSelectedSalespeople] = useState<string[]>([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(() => {
    // Default to 30 days ago (so Current Month button will have effect)
    const date = new Date();
    date.setDate(date.getDate() - 30);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [endDate, setEndDate] = useState(() => {
    // Default to today (local timezone)
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
  const statuses = ['paid', 'overdue', 'partially_paid', 'sent', 'pending', 'draft', 'void'];
  
  // Preview modal state
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    invoiceNumber: string;
    loading: boolean;
  }>({
    isOpen: false,
    invoiceNumber: '',
    loading: false
  });

  // Email modal state
  const [emailModal, setEmailModal] = useState<{
    isOpen: boolean;
    invoiceNumber: string;
    email: string;
    sending: boolean;
  }>({
    isOpen: false,
    invoiceNumber: '',
    email: '',
    sending: false
  });

  // Success notification state
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({
    show: false,
    message: '',
    type: 'success'
  });

  // Handle invoice PDF download
  const handleDownloadPDF = async (invoiceNumber: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Please log in again');
        return;
      }

      const response = await axios.get(
        `${API_URL}/api/invoices/${invoiceNumber}/pdf`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      if (error.response?.status === 401) {
        alert('Session expired. Please log in again.');
      } else if (error.response?.status === 404) {
        alert('Invoice not found. Please sync from Zoho.');
      } else {
        alert('Failed to download PDF. Please try again.');
      }
    }
  };

  // Handle invoice preview
  const handlePreviewInvoice = (invoiceNumber: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in again');
      return;
    }
    setPreviewModal({
      isOpen: true,
      invoiceNumber,
      loading: true
    });
  };

  // Close preview modal
  const handleClosePreview = () => {
    setPreviewModal({
      isOpen: false,
      invoiceNumber: '',
      loading: false
    });
  };

  // Handle print invoice
  const handlePrintInvoice = async (invoiceNumber: string) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Please log in again');
        return;
      }

      // Open PDF in new window and trigger print
      const pdfUrl = `${API_URL}/api/invoices/${invoiceNumber}/pdf`;
      const response = await axios.get(pdfUrl, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (error: any) {
      console.error('Error printing invoice:', error);
      alert('Failed to print invoice. Please try again.');
    }
  };

  // Handle email invoice
  const handleEmailInvoice = (invoiceNumber: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      setNotification({
        show: true,
        message: 'Please log in again',
        type: 'error'
      });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
      return;
    }
    
    setEmailModal({
      isOpen: true,
      invoiceNumber,
      email: '',
      sending: false
    });
  };

  // Send email from modal
  const handleSendEmail = async () => {
    try {
      const { invoiceNumber, email } = emailModal;
      
      if (!email) {
        setNotification({
          show: true,
          message: 'Please enter an email address',
          type: 'error'
        });
        setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setNotification({
          show: true,
          message: 'Please enter a valid email address',
          type: 'error'
        });
        setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
        return;
      }

      setEmailModal(prev => ({ ...prev, sending: true }));

      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/invoices/${invoiceNumber}/email`,
        { recipientEmail: email },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Close modal
      setEmailModal({
        isOpen: false,
        invoiceNumber: '',
        email: '',
        sending: false
      });

      // Show success notification
      setNotification({
        show: true,
        message: t('invoices.sentSuccess'),
        type: 'success'
      });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);

    } catch (error: any) {
      console.error('Error emailing invoice:', error);
      setEmailModal(prev => ({ ...prev, sending: false }));
      
      let errorMessage = 'Failed to send email. Please try again.';
      if (error.response?.status === 401) {
        errorMessage = 'Session expired. Please log in again.';
      }
      
      setNotification({
        show: true,
        message: errorMessage,
        type: 'error'
      });
      setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
    }
  };

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
    const day = now.getDate().toString().padStart(2, '0');
    
    console.log(`📅 Setting to current month: ${year}-${month}-01 to ${year}-${month}-${day}`);
    
    setSelectedYear(year);
    setSelectedMonth(month);
    setStartDate(`${year}-${month}-01`);
    setEndDate(`${year}-${month}-${day}`);
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
      // Add timestamp to bust cache
      params.append('_t', Date.now().toString());

      console.log('🔍 Fetching invoices with:', {
        startDate,
        endDate,
        salespeople: selectedSalespeople,
        url: `${API_URL}/api/invoices?${params}`
      });

      const response = await axios.get(`${API_URL}/api/invoices?${params}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      console.log(`✅ Received ${response.data.invoices?.length || 0} invoices`);
      if (response.data.invoices?.length > 0) {
        console.log('📅 First invoice date:', response.data.invoices[0].date);
        console.log('📅 Last invoice date:', response.data.invoices[response.data.invoices.length - 1].date);
      }

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
      // Add timestamp to bust cache
      params.append('_t', Date.now().toString());

      const response = await axios.get(`${API_URL}/api/invoices/stats?${params}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
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
      setSyncProgress({ current: 0, total: 0, percentage: 0, message: 'Starting sync...' });
      
      const token = localStorage.getItem('token');
      
      const response = await axios.post(`${API_URL}/api/invoices/sync`, { fullSync }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Update progress with sync results
      const syncData = response.data;
      if (syncData.totalSynced) {
        setSyncProgress({
          current: syncData.totalSynced,
          total: syncData.totalSynced,
          percentage: 100,
          message: fullSync 
            ? `Full sync in progress! This may take 1-3 minutes. Data will auto-refresh.`
            : `Quick sync completed! ${syncData.totalSynced} invoices synced.`
        });
      }

      setLastSyncTime(new Date());
      
      // For full sync, wait longer before refreshing
      const refreshDelay = fullSync ? 120000 : 5000; // 2 min for full, 5 sec for quick
      
      setTimeout(async () => {
        await fetchInvoices();
        await fetchStats();
        setSyncing(false);
        
        // Update success message
        setSyncProgress({
          current: syncData.totalSynced,
          total: syncData.totalSynced,
          percentage: 100,
          message: `Sync complete! ${syncData.totalSynced} invoices synced successfully.`
        });
        
        // Clear progress after showing success
        setTimeout(() => {
          setSyncProgress({ current: 0, total: 0, percentage: 0, message: '' });
        }, 3000);
      }, refreshDelay);
      
    } catch (error) {
      console.error('Error syncing invoices:', error);
      setSyncProgress({ current: 0, total: 0, percentage: 0, message: 'Sync failed!' });
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
      partially_paid: {
        class: 'bg-[#F59E0B] text-white',
        icon: (
          <svg className="mr-1.5 h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
            <path d="M10 2c-4.41 0-8 3.59-8 8s3.59 8 8 8V2z"/>
          </svg>
        )
      },
      overdue: {
        class: 'bg-[#DC2626] text-white',
        icon: (
          <svg className="mr-1.5 h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm1 15H9v-2h2v2zm0-4H9V5h2v6z"/>
          </svg>
        )
      },
      sent: {
        class: 'bg-[#3B82F6] text-white',
        icon: (
          <svg className="mr-1.5 h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M1.946.342a.5.5 0 01.54-.05l16 8a.5.5 0 010 .894l-16 8a.5.5 0 01-.712-.526L3.58 10 1.774 3.34a.5.5 0 01.172-.998zM4.42 9.5L2.89 3.94 16.236 10 2.89 16.06 4.42 10.5H10a.5.5 0 000-1H4.42z"/>
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
        icon: (
          <svg className="mr-1.5 h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M15.5 2l2.5 2.5L6.5 16H4v-2.5L15.5 2zM12.9 4.5l2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4z"/>
          </svg>
        )
      },
      void: {
        class: 'bg-[#DC2626] text-white',
        icon: (
          <svg className="mr-1.5 h-4 w-4 fill-current" viewBox="0 0 20 20">
            <path d="M10 0C4.48 0 0 4.48 0 10s4.48 10 10 10 10-4.48 10-10S15.52 0 10 0zm5 13.59L13.59 15 10 11.41 6.41 15 5 13.59 8.59 10 5 6.41 6.41 5 10 8.59 13.59 5 15 6.41 11.41 10 15 13.59z"/>
          </svg>
        )
      }
    };

    const badge = badges[status as keyof typeof badges] || { class: 'bg-gray text-black', icon: null };

    const labels: Record<string, string> = {
      partially_paid: 'PARTIAL',
    };
    const label = labels[status] || status.replace('_', ' ').toUpperCase();

    return (
      <span className={`inline-flex items-center rounded px-3 py-1 text-xs font-medium whitespace-nowrap ${badge.class}`}>
        {badge.icon}
        {label}
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
    // Don't use new Date() which converts timezones!
    // Date is already in YYYY-MM-DD format from backend
    if (!dateString) return 'N/A';
    
    // Parse date parts directly to avoid timezone issues
    const parts = dateString.split('T')[0].split('-'); // Get YYYY-MM-DD part
    if (parts.length !== 3) return 'N/A';
    
    const [year, month, day] = parts;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    
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
                {syncProgress.percentage > 0 ? `${syncProgress.percentage}%` : 'Syncing...'}
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
        </div>
      </div>

      {/* Sync Progress Bar */}
      {syncing && syncProgress.percentage > 0 && (
        <div className="mb-6 rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-black dark:text-white">
              {syncProgress.message}
            </span>
            <span className="text-sm font-medium text-primary">
              {syncProgress.percentage}%
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="relative h-2.5 w-full rounded-full bg-stroke dark:bg-strokedark">
            <div
              className="absolute left-0 h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${syncProgress.percentage}%` }}
            ></div>
          </div>
          
          {/* Count */}
          {syncProgress.total > 0 && (
            <p className="mt-2 text-xs text-body">
              Synced {syncProgress.current} of {syncProgress.total} invoices
            </p>
          )}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 md:gap-6 2xl:gap-7.5">
          {/* Paid Invoice Total */}
          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-[#10B981] bg-opacity-20">
              <svg className="stroke-[#10B981]" width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                <path d="M8 12l3 3 5-5"/>
              </svg>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <h4 className="text-title-md font-bold text-black dark:text-white">
                  {formatCurrency(stats.paidTotal || 0)}
                </h4>
                <span className="text-sm font-medium">Paid Invoice Total</span>
              </div>
            </div>
          </div>

          {/* Overdue Total */}
          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-[#EF4444] bg-opacity-20">
              <svg className="stroke-[#EF4444]" width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <h4 className="text-title-md font-bold text-black dark:text-white">
                  {formatCurrency(stats.overdueTotal || 0)}
                </h4>
                <span className="text-sm font-medium">Overdue Total</span>
              </div>
            </div>
          </div>

          {/* Total Sales */}
          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-[#3B82F6] bg-opacity-20">
              <svg className="stroke-[#3B82F6]" width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                <polyline points="16 7 22 7 22 13"/>
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

          {/* Total Commission */}
          <div className="rounded-sm border border-stroke bg-white px-7.5 py-6 shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="flex h-11.5 w-11.5 items-center justify-center rounded-full bg-[#8B5CF6] bg-opacity-20">
              <svg className="stroke-[#8B5CF6]" width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="12" rx="2"/>
                <circle cx="12" cy="12" r="3"/>
                <path d="M2 10h2"/>
                <path d="M20 10h2"/>
                <path d="M2 14h2"/>
                <path d="M20 14h2"/>
              </svg>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <h4 className="text-title-md font-bold text-black dark:text-white">
                  {formatCurrency(stats.totalCommission)}
                </h4>
                <span className="text-sm font-medium">{t('invoices.totalCommission')}</span>
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
              
              console.log(`📅 Setting to current year: ${year}-01-01 to ${year}-12-31`);
              
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
              placeholder={t('invoices.searchPlaceholder')}
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
            placeholder={t('invoices.startDate')}
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
            placeholder={t('invoices.endDate')}
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
                  ? t('invoices.allSalespeople') 
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
        </div> {/* Close Filter Row 2 */}
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
                <th className="min-w-[200px] px-4 py-4 font-medium text-black dark:text-white">
                  Customer
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
                <th className="min-w-[100px] px-4 py-4 font-medium text-black dark:text-white text-center">
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
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5">
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
                        {invoice.customer_name || '—'}
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
                      <div className="flex items-center gap-2">
                        <p className="text-success font-medium">
                          {formatCurrency(invoice.commission)}
                        </p>
                        {invoice.commissionPaid && (
                          <span className="inline-flex rounded-full bg-success bg-opacity-10 px-1.5 py-0.5 text-[10px] font-bold text-success" title="Commission paid to rep">
                            PAID
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td className="px-4 py-5">
                      <div className="flex items-center justify-center space-x-3">
                        {/* Preview Button */}
                        <button
                          onClick={() => handlePreviewInvoice(invoice.invoice_number)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                          title="Preview Invoice"
                        >
                          <Eye className="h-5 w-5" />
                        </button>
                        
                        {/* Download PDF Button */}
                        <button
                          onClick={() => handleDownloadPDF(invoice.invoice_number)}
                          className="text-success hover:text-green-700 dark:hover:text-green-500 transition-colors"
                          title="Download PDF"
                        >
                          <Download className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Preview Modal */}
      {previewModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleClosePreview}
        >
          <div 
            className="bg-white dark:bg-boxdark rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-stroke dark:border-strokedark bg-gray-2 dark:bg-meta-4">
              <h2 className="text-xl font-bold text-black dark:text-white">
                Invoice Preview: {previewModal.invoiceNumber}
              </h2>
              <div className="flex items-center gap-3">
                {/* Print Button */}
                <button
                  onClick={() => handlePrintInvoice(previewModal.invoiceNumber)}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 transition-colors"
                  title="Print Invoice"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
                
                {/* Email Button */}
                <button
                  onClick={() => handleEmailInvoice(previewModal.invoiceNumber)}
                  className="inline-flex items-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 transition-colors"
                  title="Email Invoice"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email
                </button>
                
                {/* Close Button */}
                <button
                  onClick={handleClosePreview}
                  className="text-black dark:text-white hover:text-primary dark:hover:text-primary transition-colors"
                  title="Close"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="relative overflow-auto" style={{ height: 'calc(90vh - 80px)' }}>
              {previewModal.loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-boxdark">
                  <div className="text-center">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent mx-auto mb-4"></div>
                    <p className="text-black dark:text-white">{t('invoices.loadingPreview')}</p>
                  </div>
                </div>
              )}
              <iframe
                src={`${API_URL}/api/invoices/${previewModal.invoiceNumber}/preview?token=${localStorage.getItem('token')}`}
                className="w-full border-0"
                style={{ minHeight: '600px', height: 'calc(90vh - 80px)' }}
                title="Invoice Preview"
                onLoad={() => setPreviewModal(prev => ({ ...prev, loading: false }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Email Invoice Modal */}
      {emailModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !emailModal.sending && setEmailModal({ isOpen: false, invoiceNumber: '', email: '', sending: false })}
        >
          <div 
            className="bg-white dark:bg-boxdark rounded-lg shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-stroke dark:border-strokedark">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary bg-opacity-10">
                  <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-black dark:text-white">
                    Email Invoice
                  </h3>
                  <p className="text-sm text-body dark:text-bodydark">
                    {emailModal.invoiceNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => !emailModal.sending && setEmailModal({ isOpen: false, invoiceNumber: '', email: '', sending: false })}
                disabled={emailModal.sending}
                className="text-black dark:text-white hover:text-primary dark:hover:text-primary transition-colors disabled:opacity-50"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6">
              <label className="mb-3 block text-sm font-medium text-black dark:text-white">
                Recipient Email Address
              </label>
              <input
                type="email"
                value={emailModal.email}
                onChange={(e) => setEmailModal(prev => ({ ...prev, email: e.target.value }))}
                placeholder="example@email.com"
                disabled={emailModal.sending}
                className="w-full rounded-lg border border-stroke bg-transparent py-3 px-5 text-black outline-none transition focus:border-primary active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !emailModal.sending) {
                    handleSendEmail();
                  }
                }}
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-stroke dark:border-strokedark">
              <button
                onClick={() => setEmailModal({ isOpen: false, invoiceNumber: '', email: '', sending: false })}
                disabled={emailModal.sending}
                className="inline-flex items-center justify-center rounded-md border border-stroke dark:border-strokedark px-6 py-2.5 text-center font-medium text-black hover:shadow-1 dark:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={emailModal.sending}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-center font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
              >
                {emailModal.sending ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent"></div>
                    {t('invoices.sending')}
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    Send Email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success/Error Notification */}
      {notification.show && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <div className={`flex items-center gap-3 rounded-lg px-6 py-4 shadow-lg ${
            notification.type === 'success' 
              ? 'bg-success text-white' 
              : 'bg-danger text-white'
          }`}>
            {notification.type === 'success' ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <p className="font-medium">{notification.message}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
