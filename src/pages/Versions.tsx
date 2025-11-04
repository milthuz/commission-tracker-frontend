import React from 'react';

const Versions: React.FC = () => {
  return (
    <div className="mx-auto max-w-270">
      <div className="grid grid-cols-1 gap-8">
        <div className="col-span-12">
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke py-4 px-7 dark:border-strokedark">
              <h3 className="font-medium text-black dark:text-white">
                Version History
              </h3>
            </div>

            <div className="p-7">
              <div className="mb-5.5">
                <h4 className="mb-3 text-xl font-semibold text-black dark:text-white">
                  Commission Tracker v0.2.3
                </h4>
                <p className="text-sm text-body">Released: November 3, 2025</p>
              </div>

              <div className="space-y-6">
                {/* Version 0.2.3 */}
                <div className="border-l-4 border-primary pl-4">
                  <h5 className="mb-2 font-medium text-black dark:text-white">
                    v0.2.3 - Current
                  </h5>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>✅ Full Zoho OAuth authentication</li>
                    <li>✅ User profile with photo from Zoho</li>
                    <li>✅ Protected routes and secure login</li>
                    <li>✅ JWT token management</li>
                    <li>✅ Real-time user info sync</li>
                  </ul>
                </div>

                {/* Version 0.2.2 */}
                <div className="border-l-4 border-stroke pl-4 dark:border-strokedark">
                  <h5 className="mb-2 font-medium text-black dark:text-white">
                    v0.2.2
                  </h5>
                  <ul className="list-disc list-inside space-y-1 text-sm text-body">
                    <li>Authentication system setup</li>
                    <li>Backend OAuth integration</li>
                    <li>Database token storage</li>
                  </ul>
                </div>

                {/* Version 0.2.1 */}
                <div className="border-l-4 border-stroke pl-4 dark:border-strokedark">
                  <h5 className="mb-2 font-medium text-black dark:text-white">
                    v0.2.1
                  </h5>
                  <ul className="list-disc list-inside space-y-1 text-sm text-body">
                    <li>Initial frontend setup</li>
                    <li>React Router configuration</li>
                    <li>TailAdmin theme integration</li>
                  </ul>
                </div>

                {/* Version 0.2.0 */}
                <div className="border-l-4 border-stroke pl-4 dark:border-strokedark">
                  <h5 className="mb-2 font-medium text-black dark:text-white">
                    v0.2.0
                  </h5>
                  <ul className="list-disc list-inside space-y-1 text-sm text-body">
                    <li>Project initialization</li>
                    <li>Backend API setup with Express</li>
                    <li>Zoho Books integration planning</li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 rounded-md bg-gray-2 p-4 dark:bg-meta-4">
                <p className="text-sm text-body">
                  <strong>Coming Soon:</strong> Commission tracking dashboard, Invoice sync from Zoho Books, 
                  Sales rep management, Commission calculation engine
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Versions;
