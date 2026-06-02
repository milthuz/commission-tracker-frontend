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
            className="fill-current duration-300 ease-in-out"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M16.1999 14.9343L15.6374 14.0624C15.5249 13.8937 15.4687 13.7249 15.4687 13.528V7.67803C15.4687 6.01865 14.7655 4.47178 13.4718 3.31865C12.4312 2.39053 11.0812 1.7999 9.64678 1.6874V1.1249C9.64678 0.787402 9.36553 0.478027 8.9999 0.478027C8.6624 0.478027 8.35303 0.759277 8.35303 1.1249V1.65928C8.29678 1.65928 8.24053 1.65928 8.18428 1.6874C4.92178 2.05303 2.4749 4.66865 2.4749 7.79053V13.528C2.44678 13.8093 2.39053 13.9499 2.33428 14.0343L1.7999 14.9343C1.63115 15.2155 1.63115 15.553 1.7999 15.8343C1.96865 16.0874 2.2499 16.2562 2.55928 16.2562H8.38115V16.8749C8.38115 17.2124 8.6624 17.5218 9.02803 17.5218C9.36553 17.5218 9.6749 17.2405 9.6749 16.8749V16.2562H15.4687C15.778 16.2562 16.0593 16.0874 16.228 15.8343C16.3968 15.553 16.3968 15.2155 16.1999 14.9343ZM3.23428 14.9905L3.43115 14.653C3.5999 14.3718 3.68428 14.0343 3.74053 13.6405V7.79053C3.74053 5.31553 5.70928 3.23428 8.3249 2.95303C9.92803 2.78428 11.503 3.2624 12.6562 4.2749C13.6687 5.1749 14.2312 6.38428 14.2312 7.67803V13.528C14.2312 13.9499 14.3437 14.3437 14.5968 14.7374L14.7655 14.9905H3.23428Z"
              fill=""
            />
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
