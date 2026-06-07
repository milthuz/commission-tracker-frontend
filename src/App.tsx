import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import './i18n';

import Loader from './common/Loader';
import PageTitle from './components/PageTitle';
import ZohoLogin from './pages/Authentication/ZohoLogin';
import ZohoCallback from './pages/Authentication/ZohoCallback';
import ECommerce from './pages/Dashboard/ECommerce';
import CommissionTracker from './pages/CommissionTracker';
import CommissionReport from './pages/CommissionReport';
import Profile from './pages/Profile';
import { Navigate } from 'react-router-dom';
import Versions from './pages/Versions';
import AdminPanel from './pages/AdminPanel';
import Reseller from './pages/Reseller';
import Revenue from './pages/Revenue';
import DefaultLayout from './layout/DefaultLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { NewFeaturesProvider } from './context/NewFeaturesContext';

function AppContent() {
  const [loading, setLoading] = useState<boolean>(true);
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    setTimeout(() => setLoading(false), 1000);
  }, []);

  return loading ? (
    <Loader />
  ) : (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/auth/zoho-login"
        element={
          <>
            <PageTitle title="Sign In | Commission Tracker" />
            <ZohoLogin />
          </>
        }
      />
      <Route
        path="/auth/zoho/callback"
        element={
          <>
            <PageTitle title="Authenticating | Commission Tracker" />
            <ZohoCallback />
          </>
        }
      />

      {/* Protected Routes - Wrapped in DefaultLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DefaultLayout />}>
          <Route
            index
            element={
              <>
                <PageTitle title="Sales Hub | Commission Tracker" />
                <ECommerce />
              </>
            }
          />
          <Route
            path="/commission-tracker"
            element={
              <>
                <PageTitle title="Commission Tracker" />
                <CommissionTracker />
              </>
            }
          />
          <Route
            path="/commission-report"
            element={
              <>
                <PageTitle title="Commission Report" />
                <CommissionReport />
              </>
            }
          />
          <Route
            path="/profile"
            element={
              <>
                <PageTitle title="Profile | Commission Tracker" />
                <Profile />
              </>
            }
          />
          <Route
            path="/settings"
            element={<Navigate to="/profile" replace />}
          />
          <Route
            path="/versions"
            element={
              <>
                <PageTitle title="Versions | Commission Tracker" />
                <Versions />
              </>
            }
          />
          <Route
            path="/reseller"
            element={
              <>
                <PageTitle title="Reseller | Commission Tracker" />
                <Reseller />
              </>
            }
          />
          <Route
            path="/revenue"
            element={
              <>
                <PageTitle title="Processing Revenue | Commission Tracker" />
                <Revenue />
              </>
            }
          />
          <Route
            path="/admin"
            element={
              <>
                <PageTitle title="Admin Panel | Commission Tracker" />
                <AdminPanel />
              </>
            }
          />
          <Route
            path="/admin/:section"
            element={
              <>
                <PageTitle title="Admin Panel | Commission Tracker" />
                <AdminPanel />
              </>
            }
          />
        </Route>
      </Route>

      {/* Catch all - redirect to login if not authenticated */}
      <Route
        path="*"
        element={
          <>
            <PageTitle title="404 | Commission Tracker" />
            <ZohoLogin />
          </>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <NewFeaturesProvider>
        <AppContent />
      </NewFeaturesProvider>
    </AuthProvider>
  );
}

export default App;
