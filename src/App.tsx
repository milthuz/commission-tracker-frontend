import { lazy, Suspense, useEffect } from 'react';
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
import RepDashboard from './pages/Dashboard/RepDashboard';
import Profile from './pages/Profile';
import { Navigate } from 'react-router-dom';
import Versions from './pages/Versions';
import DefaultLayout from './layout/DefaultLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NewFeaturesProvider } from './context/NewFeaturesContext';
import DialogHost from './components/DialogHost';
import { PartnerAuthProvider } from './context/PartnerAuthContext';
import { PassAuthProvider } from './context/PassAuthContext';
import PassProtectedRoute from './components/PassProtectedRoute';
import PartnerProtectedRoute from './components/PartnerProtectedRoute';
import PartnerLayout from './layout/PartnerLayout';
import PartnerLogin from './pages/PartnerPortal/Login';
import PartnerAcceptInvite from './pages/PartnerPortal/AcceptInvite';
import PartnerResetPassword from './pages/PartnerPortal/ResetPassword';

// PERFORMANCE: everything below is lazy-loaded. Previously all 30 routes were statically imported
// here, producing ONE 2.70 MB chunk (687 KB gzip) that every user downloaded before first paint —
// so a sales rep landing on their dashboard was pulling the entire admin panel (37% of the app's
// source), the Zoho-billing pages, apexcharts (~512 KB, and neither RepDashboard nor
// ManagerDashboard renders a chart), and pdfjs (~448 KB, Proposals only).
//
// Kept EAGER on purpose: ZohoLogin / the auth + legal pages (first paint for a signed-out user),
// RepDashboard (the landing page for most users), Profile, Versions, and the layout/route guards.
const ECommerce = lazy(() => import('./pages/Dashboard/ECommerce'));
const ManagerDashboard = lazy(() => import('./pages/Dashboard/ManagerDashboard'));
const CommissionTracker = lazy(() => import('./pages/CommissionTracker'));
const CommissionReport = lazy(() => import('./pages/CommissionReport'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const SavingsCalculator = lazy(() => import('./pages/SavingsCalculator'));
const Reseller = lazy(() => import('./pages/Reseller'));
const Revenue = lazy(() => import('./pages/Revenue'));
const Resources = lazy(() => import('./pages/Resources'));
const KaizenDemo = lazy(() => import('./pages/KaizenDemo'));
const Proposals = lazy(() => import('./pages/Proposals'));
const PricingGuide = lazy(() => import('./pages/PricingGuide'));
const SaasIncrease = lazy(() => import('./pages/AdminPanel/SaasIncrease'));
const PartnerPortal = lazy(() => import('./pages/PartnerPortal'));
const PartnerProfile = lazy(() => import('./pages/PartnerPortal/Profile'));
const PartnerTeam = lazy(() => import('./pages/PartnerPortal/Team'));
const PartnerOrganization = lazy(() => import('./pages/PartnerPortal/Organization'));
const PassJoin = lazy(() => import('./pages/Pass/Join'));
const PassHub = lazy(() => import('./pages/Pass/Hub'));

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
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // PERFORMANCE: there used to be a hardcoded `setTimeout(() => setLoading(false), 1000)` here
  // that rendered nothing but <Loader /> for a fixed second on EVERY page load and hard refresh —
  // not tied to auth, data, or any async work (AuthContext tracks its own isLoading, and
  // ProtectedRoute already gates on it). That was a full second of artificial time-to-interactive
  // for every user, every visit. The timeout was also never cleared.
  return (
    <Suspense fallback={<Loader />}>
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

      {/* La Passe (SH-22) — adhésion et connexion des membres marchands. Route publique :
          elle est atteinte depuis un courriel, avant toute session. Le lien magique y
          revient avec ?token= et l'écran l'échange lui-même contre une session. */}
      <Route
        path="/pass/connexion"
        element={
          <>
            <PageTitle title="La Passe | Cluster" />
            <PassJoin />
          </>
        }
      />

      {/* La Passe — écrans membres. Aucun layout Sales Hub (pas de Sidebar) : un marchand
          n'est pas un utilisateur interne, il ne voit que son programme. */}
      <Route element={<PassProtectedRoute />}>
        <Route
          path="/pass"
          element={
            <>
              <PageTitle title="La Passe | Cluster" />
              <PassHub />
            </>
          }
        />
      </Route>

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
          <Route
            path="/partner-portal/team"
            element={
              <>
                <PageTitle title="Team | Sales Hub" />
                <PartnerTeam />
              </>
            }
          />
          <Route
            path="/partner-portal/organization"
            element={
              <>
                <PageTitle title="Organization | Sales Hub" />
                <PartnerOrganization />
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
    </Suspense>
  );
}

function App() {
  return (
    <AuthProvider>
      <PartnerAuthProvider>
        <PassAuthProvider>
          <NewFeaturesProvider>
            <AppContent />
            <DialogHost />
          </NewFeaturesProvider>
        </PassAuthProvider>
      </PartnerAuthProvider>
    </AuthProvider>
  );
}

export default App;
