import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

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
  title: string;
  preview: string;
  date: string;
}

// Same preview-extraction helper as DropdownNotification — picks the first
// non-empty, non-heading line and strips markdown bullet markers.
function previewLine(body: string): string {
  if (!body) return '';
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  for (const l of lines) {
    if (l.match(/^#+\s/)) continue;
    if (l.match(/^[-*_]{3,}$/)) continue;
    return l.replace(/^[-*•]\s*/, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
  }
  return '';
}

const DropdownHelp = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [releases, setReleases] = useState<ReleaseDisplay[]>([]);

  const trigger = useRef<any>(null);
  const dropdown = useRef<any>(null);

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
        setReleases(list.slice(0, 3).map((r, i) => ({
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

  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!dropdown.current) return;
      if (
        !dropdownOpen ||
        dropdown.current.contains(target) ||
        trigger.current.contains(target)
      )
        return;
      setDropdownOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  });

  useEffect(() => {
    const keyHandler = ({ keyCode }: KeyboardEvent) => {
      if (!dropdownOpen || keyCode !== 27) return;
      setDropdownOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  });

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(i18n.language === 'fr' ? 'fr-CA' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return iso; }
  };

  const goToVersion = (version: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDropdownOpen(false);
    const anchor = `v${String(version).replace(/^v/i, '')}`;
    navigate(`/versions#${anchor}`);
  };

  return (
    <li className="relative">
      <Link
        ref={trigger}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        to="#"
        aria-label="Help"
        className="relative flex h-8.5 w-8.5 items-center justify-center rounded-full border-[0.5px] border-stroke bg-gray hover:text-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
      >
        <svg className="fill-current" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" fill=""/>
        </svg>
      </Link>

      <div
        ref={dropdown}
        onFocus={() => setDropdownOpen(true)}
        onBlur={() => setDropdownOpen(false)}
        className={`absolute -right-16 mt-2.5 flex max-h-[32rem] w-80 flex-col rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark sm:right-0 ${
          dropdownOpen ? 'block' : 'hidden'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4.5 py-3 border-b border-stroke dark:border-strokedark">
          <h5 className="text-sm font-semibold text-black dark:text-white">{t('help.title')}</h5>
        </div>

        {/* Recent releases section */}
        <div className="px-4.5 pt-3 pb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-body">{t('help.recentReleases')}</span>
          <Link
            to="/versions"
            onClick={() => setDropdownOpen(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {t('notifications.viewAll')}
          </Link>
        </div>

        <ul className="flex flex-col overflow-y-auto">
          {releases.length === 0 ? (
            <li className="px-4.5 py-3 text-center text-xs text-body">
              {t('notifications.empty')}
            </li>
          ) : releases.map((r) => (
            <li key={r.id}>
              <a
                href={`/versions#v${r.version.replace(/^v/i, '')}`}
                onClick={goToVersion(r.version)}
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

        {/* Get-help section */}
        <div className="px-4.5 pt-3 pb-1.5 border-t border-stroke dark:border-strokedark">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-body">{t('help.getHelp')}</span>
        </div>
        <ul className="flex flex-col">
          <li>
            <a
              className="flex items-center gap-3 border-t border-stroke px-4.5 py-3 hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4"
              href="mailto:david@clustersystems.com?subject=Commission Tracker Support Request"
              onClick={() => setDropdownOpen(false)}
            >
              <svg className="fill-current text-primary" width="18" height="18" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.7778 1.77778H4.22222C2.98477 1.77778 1.97333 2.78922 1.97333 4.02667L1.96 17.7778C1.96 19.0152 2.98477 20.0267 4.22222 20.0267H17.7778C19.0152 20.0267 20.0267 19.0152 20.0267 17.7778V4.02667C20.0267 2.78922 19.0152 1.77778 17.7778 1.77778ZM17.7778 6.27556L11 10.8889L4.22222 6.27556V4.02667L11 8.64L17.7778 4.02667V6.27556Z" fill=""/>
              </svg>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-black dark:text-white">{t('help.contactSupport')}</span>
                <span className="text-xs text-body">david@clustersystems.com</span>
              </div>
            </a>
          </li>
        </ul>
      </div>
    </li>
  );
};

export default DropdownHelp;
