import React, { useState, useEffect } from 'react';

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  prerelease: boolean;
}

const Versions: React.FC = () => {
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReleases();
  }, []);

  const fetchReleases = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        'https://api.github.com/repos/milthuz/commission-tracker-frontend/releases'
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch releases');
      }
      
      const data = await response.json();
      setReleases(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching releases:', err);
      setError('Failed to load release history. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const parseReleaseBody = (body: string) => {
    // Split by lines and filter out empty lines
    const lines = body.split('\n').filter(line => line.trim());
    
    // Find bullet points (lines starting with -, *, or •)
    const features: string[] = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      // Match markdown bullet points or emoji bullet points
      if (trimmed.match(/^[-*•]/)) {
        // Remove the bullet and trim
        const feature = trimmed.replace(/^[-*•]\s*/, '').trim();
        if (feature) {
          features.push(feature);
        }
      }
      // Also match lines with emojis like ✅, ✓
      else if (trimmed.match(/^[✅✓]/)) {
        const feature = trimmed.replace(/^[✅✓]\s*/, '').trim();
        if (feature) {
          features.push(feature);
        }
      }
      // Match lines starting with "- **"
      else if (trimmed.match(/^-\s*\*\*/)) {
        const feature = trimmed.replace(/^-\s*\*\*/, '').replace(/\*\*:?\s*/, '').trim();
        if (feature) {
          features.push(feature);
        }
      }
    });
    
    return features.length > 0 ? features : [body.substring(0, 200) + '...'];
  };

  const getBadgeColor = (index: number, isPrerelease: boolean) => {
    if (isPrerelease) return 'bg-warning';
    if (index === 0) return 'bg-success';
    if (index === 1) return 'bg-primary';
    return 'bg-meta-3';
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-270">
        <div className="mb-6">
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            Version History
          </h2>
        </div>
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke py-4 px-6.5 dark:border-strokedark">
            <h3 className="font-medium text-black dark:text-white">
              Commission Tracker Releases
            </h3>
          </div>
          <div className="p-6.5 flex items-center justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-270">
        <div className="mb-6">
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            Version History
          </h2>
        </div>
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke py-4 px-6.5 dark:border-strokedark">
            <h3 className="font-medium text-black dark:text-white">
              Commission Tracker Releases
            </h3>
          </div>
          <div className="p-6.5">
            <div className="flex items-center justify-center gap-3 rounded-lg bg-danger bg-opacity-10 p-6">
              <svg
                className="h-6 w-6 text-danger"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-danger">{error}</p>
            </div>
            <button
              onClick={fetchReleases}
              className="mt-4 rounded-md bg-primary px-6 py-2 text-white hover:bg-opacity-90"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          {releases.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-body dark:text-bodydark">No releases found.</p>
            </div>
          ) : (
            releases.map((release, index) => {
              const features = parseReleaseBody(release.body);
              const version = release.tag_name.replace('v', '');
              const badgeColor = getBadgeColor(index, release.prerelease);
              const isCurrent = index === 0 && !release.prerelease;
              
              return (
                <div key={release.id} className={index < releases.length - 1 ? 'mb-8' : ''}>
                  <div className="mb-3 flex items-center gap-3">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-full ${badgeColor}`}>
                      <svg
                        className="fill-white"
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        {isCurrent ? (
                          <>
                            <path
                              d="M10 0.5625C4.78125 0.5625 0.5625 4.78125 0.5625 10C0.5625 15.2188 4.78125 19.4375 10 19.4375C15.2188 19.4375 19.4375 15.2188 19.4375 10C19.4375 4.78125 15.2188 0.5625 10 0.5625ZM10 17.8125C5.65625 17.8125 2.1875 14.3438 2.1875 10C2.1875 5.65625 5.65625 2.1875 10 2.1875C14.3438 2.1875 17.8125 5.65625 17.8125 10C17.8125 14.3438 14.3438 17.8125 10 17.8125Z"
                              fill=""
                            />
                            <path
                              d="M13.2812 7.34375L8.84375 11.7812L6.71875 9.65625C6.4375 9.375 5.96875 9.375 5.6875 9.65625C5.40625 9.9375 5.40625 10.4062 5.6875 10.6875L8.34375 13.3438C8.46875 13.4688 8.65625 13.5625 8.84375 13.5625C9.03125 13.5625 9.21875 13.5 9.34375 13.3438L14.3125 8.375C14.5938 8.09375 14.5938 7.625 14.3125 7.34375C14.0312 7.0625 13.5625 7.0625 13.2812 7.34375Z"
                              fill=""
                            />
                          </>
                        ) : (
                          <>
                            <path d="M10 0C4.48 0 0 4.48 0 10C0 15.52 4.48 20 10 20C15.52 20 20 15.52 20 10C20 4.48 15.52 0 10 0ZM10 18C5.59 18 2 14.41 2 10C2 5.59 5.59 2 10 2C14.41 2 18 5.59 18 10C18 14.41 14.41 18 10 18Z" fill=""/>
                            <path d="M10.5 5H9.5V11H15.5V10H10.5V5Z" fill=""/>
                          </>
                        )}
                      </svg>
                    </span>
                    <div>
                      <h4 className="text-xl font-semibold text-black dark:text-white">
                        Version {version}
                      </h4>
                      <p className="text-sm text-body">
                        {isCurrent && 'Current Release • '}
                        {release.prerelease && 'Pre-release • '}
                        {formatDate(release.published_at)}
                      </p>
                    </div>
                  </div>
                  <div className="ml-15 space-y-2">
                    {features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className={`mt-1 ${isCurrent ? 'text-success' : ''}`}>
                          {isCurrent ? '✓' : '•'}
                        </span>
                        <p className="text-body dark:text-bodydark">{feature}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Versions;
