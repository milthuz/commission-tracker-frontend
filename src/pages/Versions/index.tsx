import React, { useEffect, useState } from 'react';
import Breadcrumb from '../../components/Breadcrumbs/Breadcrumb';
import packageJson from '../../../package.json';

interface Release {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

const Versions: React.FC = () => {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReleases = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          'https://api.github.com/repos/milthuz/commission-tracker-frontend/releases'
        );
        
        if (!response.ok) {
          // If no releases found, just show empty state
          setReleases([]);
          setError(null);
        } else {
          const data = await response.json();
          setReleases(data || []);
          setError(null);
        }
      } catch (err) {
        console.error('Error fetching releases:', err);
        setReleases([]);
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchReleases();
  }, []);

  // Default/sample release for testing
  const sampleRelease: Release = {
    id: 1,
    tag_name: `v${packageJson.version}`,
    name: `v${packageJson.version} - Cluster Branding`,
    body: `✨ **New Features:**
- Added Cluster branding throughout the application
- Implemented BETA badge in sidebar
- Added version display (v${packageJson.version})
- Created Help/Settings dropdown
- New Versions page showing release history

🎨 **Design Updates:**
- Updated color scheme to Cluster brand colors (Orange #F58346)
- Updated all charts to use brand palette
- Improved sidebar layout
- New Help dropdown in header

🐛 **Bug Fixes:**
- Fixed theme color consistency
- Improved responsive design
- Better mobile navigation

📊 **Charts Updated:**
- Total Revenue Chart - Orange/Purple theme
- Profit This Week Chart - Orange/Purple theme
- Visitors Analytics Chart - Brand color palette`,
    published_at: new Date().toISOString(),
    html_url: 'https://github.com/milthuz/commission-tracker-frontend/releases/tag/v0.2.0',
  };

  return (
    <>
      <Breadcrumb pageName="Versions" />

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-4 py-6 dark:border-strokedark sm:px-6">
          <h3 className="font-medium text-black dark:text-white">
            Commission Tracker - Version History
          </h3>
          <p className="text-sm text-bodydark mt-2">
            Current Version: <span className="font-semibold text-primary">v{packageJson.version} BETA</span>
          </p>
        </div>

        <div className="px-4 py-6 sm:px-6">
          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}

          {!loading && (
            <div className="space-y-6">
              {/* Show releases from Github */}
              {releases && releases.length > 0 && releases.map((release) => (
                <div
                  key={release.id}
                  className="rounded-sm border border-stroke p-5 dark:border-strokedark hover:shadow-1 dark:hover:shadow-1"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h4 className="font-semibold text-black dark:text-white">
                        {release.name || release.tag_name}
                      </h4>
                      <p className="text-sm text-bodydark2 mt-1">
                        Released {new Date(release.published_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <a
                      href={release.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-md bg-primary px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-opacity-90"
                    >
                      View on Github
                    </a>
                  </div>

                  <div className="text-sm text-bodydark whitespace-pre-wrap break-words">
                    {release.body || 'No description provided'}
                  </div>
                </div>
              ))}

              {/* Show sample release if no Github releases */}
              {releases.length === 0 && (
                <>
                  <div className="rounded-sm border border-stroke p-5 dark:border-strokedark hover:shadow-1">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h4 className="font-semibold text-black dark:text-white">
                          {sampleRelease.name}
                        </h4>
                        <p className="text-sm text-bodydark2 mt-1">
                          Current version
                        </p>
                      </div>
                      <a
                        href="https://github.com/milthuz/commission-tracker-frontend/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex rounded-md bg-primary px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-opacity-90"
                      >
                        View Releases
                      </a>
                    </div>

                    <div className="text-sm text-bodydark whitespace-pre-wrap break-words">
                      {sampleRelease.body}
                    </div>

                    <div className="mt-4 rounded-sm border border-warning bg-warning/10 p-3">
                      <p className="text-xs text-warning">
                        <strong>Tip:</strong> Push a version tag (e.g., git tag v0.2.3 && git push origin v0.2.3) to automatically create a release here!
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Versions;
