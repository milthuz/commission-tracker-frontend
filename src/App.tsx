import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import Loader from './common/Loader';
import PageTitle from './components/PageTitle';
import ZohoLogin from './pages/Authentication/ZohoLogin';
import ZohoCallback from './pages/Authentication/ZohoCallback';
import ECommerce from './pages/Dashboard/ECommerce';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import CommissionTracker from './pages/CommissionTracker';
import Versions from './pages/Versions';
import DefaultLayout from './layout/DefaultLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';

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
                <PageTitle title="Dashboard | Commission Tracker" />
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
            element={
              <>
                <PageTitle title="Settings | Commission Tracker" />
                <Settings />
              </>
            }
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
      <AppContent />
    </AuthProvider>
  );
}

export default App;
