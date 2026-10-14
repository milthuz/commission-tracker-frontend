import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV, NavItem } from '../config/navigation';

// Browser tab title, in the user's language (audit UX, P1: titles were hard-coded and mixed
// EN/FR). Pass `titleKey` (an i18n key) — or `fromNav` to take the label of the matching screen
// in config/navigation (used by /admin/:section). `title` stays for fixed brand strings.

interface PageTitleProps {
  title?: string;
  titleKey?: string;
  fromNav?: boolean;
  /** Appended after « | ». Default « Sales Hub »; empty string = none. */
  suffix?: string;
}

const findByPath = (path: string): NavItem | undefined => {
  let found: NavItem | undefined;
  const walk = (items: NavItem[]) => items.forEach((it) => {
    if (found) return;
    if (it.children) walk(it.children);
    else if (it.to && it.to.split('?')[0] === path) found = it;
  });
  NAV.forEach((s) => walk(s.items));
  return found;
};

const PageTitle: React.FC<PageTitleProps> = ({ title, titleKey, fromNav, suffix = 'Sales Hub' }) => {
  const location = useLocation();
  const { section } = useParams();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    // A literal `title` is the whole tab title, used as is (brand pages: « La Passe | Cluster »).
    if (title) { document.title = title; return; }
    let main = titleKey ? (t(titleKey) as string) : '';
    if (fromNav) {
      const item = findByPath(section ? `/admin/${section}` : location.pathname);
      main = item ? (t(item.label) as string) : (t('sidebar.adminPanel') as string);
    }
    document.title = main && suffix ? `${main} | ${suffix}` : main || suffix;
  }, [location, title, titleKey, fromNav, suffix, section, t, i18n.language]);

  return null; // This component doesn't render anything
};

export default PageTitle;
