import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ClusterLogo from '../../images/logo/cluster-on-light.svg';
import packageJson from '../../../package.json';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

const ZohoLogin = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  const handleZohoLogin = async () => {
    try {
      // Fetch the auth URL from backend
      const response = await fetch(`${API_URL}/api/auth/zoho`);
      const data = await response.json();

      if (data.authUrl) {
        // Redirect to Zoho OAuth page
        window.location.href = data.authUrl;
      } else {
        console.error('No auth URL received from backend');
      }
    } catch (error) {
      console.error('Failed to initiate Zoho login:', error);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-boxdark-2 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6.5 py-5 dark:border-strokedark">
            <div className="flex justify-center">
              <img src={ClusterLogo} alt="Cluster" className="h-10 w-auto" />
            </div>
          </div>

          <div className="p-6.5">
            <div className="mb-6 text-center">
              <h2 className="mb-2 text-2xl font-bold text-black dark:text-white">
                Commission Tracker
              </h2>
              <div className="flex items-center justify-center gap-2">
                <span className="rounded-full bg-warning px-3 py-1 text-xs font-bold text-white">
                  BETA
                </span>
                <span className="text-sm font-semibold text-bodydark">
                  v{packageJson.version}
                </span>
              </div>
              <p className="mt-4 text-sm text-bodydark">
                Sign in with your Zoho account to continue
              </p>
            </div>

            <button
              onClick={handleZohoLogin}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-stroke bg-gray p-4 hover:bg-opacity-50 dark:border-strokedark dark:bg-meta-4 dark:hover:bg-opacity-50 transition-all duration-200"
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M23.5 12C23.5 5.649 18.351 0.5 12 0.5C5.649 0.5 0.5 5.649 0.5 12C0.5 18.351 5.649 23.5 12 23.5C18.351 23.5 23.5 18.351 23.5 12Z"
                  fill="#1D8AC7"
                />
                <path
                  d="M6 9H18V15H6V9Z"
                  fill="white"
                />
              </svg>
              <span className="text-base font-medium text-black dark:text-white">
                Sign in with Zoho
              </span>
            </button>

            <div className="mt-6 text-center">
              <p className="text-xs text-bodydark">
                Powered by <span className="font-semibold">Cluster Systems</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 text-center">
          <p className="text-sm text-bodydark">
            By signing in, you agree to our{' '}
            <a href="#" className="text-primary hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="text-primary hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ZohoLogin;
