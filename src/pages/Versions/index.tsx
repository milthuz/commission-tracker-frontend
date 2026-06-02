import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// Releases now come from our backend (table `releases`, populated by
// Admin Panel → Releases → Create). This shape matches what /api/releases returns.
// Note: the DB column is `notes`, not `body` — we accept either for safety.
interface Release {
  id?: number;
  version: string;        // shown as tag_name
  name?: string | null;
  notes?: string | null;  // the actual column name in the DB
  body?: string | null;   // legacy alias (kept in case the backend ever renames it)
  date: string;           // ISO date
  url?: string | null;
  prerelease?: boolean;
}

// Adapter shape so the rest of the component (which used to read GitHub release fields) keeps working.
interface DisplayRelease {
  id: number | string;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  prerelease: boolean;
  url?: string | null;
}

const Versions: React.FC = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [releases, setReleases] = useState<DisplayRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The anchor we should scroll to after releases finish loading. Strip leading 'v'
  // for the comparison (DOM ids are 'v0.3.0' regardless of how the URL was written).
  const targetVersion = location.hash.replace(/^#v?/i, '').trim();

  useEffect(() => {
    fetchReleases();
  }, []);

  // After releases are rendered, scroll the URL-hash-targeted card into view.
  useEffect(() => {
    if (!targetVersion || releases.length === 0) return;
    const id = `v${targetVersion}`;
    // Defer a tick so the DOM has flushed the new cards
    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'dark:ring-offset-boxdark');
        setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'dark:ring-offset-boxdark'), 2500);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [targetVersion, releases]);

  const fetchReleases = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/releases`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const list: Release[] = response.data?.releases || [];
      const mapped: DisplayRelease[] = list.map((r, i) => ({
        id:           r.id ?? i,
        tag_name:     r.version,
        name:         r.name || r.version,
        body:         r.notes || r.body || '',
        published_at: r.date,
        prerelease:   r.prerelease || false,
        url:          r.url || null,
      }));
      setReleases(mapped);
      // Mark the latest release as seen for this user — clears any red-dot indicators.
      // Normalize to strip a leading 'v' so we match useAppVersion (which also strips it),
      // otherwise 'v0.3.0' vs '0.3.0' would mis-compare.
      if (mapped.length > 0) {
        const normalized = mapped[0].tag_name.replace(/^v/i, '').trim();
        localStorage.setItem('last-seen-release-version', normalized);
        // Notify other tabs/components (sidebar badge) that the seen state changed
        window.dispatchEvent(new Event('release-seen'));
      }
      setError(null);
    } catch (err) {
      console.error('Error fetching releases:', err);
      setError(t('versions.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const locale = i18n.language === 'fr' ? 'fr-CA' : 'en-US';
    return date.toLocaleDateString(locale, {
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
      
      // Skip headers (##, ###, etc.)
      if (trimmed.match(/^#+\s/)) {
        return;
      }
      
      // Skip horizontal rules (---, ***, etc.)
      if (trimmed.match(/^[-*_]{3,}$/)) {
        return;
      }
      
      let feature = '';
      
      // Match markdown bullet points (-, *, •)
      if (trimmed.match(/^[-*•]\s+/)) {
        feature = trimmed.replace(/^[-*•]\s+/, '').trim();
      }
      // Match emoji bullets (✅, ✓, 🎉, etc.)
      else if (trimmed.match(/^[✅✓🎉🖨️📧📊🔔🐛⚠️]/)) {
        feature = trimmed.replace(/^[✅✓🎉🖨️📧📊🔔🐛⚠️]+\s*/, '').trim();
      }
      // Match lines starting with "- **" (bold bullets)
      else if (trimmed.match(/^-\s*\*\*/)) {
        feature = trimmed.replace(/^-\s*\*\*/, '').replace(/\*\*:?\s*/, '').trim();
      }
      
      // Only add if feature has actual text and is longer than 3 characters
      if (feature && feature.length > 3 && !feature.match(/^[-*•✅✓]+$/)) {
        features.push(feature);
      }
    });
    
    // If no markdown bullets were found, fall back to non-empty text lines so
    // releases that were typed in free-form prose still display something useful.
    if (features.length > 0) return features;
    const plainLines = body.split('\n').map(l => l.trim()).filter(l => l && !l.match(/^#+\s/) && !l.match(/^[-*_]{3,}$/));
    return plainLines.length > 0 ? plainLines : [];
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-270">
        <div className="mb-6">
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            {t('versions.title')}
          </h2>
        </div>
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke py-4 px-6.5 dark:border-strokedark">
            <h3 className="font-medium text-black dark:text-white">
              {t('versions.subtitle')}
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
            {t('versions.title')}
          </h2>
        </div>
        <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke py-4 px-6.5 dark:border-strokedark">
            <h3 className="font-medium text-black dark:text-white">
              {t('versions.subtitle')}
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
              {t('versions.retry')}
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
          {t('versions.title')}
        </h2>
      </div>

      {/* Version Cards */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke py-4 px-6.5 dark:border-strokedark">
          <h3 className="font-medium text-black dark:text-white">
            {t('versions.subtitle')}
          </h3>
        </div>
        
        <div className="p-6.5">
          {releases.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-body dark:text-bodydark">{t('versions.noReleases')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {releases.map((release, index) => {
                const features = parseReleaseBody(release.body);
                const version = release.tag_name.replace(/^v/i, '');
                const isCurrent = index === 0 && !release.prerelease;
                return (
                  <div
                    key={release.id}
                    id={`v${version}`}
                    className="scroll-mt-24 rounded-md border border-stroke p-4 transition-shadow dark:border-strokedark"
                  >
                    {/* Header row — purple version pill + date + current/prerelease badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex rounded-full bg-[#8B5CF6] bg-opacity-10 px-3 py-0.5 text-xs font-bold text-[#8B5CF6]">
                        v{version}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex rounded-full bg-success bg-opacity-10 px-2 py-0.5 text-[10px] font-bold text-success">
                          {t('versions.currentRelease')}
                        </span>
                      )}
                      {release.prerelease && (
                        <span className="inline-flex rounded-full bg-warning bg-opacity-10 px-2 py-0.5 text-[10px] font-bold text-warning">
                          {t('versions.preRelease')}
                        </span>
                      )}
                      <span className="text-xs text-body">{formatDate(release.published_at)}</span>
                    </div>

                    {/* Notes — full content rendered as a compact bullet list */}
                    {features.length > 0 && (
                      <ul className="mt-2.5 space-y-1">
                        {features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-body">
                            <span className="mt-0.5 text-[#8B5CF6]">•</span>
                            <span className="flex-1 whitespace-pre-line">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Versions;
