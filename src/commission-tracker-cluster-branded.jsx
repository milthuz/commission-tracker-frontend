import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { LogOut, TrendingUp, Users, DollarSign, RefreshCw } from 'lucide-react';

const CommissionTracker = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [commissions, setCommissions] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '2025-01-01', end: '2025-12-31' });

  // Mock data for demo
  const mockCommissions = [
    { repName: 'John Smith', invoices: 5, commission: 500, avgPerInvoice: 100 },
    { repName: 'Sarah Johnson', invoices: 8, commission: 800, avgPerInvoice: 100 },
    { repName: 'Mike Davis', invoices: 3, commission: 300, avgPerInvoice: 100 },
  ];

  const handleDemoLogin = (isAdmin = false) => {
    setLoading(true);
    setTimeout(() => {
      setUser({
        email: isAdmin ? 'admin@cluster.com' : 'demo@cluster.com',
        name: isAdmin ? 'Admin' : 'Demo',
        isAdmin,
      });
      setCommissions(mockCommissions);
      setLoading(false);
    }, 500);
  };

  const handleLogout = () => {
    setUser(null);
    setCommissions([]);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setCommissions(mockCommissions);
      setRefreshing(false);
    }, 500);
  };

  const totalCommission = commissions.reduce((sum, rep) => sum + rep.commission, 0);
  const avgCommission = commissions.length > 0 ? (totalCommission / commissions.length).toFixed(2) : 0;
  const activeReps = commissions.length;
  const topPerformer = commissions.length > 0 ? commissions.reduce((max, rep) => rep.commission > max.commission ? rep : max) : null;

  const chartData = commissions.map(rep => ({
    name: rep.repName,
    commission: rep.commission,
  }));

  const trendData = [
    { date: '2025-01', amount: 1000 },
    { date: '2025-02', amount: 2500 },
    { date: '2025-03', amount: 4200 },
  ];

  if (!user) {
    return (
      <div style={styles.container}>
        <div style={styles.loginContainer}>
          <div style={styles.loginCard}>
            <div style={styles.logoSection}>
              <img src="/cluster-on-dark.svg" alt="Cluster Logo" style={styles.logoImage} />
            </div>
            
            <h2 style={styles.subtitle}>Commission Tracker</h2>
            <p style={styles.description}>Track your sales commissions in real-time</p>

            <div style={styles.loginForm}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Email Address</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  style={styles.input}
                  disabled
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  style={styles.input}
                  disabled
                />
              </div>

              <button style={styles.signInButton} disabled>
                Sign In
              </button>
            </div>

            <div style={styles.divider}>
              <span>or try demo</span>
            </div>

            <div style={styles.demoButtons}>
              <button
                style={{ ...styles.demoButton, ...styles.demoButtonPrimary }}
                onClick={() => handleDemoLogin(false)}
                disabled={loading}
              >
                👤 Sales Rep Demo
              </button>
              <button
                style={{ ...styles.demoButton, ...styles.demoButtonSecondary }}
                onClick={() => handleDemoLogin(true)}
                disabled={loading}
              >
                👨‍💼 Admin Demo
              </button>
            </div>

            <p style={styles.footer}>Powered by Cluster POS</p>
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
            <img src="/cluster-on-dark.svg" alt="Cluster Logo" style={styles.headerLogoImage} />
            <div>
              <h1 style={styles.headerTitle}>Commission Tracker</h1>
              <p style={styles.headerSubtitle}>Sales Performance Dashboard</p>
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
        {/* Controls */}
        <div style={styles.controls}>
          <div style={styles.dateControls}>
            <div style={styles.dateGroup}>
              <label style={styles.dateLabel}>Start Date</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                style={styles.dateInput}
              />
            </div>
            <div style={styles.dateGroup}>
              <label style={styles.dateLabel}>End Date</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                style={styles.dateInput}
              />
            </div>
          </div>
          <button
            style={styles.refreshButton}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={18} style={{ marginRight: '8px' }} />
            Refresh
          </button>
        </div>

        {/* Key Metrics */}
        <div style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <div style={styles.metricIcon} style={{ ...styles.metricIcon, backgroundColor: '#FFE4D1' }}>
              <DollarSign size={24} color="#FF6B35" />
            </div>
            <div>
              <p style={styles.metricLabel}>Total Commission</p>
              <h3 style={styles.metricValue}>${totalCommission.toFixed(2)}</h3>
            </div>
          </div>

          <div style={styles.metricCard}>
            <div style={styles.metricIcon} style={{ ...styles.metricIcon, backgroundColor: '#FFF0E6' }}>
              <TrendingUp size={24} color="#FF6B35" />
            </div>
            <div>
              <p style={styles.metricLabel}>Top Performer</p>
              <h3 style={styles.metricValue}>{topPerformer ? topPerformer.repName : 'N/A'}</h3>
            </div>
          </div>

          <div style={styles.metricCard}>
            <div style={styles.metricIcon} style={{ ...styles.metricIcon, backgroundColor: '#FFE4D1' }}>
              <Users size={24} color="#FF6B35" />
            </div>
            <div>
              <p style={styles.metricLabel}>Active Reps</p>
              <h3 style={styles.metricValue}>{activeReps}</h3>
            </div>
          </div>

          <div style={styles.metricCard}>
            <div style={styles.metricIcon} style={{ ...styles.metricIcon, backgroundColor: '#FFF0E6' }}>
              <DollarSign size={24} color="#FF6B35" />
            </div>
            <div>
              <p style={styles.metricLabel}>Average Commission</p>
              <h3 style={styles.metricValue}>${avgCommission}</h3>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div style={styles.chartsGrid}>
          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Commission by Rep</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" />
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

          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>Cumulative Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFF',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#FF6B35"
                  strokeWidth={2}
                  dot={{ fill: '#FF6B35', r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Details Table */}
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
                {commissions.map((rep, idx) => (
                  <tr key={idx} style={styles.tableRow}>
                    <td style={styles.tableCell}>{rep.repName}</td>
                    <td style={styles.tableCell}>{rep.invoices}</td>
                    <td style={styles.tableCell} style={{ ...styles.tableCell, color: '#FF6B35', fontWeight: '600' }}>
                      ${rep.commission.toFixed(2)}
                    </td>
                    <td style={styles.tableCell}>${rep.avgPerInvoice.toFixed(2)}</td>
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

// ============================================================================
// STYLES - Modern, Professional Design
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
  logoIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #FF6B35, #FF8C42)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#FFFFFF',
    fontSize: '24px',
    fontWeight: 'bold',
    marginRight: '12px',
  },
  logoImage: {
    height: '48px',
    marginRight: '16px',
  },
  headerLogoImage: {
    height: '40px',
    marginRight: '12px',
  },
  logoText: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1F2937',
    margin: '0',
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
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '12px',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    fontSize: '14px',
    boxSizing: 'border-box',
    transition: 'all 0.3s ease',
  },
  signInButton: {
    width: '100%',
    padding: '12px',
    background: '#FF6B35',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '24px 0',
    color: '#9CA3AF',
    fontSize: '14px',
  },
  demoButtons: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
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
  },
  demoButtonSecondary: {
    background: '#F3F4F6',
    color: '#1F2937',
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
  },
  headerContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
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
  },
  controls: {
    background: '#FFFFFF',
    padding: '24px',
    borderRadius: '12px',
    marginBottom: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: '24px',
  },
  dateControls: {
    display: 'flex',
    gap: '16px',
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
    transition: 'all 0.3s ease',
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
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

export default CommissionTracker;
