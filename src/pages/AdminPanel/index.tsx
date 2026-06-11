import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import packageJson from '../../../package.json';
import { useAppVersion } from '../../hooks/useAppVersion';
import { formatDateOnly } from '../../utils/date';
import CommissionImport from './CommissionImport';
import ExternalUsers from './ExternalUsers';
import ResellerAdmin from './ResellerAdmin';

const API_URL = import.meta.env.VITE_API_URL;
const DEFAULT_QUOTA = 15;

interface Salesperson {
  name: string;
  isActive: boolean;
  commissionRate: number;
  baseSalary: number;
  invoiceCount: number;
  aliases: string[];
  signupBonusAmount: number;
  signupBonusEnabled: boolean;
  monthlyQuota: number | null;
  teamId: number | null;
  teamName: string | null;
}

interface Team {
  id: number;
  name: string;
  monthlyQuotaOverride: number | null;
  countsTowardQuota: boolean;
  includeDeals: boolean;
  includePayments: boolean;
  memberCount: number;
}

interface AdminUser {
  email: string;
  isAdmin: boolean;
  createdAt: string | null;
  lastLogin: string | null;
  userType?: 'zoho' | 'external' | 'pending';
  roles?: { id: number; name: string }[];
}

interface Release {
  id: number;
  version: string;
  name: string;
  notes: string;
  date: string;
  url: string;
}

interface ExcludedCustomer {
  id: number;
  customer_name: string;
  excluded_by: string;
  created_at: string;
}

interface CustomerSearchResult {
  name: string;
  invoiceCount: number;
  totalSpent: number;
}

