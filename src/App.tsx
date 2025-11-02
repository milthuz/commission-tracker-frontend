import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';

import Loader from './common/Loader';
import PageTitle from './components/PageTitle';
import SignIn from './pages/Authentication/SignIn';
import ECommerce from './pages/Dashboard/ECommerce';
import Profile from './pages/Profile';
import Versions from './pages/Versions';
import DefaultLayout from './layout/DefaultLayout';
import CommissionTracker from './views/commission-tracker';

function App() {
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
    <DefaultLayout>
      <Routes>
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
              <PageTitle title="Commission Tracker | Cluster" />
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
          path="/versions"
          element={
            <>
              <PageTitle title="Version History | Commission Tracker" />
              <Versions />
            </>
          }
        />
        <Route
          path="/auth/signin"
          element={
            <>
              <PageTitle title="Sign In | Commission Tracker" />
              <SignIn />
            </>
          }
        />
      </Routes>
    </DefaultLayout>
  );
}

export default App;
