import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import ClickOutside from '../ClickOutside';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const SEEN_KEY = 'partner-last-seen-notifications-at';

interface NotificationRow {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
}

// Partner Portal's notification bell (user request 2026-07-2x: "a notification area like Sales
// Hub, we'll push notifications eventually"). Nothing writes to partner_notifications yet — this
// is the ready-to-receive shell, same idiom as Header/DropdownNotification.tsx but reading from
// the new GET /api/partner-portal/notifications instead of /api/releases (release changelogs
// aren't relevant to a partner). "Seen" is a client-side timestamp compare, same lightweight
// pattern as the internal app's unseen-release dot — no per-user read-state table needed.
const PartnerDropdownNotification = () => {
  const { t, i18n } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [hasUnseen, setHasUnseen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('partnerToken');
        const res = await axios.get(`${API_URL}/api/partner-portal/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        const list: NotificationRow[] = res.data?.notifications || [];
        setNotifications(list);
        const seenAt = localStorage.getItem(SEEN_KEY);
        setHasUnseen(list.length > 0 && (!seenAt || new Date(list[0].createdAt) > new Date(seenAt)));
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

  const toggleOpen = () => {
    const next = !dropdownOpen;
    setDropdownOpen(next);
    if (next && notifications.length > 0) {
      localStorage.setItem(SEEN_KEY, notifications[0].createdAt);
      setHasUnseen(false);
    }
  };

  return (
    <ClickOutside onClick={() => setDropdownOpen(false)} className="relative">
      <li>
        <Link
          onClick={(e) => { e.preventDefault(); toggleOpen(); }}
          to="#"
          aria-label={t('partnerPortal.notifications.title') as string}
          className="relative flex h-8.5 w-8.5 items-center justify-center rounded-full border-[0.5px] border-stroke bg-gray hover:text-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
        >
          <span className={`absolute -top-0.5 right-0 z-1 h-2 w-2 rounded-full bg-meta-1 ${hasUnseen ? 'inline' : 'hidden'}`}>
            <span className="absolute -z-1 inline-flex h-full w-full animate-ping rounded-full bg-meta-1 opacity-75"></span>
          </span>

          <svg className="duration-300 ease-in-out" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
          </svg>
        </Link>

        {dropdownOpen && (
          <div className="absolute -right-27 mt-2.5 flex max-h-[28rem] w-80 flex-col rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark sm:right-0">
            <div className="px-4.5 py-3 border-b border-stroke dark:border-strokedark">
              <h5 className="text-sm font-semibold text-black dark:text-white">
                {t('partnerPortal.notifications.title')}
              </h5>
            </div>

            <ul className="flex flex-col overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="px-4.5 py-6 text-center text-sm text-body">
                  {t('partnerPortal.notifications.empty')}
                </li>
              ) : notifications.map((n) => (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      to={n.link}
                      onClick={() => setDropdownOpen(false)}
                      className="flex flex-col gap-1 border-t border-stroke px-4.5 py-3 hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-black dark:text-white truncate">{n.title}</span>
                        <span className="text-[10px] text-body whitespace-nowrap">{formatDate(n.createdAt)}</span>
                      </div>
                      {n.body && <p className="text-xs text-body line-clamp-2">{n.body}</p>}
                    </Link>
                  ) : (
                    <div className="flex flex-col gap-1 border-t border-stroke px-4.5 py-3 dark:border-strokedark">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-black dark:text-white truncate">{n.title}</span>
                        <span className="text-[10px] text-body whitespace-nowrap">{formatDate(n.createdAt)}</span>
                      </div>
                      {n.body && <p className="text-xs text-body line-clamp-2">{n.body}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </li>
    </ClickOutside>
  );
};

export default PartnerDropdownNotification;
