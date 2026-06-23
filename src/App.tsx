import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import './i18n';

import Loader from './common/Loader';
import PageTitle from './components/PageTitle';
import ZohoLogin from './pages/Authentication/ZohoLogin';
import ZohoCallback from './pages/Authentication/ZohoCallback';
import AcceptInvite from './pages/Authentication/AcceptInvite';
import ResetPassword from './pages/Authentication/ResetPassword';
import TermsOfService from './pages/Legal/TermsOfService';
import PrivacyPolicy from './pages/Legal/PrivacyPolicy';
import ECommerce from './pages/Dashboard/ECommerce';
import RepDashboard from './pages/Dashboard/RepDashboard';
import ManagerDashboard from './pages/Dashboard/ManagerDashboard';
import CommissionTracker from './pages/CommissionTracker';
import CommissionReport from './pages/CommissionReport';
import Profile from './pages/Profile';
import { Navigate } from 'react-router-dom';
import Versions from './pages/Versions';
import AdminPanel from './pages/AdminPanel';
import Reseller from './pages/Reseller';
import Revenue from './pages/Revenue';
import Resources from './pages/Resources';
import KaizenDemo from './pages/KaizenDemo';
import Proposals from './pages/Proposals';
import DefaultLayout from './layout/DefaultLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NewFeaturesProvider } from './context/NewFeaturesContext';
import DialogHost from './components/DialogHost';

// "/" adapts to the user's role:
//   • Admin (* / admin:access / dashboard:view_admin) → finance dashboard
//   • Manager (report:view_others, not admin) → team-performance dashboard
//   • everyone else (Sales Rep) → personal RepDashboard
function HomeRoute() {
  const { user } = useAuth();
  const perms = user?.permissions || [];
  const isAdmin = !!user?.isAdmin || perms.includes('*') || perms.includes('admin:access') || perms.includes('dashboard:view_admin');
  const isManager = perms.includes('report:view_others') || perms.includes('tracker:view_all_details');
  return (
    <>
      <PageTitle title="Sales Hub" />
      {isAdmin ? <ECommerce /> : isManager ? <ManagerDashboard /> : <RepDashboard />}
    </>
  );
}

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
            <PageTitle title="Sign In | Sales Hub" />
            <ZohoLogin />
          </>
        }
      />
      <Route
        path="/auth/zoho/callback"
        element={
          <>
            <PageTitle title="Authenticating | Sales Hub" />
            <ZohoCallback />
          </>
        }
      />
      <Route
        path="/terms"
        element={
          <>
            <PageTitle title="Terms of Service | Sales Hub" />
            <TermsOfService />
          </>
        }
      />
      <Route
        path="/privacy"
        element={
          <>
            <PageTitle title="Privacy Policy | Sales Hub" />
            <PrivacyPolicy />
          </>
        }
      />
      <Route
        path="/accept-invite"
        element={
          <>
            <PageTitle title="Invitation | Sales Hub" />
            <AcceptInvite />
          </>
        }
      />
      <Route
        path="/reset-password"
        element={
          <>
            <PageTitle title="Reset Password | Sales Hub" />
            <ResetPassword />
          </>
        }
      />

      {/* Protected Routes - Wrapped in DefaultLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DefaultLayout />}>
          <Route
            index
            element={<HomeRoute />}
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
                <PageTitle title="Profile | Sales Hub" />
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
                <PageTitle title="Versions | Sales Hub" />
                <Versions />
              </>
            }
          />
          <Route
            path="/reseller"
            element={
              <>
                <PageTitle title="Reseller | Sales Hub" />
                <Reseller />
              </>
            }
          />
          <Route
            path="/revenue"
            element={
              <>
                <PageTitle title="Processing Revenue | Sales Hub" />
                <Revenue />
              </>
            }
          />
          <Route
            path="/resources"
            element={
              <>
                <PageTitle title="Resources | Sales Hub" />
                <Resources />
              </>
            }
          />
          <Route
            path="/kaizen-demo"
            element={
              <>
                <PageTitle title="Kaizen DEMO | Sales Hub" />
                <KaizenDemo />
              </>
            }
          />
          <Route
            path="/proposals"
            element={
              <>
                <PageTitle title="Propositions | Sales Hub" />
                <Proposals />
              </>
            }
          />
          <Route
            path="/admin"
            element={
              <>
                <PageTitle title="Admin Panel | Sales Hub" />
                <AdminPanel />
              </>
            }
          />
          <Route
            path="/admin/:section"
            element={
              <>
                <PageTitle title="Admin Panel | Sales Hub" />
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
            <PageTitle title="404 | Sales Hub" />
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
        <DialogHost />
      </NewFeaturesProvider>
    </AuthProvider>
  );
}

export default App;
