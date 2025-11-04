import React from 'react';

const Versions: React.FC = () => {
  return (
    <div className="mx-auto max-w-270">
      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">
          Version History
        </h2>
      </div>

      {/* Version Cards */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke py-4 px-6.5 dark:border-strokedark">
          <h3 className="font-medium text-black dark:text-white">
            Commission Tracker Releases
          </h3>
        </div>
        
        <div className="p-6.5">
          {/* Version 0.2.4 - Current */}
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success">
                <svg
                  className="fill-white"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M10 0.5625C4.78125 0.5625 0.5625 4.78125 0.5625 10C0.5625 15.2188 4.78125 19.4375 10 19.4375C15.2188 19.4375 19.4375 15.2188 19.4375 10C19.4375 4.78125 15.2188 0.5625 10 0.5625ZM10 17.8125C5.65625 17.8125 2.1875 14.3438 2.1875 10C2.1875 5.65625 5.65625 2.1875 10 2.1875C14.3438 2.1875 17.8125 5.65625 17.8125 10C17.8125 14.3438 14.3438 17.8125 10 17.8125Z"
                    fill=""
                  />
                  <path
                    d="M13.2812 7.34375L8.84375 11.7812L6.71875 9.65625C6.4375 9.375 5.96875 9.375 5.6875 9.65625C5.40625 9.9375 5.40625 10.4062 5.6875 10.6875L8.34375 13.3438C8.46875 13.4688 8.65625 13.5625 8.84375 13.5625C9.03125 13.5625 9.21875 13.5 9.34375 13.3438L14.3125 8.375C14.5938 8.09375 14.5938 7.625 14.3125 7.34375C14.0312 7.0625 13.5625 7.0625 13.2812 7.34375Z"
                    fill=""
                  />
                </svg>
              </span>
              <div>
                <h4 className="text-xl font-semibold text-black dark:text-white">
                  Version 0.2.4
                </h4>
                <p className="text-sm text-body">Current Release • November 3, 2025</p>
              </div>
            </div>
            <div className="ml-15 space-y-2">
              <div className="flex items-start gap-2">
                <span className="mt-1 text-success">✓</span>
                <p>Fixed user profile photo sync from Zoho</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 text-success">✓</span>
                <p>Cleaned up header UI (removed dark mode toggle and help icon)</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 text-success">✓</span>
                <p>Moved Help & Info section into user dropdown menu</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 text-success">✓</span>
                <p>Added working Version History page with routing</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 text-success">✓</span>
                <p>Fixed DefaultLayout to properly render nested routes</p>
              </div>
            </div>
          </div>

          {/* Version 0.2.3 */}
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
                <svg
                  className="fill-white"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM10 18C5.59 18 2 14.41 2 10C2 5.59 5.59 2 10 2C14.41 2 18 5.59 18 10C18 14.41 14.41 18 10 18Z" fill=""/>
                  <path d="M10.5 5H9.5V11H15.5V10H10.5V5Z" fill=""/>
                </svg>
              </span>
              <div>
                <h4 className="text-xl font-semibold text-black dark:text-white">
                  Version 0.2.3
                </h4>
                <p className="text-sm text-body">November 3, 2025</p>
              </div>
            </div>
            <div className="ml-15 space-y-2">
              <div className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <p>Full Zoho OAuth 2.0 authentication system</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <p>User profile with photo sync from Zoho</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <p>Protected routes with JWT token management</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <p>Secure login/logout functionality</p>
              </div>
            </div>
          </div>

          {/* Version 0.2.2 */}
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-meta-3">
                <svg
                  className="fill-white"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM10 18C5.59 18 2 14.41 2 10C2 5.59 5.59 2 10 2C14.41 2 18 5.59 18 10C18 14.41 14.41 18 10 18Z" fill=""/>
                  <path d="M10.5 5H9.5V11H15.5V10H10.5V5Z" fill=""/>
                </svg>
              </span>
              <div>
                <h4 className="text-xl font-semibold text-black dark:text-white">
                  Version 0.2.2
                </h4>
                <p className="text-sm text-body">November 2, 2025</p>
              </div>
            </div>
            <div className="ml-15 space-y-2">
              <div className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <p>Authentication system foundation</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <p>Backend OAuth integration with Zoho</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1">•</span>
                <p>PostgreSQL database setup</p>
              </div>
            </div>
          </div>

          {/* Coming Soon */}
          <div className="mt-10 rounded-lg border-2 border-dashed border-stroke p-6 dark:border-strokedark">
            <h4 className="mb-4 text-lg font-semibold text-black dark:text-white">
              🚀 Coming Soon in v0.3.0
            </h4>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="mt-1 text-warning">→</span>
                <p>Commission tracking dashboard with real-time data</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 text-warning">→</span>
                <p>Automated invoice sync from Zoho Books</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 text-warning">→</span>
                <p>Sales representative management system</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 text-warning">→</span>
                <p>Commission calculation engine with custom rules</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Versions;
