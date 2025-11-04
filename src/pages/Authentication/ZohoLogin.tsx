import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import packageJson from '../../../package.json';

const apiUrl = import.meta.env.VITE_API_URL;

const ZohoLogin = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleZohoLogin = () => {
    window.location.href = `${apiUrl}/api/auth/zoho`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-boxdark-2">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg dark:bg-boxdark">
        {/* Logo and Title */}
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <h1 className="text-4xl font-bold">
              <span className="text-danger">c</span>
              <span className="text-black dark:text-white">luster</span>
            </h1>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-black dark:text-white">
            Commission Tracker
          </h2>
          <div className="flex items-center justify-center gap-2">
            <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-white">
              BETA
            </span>
            <span className="text-sm text-body">v{packageJson.version}</span>
          </div>
        </div>

        {/* Description */}
        <p className="mb-6 text-center text-sm text-body">
          Sign in with your Zoho account to continue
        </p>

        {/* Zoho Login Button */}
        <button
          onClick={handleZohoLogin}
          className="flex w-full items-center justify-center gap-3 rounded-lg bg-primary px-6 py-3 font-medium text-white transition hover:bg-opacity-90"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 0C4.477 0 0 4.477 0 10C0 15.523 4.477 20 10 20C15.523 20 20 15.523 20 10C20 4.477 15.523 0 10 0Z"
              fill="currentColor"
            />
          </svg>
          Sign in with Zoho
        </button>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-body">
          Powered by Cluster Systems
        </div>

        <div className="mt-4 text-center text-xs text-body">
          By signing in, you agree to our{' '}
          <a href="#" className="text-primary hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="text-primary hover:underline">
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  );
};

export default ZohoLogin;
