import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import NavIcon from '../../components/Sidebar/NavIcon';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import { useTheme } from '../../lib/theme';
import { useAppVersion } from '../../hooks/useAppVersion';
import { setPartnerLanguage } from './locale';

// « Plus » of the partner portal — the phone's menu, reached from the last tab of
// PartnerMobileTabBar. Same layout as the internal pages/More (canvas board Plus): profile
// card, the screens the bar has no room for, then theme, language and log out. Works on a
// desktop too; it is just a page.

const card = 'rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
const heading = 'mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#575A61] dark:text-[#999AA7]';

const PartnerMore = () => {
  const { t, i18n } = useTranslation();
  const { user, logout } = usePartnerAuth();
  const isAdmin = user?.role === 'admin';
  const [theme, setTheme] = useTheme();
  const version = useAppVersion();
  const initials = (user?.name || user?.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('');

  const Chevron = () => <NavIcon name="chevron" className="text-[#575A61] dark:text-[#999AA7]" />;
  const Segment = <T extends string>({ label, value, options, onPick }: { label: string; value: T; options: { id: T; label: string }[]; onPick: (v: T) => void }) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[15px] font-medium text-black dark:text-white">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-gray-2 p-1 dark:bg-meta-4">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={o.id === value} onClick={() => onPick(o.id)}
            className={`h-9 rounded-full px-3.5 text-[13px] font-bold ${o.id === value ? 'bg-primary text-[#141414]' : 'text-[#424242] dark:text-bodydark'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
  const rows: { to: string; label: string }[] = [
    ...(isAdmin ? [
      { to: '/partner-portal/team', label: t('partnerPortal.sidebar.team') },
      { to: '/partner-portal/organization', label: t('partnerPortal.sidebar.organization') },
    ] : []),
  ];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <h1 className="text-[28px] font-bold leading-tight text-black dark:text-white">{t('mobileNav.more')}</h1>

      <Link to="/partner-portal/profile" className={`${card} flex items-center gap-3 p-3.5`}>
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[rgba(245,131,69,0.14)] text-base font-bold text-accent-ink dark:bg-[rgba(245,131,69,0.16)] dark:text-accent-ink-dark">{initials}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-bold text-black dark:text-white">{user?.name || user?.email}</span>
          <span className="truncate text-[13px] text-[#575A61] dark:text-[#999AA7]">{t('partnerPortal.more.profileSub')}</span>
        </span>
        <Chevron />
      </Link>

      {/* Standard partner users simply don't get this section — the admin screens would only
          show them a « réservé aux administrateurs » card. */}
      {rows.length > 0 && (
        <section>
          <h2 className={heading}>{t('partnerPortal.sidebar.adminPanel')}</h2>
          <div className={`${card} flex flex-col`}>
            {rows.map((r, i) => (
              <Link key={r.to} to={r.to}
                className={`flex min-h-[52px] items-center gap-3 px-3.5 py-2 text-[15px] font-medium text-black dark:text-white ${i < rows.length - 1 ? 'border-b border-stroke dark:border-strokedark' : ''}`}>
                <span className="flex-1 truncate">{r.label}</span><Chevron />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className={heading}>{t('more.display')}</h2>
        <div className={`${card} flex flex-col gap-3.5 p-3.5`}>
          <Segment label={t('more.theme')} value={theme} onPick={setTheme}
            options={[{ id: 'light', label: t('more.light') }, { id: 'dark', label: t('more.dark') }]} />
          <Segment label={t('more.language')} value={i18n.language?.startsWith('fr') ? 'fr' : 'en'} onPick={(l) => setPartnerLanguage(i18n, l)}
            options={[{ id: 'fr', label: 'FR' }, { id: 'en', label: 'EN' }]} />
        </div>
      </section>

      <button type="button" onClick={logout}
        className={`${card} flex min-h-[52px] items-center gap-3 px-3.5 text-[15px] font-medium text-[#D92D20] dark:text-[#F46060]`}>
        <NavIcon name="logout" />{t('more.logout')}
      </button>

      <p className="text-center text-xs text-[#575A61] dark:text-[#999AA7]">Cluster · v{version}</p>
    </div>
  );
};

export default PartnerMore;
