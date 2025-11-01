import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LogOut, RefreshCw, Download } from 'lucide-react';

const CommissionTracker = () => {
  const [user, setUser] = useState(null);
  const [currentMonthData, setCurrentMonthData] = useState([]);
  const [previousMonthData, setPreviousMonthData] = useState([]);
  const [customData, setCustomData] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  // showCustom state removed - not used

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4336';

  // Get current and previous month dates
  const getCurrentMonthDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  };

  const getPreviousMonthDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  };

  // Fetch commissions for a date range
  const fetchCommissionsForRange = async (authToken, startDate, endDate) => {
    if (!authToken) {
      console.error('❌ No auth token');
      return [];
    }

    try {
      const timestamp = Date.now();
      const url = `${API_URL}/api/commissions?start=${startDate}&end=${endDate}&t=${timestamp}`;
      
      console.log('🔗 Fetching from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.commissions || [];
    } catch (error) {
      console.error('❌ Fetch error:', error);
      return [];
    }
  };

  // Fetch invoices
  const fetchInvoicesForRange = async (authToken, startDate, endDate) => {
    if (!authToken) return [];

    try {
      const timestamp = Date.now();
      const url = `${API_URL}/api/invoices?start=${startDate}&end=${endDate}&t=${timestamp}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });

      if (!response.ok) return [];
      const data = await response.json();
      return data.invoices || [];
    } catch (error) {
      console.error('❌ Fetch invoices error:', error);
      return [];
    }
  };

  // Load dashboard data on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    const initializeDashboard = async (token) => {
      setLoading(true);
      const currentMonth = getCurrentMonthDates();
      const previousMonth = getPreviousMonthDates();

      const current = await fetchCommissionsForRange(token, currentMonth.start, currentMonth.end);
      const previous = await fetchCommissionsForRange(token, previousMonth.start, previousMonth.end);
      const invs = await fetchInvoicesForRange(token, currentMonth.start, currentMonth.end);

      setCurrentMonthData(current);
      setPreviousMonthData(previous);
      setInvoices(invs);
      setLoading(false);
    };

    if (urlToken) {
      localStorage.setItem('authToken', urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      setUser({ name: 'Sales Rep', email: 'rep@cluster.local', isAdmin: true });
      initializeDashboard(urlToken);
    } else {
      const savedToken = localStorage.getItem('authToken');
      if (savedToken) {
        setUser({ name: 'Sales Rep', email: 'rep@cluster.local', isAdmin: true });
        initializeDashboard(savedToken);
      }
    }
  }, []);

  const handleZohoLogin = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/zoho`);
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Failed to login');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const token = localStorage.getItem('authToken');
    if (token) {
      const currentMonth = getCurrentMonthDates();
      const previousMonth = getPreviousMonthDates();

      const current = await fetchCommissionsForRange(token, currentMonth.start, currentMonth.end);
      const previous = await fetchCommissionsForRange(token, previousMonth.start, previousMonth.end);
      const invs = await fetchInvoicesForRange(token, currentMonth.start, currentMonth.end);

      setCurrentMonthData(current);
      setPreviousMonthData(previous);
      setInvoices(invs);
    }
    setRefreshing(false);
  };

  const handleCustomDateFilter = async () => {
    if (!customStartDate || !customEndDate) {
      alert('Please select both start and end dates');
      return;
    }

    setRefreshing(true);
    const token = localStorage.getItem('authToken');
    if (token) {
      const data = await fetchCommissionsForRange(token, customStartDate, customEndDate);
      setCustomData(data);
    }
    setRefreshing(false);
  };

  const downloadCSV = (data, filename) => {
    const headers = ['Rep Name', 'Invoices', 'Commission', 'Avg per Invoice'];
    const rows = data.map(rep => [
      rep.repName,
      rep.invoices,
      rep.commission.toFixed(2),
      rep.avgPerInvoice.toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  // Format chart data
  const formatChartData = (data) => {
    return data.map(rep => ({
      name: rep.repName.length > 15 ? rep.repName.substring(0, 12) + '...' : rep.repName,
      commission: parseFloat(rep.commission.toFixed(2)),
    }));
  };

  // Calculate metrics
  const calculateMetrics = (data) => {
    if (!data || data.length === 0) return { total: 0, avg: 0, top: null };
    const total = data.reduce((sum, rep) => sum + rep.commission, 0);
    const avg = (total / data.length).toFixed(2);
    const top = data.reduce((max, rep) => rep.commission > max.commission ? rep : max);
    return { total: total.toFixed(2), avg, top: top.repName };
  };

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '24px', right: '24px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ background: '#FF6B35', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>BETA</span>
          <span style={{ color: '#9CA3AF', fontSize: '12px' }}>v0.1.0</span>
        </div>

        <div style={{ textAlign: 'center', background: 'white', padding: '48px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '400px' }}>
          <div style={{ marginBottom: '24px' }}>
            <img 
              src="/cluster-on-light.svg" 
              alt="Cluster Systems" 
              style={{ height: '40px', margin: '0 auto', display: 'block' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>

          <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '16px', color: '#1F2937' }}>Commission Tracker</h1>
          <p style={{ color: '#6B7280', marginBottom: '8px' }}>Track your sales commissions in real-time</p>
          <p style={{ color: '#9CA3AF', marginBottom: '32px', fontSize: '14px' }}>Powered by Cluster Systems</p>
          <button
            onClick={handleZohoLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 24px',
              background: '#FF6B35',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Logging in...' : '🔗 Login with Zoho'}
          </button>
        </div>
      </div>
    );
  }

  const currentMonthMetrics = calculateMetrics(currentMonthData);
  const previousMonthMetrics = calculateMetrics(previousMonthData);
  const customMetrics = calculateMetrics(customData);

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img 
              src="/cluster-on-light.svg" 
              alt="Cluster Systems" 
              style={{ height: '32px' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1F2937', margin: 0 }}>Commission Tracker</h1>
              <p style={{ fontSize: '14px', color: '#6B7280', margin: '4px 0 0 0' }}>Sales Performance Dashboard</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                padding: '8px 12px',
                background: '#FF6B35',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              <RefreshCw size={18} />
            </button>
            <span style={{ fontSize: '14px', color: '#6B7280' }}>👤 {user.name}</span>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 12px',
                background: '#EF4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        {/* Tabs */}
        <div style={{ background: 'white', borderBottom: '2px solid #E5E7EB', marginBottom: '24px', display: 'flex', gap: '0', borderRadius: '12px 12px 0 0' }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              padding: '16px 24px',
              background: activeTab === 'dashboard' ? '#FF6B35' : 'white',
              color: activeTab === 'dashboard' ? 'white' : '#6B7280',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            📊 Dashboard
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            style={{
              padding: '16px 24px',
              background: activeTab === 'invoices' ? '#FF6B35' : 'white',
              color: activeTab === 'invoices' ? 'white' : '#6B7280',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            📄 Invoices ({invoices.length})
          </button>
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Current Month Section */}
            <div style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1F2937', marginBottom: '16px' }}>📅 Current Month</h2>
              
              {/* Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Total Commission</p>
                  <p style={{ fontSize: '28px', fontWeight: '700', color: '#FF6B35', margin: 0 }}>${currentMonthMetrics.total}</p>
                </div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Average Commission</p>
                  <p style={{ fontSize: '28px', fontWeight: '700', color: '#3B82F6', margin: 0 }}>${currentMonthMetrics.avg}</p>
                </div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Top Performer</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: '#10B981', margin: 0 }}>{currentMonthMetrics.top || 'N/A'}</p>
                </div>
              </div>

              {/* Chart */}
              {currentMonthData.length > 0 && (
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={formatChartData(currentMonthData)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="commission" fill="#FF6B35" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Previous Month Section */}
            <div style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1F2937', marginBottom: '16px' }}>📅 Previous Month</h2>
              
              {/* Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Total Commission</p>
                  <p style={{ fontSize: '28px', fontWeight: '700', color: '#FF6B35', margin: 0 }}>${previousMonthMetrics.total}</p>
                </div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Average Commission</p>
                  <p style={{ fontSize: '28px', fontWeight: '700', color: '#3B82F6', margin: 0 }}>${previousMonthMetrics.avg}</p>
                </div>
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Top Performer</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: '#10B981', margin: 0 }}>{previousMonthMetrics.top || 'N/A'}</p>
                </div>
              </div>

              {/* Chart */}
              {previousMonthData.length > 0 && (
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={formatChartData(previousMonthData)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="commission" fill="#8B5CF6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Custom Date Range Section */}
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1F2937', marginBottom: '16px' }}>🔧 Custom Date Range</h2>
              
              <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#1F2937', marginBottom: '8px', display: 'block' }}>Start Date</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#1F2937', marginBottom: '8px', display: 'block' }}>End Date</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '6px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                  <button
                    onClick={handleCustomDateFilter}
                    disabled={refreshing}
                    style={{
                      padding: '10px 16px',
                      background: '#8B5CF6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      opacity: refreshing ? 0.6 : 1,
                    }}
                  >
                    🔍 Apply Filter
                  </button>
                  {customData.length > 0 && (
                    <button
                      onClick={() => {
                        setCustomData([]);
                        setCustomStartDate('');
                        setCustomEndDate('');
                      }}
                      style={{
                        padding: '10px 16px',
                        background: '#EF4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                      }}
                    >
                      ✕ Clear
                    </button>
                  )}
                  {customData.length > 0 && (
                    <button
                      onClick={() => downloadCSV(customData, `commissions-${customStartDate}-to-${customEndDate}.csv`)}
                      style={{
                        padding: '10px 16px',
                        background: '#10B981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                      }}
                    >
                      <Download size={16} style={{ marginRight: '8px' }} />
                      Export
                    </button>
                  )}
                </div>
              </div>

              {customData.length > 0 && (
                <div>
                  {/* Metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Total Commission</p>
                      <p style={{ fontSize: '28px', fontWeight: '700', color: '#FF6B35', margin: 0 }}>${customMetrics.total}</p>
                    </div>
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Average Commission</p>
                      <p style={{ fontSize: '28px', fontWeight: '700', color: '#3B82F6', margin: 0 }}>${customMetrics.avg}</p>
                    </div>
                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Top Performer</p>
                      <p style={{ fontSize: '18px', fontWeight: '700', color: '#10B981', margin: 0 }}>{customMetrics.top || 'N/A'}</p>
                    </div>
                  </div>

                  {/* Chart */}
                  <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={formatChartData(customData)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="commission" fill="#06B6D4" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Invoices Tab */}
        {activeTab === 'invoices' && (
          <div style={{ background: 'white', padding: '24px', borderRadius: '0 0 12px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>Invoice #</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>Salesperson</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>Total</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>Commission</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                      <td style={{ padding: '16px 12px', fontSize: '14px', color: '#1F2937', fontWeight: '500' }}>{invoice.invoice_number}</td>
                      <td style={{ padding: '16px 12px', fontSize: '14px', color: '#1F2937' }}>
                        {invoice.salesperson_name ? (invoice.salesperson_name.length > 25 ? invoice.salesperson_name.substring(0, 25) + '...' : invoice.salesperson_name) : 'Unassigned'}
                      </td>
                      <td style={{ padding: '16px 12px', fontSize: '14px', color: '#1F2937' }}>{new Date(invoice.date).toLocaleDateString()}</td>
                      <td style={{ padding: '16px 12px', fontSize: '14px', color: '#1F2937' }}>${parseFloat(invoice.total).toFixed(2)}</td>
                      <td style={{ padding: '16px 12px', fontSize: '14px', color: '#10B981', fontWeight: '600' }}>${parseFloat(invoice.commission).toFixed(2)}</td>
                      <td style={{ padding: '16px 12px', fontSize: '14px' }}>
                        <span style={{
                          background: invoice.status === 'paid' ? '#D1FAE5' : '#FEE2E2',
                          color: invoice.status === 'paid' ? '#065F46' : '#7F1D1D',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                        }}>
                          {invoice.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invoices.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
                  No invoices found for current month
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommissionTracker;
