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
import SavingsCalculator from './pages/SavingsCalculator';
import Reseller from './pages/Reseller';
import Revenue from './pages/Revenue';
import Resources from './pages/Resources';
import KaizenDemo from './pages/KaizenDemo';
import Proposals from './pages/Proposals';
import PricingGuide from './pages/PricingGuide';
import SaasIncrease from './pages/AdminPanel/SaasIncrease';
import DefaultLayout from './layout/DefaultLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NewFeaturesProvider } from './context/NewFeaturesContext';
import DialogHost from './components/DialogHost';
import { PartnerAuthProvider } from './context/PartnerAuthContext';
import PartnerProtectedRoute from './components/PartnerProtectedRoute';
import PartnerLayout from './layout/PartnerLayout';
import PartnerLogin from './pages/PartnerPortal/Login';
import PartnerAcceptInvite from './pages/PartnerPortal/AcceptInvite';
import PartnerResetPassword from './pages/PartnerPortal/ResetPassword';
import PartnerPortal from './pages/PartnerPortal';
import PartnerProfile from './pages/PartnerPortal/Profile';

// "/" adapts to the user's role:
//   • Admin (* / admin:access / dashboard:view_admin) → finance dashboard
//   • Manager (report:view_others, not admin) → team-performance dashboard
//   • everyone else (Sales Rep) → personal RepDashboard
function HomeRoute() {
  const { user } = useAuth();
  const perms = user?.permissions || [];
  const isAdmin = !!user?.isAdmin || perms.includes('*') || perms.includes('admin:access') || perms.includes('dashboard:view_admin');
  const isManager = perms.includes('report:view_others') || perms.includes('tracker:view_all_details');
  const canRepDash = perms.includes('dashboard:view_own');
  let body;
  if (isAdmin) body = <ECommerce />;
  else if (isManager) body = <ManagerDashboard />;
  else if (canRepDash) body = <RepDashboard />;
  // No dashboard permission → send them to a page they can use.
  else if (perms.includes('report:view_own') || perms.includes('report:view_others')) body = <Navigate to="/commission-report" replace />;
  else body = <Navigate to="/profile" replace />;
  return (
    <>
      <PageTitle title="Sales Hub" />
      {body}
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

      {/* Partner Portal — public auth routes. Deliberately its own PartnerAuthProvider/route
          tree (see PartnerLayout's comment) rather than nested under the internal auth routes. */}
      <Route
        path="/partner-portal/login"
        element={
          <>
            <PageTitle title="Partner Portal | Sales Hub" />
            <PartnerLogin />
          </>
        }
      />
      <Route
        path="/partner-portal/accept-invite"
        element={
          <>
            <PageTitle title="Invitation | Sales Hub" />
            <PartnerAcceptInvite />
          </>
        }
      />
      <Route
        path="/partner-portal/reset-password"
        element={
          <>
            <PageTitle title="Reset Password | Sales Hub" />
            <PartnerResetPassword />
          </>
        }
      />

      {/* Partner Portal — protected routes, own layout (no Sidebar), own auth guard. */}
      <Route element={<PartnerProtectedRoute />}>
        <Route element={<PartnerLayout />}>
          <Route
            path="/partner-portal"
            element={
              <>
                <PageTitle title="Partner Portal | Sales Hub" />
                <PartnerPortal />
              </>
            }
          />
          <Route
            path="/partner-portal/profile"
            element={
              <>
                <PageTitle title="Profile | Sales Hub" />
                <PartnerProfile />
              </>
            }
          />
        </Route>
      </Route>

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
          <Route path="/hardware" element={<Navigate to="/pricing-guide" replace />} />
          <Route
            path="/pricing-guide"
            element={
              <>
                <PageTitle title="Hardware & Service Guide | Sales Hub" />
                <PricingGuide />
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
            path="/savings"
            element={
              <>
                <PageTitle title="Calculateur d'économies | Sales Hub" />
                <SavingsCalculator />
              </>
            }
          />
          <Route
            path="/saas-increase"
            element={
              <>
                <PageTitle title="SaaS Increase | Sales Hub" />
                <SaasIncrease />
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
      <PartnerAuthProvider>
        <NewFeaturesProvider>
          <AppContent />
          <DialogHost />
        </NewFeaturesProvider>
      </PartnerAuthProvider>
    </AuthProvider>
  );
}

export default App;
