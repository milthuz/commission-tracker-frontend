import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function CommissionTracker() {
  const [user, setUser] = useState(null);
  const [currentMonthData, setCurrentMonthData] = useState([]);
  const [previousMonthData, setPreviousMonthData] = useState([]);
  const [customData, setCustomData] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [activeTab, setActiveTab] = useState('current');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4336';

  const getCurrentMonthDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  };

  const getPreviousMonthDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
  };

  useEffect(() => {
    const fetchData = async (token) => {
      if (!token) return;
      
      const currentMonth = getCurrentMonthDates();
      const previousMonth = getPreviousMonthDates();
      const timestamp = Date.now();
      
      try {
        const [currentRes, prevRes, invoicesRes] = await Promise.all([
          fetch(`${API_URL}/api/commissions?start=${currentMonth.start}&end=${currentMonth.end}&t=${timestamp}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
          }),
          fetch(`${API_URL}/api/commissions?start=${previousMonth.start}&end=${previousMonth.end}&t=${timestamp}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
          }),
          fetch(`${API_URL}/api/invoices?start=${currentMonth.start}&end=${currentMonth.end}&t=${timestamp}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
          })
        ]);

        setCurrentMonthData(currentRes.ok ? (await currentRes.json()).commissions || [] : []);
        setPreviousMonthData(prevRes.ok ? (await prevRes.json()).commissions || [] : []);
        setInvoices(invoicesRes.ok ? (await invoicesRes.json()).invoices || [] : []);
      } catch (e) {
        console.error('Fetch error:', e);
      }
      
      setLoading(false);
    };

    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    if (urlToken) {
      localStorage.setItem('authToken', urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      setUser({ name: 'Sales Rep' });
      setLoading(true);
      fetchData(urlToken);
    } else {
      const savedToken = localStorage.getItem('authToken');
      if (savedToken) {
        setUser({ name: 'Sales Rep' });
        setLoading(true);
        fetchData(savedToken);
      }
    }
  }, []);

  const handleZohoLogin = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/zoho`);
      const data = await response.json();
      if (data.authUrl) window.location.href = data.authUrl;
    } catch (error) {
      alert('Failed to login');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
  };

  const handleCustomDateFilter = async () => {
    if (!customStartDate || !customEndDate) {
      alert('Please select both dates');
      return;
    }

    const token = localStorage.getItem('authToken');
    if (token) {
      try {
        const res = await fetch(`${API_URL}/api/commissions?start=${customStartDate}&end=${customEndDate}&t=${Date.now()}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' }
        });
        if (res.ok) {
          const data = await res.json();
          setCustomData(data.commissions || []);
          setActiveTab('custom');
        }
      } catch (error) {
        alert('Failed to fetch data');
      }
    }
  };

  const calculateMetrics = (data) => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { total: 0, avg: 0, top: 'N/A' };
    }
    const total = data.reduce((sum, rep) => sum + (rep.commission || 0), 0);
    const avg = total / data.length;
    const top = data.reduce((max, rep) => (rep.commission || 0) > (max.commission || 0) ? rep : max);
    return { total: total.toFixed(2), avg: avg.toFixed(2), top: top.repName || 'N/A' };
  };

  const formatChartData = (data) => (data || []).map(rep => ({
    name: (rep.repName || 'Unknown').substring(0, 10),
    commission: parseFloat((rep.commission || 0).toFixed(2)),
  }));

  if (!user) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#f5f7fa',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '8px',
          padding: '40px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <h1 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>Commission Tracker</h1>
          <p style={{ color: '#6b7280', marginBottom: '32px' }}>Login to track sales commissions</p>
          <button
            onClick={handleZohoLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              background: '#3965ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Logging in...' : 'Login with Zoho'}
          </button>
        </div>
      </div>
    );
  }

  const current = calculateMetrics(currentMonthData);
  const previous = calculateMetrics(previousMonthData);
  const custom = calculateMetrics(customData);

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        background: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '20px', color: '#1f2937' }}>Commission Tracker</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Welcome, {user.name}</p>
        </div>
        <button onClick={handleLogout} style={{
          padding: '8px 16px',
          background: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px'
        }}>Logout</button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        background: 'white',
        padding: '12px',
        borderRadius: '8px'
      }}>
        {['current', 'previous', 'custom', 'invoices'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 16px',
              background: activeTab === tab ? '#3965ff' : '#f3f4f6',
              color: activeTab === tab ? 'white' : '#6b7280',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            {tab === 'current' ? 'Current' : tab === 'previous' ? 'Previous' : tab === 'custom' ? 'Custom' : 'Invoices'}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'current' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>Total</p>
              <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#3965ff' }}>${current.total}</p>
            </div>
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>Average</p>
              <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#3965ff' }}>${current.avg}</p>
            </div>
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>Top</p>
              <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#3965ff' }}>{current.top}</p>
            </div>
          </div>
          {currentMonthData.length > 0 && (
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={formatChartData(currentMonthData)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="commission" fill="#3965ff" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {activeTab === 'previous' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>Total</p>
              <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#3965ff' }}>${previous.total}</p>
            </div>
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>Average</p>
              <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#3965ff' }}>${previous.avg}</p>
            </div>
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>Top</p>
              <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#3965ff' }}>{previous.top}</p>
            </div>
          </div>
          {previousMonthData.length > 0 && (
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={formatChartData(previousMonthData)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="commission" fill="#3965ff" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {activeTab === 'custom' && (
        <div>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>Start</label>
                <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>End</label>
                <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
              </div>
            </div>
            <button onClick={handleCustomDateFilter} style={{ width: '100%', padding: '8px', background: '#3965ff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Filter</button>
          </div>
          {customData.length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>Total</p>
                  <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#3965ff' }}>${custom.total}</p>
                </div>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>Average</p>
                  <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#3965ff' }}>${custom.avg}</p>
                </div>
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>Top</p>
                  <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#3965ff' }}>{custom.top}</p>
                </div>
              </div>
              <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={formatChartData(customData)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="commission" fill="#3965ff" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', overflowX: 'auto' }}>
          {invoices.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0' }}>No invoices</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Invoice</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Salesperson</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Date</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Total</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', fontSize: '14px' }}>Commission</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontSize: '14px' }}>{inv.invoice_number}</td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>{inv.salesperson_name || '-'}</td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>{new Date(inv.date).toLocaleDateString()}</td>
                    <td style={{ padding: '12px', fontSize: '14px' }}>${(inv.total || 0).toFixed(2)}</td>
                    <td style={{ padding: '12px', fontSize: '14px', color: '#059669', fontWeight: '600' }}>${(inv.commission || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
