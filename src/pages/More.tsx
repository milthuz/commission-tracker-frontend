import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAV, NavItem, NavBadge, isItemVisible } from '../config/navigation';
import NavIcon from '../components/Sidebar/NavIcon';
import { useNavCtx } from '../components/Sidebar/useNavCtx';
import { useNavBadges } from '../components/Sidebar/useNavBadges';
import { openCommandPalette } from '../components/Sidebar/CommandPalette';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../lib/theme';
import { useAppVersion } from '../hooks/useAppVersion';

// « Plus » — the phone's menu (audit UX, P2 — canvas board Plus). The same sections and the same
// visibility rules as the sidebar (config/navigation), laid out for a thumb: the sales tools as
// tiles, everything else as 52 px rows, then profile, theme and language. Reached from the last
// tab of the mobile tab bar; works on a desktop too, it is just a page.

const leaves = (it: NavItem, ctx: ReturnType<typeof useNavCtx>): { item: NavItem; parent?: NavItem }[] => {
  if (!isItemVisible(it, ctx)) return [];
  if (!it.children) return it.to ? [{ item: it }] : [];
  return it.children.filter((ch) => isItemVisible(ch, ctx) && ch.to).map((ch) => ({ item: ch, parent: it }));
};

const card = 'rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
const heading = 'mb-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#575A61] dark:text-[#999AA7]';

const More = () => {
  const { t, i18n } = useTranslation();
  const ctx = useNavCtx();
  const { user, logout } = useAuth();
  const [theme, setTheme] = useTheme();
  const version = useAppVersion();
  const badges = useNavBadges({ leads: false, partners: ctx.isAdmin || ctx.can('partners:manage'), health: ctx.isAdmin });
  const count = (b?: NavBadge) => (b ? badges[b] : 0);
  const setLang = (l: 'en' | 'fr') => { i18n.changeLanguage(l); try { localStorage.setItem('language', l); } catch { /* ignore */ } };
  const initials = (user?.name || user?.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('');

  const Chevron = () => <NavIcon name="chevron" className="text-[#575A61] dark:text-[#999AA7]" />;
  const Count = ({ b }: { b?: NavBadge }) => {
    const n = count(b);
    if (!n) return null;
    return b === 'health'
      ? <span className="rounded-full bg-[rgba(244,96,96,0.12)] px-2 py-0.5 text-xs font-bold text-[#D92D20] dark:bg-[rgba(244,96,96,0.16)] dark:text-[#F46060]">{t('more.toFix', { count: n })}</span>
      : <span className="rounded-full bg-gray-2 px-2 py-0.5 text-xs font-bold text-[#424242] dark:bg-meta-4 dark:text-bodydark">{n}</span>;
  };

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

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <h1 className="text-[28px] font-bold leading-tight text-black dark:text-white">{t('mobileNav.more')}</h1>

      <Link to="/profile" className={`${card} flex items-center gap-3 p-3.5`}>
        {user?.photo
          ? <img src={user.photo} alt="" className="h-12 w-12 flex-none rounded-full object-cover" />
          : <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[rgba(245,131,69,0.14)] text-base font-bold text-accent-ink dark:bg-[rgba(245,131,69,0.16)] dark:text-accent-ink-dark">{initials}</span>}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-bold text-black dark:text-white">{user?.name || user?.email}</span>
          <span className="truncate text-[13px] text-[#575A61] dark:text-[#999AA7]">{t('more.profileSub')}</span>
        </span>
        <Chevron />
      </Link>

      <button type="button" onClick={openCommandPalette}
        className={`${card} flex h-12 items-center gap-2.5 px-3.5 text-left text-[15px] text-[#575A61] dark:text-[#999AA7]`}>
        <NavIcon name="search" />{t('sidebar.search')}
      </button>

      {NAV.map((section) => {
        const rows = section.items.flatMap((it) => leaves(it, ctx));
        if (!rows.length) return null;
        // Administration: ONE row to the hub, like the sidebar; its screens are in the hub.
        if (section.footer) {
          return (
            <section key={section.id}>
              <h2 className={heading}>{t('sidebar.adminPanel')}</h2>
              <div className={card}>
                <Link to="/admin" className="flex min-h-[52px] items-center gap-3 px-3.5 text-[15px] font-medium text-black dark:text-white">
                  <span className="flex-1">{t('sidebar.adminPanel')}</span><Count b="health" /><Chevron />
                </Link>
              </div>
            </section>
          );
        }
        // Sales: tiles for the tools (the dashboard and leads already have their own tab).
        if (section.id === 'sales') {
          const tiles = rows.filter((r) => r.item.id !== 'dashboard' && r.item.id !== 'leads');
          if (!tiles.length) return null;
          return (
            <section key={section.id}>
              <h2 className={heading}>{t(section.label!)}</h2>
              <div className="grid grid-cols-3 gap-2.5">
                {tiles.map(({ item, parent }) => (
                  <Link key={item.id} to={item.to!} className={`${card} flex min-h-[92px] flex-col items-start gap-2.5 px-3 py-3.5 text-[13px] font-medium text-black dark:text-white`}>
                    <span className="text-accent-ink dark:text-accent-ink-dark"><NavIcon name={item.icon || parent?.icon || 'wrench'} size={22} /></span>
                    {t(item.label)}
                  </Link>
                ))}
              </div>
            </section>
          );
        }
        const list = rows;
        return (
          <section key={section.id}>
            <h2 className={heading}>{t(section.label!)}</h2>
            <div className={`${card} flex flex-col`}>
              {list.map(({ item, parent }, i) => (
                <Link key={item.id} to={item.to!}
                  className={`flex min-h-[52px] items-center gap-3 px-3.5 py-2 text-[15px] font-medium text-black dark:text-white ${i < list.length - 1 ? 'border-b border-stroke dark:border-strokedark' : ''}`}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    {parent && <span className="text-[11px] font-medium text-[#575A61] dark:text-[#999AA7]">{t(parent.label)}</span>}
                    <span className="truncate">{t(item.label)}</span>
                  </span>
                  <Count b={item.badge} /><Chevron />
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <section>
        <h2 className={heading}>{t('more.display')}</h2>
        <div className={`${card} flex flex-col gap-3.5 p-3.5`}>
          <Segment label={t('more.theme')} value={theme} onPick={setTheme}
            options={[{ id: 'light', label: t('more.light') }, { id: 'dark', label: t('more.dark') }]} />
          <Segment label={t('more.language')} value={i18n.language?.startsWith('fr') ? 'fr' : 'en'} onPick={setLang}
            options={[{ id: 'fr', label: 'FR' }, { id: 'en', label: 'EN' }]} />
        </div>
      </section>

      <button type="button" onClick={logout}
        className={`${card} flex min-h-[52px] items-center gap-3 px-3.5 text-[15px] font-medium text-[#D92D20] dark:text-[#F46060]`}>
        <NavIcon name="logout" />{t('more.logout')}
      </button>

      <p className="text-center text-xs text-[#575A61] dark:text-[#999AA7]">Sales Hub · v{version}</p>
    </div>
  );
};

export default More;
