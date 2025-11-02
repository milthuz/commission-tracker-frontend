import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Loader from '../../common/Loader';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

const ZohoCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');

      if (error) {
        setError('Authentication failed. Please try again.');
        setTimeout(() => navigate('/auth/zoho-login'), 3000);
        return;
      }

      if (!code) {
        setError('No authorization code received.');
        setTimeout(() => navigate('/auth/zoho-login'), 3000);
        return;
      }

      try {
        // Exchange code for token with backend
        const response = await fetch(`${API_URL}/api/auth/zoho/callback?code=${code}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to authenticate');
        }

        const data = await response.json();

        // Store user and token
        login(data.user, data.token);

        // Redirect to dashboard
        navigate('/', { replace: true });
      } catch (err) {
        console.error('Authentication error:', err);
        setError('Authentication failed. Please try again.');
        setTimeout(() => navigate('/auth/zoho-login'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, navigate, login]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-boxdark-2">
        <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-15 w-15 items-center justify-center rounded-full bg-danger/10">
              <svg
                className="h-8 w-8 text-danger"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-xl font-bold text-black dark:text-white">
              Authentication Failed
            </h3>
            <p className="text-sm text-bodydark">{error}</p>
            <p className="mt-2 text-xs text-bodydark">Redirecting to login...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-boxdark-2">
      <div className="text-center">
        <Loader />
        <p className="mt-4 text-sm text-bodydark">Completing authentication...</p>
      </div>
    </div>
  );
};

export default ZohoCallback;
