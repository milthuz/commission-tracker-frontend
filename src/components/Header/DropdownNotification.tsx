import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import ClickOutside from '../ClickOutside';
import { useUnseenRelease } from '../../hooks/useUnseenRelease';
import { useAppVersion } from '../../hooks/useAppVersion';

const API_URL = import.meta.env.VITE_API_URL;

// Shape returned by GET /api/releases
interface ReleaseRow {
  id?: number;
  version: string;
  name?: string | null;
  notes?: string | null;
  body?: string | null;
  date: string;
}

interface ReleaseDisplay {
  id: number | string;
  version: string;
  title: string;     // name or version fallback
  preview: string;   // first useful line from notes
  date: string;
}

// Pick the first non-empty, non-heading line from a markdown body for a preview.
function previewLine(body: string): string {
  if (!body) return '';
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  for (const l of lines) {
    if (l.match(/^#+\s/)) continue;
    if (l.match(/^[-*_]{3,}$/)) continue;
    // Strip leading markdown bullet markers but keep the text
    return l.replace(/^[-*•]\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
  }
  return '';
}

const DropdownNotification = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [releases, setReleases] = useState<ReleaseDisplay[]>([]);
  const hasUnseen = useUnseenRelease();
  const latestVersion = useAppVersion();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/api/releases`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        const list: ReleaseRow[] = res.data?.releases || [];
        setReleases(list.slice(0, 5).map((r, i) => ({
          id:      r.id ?? i,
          version: r.version,
          title:   r.name || r.version,
          preview: previewLine(r.notes || r.body || ''),
          date:    r.date,
        })));
      } catch { /* keep empty */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(i18n.language === 'fr' ? 'fr-CA' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return iso; }
  };

  const markSeen = () => {
    if (latestVersion) {
      const normalized = String(latestVersion).replace(/^v/i, '').trim();
      localStorage.setItem('last-seen-release-version', normalized);
      window.dispatchEvent(new Event('release-seen'));
    }
  };

  const openItem = (version: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    markSeen();
    setDropdownOpen(false);
    // Use a URL hash so the Versions page can scroll to (and highlight) the
    // specific release the user just clicked on, instead of always landing
    // at the top with only the latest visible.
    const anchor = `v${String(version).replace(/^v/i, '')}`;
    navigate(`/versions#${anchor}`);
  };

  return (
    <ClickOutside onClick={() => setDropdownOpen(false)} className="relative">
      <li>
        <Link
          onClick={(e) => {
            e.preventDefault();
            setDropdownOpen(!dropdownOpen);
          }}
          to="#"
          aria-label={t('notifications.title') as string}
          className="relative flex h-8.5 w-8.5 items-center justify-center rounded-full border-[0.5px] border-stroke bg-gray hover:text-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
        >
          {/* Unseen-release indicator — replaces the placeholder static dot */}
          <span
            className={`absolute -top-0.5 right-0 z-1 h-2 w-2 rounded-full bg-meta-1 ${
              hasUnseen ? 'inline' : 'hidden'
            }`}
          >
            <span className="absolute -z-1 inline-flex h-full w-full animate-ping rounded-full bg-meta-1 opacity-75"></span>
          </span>

          <svg
            className="duration-300 ease-in-out"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
          </svg>
        </Link>

        {dropdownOpen && (
          <div className="absolute -right-27 mt-2.5 flex max-h-[28rem] w-80 flex-col rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark sm:right-0">
            <div className="flex items-center justify-between px-4.5 py-3 border-b border-stroke dark:border-strokedark">
              <h5 className="text-sm font-semibold text-black dark:text-white">
                {t('notifications.title')}
              </h5>
              <Link
                to="/versions"
                onClick={() => { markSeen(); setDropdownOpen(false); }}
                className="text-xs font-medium text-primary hover:underline"
              >
                {t('notifications.viewAll')}
              </Link>
            </div>

            <ul className="flex flex-col overflow-y-auto">
              {releases.length === 0 ? (
                <li className="px-4.5 py-6 text-center text-sm text-body">
                  {t('notifications.empty')}
                </li>
              ) : releases.map((r) => (
                <li key={r.id}>
                  <a
                    href={`/versions#v${r.version.replace(/^v/i, '')}`}
                    onClick={openItem(r.version)}
                    className="flex flex-col gap-1 border-t border-stroke px-4.5 py-3 hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-black dark:text-white truncate">
                        {t('notifications.versionPrefix')} {r.version.replace(/^v/i, '')}
                      </span>
                      <span className="text-[10px] text-body whitespace-nowrap">{formatDate(r.date)}</span>
                    </div>
                    {r.title && r.title !== r.version && (
                      <p className="text-xs font-medium text-body truncate">{r.title}</p>
                    )}
                    {r.preview && (
                      <p className="text-xs text-body line-clamp-2">{r.preview}</p>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </li>
    </ClickOutside>
  );
};

export default DropdownNotification;
