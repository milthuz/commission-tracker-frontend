import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LogOut, RefreshCw, Download } from 'lucide-react';

const CommissionTracker = () => {
  const [user, setUser] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('2025-01-01');
  const [endDate, setEndDate] = useState('2025-12-31');
  const [refreshing, setRefreshing] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4336';

  // Fetch commissions from API
  const fetchCommissions = async (authToken) => {
    if (!authToken) {
      console.error('❌ No auth token');
      return;
    }

    try {
      setRefreshing(true);
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

      console.log('📊 Response status:', response.status);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Data received:', data);

      if (data.commissions && Array.isArray(data.commissions)) {
        console.log(`📈 Setting ${data.commissions.length} commissions`);
        setCommissions(data.commissions);
      }
    } catch (error) {
      console.error('❌ Fetch error:', error);
      alert('Failed to load commissions: ' + error.message);
    } finally {
      setRefreshing(false);
    }
  };

  // Check authentication on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    if (urlToken) {
      console.log('✅ Token found in URL');
      localStorage.setItem('authToken', urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      setUser({ name: 'Sales Rep', email: 'rep@cluster.local', isAdmin: true });
      fetchCommissions(urlToken);
    } else {
      const savedToken = localStorage.getItem('authToken');
      if (savedToken) {
        console.log('✅ Token found in localStorage');
        setUser({ name: 'Sales Rep', email: 'rep@cluster.local', isAdmin: true });
        fetchCommissions(savedToken);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch when dates change
  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('authToken');
      if (token) {
        console.log(`📅 Dates changed! Fetching with start=${startDate}, end=${endDate}`);
        fetchCommissions(token);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

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
    setCommissions([]);
  };

  const handleRefresh = () => {
    const token = localStorage.getItem('authToken');
    if (token) {
      fetchCommissions(token);
    }
  };

  const downloadCSV = () => {
    const headers = ['Rep Name', 'Invoices', 'Commission', 'Avg per Invoice'];
    const rows = commissions.map(rep => [
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
    a.download = `commissions-${startDate}-to-${endDate}.csv`;
    a.click();
  };

  // Calculate metrics
  const totalCommission = commissions.reduce((sum, rep) => sum + rep.commission, 0);
  const avgCommission = commissions.length > 0 ? (totalCommission / commissions.length).toFixed(2) : 0;
  const topPerformer = commissions.length > 0 ? commissions.reduce((max, rep) => rep.commission > max.commission ? rep : max) : null;

  const chartData = commissions.map(rep => ({
    name: rep.repName.length > 15 ? rep.repName.substring(0, 12) + '...' : rep.repName,
    commission: parseFloat(rep.commission.toFixed(2)),
  }));

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {/* Version badge */}
        <div style={{ position: 'absolute', top: '24px', right: '24px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ background: '#FF6B35', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>BETA</span>
          <span style={{ color: '#9CA3AF', fontSize: '12px' }}>v0.1</span>
        </div>

        <div style={{ textAlign: 'center', background: 'white', padding: '48px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '400px' }}>
          {/* Logo */}
          <div style={{ marginBottom: '24px' }}>
            <img 
              src="/cluster-on-dark.svg" 
              alt="Cluster Systems" 
              style={{ height: '40px', margin: '0 auto', display: 'block' }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
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
              transition: 'opacity 0.2s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Logging in...' : '🔗 Login with Zoho'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img 
              src="/cluster-on-dark.svg" 
              alt="Cluster Systems" 
              style={{ height: '32px' }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1F2937', margin: 0 }}>Commission Tracker</h1>
              <p style={{ fontSize: '14px', color: '#6B7280', margin: '4px 0 0 0' }}>Sales Performance Dashboard</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
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
        {/* Controls */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '14px', fontWeight: '500', color: '#1F2937', marginBottom: '8px', display: 'block' }}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
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
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
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
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                padding: '10px 16px',
                background: '#FF6B35',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              <RefreshCw size={18} style={{ marginRight: '8px' }} />
              Refresh
            </button>
            <button
              onClick={downloadCSV}
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
              <Download size={18} style={{ marginRight: '8px' }} />
              Export
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Total Commission</p>
            <p style={{ fontSize: '24px', fontWeight: '700', color: '#1F2937', margin: 0 }}>${totalCommission.toFixed(2)}</p>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Average Commission</p>
            <p style={{ fontSize: '24px', fontWeight: '700', color: '#1F2937', margin: 0 }}>${avgCommission}</p>
          </div>
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 8px 0', fontWeight: '500' }}>Top Performer</p>
            <p style={{ fontSize: '24px', fontWeight: '700', color: '#1F2937', margin: 0 }}>{topPerformer?.repName || 'N/A'}</p>
          </div>
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1F2937', margin: '0 0 16px 0' }}>Commissions by Rep</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="commission" fill="#FF6B35" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Table */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1F2937', margin: '0 0 16px 0' }}>Commission Details</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>Rep Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>Invoices</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>Commission</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>Avg per Invoice</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((rep, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '16px 12px', fontSize: '14px', color: '#1F2937' }}>{rep.repName}</td>
                    <td style={{ padding: '16px 12px', fontSize: '14px', color: '#1F2937' }}>{rep.invoices}</td>
                    <td style={{ padding: '16px 12px', fontSize: '14px', color: '#1F2937' }}>${rep.commission.toFixed(2)}</td>
                    <td style={{ padding: '16px 12px', fontSize: '14px', color: '#1F2937' }}>${rep.avgPerInvoice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommissionTracker;
