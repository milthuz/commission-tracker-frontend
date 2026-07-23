import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { usePartnerAuth } from '../context/PartnerAuthContext';
import Loader from '../common/Loader';

const PartnerProtectedRoute = () => {
  const { isAuthenticated, isLoading } = usePartnerAuth();
  const location = useLocation();

  if (isLoading) {
    return <Loader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/partner-portal/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export default PartnerProtectedRoute;
