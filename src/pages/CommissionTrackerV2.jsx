import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { LogOut, TrendingUp, Users, DollarSign, RefreshCw, Mail, Filter, Download, Eye, EyeOff } from 'lucide-react';

const CommissionTrackerV2 = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [commissions, setCommissions] = useState([]);
  const [filteredCommissions, setFilteredCommissions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState(null);
  
  // App version
  const APP_VERSION = '2.0.0';
  
  // New state for features
  const [startDate, setStartDate] = useState('2025-01-01');
  const [endDate, setEndDate] = useState('2025-12-31');
  const [selectedReps, setSelectedReps] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState({
    enabled: true,
    frequency: 'weekly', // daily, weekly, monthly
    email: 'admin@cluster.local',
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  // Check mobile on resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check authentication
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
      localStorage.setItem('authToken', urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchCommissions(urlToken);
    } else {
      const savedToken = localStorage.getItem('authToken');
      if (savedToken) {
        setToken(savedToken);
        fetchCommissions(savedToken);
      }
    }
  }, []);

  // Fetch commissions when dates change
  useEffect(() => {
    if (token) {
      fetchCommissions(token);
    }
  }, [startDate, endDate]);

  // Update filtered commissions based on selected reps
  useEffect(() => {
    if (user?.isAdmin) {
      const filtered = commissions.filter(rep => selectedReps[rep.repName] !== false);
      setFilteredCommissions(filtered);
    } else {
      setFilteredCommissions(commissions);
    }
  }, [commissions, selectedReps, user]);

  const fetchCommissions = async (authToken = token) => {
    if (!authToken) return;

    try {
      setRefreshing(true);
      const response = await fetch(
        `${API_URL}/api/commissions?start=${startDate}&end=${endDate}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.commissions && Array.isArray(data.commissions)) {
        setCommissions(data.commissions);
        
        // Initialize all reps as selected
        const repsMap = {};
        data.commissions.forEach(rep => {
          repsMap[rep.repName] = true;
        });
        setSelectedReps(repsMap);

        if (data.user) {
          setUser(data.user);
        } else {
          setUser({
            name: 'Zoho User',
            email: 'zoho@user.com',
            isAdmin: true,
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch commissions:', error);
      alert('Failed to load commission data. Please try logging in again.');
      handleLogout();
    } finally {
      setRefreshing(false);
    }
  };

  const handleZohoLogin = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/zoho`);
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Failed to get auth URL:', error);
      alert('Failed to connect to Zoho. Please try again.');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setCommissions([]);
    localStorage.removeItem('authToken');
  };

  const handleRefresh = () => {
    if (token) {
      fetchCommissions(token);
    }
  };

  const toggleRep = (repName) => {
    setSelectedReps(prev => ({
      ...prev,
      [repName]: !prev[repName]
    }));
  };

  const downloadCSV = () => {
    const headers = ['Rep Name', 'Invoices', 'Commission', 'Avg per Invoice'];
    const rows = filteredCommissions.map(rep => [
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
  const totalCommission = filteredCommissions.reduce((sum, rep) => sum + rep.commission, 0);
  const avgCommission = filteredCommissions.length > 0 ? (totalCommission / filteredCommissions.length).toFixed(2) : 0;
  const activeReps = filteredCommissions.length;
  const topPerformer = filteredCommissions.length > 0 ? filteredCommissions.reduce((max, rep) => rep.commission > max.commission ? rep : max) : null;

  const chartData = filteredCommissions.map(rep => ({
    name: rep.repName.length > 15 ? rep.repName.substring(0, 12) + '...' : rep.repName,
    commission: parseFloat(rep.commission.toFixed(2)),
  }));

  if (!user) {
    return (
      <div style={styles.container}>
        <div style={styles.loginContainer}>
          <div style={styles.loginCard}>
            <div style={styles.logoSection}>
              <div style={styles.logoWrapper}>
                <img src="/cluster-on-light.svg" alt="Cluster Logo" style={styles.logoImage} />
                <span style={styles.alphaBadge}>ALPHA</span>
              </div>
            </div>
            
            <h2 style={styles.subtitle}>Commission Tracker</h2>
            <p style={styles.description}>Track your sales commissions in real-time</p>
            <p style={styles.versionText}>v{APP_VERSION}</p>

            <div style={styles.loginForm}>
              <button
                style={{ ...styles.demoButton, ...styles.demoButtonPrimary }}
                onClick={handleZohoLogin}
                disabled={loading}
              >
                🔗 Login with Zoho
              </button>
            </div>

            <p style={styles.footer}>Powered by Cluster Systems</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.dashboardContainer}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.headerLeft}>
            <div style={styles.headerLogoWrapper}>
              <img src="/cluster-on-light.svg" alt="Cluster Logo" style={styles.headerLogoImage} />
              <span style={styles.headerAlphaBadge}>ALPHA</span>
            </div>
            <div>
              <h1 style={styles.headerTitle}>Commission Tracker</h1>
              <p style={styles.headerSubtitle}>v{APP_VERSION} • Sales Performance Dashboard</p>
            </div>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.userInfo}>👤 {user.name}</span>
            <button
              style={styles.logoutButton}
              onClick={handleLogout}
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Controls Section */}
        <div style={styles.controlsSection}>
          {/* Date Picker */}
          <div style={styles.datePickerContainer}>
            <div style={styles.dateGroup}>
              <label style={styles.dateLabel}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={styles.dateInput}
              />
            </div>
            <div style={styles.dateGroup}>
              <label style={styles.dateLabel}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={styles.dateInput}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={styles.actionButtons}>
            <button
              style={styles.refreshButton}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={18} style={{ marginRight: '8px' }} />
              Refresh
            </button>
            <button
              style={styles.filterButton}
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter size={18} style={{ marginRight: '8px' }} />
              Filters
            </button>
            <button
              style={styles.downloadButton}
              onClick={downloadCSV}
            >
              <Download size={18} style={{ marginRight: '8px' }} />
              Export
            </button>
            {user.isAdmin && (
              <button style={styles.emailButton}>
                <Mail size={18} style={{ marginRight: '8px' }} />
                Email Settings
              </button>
            )}
          </div>
        </div>

        {/* Admin Filters Section */}
        {user.isAdmin && showFilters && (
          <div style={styles.filtersPanel}>
            <h3 style={styles.filterTitle}>Filter Sales Reps</h3>
            <div style={styles.repCheckboxes}>
              {commissions.map(rep => (
                <label key={rep.repName} style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={selectedReps[rep.repName] !== false}
                    onChange={() => toggleRep(rep.repName)}
                    style={styles.checkbox}
                  />
                  <span>{rep.repName}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Key Metrics */}
        <div style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <div style={{ ...styles.metricIcon, backgroundColor: '#FFE4D1' }}>
              <DollarSign size={24} color="#FF6B35" />
            </div>
            <div>
              <p style={styles.metricLabel}>Total Commission</p>
              <h3 style={styles.metricValue}>${totalCommission.toFixed(2)}</h3>
            </div>
          </div>

          <div style={styles.metricCard}>
            <div style={{ ...styles.metricIcon, backgroundColor: '#FFF0E6' }}>
              <TrendingUp size={24} color="#FF6B35" />
            </div>
            <div>
              <p style={styles.metricLabel}>Top Performer</p>
              <h3 style={styles.metricValue}>{topPerformer ? topPerformer.repName.substring(0, 20) : 'N/A'}</h3>
            </div>
          </div>

          <div style={styles.metricCard}>
            <div style={{ ...styles.metricIcon, backgroundColor: '#FFE4D1' }}>
              <Users size={24} color="#FF6B35" />
            </div>
            <div>
              <p style={styles.metricLabel}>Active Reps</p>
              <h3 style={styles.metricValue}>{activeReps}</h3>
            </div>
          </div>

          <div style={styles.metricCard}>
            <div style={{ ...styles.metricIcon, backgroundColor: '#FFF0E6' }}>
              <DollarSign size={24} color="#FF6B35" />
            </div>
            <div>
              <p style={styles.metricLabel}>Average Commission</p>
              <h3 style={styles.metricValue}>${avgCommission}</h3>
            </div>
          </div>
        </div>

        {/* Charts - Responsive */}
        <div style={styles.chartsGrid}>
          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Commission by Rep</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ bottom: isMobile ? 60 : 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis 
                  dataKey="name" 
                  angle={isMobile ? -45 : 0}
                  textAnchor={isMobile ? "end" : "middle"}
                  height={isMobile ? 100 : 30}
                />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="commission" fill="#FF6B35" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {!isMobile && (
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>Commission Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="commission"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#FF6B35', '#FF8C5A', '#FFA573', '#FFBA8C'][index % 4]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Commission Details Table */}
        <div style={styles.tableCard}>
          <h3 style={styles.chartTitle}>Commission Details</h3>
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeaderRow}>
                  <th style={styles.tableHeader}>Rep Name</th>
                  <th style={styles.tableHeader}>Invoices</th>
                  <th style={styles.tableHeader}>Commission</th>
                  <th style={styles.tableHeader}>Avg/Invoice</th>
                </tr>
              </thead>
              <tbody>
                {filteredCommissions.map((rep, idx) => (
                  <tr key={idx} style={styles.tableRow}>
                    <td style={styles.tableCell}>{rep.repName}</td>
                    <td style={styles.tableCell}>{rep.invoices || 0}</td>
                    <td style={{ ...styles.tableCell, color: '#FF6B35', fontWeight: '600' }}>
                      ${rep.commission.toFixed(2)}
                    </td>
                    <td style={styles.tableCell}>${rep.avgPerInvoice ? rep.avgPerInvoice.toFixed(2) : '0.00'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredCommissions.length === 0 && (
              <p style={{ ...styles.tableCell, textAlign: 'center', padding: '40px' }}>
                No commission data available for the selected filters.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1F2937 0%, #111827 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  loginContainer: {
    width: '100%',
    maxWidth: '420px',
  },
  loginCard: {
    background: '#FFFFFF',
    borderRadius: '12px',
    padding: '40px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '30px',
    justifyContent: 'center',
  },
  logoWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  logoImage: {
    height: '48px',
  },
  alphaBadge: {
    background: '#FF6B35',
    color: '#FFFFFF',
    fontSize: '10px',
    fontWeight: '700',
    padding: '4px 8px',
    borderRadius: '4px',
    letterSpacing: '0.5px',
    display: 'inline-block',
    whiteSpace: 'nowrap',
  },
  headerLogoWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  headerLogoImage: {
    height: '40px',
  },
  headerAlphaBadge: {
    background: '#FF6B35',
    color: '#FFFFFF',
    fontSize: '8px',
    fontWeight: '700',
    padding: '3px 6px',
    borderRadius: '3px',
    letterSpacing: '0.5px',
    display: 'inline-block',
    whiteSpace: 'nowrap',
  },
  versionText: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#9CA3AF',
    margin: '16px 0 0 0',
  },
  subtitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1F2937',
    margin: '0 0 8px 0',
    textAlign: 'center',
  },
  description: {
    fontSize: '14px',
    color: '#6B7280',
    textAlign: 'center',
    margin: '0 0 24px 0',
  },
  loginForm: {
    marginBottom: '24px',
  },
  demoButton: {
    padding: '12px',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  demoButtonPrimary: {
    background: '#FF6B35',
    color: '#FFFFFF',
    border: 'none',
    width: '100%',
    marginBottom: '12px',
  },
  footer: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#9CA3AF',
    margin: '0',
  },

  // Dashboard Styles
  dashboardContainer: {
    minHeight: '100vh',
    background: '#F9FAFB',
  },
  header: {
    background: '#FFFFFF',
    borderBottom: '1px solid #E5E7EB',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  headerContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flex: 1,
    minWidth: '200px',
  },
  headerTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1F2937',
    margin: '0',
  },
  headerSubtitle: {
    fontSize: '14px',
    color: '#6B7280',
    margin: '4px 0 0 0',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  userInfo: {
    fontSize: '14px',
    color: '#6B7280',
  },
  logoutButton: {
    padding: '8px 12px',
    background: '#EF4444',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  mainContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px',
    paddingBottom: '60px',
  },
  controlsSection: {
    background: '#FFFFFF',
    padding: '24px',
    borderRadius: '12px',
    marginBottom: '24px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  datePickerContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  },
  dateGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  dateLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: '8px',
  },
  dateInput: {
    padding: '10px',
    border: '1px solid #E5E7EB',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  actionButtons: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '12px',
  },
  refreshButton: {
    padding: '10px 16px',
    background: '#FF6B35',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
  },
  filterButton: {
    padding: '10px 16px',
    background: '#F3F4F6',
    color: '#1F2937',
    border: '1px solid #E5E7EB',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
  },
  downloadButton: {
    padding: '10px 16px',
    background: '#10B981',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
  },
  emailButton: {
    padding: '10px 16px',
    background: '#3B82F6',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s ease',
  },
  filtersPanel: {
    background: '#F9FAFB',
    padding: '16px',
    borderRadius: '8px',
    marginBottom: '16px',
    border: '1px solid #E5E7EB',
  },
  filterTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1F2937',
    margin: '0 0 12px 0',
  },
  repCheckboxes: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '12px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#1F2937',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  metricCard: {
    background: '#FFFFFF',
    padding: '24px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  metricIcon: {
    width: '56px',
    height: '56px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  metricLabel: {
    fontSize: '12px',
    color: '#6B7280',
    margin: '0 0 8px 0',
    fontWeight: '500',
  },
  metricValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1F2937',
    margin: '0',
  },
  chartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '24px',
    marginBottom: '24px',
  },
  chartCard: {
    background: '#FFFFFF',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  chartTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1F2937',
    margin: '0 0 16px 0',
  },
  tableCard: {
    background: '#FFFFFF',
    padding: '24px',
    borderRadius: '12px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeaderRow: {
    borderBottom: '2px solid #E5E7EB',
  },
  tableHeader: {
    padding: '12px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  tableRow: {
    borderBottom: '1px solid #E5E7EB',
    transition: 'background 0.3s ease',
  },
  tableCell: {
    padding: '16px 12px',
    fontSize: '14px',
    color: '#1F2937',
  },
};

export default CommissionTrackerV2;