const AdminPanel = () => {
  const { t } = useTranslation();
  const appVersion = useAppVersion();
  useAuth();
  const navigate = useNavigate();
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [dealGroups, setDealGroups] = useState<{ sourceGroup: string; points: number; isCustom: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<any>(null);
  const location = useLocation();
  const pathParts = location.pathname.split('/');
  const activeTab = pathParts[2] || 'sync'; // /admin/sync, /admin/salespeople, etc.

  // Handle redirect back from CRM OAuth
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('crm') === 'connected') {
      fetchCrmStatus();
      // Clean up the URL
      window.history.replaceState({}, '', '/admin/sync');
    }
  }, [location.search]);

  // Release management state
  const [releases, setReleases] = useState<Release[]>([]);
  const [newVersion, setNewVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  // "What's New" menu tags chosen at publish time → drive the sidebar dot/badge + banner.
  const [newFeatureTags, setNewFeatureTags] = useState<{ path: string; title: string; description: string; days: number }[]>([]);
  const RESELLER_MENU_ITEMS = [
    { path: '/', label: 'Dashboard' },
    { path: '/commission-tracker', label: 'Commission Tracker' },
    { path: '/commission-report', label: 'Commission Report' },
    { path: '/reseller', label: 'Reseller' },
    { path: '/admin/sync', label: 'Admin → Integrations' },
    { path: '/admin/salespeople', label: 'Admin → Salespeople' },
    { path: '/admin/customers', label: 'Admin → Customers' },
    { path: '/admin/releases', label: 'Admin → Releases' },
    { path: '/admin/roles', label: 'Admin → Roles & Permissions' },
    { path: '/admin/import-payments', label: 'Admin → Import Commissions' },
  ];
  const [releaseStatus, setReleaseStatus] = useState<string | null>(null);
  const [_workflowStatus, setWorkflowStatus] = useState<any>(null);
  const [showReleaseForm, setShowReleaseForm] = useState(false);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [commitCount, setCommitCount] = useState(0);
  const [sinceTag, setSinceTag] = useState('');

  // Excluded customers state
  const [excludedCustomers, setExcludedCustomers] = useState<ExcludedCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);

  // Roles state
  interface PermDef { key: string; label: string; category: string; }
  interface Role {
    id: number; name: string; description: string;
    permissions: string[]; isSystem: boolean; userCount: number;
  }
  const [permCatalog, setPermCatalog] = useState<PermDef[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [showNewRole, setShowNewRole] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  // User roles editing
  const [editingUserRoles, setEditingUserRoles] = useState<string | null>(null); // user email being edited
  const [preassignEmail, setPreassignEmail] = useState(''); // assign roles to an email that hasn't logged in yet
  const [editingUserRoleIds, setEditingUserRoleIds] = useState<number[]>([]);

  // CRM connection state
  const [crmStatus, setCrmStatus] = useState<{ connected: boolean; expired: boolean } | null>(null);
  const [crmSyncing, setCrmSyncing] = useState(false);
  const [crmSyncMsg, setCrmSyncMsg] = useState<string | null>(null);
  const [crmConnecting, setCrmConnecting] = useState(false);

  // Zentact state
  const [zentactStatus, setZentactStatus] = useState<{
    connected: boolean; total: number; active: number; lastSync: string | null; reason?: string;
    withRepEmail?: number; assigned?: number;
    debugSamples?: { merchant_account_id: string; business_name: string; sales_rep_email: string | null; sales_rep_name: string | null; raw_attributes: any }[];
  } | null>(null);
  const [zentactSyncing, setZentactSyncing] = useState(false);
  const [zentactSyncMsg, setZentactSyncMsg] = useState<string | null>(null);
  const [unassignedMerchants, setUnassignedMerchants] = useState<{
    merchant_account_id: string; business_name: string;
    raw_attributes: any; activated_at: string | null;
  }[]>([]);
  const [showUnassigned, setShowUnassigned] = useState(false);

  // CSV import state
  const [csvImport, setCsvImport] = useState<{
    showing: boolean;
    rows: { merchant: string; salesRep: string; activatedAt: string }[];
    preview: any | null;
    applying: boolean;
    message: string | null;
  }>({ showing: false, rows: [], preview: null, applying: false, message: null });

  // Recalculate commissions state
  const [recalcStatus, setRecalcStatus] = useState<any>(null);
  const [recalcPolling, setRecalcPolling] = useState(false);
  const [recalcStopping, setRecalcStopping] = useState(false);
  // Enrich invoices state
  const [enrichStatus, setEnrichStatus] = useState<any>(null);
  const [enrichPolling, setEnrichPolling] = useState(false);
  const [enrichStopping, setEnrichStopping] = useState(false);

  // Admin users state
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  // Salespeople tab and edit lock state
  const [salespeopleTab, setSalespeopleTab] = useState<'active' | 'inactive'>('active');
  const [unlockedFields, setUnlockedFields] = useState<Record<string, boolean>>({});
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    name: string;
    field: string;
    oldValue: number;
    newValue: number;
    onConfirm: () => void;
  } | null>(null);

  // Admin gate from the EFFECTIVE identity (/api/auth/verify), not the raw JWT —
  // the JWT stays admin while impersonating, which would let an impersonated
  // "view as" session into the Admin Panel.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/'); return; }
    axios
      .get(`${API_URL}/api/auth/verify`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const adminStatus = !!res.data?.user?.isAdmin;
        setIsAdmin(adminStatus);
        if (!adminStatus) navigate('/');
      })
      .catch(() => navigate('/'));
  }, [navigate]);

  // Fetch all salespeople
  const fetchSalespeople = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await axios.get(`${API_URL}/api/salespeople/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSalespeople(response.data.salespeople || []);
    } catch (error) {
      console.error('Error fetching salespeople:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch teams
  const fetchTeams = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/teams`, { headers: { Authorization: `Bearer ${token}` } });
      setTeams(res.data.teams || []);
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };

  const createTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/teams`, { name }, { headers: { Authorization: `Bearer ${token}` } });
      setNewTeamName('');
      fetchTeams();
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to create team');
    }
  };

  const updateTeam = async (team: Team, patch: Partial<Team>) => {
    const merged = { ...team, ...patch };
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/teams/${team.id}`,
        {
          name: merged.name,
          monthlyQuotaOverride: merged.monthlyQuotaOverride,
          countsTowardQuota: merged.countsTowardQuota,
          includeDeals: merged.includeDeals,
          includePayments: merged.includePayments,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTeams(prev => prev.map(t => t.id === team.id ? merged : t));
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to update team');
      fetchTeams();
    }
  };

  const moveTeam = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= teams.length) return;
    const next = [...teams];
    [next[index], next[j]] = [next[j], next[index]];
    setTeams(next);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/teams/reorder`, { orderedIds: next.map(t => t.id) }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {
      fetchTeams(); // revert to server order on failure
    }
  };

  const deleteTeam = async (team: Team) => {
    if (!window.confirm(t('admin.teams.confirmDelete', { name: team.name }) as string)) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/teams/${team.id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchTeams();
      fetchSalespeople();
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to delete team');
    }
  };

  const updateQuota = async (name: string, quota: number | null) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/salespeople/${encodeURIComponent(name)}/quota`,
        { quota },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSalespeople(prev => prev.map(p => p.name === name ? { ...p, monthlyQuota: quota } : p));
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to update quota');
    }
  };

  const assignTeam = async (name: string, teamId: number | null) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/salespeople/${encodeURIComponent(name)}/team`,
        { teamId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const teamName = teamId == null ? null : (teams.find(t => t.id === teamId)?.name ?? null);
      setSalespeople(prev => prev.map(p => p.name === name ? { ...p, teamId, teamName } : p));
      fetchTeams(); // refresh member counts
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to assign team');
    }
  };

  // Deal-type point values
  const fetchDealPoints = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/deal-source-points`, { headers: { Authorization: `Bearer ${token}` } });
      setDealGroups(res.data.groups || []);
    } catch (error) {
      console.error('Error fetching deal points:', error);
    }
  };

  const saveDealPoints = async (sourceGroup: string, points: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/deal-source-points`, { sourceGroup, points }, { headers: { Authorization: `Bearer ${token}` } });
      fetchDealPoints();
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to save points');
    }
  };

  const deleteDealPoints = async (sourceGroup: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/deal-source-points/${encodeURIComponent(sourceGroup)}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchDealPoints();
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to delete');
    }
  };

  // Fetch admin users
  const fetchAdminUsers = async () => {
    try {
      setAdminLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAdminUsers(response.data.users || []);
    } catch (error) {
      console.error('Error fetching admin users:', error);
    } finally {
      setAdminLoading(false);
    }
  };

  // ============================ ROLES ============================

  const fetchPermCatalog = async () => {
    try {
      const token = localStorage.getItem('token');
      const r = await axios.get(`${API_URL}/api/permissions/catalog`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPermCatalog(r.data.catalog || []);
    } catch (e) { console.error('catalog', e); }
  };

  const fetchRoles = async () => {
    try {
      const token = localStorage.getItem('token');
      const r = await axios.get(`${API_URL}/api/roles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoles(r.data.roles || []);
    } catch (e) { console.error('roles', e); }
  };

  const saveRole = async (role: Partial<Role>, isNew: boolean) => {
    setSavingRole(true);
    try {
      const token = localStorage.getItem('token');
      if (isNew) {
        await axios.post(`${API_URL}/api/roles`, role, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.put(`${API_URL}/api/roles/${role.id}`, role, { headers: { Authorization: `Bearer ${token}` } });
      }
      setEditingRole(null);
      setShowNewRole(false);
      fetchRoles();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to save role');
    } finally {
      setSavingRole(false);
    }
  };

  const deleteRole = async (role: Role) => {
    if (!confirm(`Delete role "${role.name}"? Users assigned to this role will lose its permissions.`)) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/roles/${role.id}`, { headers: { Authorization: `Bearer ${token}` } });
      fetchRoles();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to delete role');
    }
  };

  const saveUserRoles = async (email: string, roleIds: number[]) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/users/${encodeURIComponent(email)}/roles`,
        { roleIds }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingUserRoles(null);
      fetchAdminUsers();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to save user roles');
    }
  };

  // Toggle admin status
  const toggleAdminStatus = async (email: string, currentStatus: boolean) => {
    const action = currentStatus ? t('admin.admins.confirmRevoke') : t('admin.admins.confirmGrant');
    if (!confirm(`${action} ${email}?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/admin/users/${encodeURIComponent(email)}/admin`,
        { makeAdmin: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAdminUsers(prev =>
        prev.map(user =>
          user.email === email ? { ...user, isAdmin: !currentStatus } : user
        )
      );
    } catch (error: any) {
      const msg = error.response?.data?.error || t('admin.admins.failedUpdate');
      alert(msg);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchSalespeople();
      fetchTeams();
      fetchDealPoints();
      fetchSyncStatus();
      fetchCrmStatus();
      fetchZentactStatus();
      fetchReleases();
      fetchExcludedCustomers();
      fetchAdminUsers();
      fetchPermCatalog();
      fetchRoles();
    }
  }, [isAdmin]);

  // Fetch excluded customers
  const fetchExcludedCustomers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/excluded-customers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setExcludedCustomers(response.data.excludedCustomers || []);
    } catch (err) {
      console.error('Error fetching excluded customers:', err);
    }
  };

  // Search customers API call
  const doCustomerSearch = async (query: string) => {
    if (query.length < 2) {
      setCustomerResults([]);
      return;
    }
    try {
      setSearchingCustomers(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/customers/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustomerResults(response.data.customers || []);
    } catch (err) {
      console.error('Error searching customers:', err);
    } finally {
      setSearchingCustomers(false);
    }
  };

  // Exclude a customer
  const excludeCustomer = async (name: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/excluded-customers`,
        { customerName: name },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchExcludedCustomers();
      setCustomerSearch('');
      setCustomerResults([]);
    } catch (err) {
      console.error('Error excluding customer:', err);
    }
  };

  // Re-include a customer
  const reincludeCustomer = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/excluded-customers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchExcludedCustomers();
    } catch (err) {
      console.error('Error re-including customer:', err);
    }
  };

  // Debounce customer search
  useEffect(() => {
    if (customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    const timer = setTimeout(() => {
      doCustomerSearch(customerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  // Fetch releases from GitHub
  const fetchReleases = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/releases`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReleases(response.data.releases || []);

      // Suggest next version based on latest
      if (response.data.releases?.length > 0) {
        const latest = response.data.releases[0].version.replace('v', '');
        const parts = latest.split('.').map(Number);
        parts[2] = (parts[2] || 0) + 1;
        setNewVersion(parts.join('.'));
      } else {
        // Fallback to package.json version + 1
        const parts = packageJson.version.split('.').map(Number);
        parts[2] = (parts[2] || 0) + 1;
        setNewVersion(parts.join('.'));
      }
    } catch (err) {
      console.error('Error fetching releases:', err);
    }
  };

  // Auto-generate release notes from commits
  const generateNotes = async () => {
    try {
      setGeneratingNotes(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/releases/generate-notes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReleaseNotes(response.data.notes || '');
      setCommitCount(response.data.commitCount || 0);
      setSinceTag(response.data.sinceTag || '');
      // Auto-fill "What's New" from feat(scope) commits → menu sections (admin can tweak).
      if (Array.isArray(response.data.suggestedFeatures)) {
        setNewFeatureTags(
          response.data.suggestedFeatures.map((f: any) => ({
            path: f.path || '',
            title: f.title || '',
            description: f.description || '',
            days: f.days || 7,
          }))
        );
      }
    } catch (err) {
      console.error('Error generating notes:', err);
      setReleaseNotes('## ✨ New Features\n- \n\n## 🎨 UI Improvements\n- \n\n## 🔧 Bug Fixes\n- \n');
    } finally {
      setGeneratingNotes(false);
    }
  };

  // Open release form and auto-generate notes
  const openReleaseForm = async () => {
    setShowReleaseForm(true);
    await generateNotes();
  };

  // Push a new release
  const pushRelease = async () => {
    if (!newVersion.trim() || !releaseNotes.trim()) {
      alert('Please enter a version number and release notes.');
      return;
    }
    if (!confirm(`Push release v${newVersion}? This will:\n\n• Bump package.json to v${newVersion}\n• Create a git tag\n• Create a GitHub Release\n• Trigger Netlify deployment\n\nContinue?`)) return;

    try {
      setReleaseStatus('pushing');
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/releases/create`,
        { version: newVersion, releaseNotes, newFeatures: newFeatureTags.filter(f => f.path) },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setReleaseStatus('triggered');
      setShowReleaseForm(false);
      setReleaseNotes('');
      setNewFeatureTags([]);

      // Poll workflow status
      const pollInterval = setInterval(async () => {
        try {
          const token = localStorage.getItem('token');
          const statusRes = await axios.get(`${API_URL}/api/releases/workflow-status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setWorkflowStatus(statusRes.data);
          if (statusRes.data.status === 'completed') {
            clearInterval(pollInterval);
            setReleaseStatus(statusRes.data.conclusion === 'success' ? 'success' : 'failed');
            fetchReleases();
            setTimeout(() => setReleaseStatus(null), 8000);
          }
        } catch (e) { /* keep polling */ }
      }, 10000);

      // Stop polling after 10 minutes
      setTimeout(() => clearInterval(pollInterval), 600000);
    } catch (err: any) {
      console.error('Release error:', err);
      setReleaseStatus('error');
      alert(err.response?.data?.error || 'Failed to create release');
      setTimeout(() => setReleaseStatus(null), 5000);
    }
  };

  // Fetch Zentact status
  const fetchZentactStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/zentact/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setZentactStatus(res.data);
    } catch (e) {
      console.error('Failed to fetch Zentact status:', e);
    }
  };

  // Trigger Zentact sync
  const syncZentact = async () => {
    try {
      setZentactSyncing(true);
      setZentactSyncMsg(null);
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/zentact/sync`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const statusRes = await axios.get(`${API_URL}/api/zentact/sync-status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!statusRes.data.running) {
            clearInterval(poll);
            setZentactSyncing(false);
            if (statusRes.data.result) {
              setZentactSyncMsg(`✓ ${statusRes.data.result.total} merchants · ${statusRes.data.result.active} active`);
              fetchZentactStatus();
            } else if (statusRes.data.error) {
              setZentactSyncMsg(`✕ ${statusRes.data.error}`);
            }
          }
        } catch { clearInterval(poll); setZentactSyncing(false); }
      }, 3000);
    } catch (e: any) {
      setZentactSyncing(false);
      setZentactSyncMsg(`✕ ${e.response?.data?.error || e.message}`);
    }
  };

  // Fetch unassigned Zentact merchants
  const fetchUnassignedMerchants = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/zentact/merchants?unassigned=true&active=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUnassignedMerchants(res.data.merchants || []);
    } catch (e) {
      console.error('Failed to fetch unassigned merchants:', e);
    }
  };

  // Assign a rep to one Zentact merchant
  const assignMerchantRep = async (merchantId: string, repName: string) => {
    if (!repName) return;
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/zentact/merchants/${encodeURIComponent(merchantId)}/rep`,
        { repName },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Drop the merchant from the local unassigned list
      setUnassignedMerchants(prev => prev.filter(m => m.merchant_account_id !== merchantId));
    } catch (e) {
      console.error('Failed to assign rep:', e);
      alert('Failed to assign rep');
    }
  };

  // Parse a CSV file uploaded by the admin. Expected headers (case-insensitive):
  //   merchant (or business_name) | sales_rep (or rep, salesrep) | activated_at (or date, activation_date)
  const handleCsvFile = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) {
      setCsvImport(prev => ({ ...prev, message: 'CSV must have header + at least one row' }));
      return;
    }
    const splitLine = (line: string) => {
      // Simple CSV split — handles quoted fields with commas
      const out: string[] = [];
      let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; continue; }
        if (c === '"') { q = !q; continue; }
        if (c === ',' && !q) { out.push(cur); cur = ''; continue; }
        cur += c;
      }
      out.push(cur);
      return out;
    };
    const headers = splitLine(lines[0]).map(h => h.trim().toLowerCase());
    const merchantIdx = headers.findIndex(h => ['merchant', 'business_name', 'business name', 'name'].includes(h));
    const repIdx      = headers.findIndex(h => ['sales_rep', 'salesrep', 'rep', 'sales rep', 'vendeur', 'representant'].includes(h));
    const dateIdx     = headers.findIndex(h => ['activated_at', 'activated', 'date', 'activation_date', 'activation date', 'boarded', 'boarded_at'].includes(h));
    if (merchantIdx === -1) {
      setCsvImport(prev => ({ ...prev, message: `Missing 'merchant' column. Found: ${headers.join(', ')}` }));
      return;
    }
    const rows = lines.slice(1).map(line => {
      const cells = splitLine(line);
      return {
        merchant:    (cells[merchantIdx] || '').trim(),
        salesRep:    repIdx  !== -1 ? (cells[repIdx]  || '').trim() : '',
        activatedAt: dateIdx !== -1 ? normalizeDate(cells[dateIdx] || '') : '',
      };
    }).filter(r => r.merchant);
    setCsvImport(prev => ({ ...prev, rows, message: `Parsed ${rows.length} rows. Click 'Preview' to match against the database.` }));
  };

  const normalizeDate = (s: string): string => {
    const trimmed = s.trim();
    if (!trimmed) return '';
    // Accept YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, etc.
    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2,'0')}-${isoMatch[3].padStart(2,'0')}`;
    // MM/DD/YYYY or DD/MM/YYYY — assume MM/DD/YYYY (most common in NA exports)
    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const [_, p1, p2, y] = slashMatch;
      const mm = p1.padStart(2, '0'), dd = p2.padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    }
    return trimmed;
  };

  const runImportPreview = async (apply: boolean) => {
    if (csvImport.rows.length === 0) return;
    setCsvImport(prev => ({ ...prev, applying: true, message: null }));
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/api/zentact/import-assignments`,
        { rows: csvImport.rows, dryRun: !apply },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCsvImport(prev => ({
        ...prev,
        applying: false,
        preview: res.data,
        message: apply
          ? `✓ Applied: ${res.data.updated} merchants updated, ${res.data.unmatched.length} unmatched`
          : `Preview: ${res.data.matched.length} will be updated, ${res.data.unmatched.length} unmatched`,
      }));
      if (apply) fetchZentactStatus();
    } catch (e: any) {
      setCsvImport(prev => ({ ...prev, applying: false, message: `✕ ${e.response?.data?.error || e.message}` }));
    }
  };

  // Fetch CRM connection status
  const fetchCrmStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/auth/crm-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCrmStatus(res.data);
    } catch (e) {
      console.error('Failed to fetch CRM status:', e);
    }
  };

  // Initiate CRM OAuth
  const connectCRM = async () => {
    try {
      setCrmConnecting(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/auth/zoho-crm`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Redirect user to Zoho consent screen
      window.location.href = res.data.authUrl;
    } catch (e) {
      console.error('Failed to initiate CRM OAuth:', e);
      setCrmConnecting(false);
    }
  };

  // Trigger non-destructive manual CRM sync (preserves sold_date)
  const syncCRM = async () => {
    try {
      setCrmSyncing(true);
      setCrmSyncMsg(null);
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/crm/sync`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const statusRes = await axios.get(`${API_URL}/api/crm/sync-status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!statusRes.data.running) {
            clearInterval(poll);
            setCrmSyncing(false);
            if (statusRes.data.result) {
              setCrmSyncMsg(`✓ ${statusRes.data.result.total} deals · ${statusRes.data.result.newCount} new`);
            } else if (statusRes.data.error) {
              setCrmSyncMsg(`✕ ${statusRes.data.error}`);
            }
          }
        } catch { clearInterval(poll); setCrmSyncing(false); }
      }, 3000);
    } catch (e: any) {
      setCrmSyncing(false);
      setCrmSyncMsg(`✕ ${e.response?.data?.error || e.message}`);
    }
  };

  // Fetch sync status
  const fetchSyncStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/sync/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSyncInfo(response.data);
      if (response.data.syncStatus === 'syncing') {
        setSyncStatus('bulk_started');
        startPolling();
      }
    } catch (err) {
      console.error('Error fetching sync status:', err);
    }
  };

  // Poll for sync completion
  const startPolling = () => {
    const pollInterval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const statusRes = await axios.get(`${API_URL}/api/sync/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSyncInfo(statusRes.data);
        if (statusRes.data.syncStatus !== 'syncing') {
          clearInterval(pollInterval);
          setSyncStatus('bulk_done');
          fetchSalespeople();
          setTimeout(() => setSyncStatus(null), 5000);
        }
      } catch (e) { /* keep polling */ }
    }, 15000);
  };

  // Full bulk import
  const triggerBulkImport = async () => {
    if (!confirm('This will re-import ALL invoices from Zoho Books. This runs in the background and may take 10-20 minutes. Continue?')) return;
    try {
      setSyncStatus('bulk_importing');
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/invoices/bulk-import`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.status === 'already_syncing') {
        setSyncStatus('already_syncing');
        setTimeout(() => setSyncStatus(null), 3000);
      } else {
        setSyncStatus('bulk_started');
        startPolling();
      }
    } catch (err) {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(null), 3000);
    }
  };

  // Quick incremental sync
  const triggerQuickSync = async () => {
    try {
      setSyncStatus('syncing');
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/invoices/incremental-sync`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.needsBulkImport) {
        setSyncStatus('needs_import');
        setTimeout(() => setSyncStatus(null), 3000);
      } else {
        setSyncStatus(`done_${response.data.totalSynced || 0}`);
        fetchSyncStatus();
        fetchSalespeople();
        setTimeout(() => setSyncStatus(null), 3000);
      }
    } catch (err) {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus(null), 3000);
    }
  };

  // Format date helper
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('common.never');
    const d = new Date(dateStr);
    return d.toLocaleString();
  };

  // Helper: a job is "active" while running or in the process of stopping.
  const jobActive = (s: any) => s?.status === 'running' || s?.status === 'stopping';

  // ---- Recalculate commissions (recalc-v2 — the real subscription-rule model) ----
  const triggerRecalculate = async () => {
    if (!confirm(t('admin.recalculate.confirmRecalculate'))) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/commissions/recalc-v2/start`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRecalcStopping(false);
      setRecalcPolling(true);
      startRecalcPolling();
    } catch (err: any) {
      if (err?.response?.status === 409) { setRecalcPolling(true); startRecalcPolling(); return; }
      alert(t('admin.recalculate.startFailed'));
    }
  };

  const stopRecalculate = async () => {
    try {
      const token = localStorage.getItem('token');
      setRecalcStopping(true);
      await axios.post(`${API_URL}/api/commissions/recalc-v2/stop`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      setRecalcStopping(false);
    }
  };

  const startRecalcPolling = () => {
    const pollInterval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/api/commissions/recalc-v2/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRecalcStatus(res.data);
        if (!jobActive(res.data)) {
          clearInterval(pollInterval);
          setRecalcPolling(false);
          setRecalcStopping(false);
        }
      } catch (e) {
        clearInterval(pollInterval);
        setRecalcPolling(false);
        setRecalcStopping(false);
      }
    }, 3000);
  };

  // ---- Enrich invoices (fetch line items + classify hardware/SaaS — prerequisite to recalc) ----
  const triggerEnrich = async () => {
    if (!confirm(t('admin.enrich.confirm'))) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/invoices/enrich/start`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEnrichStopping(false);
      setEnrichPolling(true);
      startEnrichPolling();
    } catch (err: any) {
      if (err?.response?.status === 409) { setEnrichPolling(true); startEnrichPolling(); return; }
      alert(t('admin.enrich.startFailed'));
    }
  };

  const stopEnrich = async () => {
    try {
      const token = localStorage.getItem('token');
      setEnrichStopping(true);
      await axios.post(`${API_URL}/api/invoices/enrich/stop`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      setEnrichStopping(false);
    }
  };

  const startEnrichPolling = () => {
    const pollInterval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/api/invoices/enrich/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setEnrichStatus(res.data);
        if (!jobActive(res.data)) {
          clearInterval(pollInterval);
          setEnrichPolling(false);
          setEnrichStopping(false);
        }
      } catch (e) {
        clearInterval(pollInterval);
        setEnrichPolling(false);
        setEnrichStopping(false);
      }
    }, 3000);
  };

  // Check enrich + recalc-v2 status on mount (and resume polling if a job is already running)
  useEffect(() => {
    if (isAdmin && activeTab === 'sync') {
      const check = async () => {
        try {
          const token = localStorage.getItem('token');
          const headers = { Authorization: `Bearer ${token}` };
          const [rc, en] = await Promise.all([
            axios.get(`${API_URL}/api/commissions/recalc-v2/status`, { headers }),
            axios.get(`${API_URL}/api/invoices/enrich/status`, { headers }),
          ]);
          setRecalcStatus(rc.data);
          if (jobActive(rc.data)) { setRecalcPolling(true); startRecalcPolling(); }
          setEnrichStatus(en.data);
          if (jobActive(en.data)) { setEnrichPolling(true); startEnrichPolling(); }
        } catch (_) {}
      };
      check();
    }
  }, [isAdmin, activeTab]);

  // Toggle salesperson active status
  const toggleSalesperson = async (name: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem('token');
      
      await axios.put(
        `${API_URL}/api/salespeople/${encodeURIComponent(name)}/status`,
        { isActive: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSalespeople(prev =>
        prev.map(person =>
          person.name === name
            ? { ...person, isActive: !currentStatus }
            : person
        )
      );
    } catch (error) {
      console.error('Error updating salesperson status:', error);
      alert('Failed to update salesperson status');
    }
  };

  // Update commission rate (called after confirmation)
  const updateCommissionRate = async (name: string, rate: number) => {
    try {
      const token = localStorage.getItem('token');
      
      await axios.put(
        `${API_URL}/api/salespeople/${encodeURIComponent(name)}/commission-rate`,
        { commissionRate: rate },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSalespeople(prev =>
        prev.map(person =>
          person.name === name
            ? { ...person, commissionRate: rate }
            : person
        )
      );
      // Re-lock the field after save
      setUnlockedFields(prev => ({ ...prev, [`${name}_commission`]: false }));
    } catch (error) {
      console.error('Error updating commission rate:', error);
      alert('Failed to update commission rate');
    }
  };

  // Show confirmation for commission rate change
  const confirmCommissionRate = (name: string, oldValue: number, newValue: number) => {
    setConfirmModal({
      show: true,
      name,
      field: t('admin.salespeople.commissionPercent'),
      oldValue,
      newValue,
      onConfirm: () => {
        updateCommissionRate(name, newValue);
        setConfirmModal(null);
      },
    });
  };

  // Update base salary (called after confirmation)
  const updateBaseSalary = async (name: string, salary: number) => {
    try {
      const token = localStorage.getItem('token');

      await axios.put(
        `${API_URL}/api/salespeople/${encodeURIComponent(name)}/base-salary`,
        { baseSalary: salary },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSalespeople(prev =>
        prev.map(person =>
          person.name === name
            ? { ...person, baseSalary: salary }
            : person
        )
      );
      // Re-lock the field after save
      setUnlockedFields(prev => ({ ...prev, [`${name}_salary`]: false }));
    } catch (error) {
      console.error('Error updating base salary:', error);
      alert(t('admin.salespeople.failedUpdateSalary'));
    }
  };

  // Update per-salesperson signup-bonus amount (per activation) and/or on-off toggle.
  const updateSignupBonus = async (name: string, amount: number, enabled: boolean) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/salespeople/${encodeURIComponent(name)}/signup-bonus`,
        { amount, enabled },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSalespeople(prev =>
        prev.map(person =>
          person.name === name ? { ...person, signupBonusAmount: amount, signupBonusEnabled: enabled } : person
        )
      );
      setUnlockedFields(prev => ({ ...prev, [`${name}_signup`]: false }));
    } catch (error) {
      console.error('Error updating signup bonus:', error);
      alert(t('admin.salespeople.failedUpdateSignup'));
    }
  };

  // Update aliases (e.g. ["Gaby", "Gabi"] for Gabriella Daly)
  const updateAliases = async (name: string, aliases: string[]) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/salespeople/${encodeURIComponent(name)}/aliases`,
        { aliases },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSalespeople(prev =>
        prev.map(person => person.name === name ? { ...person, aliases } : person)
      );
      setUnlockedFields(prev => ({ ...prev, [`${name}_aliases`]: false }));
    } catch (error) {
      console.error('Error updating aliases:', error);
      alert('Failed to update aliases');
    }
  };

  // Show confirmation for base salary change
  const confirmBaseSalary = (name: string, oldValue: number, newValue: number) => {
    setConfirmModal({
      show: true,
      name,
      field: t('admin.salespeople.baseSalary'),
      oldValue,
      newValue,
      onConfirm: () => {
        updateBaseSalary(name, newValue);
        setConfirmModal(null);
      },
    });
  };

  // Filter salespeople by search
  const filteredSalespeople = salespeople
    .filter(person => person.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));

  const activePeople = filteredSalespeople.filter(p => p.isActive);
  const inactivePeople = filteredSalespeople.filter(p => !p.isActive);

  if (!isAdmin) {
    return null; // Will redirect via useEffect
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-title-md2 font-semibold text-black dark:text-white">
            {activeTab === 'sync' ? t('admin.integrations.title') :
             activeTab === 'salespeople' ? t('admin.salespeople.title') :
             activeTab === 'customers' ? t('admin.customers.title') :
             activeTab === 'releases' ? t('admin.releases.title') :
             activeTab === 'admins' ? t('admin.admins.title') :
             activeTab === 'roles' ? t('admin.roles.title') :
             activeTab === 'import-payments' ? t('admin.commissionImport.title') :
             activeTab === 'resellers' ? t('admin.resellers.title') :
             t('admin.title')}
          </h2>
          <p className="text-sm text-body">
            {activeTab === 'sync' ? t('admin.integrations.subtitle') :
             activeTab === 'salespeople' ? t('admin.salespeople.subtitle') :
             activeTab === 'customers' ? t('admin.customers.subtitle') :
             activeTab === 'releases' ? `${t('admin.releases.currentVersion')}: v${appVersion}` :
             activeTab === 'admins' ? t('admin.admins.subtitle') :
             activeTab === 'roles' ? t('admin.roles.subtitle') :
             activeTab === 'import-payments' ? t('admin.commissionImport.subtitle') :
             activeTab === 'resellers' ? t('admin.resellers.subtitle') :
             t('admin.title')}
          </p>
        </div>
        {activeTab === 'releases' && (
          <button
            onClick={showReleaseForm ? () => setShowReleaseForm(false) : openReleaseForm}
            className="inline-flex items-center gap-2 rounded-md bg-[#8B5CF6] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {t('admin.releases.newRelease')}
          </button>
        )}
      </div>

      {/* Content */}
          {activeTab === 'sync' && (
            <>
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.zohoSync.title')}</h3>
                <p className="text-sm text-body mt-1">{t('admin.zohoSync.subtitle')}</p>
              </div>
              <div className="p-7">
                {/* Sync Status Info */}
                <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs font-medium uppercase text-body">{t('admin.zohoSync.status')}</p>
                    <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                      {syncInfo?.syncStatus === 'syncing' ? (
                        <span className="inline-flex items-center gap-1.5 text-warning">
                          <span className="h-2 w-2 rounded-full bg-warning animate-pulse"></span>
                          {t('admin.zohoSync.syncing')}
                        </span>
                      ) : syncInfo?.syncStatus === 'error' ? (
                        <span className="text-danger">{t('admin.zohoSync.error')}</span>
                      ) : (
                        <span className="text-success">{t('common.idle')}</span>
                      )}
                    </p>
                  </div>
                  <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs font-medium uppercase text-body">{t('admin.zohoSync.invoicesInDb')}</p>
                    <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                      {syncInfo?.totalInvoicesInDb?.toLocaleString() || '—'}
                    </p>
                  </div>
                  <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs font-medium uppercase text-body">{t('admin.zohoSync.lastSync')}</p>
                    <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                      {formatDate(syncInfo?.lastIncrementalSync || syncInfo?.lastFullSync)}
                    </p>
                  </div>
                </div>

                {/* Sync Buttons */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={triggerBulkImport}
                    disabled={syncStatus === 'bulk_importing' || syncStatus === 'bulk_started' || syncStatus === 'syncing'}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
                  >
                    <svg className={`h-4 w-4 ${syncStatus === 'bulk_started' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {syncStatus === 'bulk_started' ? t('admin.zohoSync.importing') :
                     syncStatus === 'bulk_importing' ? t('admin.zohoSync.starting') :
                     syncStatus === 'already_syncing' ? t('admin.zohoSync.alreadyRunning') :
                     syncStatus === 'bulk_done' ? t('admin.zohoSync.importComplete') :
                     t('admin.zohoSync.fullImport')}
                  </button>

                  <button
                    onClick={triggerQuickSync}
                    disabled={syncStatus === 'syncing' || syncStatus === 'bulk_started'}
                    className="inline-flex items-center gap-2 rounded-md border border-stroke bg-white px-5 py-2.5 text-sm font-medium text-black shadow-sm hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:text-white dark:hover:bg-meta-4 disabled:opacity-50"
                  >
                    <svg className={`h-4 w-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {syncStatus === 'syncing' ? t('admin.zohoSync.syncing') :
                     syncStatus?.startsWith('done_') ? `✓ ${syncStatus.split('_')[1]} ${t('dashboard.synced')}` :
                     syncStatus === 'needs_import' ? t('admin.zohoSync.runFullImportFirst') :
                     syncStatus === 'error' ? t('admin.zohoSync.syncFailed') :
                     t('admin.zohoSync.quickSync')}
                  </button>

                  <button
                    onClick={fetchSyncStatus}
                    className="inline-flex items-center gap-2 rounded-md border border-stroke bg-white px-5 py-2.5 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4"
                  >
                    {t('common.refreshStatus')}
                  </button>
                </div>

                {syncStatus === 'bulk_started' && (
                  <div className="mt-4 rounded-md bg-warning bg-opacity-10 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-warning border-t-transparent"></div>
                      <p className="text-sm font-medium text-warning">
                        {t('admin.zohoSync.fullImportRunning')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ==================== CRM CONNECTION ==================== */}
            <div className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.crm.title')}</h3>
                  <p className="text-sm text-body mt-1">{t('admin.crm.subtitle')}</p>
                </div>
                {crmStatus?.connected && !crmStatus?.expired && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success bg-opacity-10 px-3 py-1 text-xs font-semibold text-success">
                    <span className="h-2 w-2 rounded-full bg-success"></span>
                    {t('admin.crm.connected')}
                  </span>
                )}
              </div>
              <div className="p-7">
                <div className="flex items-start gap-6">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[#E8542A] bg-opacity-10">
                    <svg className="h-7 w-7 text-[#E8542A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    {crmStatus === null ? (
                      <p className="text-sm text-body">{t('admin.crm.checking')}</p>
                    ) : crmStatus.connected && !crmStatus.expired ? (
                      <div>
                        <p className="text-sm font-medium text-black dark:text-white mb-1">{t('admin.crm.connectedMsg')}</p>
                        <p className="text-sm text-body mb-4">{t('admin.crm.connectedDesc')}</p>
                        {crmSyncMsg && (
                          <p className={`mb-3 text-sm font-medium ${crmSyncMsg.startsWith('✓') ? 'text-success' : 'text-danger'}`}>
                            {crmSyncMsg}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={syncCRM}
                            disabled={crmSyncing}
                            className="inline-flex items-center gap-2 rounded-md bg-[#E8542A] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
                          >
                            {crmSyncing ? (
                              <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                {t('admin.crm.syncing')}
                              </>
                            ) : (
                              <>
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {t('admin.crm.syncNow')}
                              </>
                            )}
                          </button>
                          <button
                            onClick={connectCRM}
                            disabled={crmConnecting}
                            className="inline-flex items-center gap-2 rounded-md border border-stroke bg-white px-4 py-2 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4 disabled:opacity-50"
                          >
                            {t('admin.crm.reconnect')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium text-black dark:text-white mb-1">
                          {crmStatus?.connected ? t('admin.crm.expired') : t('admin.crm.notConnected')}
                        </p>
                        <p className="text-sm text-body mb-4">{t('admin.crm.notConnectedDesc')}</p>
                        <button
                          onClick={connectCRM}
                          disabled={crmConnecting}
                          className="inline-flex items-center gap-2 rounded-md bg-[#E8542A] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
                        >
                          {crmConnecting ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                              {t('admin.crm.redirecting')}
                            </>
                          ) : (
                            <>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                              {t('admin.crm.connect')}
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ==================== ZENTACT CONNECTION ==================== */}
            <div className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.zentact.title')}</h3>
                  <p className="text-sm text-body mt-1">{t('admin.zentact.subtitle')}</p>
                </div>
                {zentactStatus?.connected && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success bg-opacity-10 px-3 py-1 text-xs font-semibold text-success">
                    <span className="h-2 w-2 rounded-full bg-success"></span>
                    {t('admin.zentact.connected')}
                  </span>
                )}
              </div>
              <div className="p-7">
                <div className="flex items-start gap-6">
                  {/* Icon */}
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[#6366F1] bg-opacity-10">
                    <svg className="h-7 w-7 text-[#6366F1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    {zentactStatus === null ? (
                      <p className="text-sm text-body">{t('admin.zentact.checking')}</p>
                    ) : !zentactStatus.connected ? (
                      <div>
                        <p className="text-sm font-medium text-black dark:text-white mb-1">{t('admin.zentact.notConnected')}</p>
                        <p className="text-sm text-body">{zentactStatus.reason}</p>
                      </div>
                    ) : (
                      <div>
                        {/* Stats row */}
                        <div className="mb-4 flex flex-wrap gap-6">
                          <div>
                            <p className="text-xs uppercase text-body font-medium">{t('admin.zentact.totalMerchants')}</p>
                            <p className="text-2xl font-bold text-black dark:text-white">{zentactStatus.total}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-body font-medium">{t('admin.zentact.activeMerchants')}</p>
                            <p className="text-2xl font-bold text-success">{zentactStatus.active}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-body font-medium">{t('admin.zentact.totalBonus')}</p>
                            <p className="text-2xl font-bold text-[#6366F1]">${(zentactStatus.active * 100).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-body font-medium">{t('admin.zohoSync.lastSync')}</p>
                            <p className="text-sm font-semibold text-black dark:text-white">
                              {zentactStatus.lastSync
                                ? new Date(zentactStatus.lastSync).toLocaleDateString()
                                : t('common.never')}
                            </p>
                          </div>
                        </div>

                        {zentactSyncMsg && (
                          <p className={`mb-3 text-sm font-medium ${zentactSyncMsg.startsWith('✓') ? 'text-success' : 'text-danger'}`}>
                            {zentactSyncMsg}
                          </p>
                        )}

                        <button
                          onClick={syncZentact}
                          disabled={zentactSyncing}
                          className="inline-flex items-center gap-2 rounded-md bg-[#6366F1] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
                        >
                          {zentactSyncing ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                              {t('admin.zentact.syncing')}
                            </>
                          ) : (
                            <>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              {t('admin.zentact.syncNow')}
                            </>
                          )}
                        </button>

                        {/* CSV import for historical assignments */}
                        <div className="mt-5 border-t border-stroke pt-4 dark:border-strokedark">
                          <button
                            onClick={() => setCsvImport(prev => ({ ...prev, showing: !prev.showing }))}
                            className="inline-flex items-center gap-2 text-sm font-medium text-[#6366F1] hover:underline"
                          >
                            <svg className={`h-4 w-4 transition-transform ${csvImport.showing ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            {t('admin.zentact.importCsv')}
                          </button>

                          {csvImport.showing && (
                            <div className="mt-3 space-y-3">
                              <p className="text-xs text-body">
                                {t('admin.zentact.csvHint')}
                              </p>
                              <pre className="rounded bg-gray-50 dark:bg-meta-4 p-2 text-xs font-mono text-body overflow-x-auto">
{`merchant,sales_rep,activated_at
Plante Cuisine,Dora Housseau-Kurtin,2024-03-15
Joker Pub,Jay Daoust,2024-04-01`}
                              </pre>
                              <input
                                type="file"
                                accept=".csv,text/csv"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleCsvFile(f);
                                }}
                                className="block w-full text-sm text-body file:mr-3 file:rounded file:border-0 file:bg-[#6366F1] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-opacity-90"
                              />
                              {csvImport.message && (
                                <p className={`text-sm ${csvImport.message.startsWith('✓') ? 'text-success' : csvImport.message.startsWith('✕') ? 'text-danger' : 'text-body'}`}>
                                  {csvImport.message}
                                </p>
                              )}
                              {csvImport.rows.length > 0 && (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => runImportPreview(false)}
                                    disabled={csvImport.applying}
                                    className="rounded border border-stroke px-4 py-1.5 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4 disabled:opacity-50"
                                  >
                                    {t('admin.zentact.preview')}
                                  </button>
                                  <button
                                    onClick={() => runImportPreview(true)}
                                    disabled={csvImport.applying || !csvImport.preview}
                                    className="rounded bg-[#6366F1] px-4 py-1.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
                                  >
                                    {t('admin.zentact.apply')}
                                  </button>
                                </div>
                              )}
                              {csvImport.preview && (
                                <div className="mt-3 max-h-80 overflow-y-auto rounded border border-stroke text-xs dark:border-strokedark">
                                  <table className="w-full table-auto">
                                    <thead className="sticky top-0 bg-gray-2 dark:bg-meta-4">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-medium text-black dark:text-white">{t('admin.zentact.merchant')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-black dark:text-white">{t('admin.zentact.zentactRep')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-black dark:text-white">{t('admin.zentact.activated')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-black dark:text-white">{t('admin.zentact.status')}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {csvImport.preview.matched?.map((m: any) => (
                                        <tr key={m.merchant_account_id} className="border-t border-stroke dark:border-strokedark">
                                          <td className="px-3 py-1.5 text-black dark:text-white">{m.merchant}</td>
                                          <td className="px-3 py-1.5 text-body">{m.newSalesRep || '—'}</td>
                                          <td className="px-3 py-1.5 text-body">{m.newActivatedAt || '—'}</td>
                                          <td className="px-3 py-1.5"><span className="rounded-full bg-success bg-opacity-10 px-2 py-0.5 text-xs font-medium text-success">✓ matched</span></td>
                                        </tr>
                                      ))}
                                      {csvImport.preview.unmatched?.map((m: any, i: number) => (
                                        <tr key={`u${i}`} className="border-t border-stroke dark:border-strokedark">
                                          <td className="px-3 py-1.5 text-black dark:text-white">{m.merchant}</td>
                                          <td className="px-3 py-1.5 text-body">{m.salesRep || '—'}</td>
                                          <td className="px-3 py-1.5 text-body">{m.activatedAt || '—'}</td>
                                          <td className="px-3 py-1.5"><span className="rounded-full bg-danger bg-opacity-10 px-2 py-0.5 text-xs font-medium text-danger">✕ {m.reason}</span></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Unassigned merchants manager */}
                        <div className="mt-5 border-t border-stroke pt-4 dark:border-strokedark">
                          <button
                            onClick={() => {
                              const next = !showUnassigned;
                              setShowUnassigned(next);
                              if (next) fetchUnassignedMerchants();
                            }}
                            className="inline-flex items-center gap-2 text-sm font-medium text-[#6366F1] hover:underline"
                          >
                            <svg className={`h-4 w-4 transition-transform ${showUnassigned ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            {t('admin.zentact.manageUnassigned')}
                          </button>

                          {showUnassigned && (
                            <div className="mt-3">
                              {unassignedMerchants.length === 0 ? (
                                <p className="text-sm text-body italic">{t('admin.zentact.noUnassigned')}</p>
                              ) : (
                                <div className="overflow-x-auto rounded-md border border-stroke dark:border-strokedark">
                                  <table className="w-full table-auto">
                                    <thead>
                                      <tr className="bg-gray-2 text-left text-xs dark:bg-meta-4">
                                        <th className="px-3 py-2 font-medium text-black dark:text-white">{t('admin.zentact.merchant')}</th>
                                        <th className="px-3 py-2 font-medium text-black dark:text-white">{t('admin.zentact.zentactRep')}</th>
                                        <th className="px-3 py-2 font-medium text-black dark:text-white">{t('admin.zentact.activated')}</th>
                                        <th className="px-3 py-2 font-medium text-black dark:text-white">{t('admin.zentact.assignTo')}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {unassignedMerchants.map(m => {
                                        const attrs = Array.isArray(m.raw_attributes) ? m.raw_attributes : [];
                                        const zRep = attrs.find((a: any) => a.name === 'sales_rep' || a.name === 'Salesrep_email')?.value || '—';
                                        return (
                                          <tr key={m.merchant_account_id} className="border-t border-stroke text-sm dark:border-strokedark">
                                            <td className="px-3 py-2 text-black dark:text-white">{m.business_name}</td>
                                            <td className="px-3 py-2 text-body">{zRep}</td>
                                            <td className="px-3 py-2 text-body">
                                              {formatDateOnly(m.activated_at)}
                                            </td>
                                            <td className="px-3 py-2">
                                              <select
                                                defaultValue=""
                                                onChange={(e) => assignMerchantRep(m.merchant_account_id, e.target.value)}
                                                className="rounded border border-stroke bg-transparent px-2 py-1 text-xs outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input text-black dark:text-white"
                                              >
                                                <option value="" disabled>{t('admin.zentact.selectRep')}</option>
                                                {salespeople.filter(sp => sp.isActive).map(sp => (
                                                  <option key={sp.name} value={sp.name}>{sp.name}</option>
                                                ))}
                                              </select>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ==================== ENRICH INVOICES ==================== */}
            <div className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.enrich.title')}</h3>
                <p className="text-sm text-body mt-1">{t('admin.enrich.subtitle')}</p>
              </div>
              <div className="p-7">
                <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs font-medium uppercase text-body">{t('admin.zohoSync.status')}</p>
                    <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                      {jobActive(enrichStatus) ? (
                        <span className="inline-flex items-center gap-1.5 text-warning">
                          <span className="h-2 w-2 rounded-full bg-warning animate-pulse"></span>
                          {t('admin.enrich.enriching')}{enrichStatus?.total ? ` (${(enrichStatus.processed || 0).toLocaleString()} / ${enrichStatus.total.toLocaleString()})` : ''}
                        </span>
                      ) : (
                        <span className="text-success">{t('common.idle')}</span>
                      )}
                    </p>
                  </div>
                  <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs font-medium uppercase text-body">{t('admin.recalculate.lastResult')}</p>
                    <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                      {enrichStatus?.message ? <span>{enrichStatus.message}</span> : <span className="text-body">{t('common.neverRun')}</span>}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={triggerEnrich}
                    disabled={enrichPolling}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
                  >
                    <svg className={`h-4 w-4 ${enrichPolling ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {enrichPolling ? `${t('admin.enrich.enriching')}... ${(enrichStatus?.processed || 0).toLocaleString()} / ${(enrichStatus?.total || 0).toLocaleString()}` : t('admin.enrich.enrichAll')}
                  </button>
                  {enrichPolling && (
                    <button
                      onClick={stopEnrich}
                      disabled={enrichStopping}
                      className="inline-flex items-center gap-2 rounded-md bg-danger px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                      {enrichStopping ? t('admin.recalculate.stopping') : t('admin.recalculate.stop')}
                    </button>
                  )}
                </div>

                {jobActive(enrichStatus) && (
                  <div className="mt-4 rounded-md bg-warning bg-opacity-10 p-4">
                    <div className="w-full bg-stroke rounded-full h-2.5 dark:bg-strokedark">
                      <div className="bg-warning h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${enrichStatus?.total > 0 ? Math.round((enrichStatus.processed || 0) / enrichStatus.total * 100) : 0}%` }}></div>
                    </div>
                    <p className="mt-2 text-xs text-body">{t('admin.enrich.note')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* ==================== RECALCULATE COMMISSIONS (v2) ==================== */}
            <div className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.recalculate.title')}</h3>
                <p className="text-sm text-body mt-1">{t('admin.recalculate.subtitle')}</p>
              </div>
              <div className="p-7">
                {/* Status Cards */}
                <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs font-medium uppercase text-body">{t('admin.zohoSync.status')}</p>
                    <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                      {jobActive(recalcStatus) ? (
                        <span className="inline-flex items-center gap-1.5 text-warning">
                          <span className="h-2 w-2 rounded-full bg-warning animate-pulse"></span>
                          {t('admin.recalculate.recalculating')} ({(recalcStatus?.processed || 0).toLocaleString()} / {(recalcStatus?.total || 0).toLocaleString()})
                        </span>
                      ) : (
                        <span className="text-success">{t('common.idle')}</span>
                      )}
                    </p>
                  </div>
                  <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs font-medium uppercase text-body">{t('admin.recalculate.lastResult')}</p>
                    <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                      {recalcStatus?.message ? <span>{recalcStatus.message}</span> : <span className="text-body">{t('common.neverRun')}</span>}
                    </p>
                  </div>
                  <div className="rounded-md border border-stroke p-4 dark:border-strokedark">
                    <p className="text-xs font-medium uppercase text-body">{t('admin.recalculate.totalCommission')}</p>
                    <p className="mt-1 text-sm font-semibold text-black dark:text-white">
                      {recalcStatus?.stats?.total_commission != null ? `$${Number(recalcStatus.stats.total_commission).toLocaleString()}` : '—'}
                    </p>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={triggerRecalculate}
                    disabled={recalcPolling || enrichPolling}
                    className="inline-flex items-center gap-2 rounded-md bg-warning px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
                  >
                    <svg className={`h-4 w-4 ${recalcPolling ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    {recalcPolling ? `${t('admin.recalculate.recalculating')}... ${(recalcStatus?.processed || 0).toLocaleString()} / ${(recalcStatus?.total || 0).toLocaleString()}` : t('admin.recalculate.recalculateAll')}
                  </button>
                  {recalcPolling && (
                    <button
                      onClick={stopRecalculate}
                      disabled={recalcStopping}
                      className="inline-flex items-center gap-2 rounded-md bg-danger px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="1" />
                      </svg>
                      {recalcStopping ? t('admin.recalculate.stopping') : t('admin.recalculate.stop')}
                    </button>
                  )}
                </div>

                {enrichPolling && !recalcPolling && (
                  <p className="mt-2 text-xs text-warning">{t('admin.recalculate.waitForEnrich')}</p>
                )}

                {/* Progress (while running) */}
                {jobActive(recalcStatus) && (
                  <div className="mt-4 rounded-md bg-warning bg-opacity-10 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-4 w-4 animate-spin rounded-full border-2 ${recalcStopping ? 'border-danger border-t-transparent' : 'border-warning border-t-transparent'}`}></div>
                        <span className={`text-sm font-medium ${recalcStopping ? 'text-danger' : 'text-warning'}`}>
                          {recalcStopping ? t('admin.recalculate.stoppingMessage') : t('admin.recalculate.processingPaid')}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-body">
                        {(recalcStatus?.processed || 0).toLocaleString()} / {(recalcStatus?.total || 0).toLocaleString()}
                        {recalcStatus?.total > 0 && ` (${Math.round((recalcStatus.processed || 0) / recalcStatus.total * 100)}%)`}
                      </span>
                    </div>
                    <div className="w-full bg-stroke rounded-full h-2.5 dark:bg-strokedark">
                      <div className="bg-warning h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${recalcStatus?.total > 0 ? Math.round((recalcStatus.processed || 0) / recalcStatus.total * 100) : 0}%` }}></div>
                    </div>
                    <p className="mt-2 text-xs text-body">{t('admin.recalculate.paidOnlyNote')}</p>
                  </div>
                )}
              </div>
            </div>
            </>
          )}

          {/* ==================== SALESPEOPLE ==================== */}
          {activeTab === 'salespeople' && (
            <>
            {/* Confirmation Modal */}
            {confirmModal?.show && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50">
                <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-boxdark">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning bg-opacity-10">
                      <svg className="h-5 w-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.salespeople.confirmChange')}</h3>
                      <p className="text-sm text-body">{confirmModal.name}</p>
                    </div>
                  </div>
                  <div className="mb-5 rounded-md bg-gray-2 p-4 dark:bg-meta-4">
                    <p className="text-sm text-body mb-2">{confirmModal.field}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-danger line-through">
                        {confirmModal.field.includes('%') ? `${confirmModal.oldValue}%` : `$${confirmModal.oldValue.toLocaleString()}`}
                      </span>
                      <svg className="h-4 w-4 text-body" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      <span className="text-lg font-bold text-success">
                        {confirmModal.field.includes('%') ? `${confirmModal.newValue}%` : `$${confirmModal.newValue.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setConfirmModal(null)}
                      className="rounded-md border border-stroke px-5 py-2.5 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={confirmModal.onConfirm}
                      className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90"
                    >
                      {t('admin.salespeople.confirmSave')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Teams management */}
            <div className="mb-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.teams.title')}</h3>
                <p className="text-sm text-body mt-1">{t('admin.teams.subtitle')}</p>
              </div>
              <div className="p-3 sm:p-5">
                {/* Create */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') createTeam(); }}
                    placeholder={t('admin.teams.newPlaceholder') as string}
                    className="flex-1 min-w-[200px] rounded border-[1.5px] border-stroke bg-transparent px-4 py-2.5 font-medium outline-none transition focus:border-primary dark:border-form-strokedark dark:bg-form-input"
                  />
                  <button onClick={createTeam} className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90">
                    {t('admin.teams.create')}
                  </button>
                </div>
                {teams.length === 0 ? (
                  <p className="py-4 text-center text-sm text-body">{t('admin.teams.empty')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] table-auto">
                      <thead>
                        <tr className="bg-gray-2 text-left text-sm dark:bg-meta-4">
                          <th className="px-3 py-3 font-medium text-black dark:text-white">{t('admin.teams.colName')}</th>
                          <th className="px-3 py-3 font-medium text-black dark:text-white">{t('admin.teams.colMembers')}</th>
                          <th className="px-3 py-3 font-medium text-black dark:text-white">{t('admin.teams.colQuota')}</th>
                          <th className="px-3 py-3 font-medium text-black dark:text-white">{t('admin.teams.colSources')}</th>
                          <th className="px-3 py-3 font-medium text-black dark:text-white">{t('admin.teams.colCounts')}</th>
                          <th className="px-3 py-3 font-medium text-black dark:text-white">{t('common.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teams.map((team, idx) => (
                          <tr key={team.id} className="border-b border-stroke text-sm dark:border-strokedark">
                            <td className="px-3 py-3">
                              <input
                                type="text"
                                defaultValue={team.name}
                                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== team.name) updateTeam(team, { name: v }); }}
                                className="w-full max-w-[200px] rounded border border-stroke bg-transparent px-2 py-1 text-black outline-none focus:border-primary dark:border-strokedark dark:text-white"
                              />
                            </td>
                            <td className="px-3 py-3 text-body">{team.memberCount}</td>
                            <td className="px-3 py-3">
                              <input
                                type="number"
                                min="0"
                                defaultValue={team.monthlyQuotaOverride ?? ''}
                                placeholder={t('admin.teams.autoQuota') as string}
                                onBlur={(e) => {
                                  const raw = e.target.value.trim();
                                  const val = raw === '' ? null : parseInt(raw);
                                  if (val !== team.monthlyQuotaOverride) updateTeam(team, { monthlyQuotaOverride: val });
                                }}
                                className="w-28 rounded border border-stroke bg-transparent px-2 py-1 text-black outline-none focus:border-primary dark:border-strokedark dark:text-white"
                                title={t('admin.teams.quotaHint') as string}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col gap-1.5">
                                <label className="flex items-center gap-2 text-xs text-body">
                                  <button
                                    onClick={() => updateTeam(team, { includeDeals: !team.includeDeals })}
                                    title={t('admin.teams.includeDealsHint') as string}
                                    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition ${team.includeDeals ? 'bg-primary' : 'bg-stroke dark:bg-meta-4'}`}
                                  >
                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${team.includeDeals ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                  </button>
                                  {t('admin.teams.includeDeals')}
                                </label>
                                <label className="flex items-center gap-2 text-xs text-body">
                                  <button
                                    onClick={() => updateTeam(team, { includePayments: !team.includePayments })}
                                    title={t('admin.teams.includePaymentsHint') as string}
                                    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition ${team.includePayments ? 'bg-primary' : 'bg-stroke dark:bg-meta-4'}`}
                                  >
                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition ${team.includePayments ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                  </button>
                                  {t('admin.teams.includePayments')}
                                </label>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <button
                                onClick={() => updateTeam(team, { countsTowardQuota: !team.countsTowardQuota })}
                                title={t('admin.teams.countsHint') as string}
                                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${team.countsTowardQuota ? 'bg-primary' : 'bg-stroke dark:bg-meta-4'}`}
                              >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${team.countsTowardQuota ? 'translate-x-4' : 'translate-x-0.5'}`} />
                              </button>
                            </td>
                            <td className="px-3 py-3">
                              <button
                                onClick={() => moveTeam(idx, -1)}
                                disabled={idx === 0}
                                title={t('admin.teams.moveUp') as string}
                                className="mr-1 rounded-md border border-stroke px-2 py-1.5 text-xs text-body transition hover:border-primary hover:text-primary disabled:opacity-30 dark:border-strokedark"
                              >↑</button>
                              <button
                                onClick={() => moveTeam(idx, 1)}
                                disabled={idx === teams.length - 1}
                                title={t('admin.teams.moveDown') as string}
                                className="mr-2 rounded-md border border-stroke px-2 py-1.5 text-xs text-body transition hover:border-primary hover:text-primary disabled:opacity-30 dark:border-strokedark"
                              >↓</button>
                              <button onClick={() => deleteTeam(team)} className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90 whitespace-nowrap">
                                {t('common.delete')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Deal-type point values */}
            <div className="mb-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.dealPoints.title')}</h3>
                <p className="text-sm text-body mt-1">{t('admin.dealPoints.subtitle')}</p>
              </div>
              <div className="p-3 sm:p-5">
                {dealGroups.length === 0 ? (
                  <p className="text-sm text-body">{t('admin.dealPoints.empty')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] table-auto">
                      <thead>
                        <tr className="bg-gray-2 text-left text-sm dark:bg-meta-4">
                          <th className="px-3 py-3 font-medium text-black dark:text-white">{t('admin.dealPoints.type')}</th>
                          <th className="px-3 py-3 font-medium text-black dark:text-white">{t('admin.dealPoints.points')}</th>
                          <th className="px-3 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dealGroups.map(dp => (
                          <tr key={dp.sourceGroup} className="border-b border-stroke text-sm dark:border-strokedark">
                            <td className="px-3 py-3 text-black dark:text-white">{dp.sourceGroup}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  defaultValue={dp.points}
                                  key={`${dp.sourceGroup}-${dp.points}-${dp.isCustom}`}
                                  onBlur={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v !== dp.points) saveDealPoints(dp.sourceGroup, v); }}
                                  className={`w-20 rounded border bg-transparent px-2 py-1 outline-none focus:border-primary dark:bg-form-input ${dp.isCustom ? 'border-primary font-medium text-[#8B5CF6]' : 'border-stroke text-black dark:border-strokedark dark:text-white'}`}
                                />
                                {dp.isCustom
                                  ? <span className="rounded-full bg-[#8B5CF6] bg-opacity-10 px-2 py-0.5 text-xs font-medium text-[#8B5CF6]">{t('admin.dealPoints.custom')}</span>
                                  : <span className="text-xs text-body">{t('admin.dealPoints.default')}</span>}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              {dp.isCustom && (
                                <button onClick={() => deleteDealPoints(dp.sourceGroup)} className="rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body transition hover:border-danger hover:text-danger whitespace-nowrap dark:border-strokedark">
                                  {t('admin.dealPoints.reset')}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.salespeople.title')}</h3>
                <p className="text-sm text-body mt-1">{t('admin.salespeople.subtitle')}</p>
              </div>

              {/* Stats Row */}
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <div className="flex flex-wrap gap-6">
                  <div>
                    <span className="text-2xl font-bold text-black dark:text-white">{salespeople.length}</span>
                    <span className="ml-2 text-sm text-body">{t('admin.salespeople.totalSalespeople')}</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-success">{activePeople.length}</span>
                    <span className="ml-2 text-sm text-body">{t('admin.salespeople.activeSalespeople')}</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-danger">{inactivePeople.length}</span>
                    <span className="ml-2 text-sm text-body">{t('admin.salespeople.inactiveSalespeople')}</span>
                  </div>
                </div>
              </div>

              {/* Active / Inactive Tabs */}
              <div className="flex border-b border-stroke dark:border-strokedark">
                <button
                  onClick={() => setSalespeopleTab('active')}
                  className={`flex-1 py-3.5 text-center text-sm font-medium transition ${
                    salespeopleTab === 'active'
                      ? 'border-b-2 border-success text-success'
                      : 'text-body hover:text-black dark:hover:text-white'
                  }`}
                >
                  {t('common.active')} ({activePeople.length})
                </button>
                <button
                  onClick={() => setSalespeopleTab('inactive')}
                  className={`flex-1 py-3.5 text-center text-sm font-medium transition ${
                    salespeopleTab === 'inactive'
                      ? 'border-b-2 border-danger text-danger'
                      : 'text-body hover:text-black dark:hover:text-white'
                  }`}
                >
                  {t('common.inactive')} ({inactivePeople.length})
                </button>
              </div>

              {/* Search Bar */}
              <div className="px-7 py-4 border-b border-stroke dark:border-strokedark">
                <input
                  type="text"
                  placeholder={t('admin.salespeople.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
                </div>
              ) : (
                <div className="p-3 sm:p-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {(salespeopleTab === 'active' ? activePeople : inactivePeople).map((person) => {
                      const commissionUnlocked = unlockedFields[`${person.name}_commission`] || false;
                      const salaryUnlocked = unlockedFields[`${person.name}_salary`] || false;
                      return (
                        <div key={person.name} className="rounded-lg border border-stroke bg-white p-4 shadow-sm transition hover:shadow-md dark:border-strokedark dark:bg-boxdark">
                          {/* Card header */}
                          <div className="mb-4 flex items-start justify-between gap-3 border-b border-stroke pb-3 dark:border-strokedark">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-black dark:text-white">{person.name}</p>
                              <p className="text-xs text-body">{person.invoiceCount} {t('common.invoices').toLowerCase()}</p>
                            </div>
                            <button
                              onClick={() => toggleSalesperson(person.name, person.isActive)}
                              className={`shrink-0 inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition ${
                                person.isActive ? 'bg-danger text-white hover:bg-opacity-90' : 'bg-success text-white hover:bg-opacity-90'
                              }`}
                            >
                              {person.isActive ? t('admin.salespeople.deactivate') : t('admin.salespeople.activate')}
                            </button>
                          </div>
                          {/* Fields */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="mb-1 block text-xs font-medium text-body">{t('admin.salespeople.commissionPercent')}</span>
                              <div className="flex items-center gap-1.5">
                                {commissionUnlocked ? (
                                  <>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.5"
                                      autoFocus
                                      defaultValue={person.commissionRate}
                                      onBlur={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val) && val !== person.commissionRate) {
                                          confirmCommissionRate(person.name, person.commissionRate, val);
                                        } else {
                                          setUnlockedFields(prev => ({ ...prev, [`${person.name}_commission`]: false }));
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                        if (e.key === 'Escape') setUnlockedFields(prev => ({ ...prev, [`${person.name}_commission`]: false }));
                                      }}
                                      className={`w-16 rounded border border-primary bg-transparent px-2 py-1 text-center text-sm font-medium outline-none dark:bg-form-input ${
                                        person.commissionRate !== 10 ? 'text-[#8B5CF6]' : 'text-black dark:text-white'
                                      }`}
                                    />
                                    <span className="text-xs text-body">%</span>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => setUnlockedFields(prev => ({ ...prev, [`${person.name}_commission`]: true }))}
                                    className="group flex items-center gap-2 rounded-md border border-stroke px-3 py-1.5 text-sm transition hover:border-primary dark:border-strokedark"
                                  >
                                    <span className={`font-medium ${person.commissionRate !== 10 ? 'text-[#8B5CF6]' : 'text-black dark:text-white'}`}>
                                      {person.commissionRate}%
                                    </span>
                                    <svg className="h-3.5 w-3.5 text-body group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    {person.commissionRate !== 10 && (
                                      <span className="text-xs text-[#8B5CF6] font-medium">{t('admin.salespeople.override')}</span>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div>
                              <span className="mb-1 block text-xs font-medium text-body">{t('admin.salespeople.baseSalary')}</span>
                              <div className="flex items-center gap-1.5">
                                {salaryUnlocked ? (
                                  <>
                                    <span className="text-xs text-body">$</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="100"
                                      autoFocus
                                      defaultValue={person.baseSalary || 0}
                                      onBlur={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val) && val !== (person.baseSalary || 0)) {
                                          confirmBaseSalary(person.name, person.baseSalary || 0, val);
                                        } else {
                                          setUnlockedFields(prev => ({ ...prev, [`${person.name}_salary`]: false }));
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                        if (e.key === 'Escape') setUnlockedFields(prev => ({ ...prev, [`${person.name}_salary`]: false }));
                                      }}
                                      className={`w-24 rounded border border-primary bg-transparent px-2 py-1 text-center text-sm font-medium outline-none dark:bg-form-input ${
                                        (person.baseSalary || 0) > 0 ? 'text-primary' : 'text-black dark:text-white'
                                      }`}
                                    />
                                  </>
                                ) : (
                                  <button
                                    onClick={() => setUnlockedFields(prev => ({ ...prev, [`${person.name}_salary`]: true }))}
                                    className="group flex items-center gap-2 rounded-md border border-stroke px-3 py-1.5 text-sm transition hover:border-primary dark:border-strokedark"
                                  >
                                    <span className={`font-medium ${(person.baseSalary || 0) > 0 ? 'text-primary' : 'text-black dark:text-white'}`}>
                                      ${(person.baseSalary || 0).toLocaleString()}
                                    </span>
                                    <svg className="h-3.5 w-3.5 text-body group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                            <div>
                              <span className="mb-1 block text-xs font-medium text-body">{t('admin.salespeople.monthlyQuota')}</span>
                              <input
                                type="number"
                                min="0"
                                defaultValue={person.monthlyQuota ?? ''}
                                placeholder={String(DEFAULT_QUOTA)}
                                title={t('admin.salespeople.quotaHint') as string}
                                onBlur={(e) => {
                                  const raw = e.target.value.trim();
                                  const val = raw === '' ? null : parseInt(raw);
                                  if (val !== person.monthlyQuota) updateQuota(person.name, val);
                                }}
                                className={`w-24 rounded border border-stroke bg-transparent px-2 py-1 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input ${person.monthlyQuota != null ? 'font-medium text-[#8B5CF6]' : 'text-black dark:text-white'}`}
                              />
                            </div>
                            <div>
                              <span className="mb-1 block text-xs font-medium text-body">{t('admin.salespeople.signupBonus')}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => updateSignupBonus(person.name, person.signupBonusAmount ?? 100, !person.signupBonusEnabled)}
                                  title={t('admin.salespeople.signupToggleHint')}
                                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${person.signupBonusEnabled ? 'bg-primary' : 'bg-stroke dark:bg-meta-4'}`}
                                >
                                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${person.signupBonusEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                </button>
                                {person.signupBonusEnabled ? (
                                  unlockedFields[`${person.name}_signup`] ? (
                                    <input
                                      type="number"
                                      min="0"
                                      step="10"
                                      autoFocus
                                      defaultValue={person.signupBonusAmount ?? 100}
                                      onBlur={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val) && val !== (person.signupBonusAmount ?? 100)) {
                                          updateSignupBonus(person.name, val, true);
                                        } else {
                                          setUnlockedFields(prev => ({ ...prev, [`${person.name}_signup`]: false }));
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                        if (e.key === 'Escape') setUnlockedFields(prev => ({ ...prev, [`${person.name}_signup`]: false }));
                                      }}
                                      className="w-20 rounded border border-primary bg-transparent px-2 py-1 text-center text-sm font-medium outline-none dark:bg-form-input text-black dark:text-white"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => setUnlockedFields(prev => ({ ...prev, [`${person.name}_signup`]: true }))}
                                      className="group flex items-center gap-1.5 rounded-md border border-stroke px-2.5 py-1.5 text-sm transition hover:border-primary dark:border-strokedark"
                                    >
                                      <span className={`font-medium ${(person.signupBonusAmount ?? 100) !== 100 ? 'text-[#8B5CF6]' : 'text-black dark:text-white'}`}>
                                        ${(person.signupBonusAmount ?? 100).toLocaleString()}
                                      </span>
                                      <svg className="h-3.5 w-3.5 text-body group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                      </svg>
                                    </button>
                                  )
                                ) : (
                                  <span className="text-xs italic text-body">{t('admin.salespeople.signupOff')}</span>
                                )}
                              </div>
                            </div>
                            <div className="col-span-2">
                              <span className="mb-1 block text-xs font-medium text-body">{t('admin.salespeople.aliases')}</span>
                              {unlockedFields[`${person.name}_aliases`] ? (
                                <input
                                  type="text"
                                  autoFocus
                                  defaultValue={(person.aliases || []).join(', ')}
                                  placeholder="Gaby, Gabi"
                                  onBlur={(e) => {
                                    const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                    updateAliases(person.name, list);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                    if (e.key === 'Escape') setUnlockedFields(prev => ({ ...prev, [`${person.name}_aliases`]: false }));
                                  }}
                                  className="w-44 rounded border border-primary bg-transparent px-2 py-1 text-sm outline-none dark:bg-form-input text-black dark:text-white"
                                />
                              ) : (
                                <button
                                  onClick={() => setUnlockedFields(prev => ({ ...prev, [`${person.name}_aliases`]: true }))}
                                  className="group flex items-center gap-1.5 rounded-md border border-stroke px-2.5 py-1.5 text-sm transition hover:border-primary dark:border-strokedark flex-wrap max-w-[220px]"
                                  title={t('admin.salespeople.aliasesHint')}
                                >
                                  {(person.aliases || []).length === 0 ? (
                                    <span className="text-xs text-body italic">{t('admin.salespeople.addAlias')}</span>
                                  ) : (
                                    (person.aliases || []).map(a => (
                                      <span key={a} className="inline-block rounded-full bg-[#8B5CF6] bg-opacity-10 px-2 py-0.5 text-xs font-medium text-[#8B5CF6]">
                                        {a}
                                      </span>
                                    ))
                                  )}
                                  <svg className="h-3.5 w-3.5 text-body group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <div>
                              <span className="mb-1 block text-xs font-medium text-body">{t('admin.teams.team')}</span>
                              <select
                                value={person.teamId ?? ''}
                                onChange={(e) => assignTeam(person.name, e.target.value === '' ? null : parseInt(e.target.value))}
                                className="w-full rounded border border-stroke bg-transparent px-2 py-1.5 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
                              >
                                <option value="">{t('admin.teams.noTeam')}</option>
                                {teams.map(tm => (
                                  <option key={tm.id} value={tm.id}>{tm.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {(salespeopleTab === 'active' ? activePeople : inactivePeople).length === 0 && (
                    <div className="py-12 text-center">
                      <p className="text-body">{salespeopleTab === 'active' ? t('admin.salespeople.noActive') : t('admin.salespeople.noInactive')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            </>
          )}

          {/* ==================== CUSTOMER EXCLUSIONS ==================== */}
          {activeTab === 'customers' && (
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.customers.title')}</h3>
                <p className="text-sm text-body mt-1">{t('admin.customers.subtitle')}</p>
              </div>
              <div className="p-7">
                {/* Search to add exclusion */}
                <div className="mb-5 relative">
                  <label className="mb-2 block text-sm font-medium text-black dark:text-white">
                    {t('admin.customers.searchPlaceholder')}
                  </label>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder={t('admin.customers.searchPlaceholder')}
                    className="w-full rounded border-[1.5px] border-stroke bg-transparent px-5 py-3 font-medium outline-none transition focus:border-primary active:border-primary dark:border-form-strokedark dark:bg-form-input dark:focus:border-primary"
                  />
                  {searchingCustomers && (
                    <div className="absolute right-4 top-[42px]">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    </div>
                  )}

                  {/* Search Results Dropdown */}
                  {customerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-stroke bg-white shadow-lg dark:border-strokedark dark:bg-boxdark max-h-60 overflow-y-auto">
                      {customerResults.map((customer) => (
                        <div
                          key={customer.name}
                          className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-meta-4 cursor-pointer border-b border-stroke dark:border-strokedark last:border-b-0"
                          onClick={() => excludeCustomer(customer.name)}
                        >
                          <div>
                            <p className="text-sm font-medium text-black dark:text-white">{customer.name}</p>
                            <p className="text-xs text-body">{customer.invoiceCount} {t('common.invoices').toLowerCase()} · ${customer.totalSpent.toLocaleString('en-CA', { minimumFractionDigits: 2 })}</p>
                          </div>
                          <span className="text-xs font-medium text-danger">{t('admin.customers.exclude')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Excluded Customers List */}
                {excludedCustomers.length === 0 ? (
                  <p className="text-sm text-body py-4">{t('admin.customers.noExcluded')}</p>
                ) : (
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-black dark:text-white">
                      {t('admin.customers.excluded')} ({excludedCustomers.length})
                    </h4>
                    <div className="space-y-2">
                      {excludedCustomers.map((customer) => (
                        <div
                          key={customer.id}
                          className="flex items-center justify-between rounded-md border border-stroke px-4 py-3 dark:border-strokedark"
                        >
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-danger bg-opacity-10">
                              <svg className="h-4 w-4 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            </span>
                            <div>
                              <p className="text-sm font-medium text-black dark:text-white">{customer.customer_name}</p>
                              <p className="text-xs text-body">{t('admin.customers.excluded')} {new Date(customer.created_at).toLocaleDateString('en-CA')}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => reincludeCustomer(customer.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-50 hover:text-success dark:border-strokedark dark:hover:bg-meta-4"
                          >
                            {t('admin.customers.reinclude')}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== RELEASE MANAGEMENT ==================== */}
          {activeTab === 'releases' && (
            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="p-7">
                {/* Status Banners */}
                {releaseStatus === 'triggered' && (
                  <div className="mb-4 rounded-md bg-[#8B5CF6] bg-opacity-10 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#8B5CF6] border-t-transparent"></div>
                      <p className="text-sm font-medium text-[#8B5CF6]">
                        {t('admin.releases.workflowTriggered')} v{newVersion}.
                      </p>
                    </div>
                  </div>
                )}
                {releaseStatus === 'success' && (
                  <div className="mb-4 rounded-md bg-success bg-opacity-10 p-4">
                    <p className="text-sm font-medium text-success">✓ Release created and deployed successfully!</p>
                  </div>
                )}
                {releaseStatus === 'failed' && (
                  <div className="mb-4 rounded-md bg-danger bg-opacity-10 p-4">
                    <p className="text-sm font-medium text-danger">{t('admin.releases.releaseFailed')}</p>
                  </div>
                )}

                {/* New Release Form */}
                {showReleaseForm && (
                  <div className="mb-6 rounded-lg border border-[#8B5CF6] border-opacity-30 bg-[#8B5CF6] bg-opacity-5 p-6">
                    <h4 className="mb-4 text-sm font-semibold text-black dark:text-white">{t('admin.releases.newRelease')}</h4>

                    <div className="mb-4">
                      <label className="mb-2 block text-sm font-medium text-black dark:text-white">{t('admin.releases.version')}</label>
                      <input
                        type="text"
                        value={newVersion}
                        onChange={(e) => setNewVersion(e.target.value)}
                        placeholder="e.g. 0.2.6"
                        className="w-full max-w-xs rounded border-[1.5px] border-stroke bg-transparent px-4 py-2.5 text-sm font-medium outline-none transition focus:border-[#8B5CF6] dark:border-form-strokedark dark:bg-form-input"
                      />
                    </div>

                    <div className="mb-4">
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-sm font-medium text-black dark:text-white">
                          {t('admin.releases.releaseNotes')}
                        </label>
                        <div className="flex items-center gap-2">
                          {commitCount > 0 && sinceTag && (
                            <span className="text-xs text-body">{commitCount} commits since {sinceTag}</span>
                          )}
                          <button
                            onClick={generateNotes}
                            disabled={generatingNotes}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#8B5CF6] hover:underline disabled:opacity-50"
                          >
                            <svg className={`h-3 w-3 ${generatingNotes ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            {generatingNotes ? t('admin.releases.generating') : t('admin.releases.autoGenerate')}
                          </button>
                        </div>
                      </div>
                      {generatingNotes ? (
                        <div className="flex items-center justify-center py-8 rounded border-[1.5px] border-stroke dark:border-form-strokedark">
                          <div className="flex items-center gap-3">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#8B5CF6] border-t-transparent"></div>
                            <span className="text-sm text-body">Fetching commits and generating notes...</span>
                          </div>
                        </div>
                      ) : (
                        <textarea
                          value={releaseNotes}
                          onChange={(e) => setReleaseNotes(e.target.value)}
                          rows={12}
                          placeholder={"## ✨ New Features\n- Feature one\n\n## 🎨 UI Improvements\n- Improvement one\n\n## 🔧 Bug Fixes\n- Fix one"}
                          className="w-full rounded border-[1.5px] border-stroke bg-transparent px-4 py-3 text-sm outline-none transition focus:border-[#8B5CF6] dark:border-form-strokedark dark:bg-form-input font-mono"
                        />
                      )}
                    </div>

                    {/* What's New — mark menu items as new for this release */}
                    <div className="mb-4">
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-sm font-medium text-black dark:text-white">{t('admin.releases.newTagsLabel')}</label>
                        <button
                          type="button"
                          onClick={() => setNewFeatureTags([...newFeatureTags, { path: '', title: '', description: '', days: 7 }])}
                          className="text-xs font-medium text-[#8B5CF6] hover:underline"
                        >
                          + {t('admin.releases.addNewTag')}
                        </button>
                      </div>
                      <p className="mb-2 text-xs text-body">{t('admin.releases.newTagsHint')}</p>
                      {newFeatureTags.map((tag, i) => (
                        <div key={i} className="mb-2 grid grid-cols-1 gap-2 rounded border border-stroke p-3 dark:border-strokedark sm:grid-cols-12">
                          <select
                            value={tag.path}
                            onChange={(e) => { const c = [...newFeatureTags]; c[i] = { ...c[i], path: e.target.value }; setNewFeatureTags(c); }}
                            className="rounded border-[1.5px] border-stroke bg-transparent px-2 py-1.5 text-sm dark:border-form-strokedark dark:bg-form-input sm:col-span-3"
                          >
                            <option value="">{t('admin.releases.selectItem')}</option>
                            {RESELLER_MENU_ITEMS.map((m) => <option key={m.path} value={m.path}>{m.label}</option>)}
                          </select>
                          <input
                            value={tag.title}
                            onChange={(e) => { const c = [...newFeatureTags]; c[i] = { ...c[i], title: e.target.value }; setNewFeatureTags(c); }}
                            placeholder={t('admin.releases.tagTitle') as string}
                            className="rounded border-[1.5px] border-stroke bg-transparent px-2 py-1.5 text-sm dark:border-form-strokedark dark:bg-form-input sm:col-span-3"
                          />
                          <input
                            value={tag.description}
                            onChange={(e) => { const c = [...newFeatureTags]; c[i] = { ...c[i], description: e.target.value }; setNewFeatureTags(c); }}
                            placeholder={t('admin.releases.tagDesc') as string}
                            className="rounded border-[1.5px] border-stroke bg-transparent px-2 py-1.5 text-sm dark:border-form-strokedark dark:bg-form-input sm:col-span-4"
                          />
                          <input
                            type="number"
                            min={1}
                            value={tag.days}
                            onChange={(e) => { const c = [...newFeatureTags]; c[i] = { ...c[i], days: parseInt(e.target.value) || 7 }; setNewFeatureTags(c); }}
                            title={t('admin.releases.tagDays') as string}
                            className="rounded border-[1.5px] border-stroke bg-transparent px-2 py-1.5 text-sm dark:border-form-strokedark dark:bg-form-input sm:col-span-1"
                          />
                          <button
                            type="button"
                            onClick={() => setNewFeatureTags(newFeatureTags.filter((_, j) => j !== i))}
                            className="text-sm font-bold text-danger sm:col-span-1"
                            aria-label="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={pushRelease}
                        disabled={releaseStatus === 'pushing' || !newVersion.trim() || !releaseNotes.trim()}
                        className="inline-flex items-center gap-2 rounded-md bg-[#8B5CF6] px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-opacity-90 disabled:opacity-50"
                      >
                        {releaseStatus === 'pushing' ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            {t('admin.releases.pushing')}
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {t('admin.releases.pushRelease')} v{newVersion}
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setShowReleaseForm(false)}
                        className="rounded-md border border-stroke px-5 py-2.5 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Release History */}
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-black dark:text-white">{t('admin.releases.previousReleases')}</h4>
                  {releases.length === 0 ? (
                    <p className="text-sm text-body py-4">{t('admin.releases.noReleases')}</p>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {releases.map((release) => (
                        <div
                          key={release.id}
                          className="flex items-start justify-between rounded-md border border-stroke p-4 dark:border-strokedark"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex rounded-full bg-[#8B5CF6] bg-opacity-10 px-3 py-0.5 text-xs font-bold text-[#8B5CF6]">
                                {release.version}
                              </span>
                              <span className="text-xs text-body">
                                {new Date(release.date).toLocaleDateString('en-CA', {
                                  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                })}
                              </span>
                            </div>
                            {release.notes && (
                              <p className="mt-1.5 text-xs text-body line-clamp-2 whitespace-pre-line">
                                {release.notes.replace(/^#+\s/gm, '').replace(/\*\*/g, '').substring(0, 150)}
                                {release.notes.length > 150 ? '...' : ''}
                              </p>
                            )}
                          </div>
                          <a
                            href={release.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-3 flex-shrink-0 text-xs font-medium text-primary hover:underline"
                          >
                            {t('admin.releases.view')}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== ADMIN USERS ==================== */}
          {activeTab === 'admins' && (
            <>
            {/* ==================== IMPERSONATION ==================== */}
            <div className="mb-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-black dark:text-white">
                    🎭 {t('admin.impersonate.title')}
                  </h3>
                  <p className="text-sm text-body mt-1">{t('admin.impersonate.subtitle')}</p>
                </div>
                {localStorage.getItem('impersonateAs') && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F59E0B] bg-opacity-10 px-3 py-1 text-xs font-semibold text-[#F59E0B]">
                    {t('admin.impersonate.active', { name: localStorage.getItem('impersonateAs') })}
                  </span>
                )}
              </div>
              <div className="p-7">
                <label className="mb-2 block text-sm font-medium text-black dark:text-white">
                  {t('admin.impersonate.selectLabel')}
                </label>
                <div className="flex flex-wrap gap-3 items-center">
                  <select
                    defaultValue={localStorage.getItem('impersonateAs') || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        localStorage.setItem('impersonateAs', val);
                      } else {
                        localStorage.removeItem('impersonateAs');
                      }
                      window.location.reload();
                    }}
                    className="rounded border border-stroke bg-transparent px-4 py-2 text-sm font-medium outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input"
                  >
                    <option value="">{t('admin.impersonate.noImpersonation')}</option>
                    {salespeople.filter(sp => sp.isActive).map(sp => (
                      <option key={sp.name} value={sp.name}>{sp.name}</option>
                    ))}
                  </select>
                  {localStorage.getItem('impersonateAs') && (
                    <button
                      onClick={() => {
                        localStorage.removeItem('impersonateAs');
                        window.location.reload();
                      }}
                      className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4"
                    >
                      {t('admin.impersonate.stop')}
                    </button>
                  )}
                </div>
                <p className="mt-3 text-xs text-body">{t('admin.impersonate.hint')}</p>
              </div>
            </div>

            <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.admins.title')}</h3>
                <p className="text-sm text-body mt-1">{t('admin.admins.subtitle')}</p>
              </div>

              {/* Stats */}
              <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
                <div className="flex flex-wrap gap-6">
                  <div>
                    <span className="text-2xl font-bold text-black dark:text-white">{adminUsers.length}</span>
                    <span className="ml-2 text-sm text-body">{t('admin.admins.totalUsers')}</span>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-success">{adminUsers.filter(u => u.isAdmin).length}</span>
                    <span className="ml-2 text-sm text-body">{t('admin.admins.adminCount')}</span>
                  </div>
                </div>
              </div>

              {adminLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
                </div>
              ) : (
                <div className="p-7">
                  <p className="mb-4 text-sm text-body">{t('admin.admins.description')}</p>
                  {/* Pre-assign roles to an email that hasn't logged in yet (rep's first Zoho
                      login will pick the roles up by email match). */}
                  <form
                    className="mb-4 flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const email = preassignEmail.trim().toLowerCase();
                      if (!email || !email.includes('@')) return;
                      setEditingUserRoles(email);
                      setEditingUserRoleIds(
                        (adminUsers.find(u => u.email.toLowerCase() === email)?.roles || []).map(r => r.id)
                      );
                      setPreassignEmail('');
                    }}
                  >
                    <input
                      type="email"
                      value={preassignEmail}
                      onChange={(e) => setPreassignEmail(e.target.value)}
                      placeholder={t('admin.admins.preassignPlaceholder')}
                      className="w-72 rounded-md border border-stroke bg-transparent py-2 px-3 text-sm text-black outline-none transition focus:border-primary dark:border-strokedark dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={!preassignEmail.trim().includes('@')}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
                    >
                      {t('admin.admins.preassignButton')}
                    </button>
                    <span className="text-xs text-body">{t('admin.admins.preassignHint')}</span>
                  </form>
                  <div className="max-h-[600px] overflow-y-auto">
                    <table className="w-full table-auto">
                      <thead>
                        <tr className="bg-gray-2 text-left dark:bg-meta-4">
                          <th className="px-4 py-4 font-medium text-black dark:text-white">{t('admin.admins.email')}</th>
                          <th className="px-4 py-4 font-medium text-black dark:text-white">{t('admin.admins.lastLogin')}</th>
                          <th className="px-4 py-4 font-medium text-black dark:text-white">{t('admin.admins.role')}</th>
                          <th className="px-4 py-4 font-medium text-black dark:text-white">{t('admin.admins.rolesColumn')}</th>
                          <th className="px-4 py-4 font-medium text-black dark:text-white">{t('common.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((user) => (
                          <tr key={user.email} className="border-b border-stroke dark:border-strokedark">
                            <td className="px-4 py-5">
                              <p className="text-black dark:text-white font-medium">{user.email}</p>
                              {user.userType && user.userType !== 'zoho' && (
                                <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  user.userType === 'external'
                                    ? 'bg-primary bg-opacity-10 text-primary'
                                    : 'bg-warning bg-opacity-10 text-warning'
                                }`}>
                                  {t(`admin.admins.type_${user.userType}`)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-5">
                              <p className="text-sm text-body">
                                {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('en-CA', {
                                  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                }) : t('common.never')}
                              </p>
                            </td>
                            <td className="px-4 py-5">
                              {user.isAdmin ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-success bg-opacity-10 px-3 py-1 text-sm font-medium text-success">
                                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
                                  {t('admin.admins.admin')}
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-gray-2 px-3 py-1 text-sm font-medium text-body dark:bg-meta-4">
                                  {t('admin.admins.user')}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-5">
                              <div className="flex flex-wrap gap-1">
                                {(user.roles || []).map(r => (
                                  <span key={r.id} className="inline-flex rounded-full bg-[#8B5CF6] bg-opacity-10 px-2 py-0.5 text-xs font-medium text-[#8B5CF6]">
                                    {r.name}
                                  </span>
                                ))}
                                {(!user.roles || user.roles.length === 0) && (
                                  <span className="text-xs text-body italic">{t('admin.admins.noRoles')}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-5">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => {
                                    setEditingUserRoles(user.email);
                                    setEditingUserRoleIds((user.roles || []).map(r => r.id));
                                  }}
                                  className="inline-flex items-center justify-center rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4"
                                >
                                  {t('admin.admins.editRoles')}
                                </button>
                              {(!user.userType || user.userType === 'zoho') && (
                              <button
                                onClick={() => toggleAdminStatus(user.email, user.isAdmin)}
                                className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition ${
                                  user.isAdmin
                                    ? 'bg-danger text-white hover:bg-opacity-90'
                                    : 'bg-success text-white hover:bg-opacity-90'
                                }`}
                              >
                                {user.isAdmin ? t('admin.admins.revokeAdmin') : t('admin.admins.grantAdmin')}
                              </button>
                              )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {adminUsers.length === 0 && (
                      <div className="py-12 text-center">
                        <p className="text-body">{t('admin.admins.noUsers')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            </>
          )}

          {/* ==================== COMMISSION IMPORT TAB ==================== */}
          {activeTab === 'admins' && <ExternalUsers />}
          {activeTab === 'import-payments' && <CommissionImport />}
          {activeTab === 'resellers' && <ResellerAdmin />}

          {/* ==================== ROLES TAB ==================== */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                <div className="border-b border-stroke px-7 py-4 dark:border-strokedark flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.roles.title')}</h3>
                    <p className="text-sm text-body mt-1">{t('admin.roles.subtitle')}</p>
                  </div>
                  <button
                    onClick={() => { setShowNewRole(true); setEditingRole({ id: 0, name: '', description: '', permissions: [], isSystem: false, userCount: 0 }); }}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-opacity-90"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    {t('admin.roles.newRole')}
                  </button>
                </div>
                <div className="p-7">
                  {roles.length === 0 ? (
                    <p className="text-center text-body py-8">{t('admin.roles.noRoles')}</p>
                  ) : (
                    <div className="space-y-3">
                      {roles.map(role => (
                        <div key={role.id} className="rounded-md border border-stroke p-4 dark:border-strokedark">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-black dark:text-white">{role.name}</h4>
                                {role.isSystem && (
                                  <span className="inline-flex rounded-full bg-gray-2 px-2 py-0.5 text-xs font-medium text-body dark:bg-meta-4">
                                    {t('admin.roles.systemRole')}
                                  </span>
                                )}
                                <span className="inline-flex rounded-full bg-primary bg-opacity-10 px-2 py-0.5 text-xs font-medium text-primary">
                                  {role.userCount} {role.userCount === 1 ? t('admin.roles.user') : t('admin.roles.users')}
                                </span>
                              </div>
                              {(() => {
                                // System roles get translated descriptions by name; custom roles use the DB value.
                                const sysKey = ({
                                  'Administrator': 'admin.roles.descAdmin',
                                  'Manager':       'admin.roles.descManager',
                                  'Sales Rep':     'admin.roles.descSalesRep',
                                } as Record<string, string>)[role.name];
                                const desc = sysKey ? t(sysKey) : role.description;
                                return desc ? <p className="text-sm text-body mb-2">{desc}</p> : null;
                              })()}
                              <div className="flex flex-wrap gap-1">
                                {role.permissions.includes('*') ? (
                                  <span className="inline-flex rounded-full bg-success bg-opacity-10 px-2 py-0.5 text-xs font-medium text-success">
                                    {t('admin.roles.allPermissions')}
                                  </span>
                                ) : (
                                  <>
                                    {role.permissions.slice(0, 5).map(p => (
                                      <span key={p} className="inline-flex rounded-full bg-gray-100 dark:bg-meta-4 px-2 py-0.5 text-xs font-mono text-body">
                                        {p}
                                      </span>
                                    ))}
                                    {role.permissions.length > 5 && (
                                      <span className="text-xs text-body italic">{t('admin.roles.moreCount', { count: role.permissions.length - 5 })}</span>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingRole(role)}
                                className="rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4"
                              >
                                {t('common.edit')}
                              </button>
                              {!role.isSystem && (
                                <button
                                  onClick={() => deleteRole(role)}
                                  className="rounded-md border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger hover:bg-opacity-10"
                                >
                                  {t('common.delete')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== ROLE EDIT MODAL ==================== */}
          {editingRole && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[99999] p-4" onClick={() => { setEditingRole(null); setShowNewRole(false); }}>
              <div className="bg-white dark:bg-boxdark rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
                  <h3 className="text-lg font-semibold text-black dark:text-white">
                    {showNewRole ? t('admin.roles.newRole') : t('admin.roles.editRole')}: {editingRole.name || '(new)'}
                  </h3>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                  <label className="block text-sm font-medium text-black dark:text-white mb-1">{t('admin.roles.nameField')}</label>
                  <input
                    type="text"
                    value={editingRole.name}
                    onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                    placeholder="e.g. Team Lead"
                    className="w-full mb-4 rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input text-black dark:text-white"
                  />
                  <label className="block text-sm font-medium text-black dark:text-white mb-1">{t('admin.roles.descField')}</label>
                  <input
                    type="text"
                    value={editingRole.description}
                    onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                    placeholder="What is this role for?"
                    className="w-full mb-4 rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input text-black dark:text-white"
                  />

                  <label className="block text-sm font-medium text-black dark:text-white mb-2">{t('admin.roles.permissionsField')}</label>
                  {/* Wildcard toggle for super admin */}
                  <label className="flex items-center gap-2 mb-3 p-2 rounded border border-success bg-success bg-opacity-5">
                    <input
                      type="checkbox"
                      checked={editingRole.permissions.includes('*')}
                      onChange={(e) => {
                        setEditingRole({
                          ...editingRole,
                          permissions: e.target.checked ? ['*'] : [],
                        });
                      }}
                    />
                    <span className="text-sm font-semibold text-success">{t('admin.roles.allPermissions')} (*)</span>
                  </label>

                  {!editingRole.permissions.includes('*') && (() => {
                    const byCategory: Record<string, PermDef[]> = {};
                    permCatalog.forEach(p => {
                      if (!byCategory[p.category]) byCategory[p.category] = [];
                      byCategory[p.category].push(p);
                    });
                    return Object.entries(byCategory).map(([category, perms]) => (
                      <div key={category} className="mb-4">
                        <p className="text-xs font-bold uppercase text-body mb-2">{category}</p>
                        <div className="space-y-1">
                          {perms.map(p => (
                            <label key={p.key} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-meta-4 px-2 py-1 rounded">
                              <input
                                type="checkbox"
                                checked={editingRole.permissions.includes(p.key)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditingRole({ ...editingRole, permissions: [...editingRole.permissions, p.key] });
                                  } else {
                                    setEditingRole({ ...editingRole, permissions: editingRole.permissions.filter(x => x !== p.key) });
                                  }
                                }}
                              />
                              <span className="text-sm text-black dark:text-white">{p.label}</span>
                              <span className="text-xs text-body font-mono ml-auto">{p.key}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
                <div className="border-t border-stroke px-6 py-3 dark:border-strokedark flex justify-end gap-3">
                  <button
                    onClick={() => { setEditingRole(null); setShowNewRole(false); }}
                    className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => saveRole(editingRole, showNewRole)}
                    disabled={savingRole || !editingRole.name.trim()}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
                  >
                    {savingRole ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== USER ROLES EDIT MODAL ==================== */}
          {editingUserRoles && (
            <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[99999] p-4" onClick={() => setEditingUserRoles(null)}>
              <div className="bg-white dark:bg-boxdark rounded-lg shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
                  <h3 className="text-lg font-semibold text-black dark:text-white">
                    {t('admin.admins.assignRoles')}
                  </h3>
                  <p className="text-sm text-body mt-1">{editingUserRoles}</p>
                </div>
                <div className="p-6">
                  <div className="space-y-2">
                    {roles.map(role => (
                      <label key={role.id} className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-meta-4 px-3 py-2 rounded">
                        <input
                          type="checkbox"
                          checked={editingUserRoleIds.includes(role.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditingUserRoleIds([...editingUserRoleIds, role.id]);
                            } else {
                              setEditingUserRoleIds(editingUserRoleIds.filter(id => id !== role.id));
                            }
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-black dark:text-white">{role.name}</p>
                          {role.description && <p className="text-xs text-body">{role.description}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="border-t border-stroke px-6 py-3 dark:border-strokedark flex justify-end gap-3">
                  <button
                    onClick={() => setEditingUserRoles(null)}
                    className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-body hover:bg-gray-50 dark:border-strokedark dark:hover:bg-meta-4"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={() => saveUserRoles(editingUserRoles, editingUserRoleIds)}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </div>
            </div>
          )}
    </div>
  );
};

export default AdminPanel;
