import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DataTable, FilterBar, StatusPill } from '../../components/ui';
import type { Column, StatusFamily } from '../../components/ui';
import { fmtDate } from '../../lib/format';

// « Tous les usagers » (audit UX, P2 — zone Personnes et accès : « utilisateurs internes, externes
// et partenaires dans une seule liste »). ONE searchable list of every account, whatever its kind;
// a row opens the place where that account is actually managed:
//   Sales Hub account (Zoho, external, pre-assigned) → the Access tab, filtered on its email
//   Partner-portal account                           → Partners › Users
// Nothing is edited here, so no action exists twice. Admin-only, like the Users tab itself.

const API_URL = import.meta.env.VITE_API_URL;

export interface DirectorySalesHubUser {
  email: string;
  displayName?: string | null;
  isAdmin: boolean;
  lastLogin: string | null;
  userType?: 'zoho' | 'external' | 'pending';
  status?: string;
  roles?: { id: number; name: string }[];
}

interface PartnerInvite {
  id: number; email: string; name: string | null; role: string; status: string; partnerName: string;
  activatedAt: string | null;
}

type Kind = 'internal' | 'external' | 'pending' | 'partner';
interface Row {
  key: string; kind: Kind; name: string; email: string; access: string; status: string; statusFamily: StatusFamily;
  lastLogin: string | null; partnerName?: string;
}

const KIND_FAMILY: Record<Kind, StatusFamily> = { internal: 'neutral', external: 'new', pending: 'wait', partner: 'ok' };

const UserDirectory = ({ users, onOpen }: { users: DirectorySalesHubUser[]; onOpen: (email: string) => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [partners, setPartners] = useState<PartnerInvite[] | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | Kind>('all');

  useEffect(() => {
    axios.get(`${API_URL}/api/admin/partner-invites`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then((r) => setPartners(r.data.invites || []))
      .catch(() => setPartners([])); // the Sales Hub accounts still list
  }, []);

  const rows = useMemo<Row[]>(() => {
    const hub: Row[] = users.map((u) => {
      const k: Kind = u.userType === 'external' ? 'external' : u.userType === 'pending' ? 'pending' : 'internal';
      const disabled = u.status === 'disabled';
      return {
        key: `hub:${u.email}`, kind: k, name: u.displayName || u.email.split('@')[0], email: u.email,
        access: u.isAdmin ? (t('admin.admins.admin') as string) : (u.roles || []).map((r) => r.name).join(', ') || (t('admin.admins.noRoles') as string),
        status: disabled ? t('admin.directory.status.disabled') : k === 'pending' ? t('admin.directory.status.pending') : u.status === 'invited' ? t('admin.directory.status.invited') : t('admin.directory.status.active'),
        statusFamily: disabled ? 'err' : k === 'pending' || u.status === 'invited' ? 'wait' : 'ok',
        lastLogin: u.lastLogin,
      };
    });
    const portal: Row[] = (partners || []).map((p) => ({
      key: `partner:${p.id}`, kind: 'partner', name: p.name || p.email.split('@')[0], email: p.email, partnerName: p.partnerName,
      access: `${p.partnerName} · ${p.role}`,
      status: t(`admin.directory.status.${p.status === 'disabled' ? 'disabled' : p.activatedAt ? 'active' : 'invited'}`),
      statusFamily: p.status === 'disabled' ? 'err' : p.activatedAt ? 'ok' : 'wait',
      lastLogin: null,
    }));
    return [...hub, ...portal];
  }, [users, partners, t]);

  const counts = useMemo(() => rows.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] || 0) + 1 }), {} as Record<Kind, number>), [rows]);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (kind === 'all' || r.kind === kind)
    && (!needle || `${r.name} ${r.email} ${r.access}`.toLowerCase().includes(needle)));

  const columns: Column<Row>[] = [
    { key: 'name', header: t('admin.directory.col.name'), sortValue: (r) => r.name.toLowerCase(),
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-black dark:text-white">{r.name}</p>
          <p className="truncate text-xs text-body dark:text-bodydark">{r.email}</p>
        </div>
      ) },
    { key: 'kind', header: t('admin.directory.col.kind'), sortValue: (r) => r.kind,
      render: (r) => <StatusPill family={KIND_FAMILY[r.kind]}>{t(`admin.directory.kind.${r.kind}`)}</StatusPill> },
    { key: 'access', header: t('admin.directory.col.access'), sortValue: (r) => r.access.toLowerCase(),
      render: (r) => <span className="text-sm text-black dark:text-white">{r.access}</span> },
    { key: 'status', header: t('admin.directory.col.status'), sortValue: (r) => r.status,
      render: (r) => <StatusPill family={r.statusFamily}>{r.status}</StatusPill> },
    { key: 'last', header: t('admin.directory.col.lastLogin'), sortValue: (r) => r.lastLogin || '',
      render: (r) => <span className="whitespace-nowrap text-sm text-body dark:text-bodydark">{r.lastLogin ? fmtDate(r.lastLogin) : '—'}</span> },
  ];

  const chips: { id: 'all' | Kind; label: string }[] = [
    { id: 'all', label: `${t('admin.directory.kind.all')} (${rows.length})` },
    ...(['internal', 'external', 'pending', 'partner'] as Kind[]).filter((k) => counts[k]).map((k) => ({ id: k, label: `${t(`admin.directory.kind.${k}`)} (${counts[k]})` })),
  ];

  return (
    <div className="space-y-4">
      <FilterBar search={q} onSearch={setQ} searchPlaceholder={t('admin.directory.search') as string}>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('admin.directory.col.kind') as string}>
          {chips.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={kind === c.id} onClick={() => setKind(c.id)}
              className={`h-9 rounded-full px-3 text-xs font-bold ${kind === c.id ? 'bg-primary text-[#141414]' : 'bg-gray-2 text-[#424242] dark:bg-meta-4 dark:text-bodydark'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </FilterBar>
      <p className="text-xs text-body dark:text-bodydark">{t('admin.directory.help')}</p>
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.key}
        onRowClick={(r) => (r.kind === 'partner' ? navigate('/admin/partners?view=users') : onOpen(r.email))}
        empty={{ title: t('admin.directory.empty') }}
      />
    </div>
  );
};

export default UserDirectory;
