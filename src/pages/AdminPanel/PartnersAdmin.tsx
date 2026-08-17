import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Select from '../../components/Select';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { dialog } from '../../lib/dialog';
import PartnerStats from './PartnerStats';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface Partner {
  id: number; name: string; active: boolean; createdAt: string; hasLogo: boolean; userCount: number;
  invitedCount: number; openedCount: number; activatedCount: number; lastInvitedAt: string | null;
  leadSource: string | null;
  billingContactName: string | null; billingContactEmail: string | null; billingContactPhone: string | null;
  businessContactName: string | null; businessContactEmail: string | null; businessContactPhone: string | null;
  payoutRate: number | null;
  initialPayoutRate: number | null;
  joinCode: string | null; joinEmailDomains: string | null; joinEnabled: boolean;
}
interface CrmMatch {
  module: 'Leads' | 'Contacts' | 'Accounts'; id: string; name: string; company: string | null;
  // Sur QUOI la fiche a matche (nom / courriel / telephone), fusionne quand plusieurs criteres
  // trouvent la meme fiche. Absent des verifications faites avant le 2026-08-05.
  matchedOn?: ('name' | 'email' | 'phone')[];
  phone: string | null; email: string | null; city: string | null; crmUrl: string | null;
}
interface Opportunity {
  id: number; businessName: string;
  contactFirstName: string | null; contactLastName: string | null;
  contactPhone: string | null; contactEmail: string | null;
  repFirstName: string | null; repLastName: string | null;
  repPhone: string | null; repEmail: string | null;
  notes: string | null; status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null; reviewedAt: string | null; rejectionReason: string | null; createdAt: string;
  partnerName: string; submittedByEmail: string | null;
  // SH-28/SH-30 — set by the backend, never sent to partners (see mapOpportunityRow's comment).
  crmMatchStatus: 'no_match' | 'match_found' | 'check_failed' | null;
  crmMatchSummary: string | null;
  crmMatchRecords: CrmMatch[];
  crmLeadId: string | null;
  crmLeadError: string | null;
  // SH-40/41 — tenue de compte de l'admin. ⚠️ Ne commande PLUS l'éligibilité au versement depuis
  // le 2026-08-05 : c'est la date de dépôt du Deal Zoho qui décide (voir crmDepositDate).
  linkedCustomerName: string | null;
  payoutStatus: 'not_eligible' | 'eligible' | 'in_run' | 'paid';
  // Ce qui commande réellement le versement, et pourquoi il peut rester bloqué.
  // `crmDealLookup` = les deux SEULS cas où une vente réelle n'aboutit pas : plusieurs deals
  // homonymes (aucun n'est retenu, verser sur le mauvais serait pire) ou aucun deal à ce nom.
  crmOwnerName: string | null;
  crmDepositDate: string | null;
  crmDealStage: string | null;
  crmDealLookup: 'ambiguous' | 'not_found' | null;
}
interface PendingPartnerPayout {
  partnerId: number; partnerName: string; payoutRate: number | null; suggestedAmount: number | null;
  // Un partenaire peut avoir DEUX groupes en attente : l'initial (dû pour le lead) et la
  // conversion. Ils ne se payent pas ensemble, donc un run porte un seul type.
  kind: 'initial' | 'conversion';
  opportunities: {
    id: number; businessName: string; linkedCustomerName: string | null; createdAt: string;
    // Ce qui rend la ligne due : la premiere facture payee de ce client.
    invoiceNumber?: string | null; invoicePaidDate?: string | null; externalRef?: string | null;
  }[];
}
interface PayoutRun {
  id: number; partnerName: string; periodLabel: string; status: 'draft' | 'finalized';
  totalAmount: number; opportunityCount: number; kind: 'initial' | 'conversion';
  createdBy: string | null; createdAt: string; finalizedBy: string | null; finalizedAt: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning/15 text-warning',
  approved: 'bg-success/15 text-green-700 dark:text-success',
  rejected: 'bg-danger/15 text-danger',
};
const PAYOUT_BADGE: Record<string, string> = {
  not_eligible: 'bg-gray-2 text-gray-500 dark:bg-meta-4',
  eligible: 'bg-success/15 text-green-700 dark:text-success',
  in_run: 'bg-primary/15 text-primary',
  paid: 'bg-primary text-white',
};

const PartnersAdmin: React.FC<{ canDelete?: boolean; canMigrate?: boolean; canStats?: boolean }> = ({ canDelete, canMigrate, canStats }) => {
  const { t, i18n } = useTranslation();
  // Landing on this page is the Opportunity Queue "dashboard" (user request 2026-07-2x) — Manage
  // Partners is reached either via the in-page tab or the Sidebar's "Manage Partners" submenu
  // item, which links here with ?view=manage.
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subFromParams = (): 'partners' | 'payouts' | 'queue' | 'users' | 'imports' | 'stats' => {
    const v = searchParams.get('view');
    if (v === 'manage') return 'partners';
    if (v === 'payouts') return 'payouts';
    if (v === 'users') return 'users';
    if (v === 'imports') return 'imports';
    if (v === 'stats') return 'stats';
    return 'queue';
  };
  const [sub, setSub] = useState<'partners' | 'payouts' | 'queue' | 'users' | 'imports' | 'stats'>(subFromParams());
  // The route stays /admin/partners for every sub-view (only ?view= changes), so AdminPanel never
  // remounts this component — the useState initializer above only runs once. Re-sync on every
  // search-param change so the Sidebar's submenu links work from an already-open page.
  useEffect(() => {
    setSub(subFromParams());
  }, [searchParams]);

  // Manage Partners
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [inviteFor, setInviteFor] = useState<Partner | null>(null);
  const [deletingPartnerId, setDeletingPartnerId] = useState<number | null>(null);

  // Logo d'un partenaire. UN seul champ de fichier cache, reutilise pour toutes les
  // lignes — en poser un par ligne multiplierait les elements sans rien apporter.
  const logoInput = useRef<HTMLInputElement | null>(null);
  const [logoFor, setLogoFor] = useState<Partner | null>(null);
  const [logoBusy, setLogoBusy] = useState<number | null>(null);
  // Change a chaque televersement pour casser le cache du navigateur : l'URL du logo ne
  // change pas, donc sans ce parametre l'ancienne image resterait affichee.
  const [logoV, setLogoV] = useState(0);

  const pickLogo = (p: Partner) => { setLogoFor(p); logoInput.current?.click(); };

  const uploadLogo = async (file: File) => {
    if (!logoFor) return;
    setLogoBusy(logoFor.id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await axios.post(`${API_URL}/api/admin/partners/${logoFor.id}/logo`, fd, { headers: authHeaders() });
      setLogoV((v) => v + 1);
      // La fiche ouverte porte sa propre copie du partenaire : sans cette ligne, elle
      // continuerait d'afficher « Ajouter un logo » alors que le logo est en place.
      setEditingPartner((prev) => (prev && prev.id === logoFor.id ? { ...prev, hasLogo: true } : prev));
      await fetchPartners();
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || t('admin.partners.logoFailed') as string);
    } finally { setLogoBusy(null); setLogoFor(null); }
  };

  const removeLogo = async (p: Partner) => {
    if (!(await dialog.confirm(t('admin.partners.logoRemoveConfirm', { name: p.name }) as string))) return;
    setLogoBusy(p.id);
    try {
      await axios.delete(`${API_URL}/api/admin/partners/${p.id}/logo`, { headers: authHeaders() });
      setLogoV((v) => v + 1);
      setEditingPartner((prev) => (prev && prev.id === p.id ? { ...prev, hasLogo: false } : prev));
      await fetchPartners();
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || t('admin.partners.logoFailed') as string);
    } finally { setLogoBusy(null); }
  };

  type Invite = {
    id: number; email: string; name: string | null; role: string; status: string;
    partnerName: string; invitedBy: string | null;
    invitedAt: string | null; openedAt: string | null; activatedAt: string | null;
    expiresAt: string | null;
  };
  const [invites, setInvites] = useState<Invite[]>([]);
  // Filtre par partenaire de la carte des usagers. Le compte de la colonne « Usagers » le pose,
  // ce qui evite un ecran de plus : la carte existante DEVIENT l'annuaire par partenaire.
  // Indispensable des la migration Moneris — 177 lignes dans une liste a plat sont illisibles.
  const [userDirFilter, setUserDirFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const userDirRef = useRef<HTMLDivElement>(null);
  const showPartnerUsers = (name: string) => {
    setUserDirFilter(name);
    // La liste vit maintenant dans sa PROPRE vue : le clic doit y naviguer, plus seulement faire
    // defiler. Le filtre est pose avant la navigation, il survit au changement de vue.
    navigate('/admin/partners?view=users');
  };
  useEffect(() => {
    axios.get(`${API_URL}/api/admin/partner-invites`, { headers: authHeaders() })
      .then((r) => setInvites(r.data.invites || []))
      .catch(() => {});
  }, []);
  // Gestion d'un usager partenaire depuis l'admin interne. Les regles vivent cote serveur
  // (dernier administrateur, historique rattache) ; ici on TRADUIT ses refus et on propose la
  // desactivation quand la suppression est impossible.
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const explainUserRefusal = async (e: any, onDisableInstead?: () => Promise<void>) => {
    const d = e?.response?.data;
    if (d?.error === 'last_admin') { dialog.alert(t('partnerPortal.userMgmt.errLastAdmin', { name: d.partnerName }) as string); return; }
    if (d?.error === 'user_has_history') {
      const ok = await dialog.confirm(t('partnerPortal.userMgmt.errHistoryAskDisable', {
        email: d.email, opportunities: d.counts?.opportunities ?? 0, invoices: d.counts?.invoices ?? 0,
      }) as string);
      if (ok && onDisableInstead) await onDisableInstead();
      return;
    }
    dialog.alert(d?.error || e?.message || 'Action failed');
  };
  const refreshUsers = async () => {
    const r = await axios.get(`${API_URL}/api/admin/partner-invites`, { headers: authHeaders() });
    setInvites(r.data.invites || []);
    await fetchPartners();   // le compte par partenaire change aussi
  };
  const setUserStatus = async (iv: Invite, status: 'active' | 'disabled') => {
    if (!(await dialog.confirm(t(status === 'disabled' ? 'partnerPortal.userMgmt.confirmDisable' : 'partnerPortal.userMgmt.confirmEnable',
      { email: iv.email }) as string))) return;
    setBusyUserId(iv.id);
    try {
      await axios.put(`${API_URL}/api/admin/partner-users/${iv.id}`, { status }, { headers: authHeaders() });
      await refreshUsers();
    } catch (e) { await explainUserRefusal(e); } finally { setBusyUserId(null); }
  };
  const deletePartnerUser = async (iv: Invite) => {
    if (!(await dialog.confirm(t('partnerPortal.userMgmt.confirmDelete', { email: iv.email }) as string))) return;
    setBusyUserId(iv.id);
    try {
      await axios.delete(`${API_URL}/api/admin/partner-users/${iv.id}`, { headers: authHeaders() });
      await refreshUsers();
    } catch (e) {
      await explainUserRefusal(e, async () => {
        await axios.put(`${API_URL}/api/admin/partner-users/${iv.id}`, { status: 'disabled' }, { headers: authHeaders() });
        await refreshUsers();
      });
    } finally { setBusyUserId(null); }
  };

  // Invitation en LOT. Un compte actif n'est jamais invitable : lui renvoyer une invitation
  // reinitialiserait son mot de passe et sa 2FA. Un compte desactive non plus — il faut d'abord le
  // reactiver, sinon on enverrait un courriel a quelqu'un qu'on vient de couper.
  const canInvite = (iv: Invite) => iv.status === 'imported' || iv.status === 'invited';
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [inviteProgress, setInviteProgress] = useState<{ done: number; total: number } | null>(null);
  const toggleUserSelected = (id: number) =>
    setSelectedUsers((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAllShown = () => setSelectedUsers((prev) => {
    const n = new Set(prev);
    if (allShownSelected) invitableShown.forEach((iv) => n.delete(iv.id));
    else invitableShown.forEach((iv) => n.add(iv.id));
    return n;
  });

  const CHUNK = 25;   // le serveur plafonne a 50 ; on reste en dessous pour des requetes courtes
  // Un seul chemin pour les deux gestes : la mecanique (tranches, cumul du rapport, rafraichissement)
  // est identique, seul le gabarit change. Deux fonctions auraient fini par diverger.
  const inviteSelected = async (rappel = false) => {
    const ids = invitableShown.filter((iv) => selectedUsers.has(iv.id)).map((iv) => iv.id);
    if (!ids.length) return;
    if (!(await dialog.confirm(t(rappel ? 'admin.partners.remindBulkConfirm' : 'admin.partners.inviteBulkConfirm',
      { count: ids.length }) as string))) return;
    const total = { sent: 0, skipped: 0, failed: [] as any[] };
    setInviteProgress({ done: 0, total: ids.length });
    try {
      // Par tranches : un seul appel de 177 ferait expirer la requete, et un echec partiel doit
      // rester lisible. Le rapport se cumule, donc on sait toujours ou on s'est arrete.
      for (let i = 0; i < ids.length; i += CHUNK) {
        const r = await axios.post(`${API_URL}/api/admin/partner-users/invite`,
          { ids: ids.slice(i, i + CHUNK), reminder: rappel }, { headers: authHeaders() });
        total.sent += r.data.sent?.length || 0;
        total.skipped += r.data.skipped?.length || 0;
        total.failed.push(...(r.data.failed || []));
        setInviteProgress({ done: Math.min(i + CHUNK, ids.length), total: ids.length });
      }
      setSelectedUsers(new Set());
      await refreshUsers();
      dialog.alert(t('admin.partners.inviteBulkDone', {
        sent: total.sent, skipped: total.skipped, failed: total.failed.length,
      }) as string + (total.failed.length
        ? '\n\n' + total.failed.slice(0, 10).map((f) => `· ${f.email} — ${f.why}`).join('\n')
        : ''));
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || e?.message || 'Invite failed');
    } finally { setInviteProgress(null); }
  };

  // Reprise de l'historique des versements Moneris (permission `partners:migrate`). Meme forme que
  // la migration du portail : simuler, lire, appliquer. Le fichier de David fait foi pour le passe.
  const [payFile, setPayFile] = useState<File | null>(null);
  const [payReport, setPayReport] = useState<any>(null);
  const [payBusy, setPayBusy] = useState<'' | 'dry' | 'apply'>('');
  const [paySimulatedFor, setPaySimulatedFor] = useState('');
  const payInput = useRef<HTMLInputElement>(null);
  const runPayoutImport = async (dryRun: boolean) => {
    if (!payFile) return;
    setPayBusy(dryRun ? 'dry' : 'apply');
    setPayReport(null);
    try {
      const payload = JSON.parse(await payFile.text());
      const r = await axios.post(`${API_URL}/api/admin/partner-payouts/import-history`,
        { ...payload, dryRun, fileName: payFile.name }, { headers: authHeaders() });
      setPayReport(r.data);
      if (dryRun) setPaySimulatedFor(payFile.name + ':' + payFile.size);
      else { setPaySimulatedFor(''); await fetchPayouts(); await fetchQueue(); await fetchDataImports(); }
    } catch (e: any) {
      const d = e?.response?.data;
      dialog.alert(d?.error || e?.message || 'Import failed');
      if (d?.report) setPayReport(d.report);
    } finally { setPayBusy(''); }
  };

  // Historique des reprises APPLIQUEES. Se recharge apres chaque application, pour que la nouvelle
  // ligne apparaisse sans que David ait a se demander si elle a bien ete enregistree.
  type DataImport = { id: number; kind: string; partnerName: string | null; source: string | null;
    fileName: string | null; importedAt: string; importedBy: string | null; report: any };
  const [dataImports, setDataImports] = useState<DataImport[]>([]);
  const [openImportId, setOpenImportId] = useState<number | null>(null);
  const fetchDataImports = async () => {
    try {
      const r = await axios.get(`${API_URL}/api/admin/partner-data-imports`, { headers: authHeaders() });
      setDataImports(r.data.imports || []);
    } catch { /* la permission peut manquer : l'historique reste simplement vide */ }
  };
  useEffect(() => { if (sub === 'imports' && canMigrate) fetchDataImports(); }, [sub, canMigrate]);

  const [revokingId, setRevokingId] = useState<number | null>(null);
  const revokeInvite = async (iv: Invite) => {
    if (!(await dialog.confirm(t('admin.partners.revokeConfirm', { email: iv.email }) as string))) return;
    setRevokingId(iv.id);
    try {
      await axios.delete(`${API_URL}/api/admin/partner-invites/${iv.id}`, { headers: authHeaders() });
      setInvites((prev) => prev.filter((x) => x.id !== iv.id));
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error === 'already_active'
        ? t('admin.partners.revokeActive') as string
        : t('admin.partners.revokeFailed') as string);
    } finally { setRevokingId(null); }
  };
  // Format court : « 5 aout 2026 » reservait 88 px par colonne de date, sur TROIS colonnes, ce qui
  // suffisait a faire deborder le tableau et a faire apparaitre une barre de defilement.
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString(i18n.language?.startsWith('fr') ? 'fr-CA' : 'en-CA',
          { year: '2-digit', month: '2-digit', day: '2-digit' }) : null;
  // Les trois etapes d'une invitation tenaient dans TROIS colonnes, dont deux vides la plupart
  // du temps, plus une quatrieme pour l'auteur : c'est ce qui poussait le tableau hors du champ
  // et obligeait a defiler de gauche a droite. Elles sont SEQUENTIELLES — on n'en montre donc
  // qu'une, la plus avancee. Les trois pastilles disent d'un coup d'oeil ou en est la ligne, et
  // l'infobulle garde la chaine complete, dates et auteur compris : rien n'est perdu, seule la
  // place l'est.
  const InviteCell = ({ iv, pending, expired }: { iv: Invite; pending: boolean; expired: boolean }) => {
    const etapes = [
      { at: iv.invitedAt, label: t('admin.partners.inviteSent') as string },
      { at: iv.openedAt, label: t('admin.partners.inviteOpened') as string },
      { at: iv.activatedAt, label: t('admin.partners.inviteAccepted') as string },
    ];
    const atteinte = etapes.reduce((acc, e, i) => (e.at ? i : acc), -1);
    if (atteinte < 0) return <span className="text-gray-400">—</span>;
    const infobulle = etapes.map((e) => `${e.label} : ${e.at ? fmtDate(e.at) : '—'}`).join('\n')
      + (iv.invitedBy ? `\n${t('admin.partners.inviteBy')} : ${iv.invitedBy}` : '');
    return (
      <div className="flex items-center gap-2 whitespace-nowrap" title={infobulle}>
        <span className="flex shrink-0 gap-1">
          {etapes.map((e, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${
              e.at ? 'bg-primary'
                   : expired ? 'bg-danger/40'
                   : pending ? 'bg-warning/60'
                   : 'bg-gray-300 dark:bg-strokedark'}`} />
          ))}
        </span>
        <span className="text-black dark:text-white">{etapes[atteinte].label}</span>
        <span className="text-xs text-body">{fmtDate(etapes[atteinte].at as string)}</span>
      </div>
    );
  };

  // Deux temps, et le second n'est demande QUE s'il y a quelque chose a perdre.
  // Le premier appel n'efface rien tant qu'il reste des donnees rattachees : le serveur
  // repond 409 avec le decompte, ce qui permet d'annoncer ce qui va disparaitre au lieu
  // de demander « etes-vous sur ? » dans le vide. Une confirmation qui ne dit pas ce
  // qu'elle detruit n'est pas une confirmation.
  const deletePartner = async (p: Partner) => {
    if (!(await dialog.confirm(t('admin.partners.deleteConfirm', { name: p.name }) as string))) return;
    setDeletingPartnerId(p.id);
    try {
      await axios.delete(`${API_URL}/api/admin/partners/${p.id}`, { headers: authHeaders() });
      await fetchPartners();
    } catch (e: any) {
      const d = e?.response?.data;
      if (e?.response?.status === 409 && d?.error === 'partner_has_data') {
        const c = d.counts || {};
        const ok = await dialog.confirm(t('admin.partners.deleteConfirmData', {
          name: d.name || p.name,
          users: c.users || 0,
          opportunities: c.opportunities || 0,
          invoices: c.invoices || 0,
          runs: c.payout_runs || 0,
        }) as string);
        if (!ok) { setDeletingPartnerId(null); return; }
        try {
          await axios.delete(`${API_URL}/api/admin/partners/${p.id}?force=1`, { headers: authHeaders() });
          await fetchPartners();
        } catch (e2: any) {
          dialog.alert(e2?.response?.data?.error || t('admin.partners.deleteFailed') as string);
        }
      } else {
        dialog.alert(d?.error || t('admin.partners.deleteFailed') as string);
      }
    } finally {
      setDeletingPartnerId(null);
    }
  };
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  // Langue du courriel d'invitation, par defaut celle de l'admin qui invite.
  const [inviteLocale, setInviteLocale] = useState<'fr' | 'en'>((i18n.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en');
  const [inviting, setInviting] = useState(false);

  const fetchPartners = async () => {
    setLoadingPartners(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/partners`, { headers: authHeaders() });
      setPartners(r.data.partners || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load partners'); }
    finally { setLoadingPartners(false); }
  };
  useEffect(() => { fetchPartners(); }, []);

  const createPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartnerName.trim()) return;
    setCreating(true);
    try {
      await axios.post(`${API_URL}/api/admin/partners`, { name: newPartnerName.trim() }, { headers: authHeaders() });
      setNewPartnerName('');
      await fetchPartners();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to create partner'); }
    finally { setCreating(false); }
  };

  const toggleActive = async (p: Partner) => {
    // Ce commutateur FERME l'acces depuis 2026-08-10 : connexion, activation d'invitation et
    // reinitialisation. Une bascule silencieuse enfermerait des gens sans que personne ne
    // l'ait voulu — la confirmation dit donc combien de comptes elle coupe. Reactiver ne
    // detruit rien, on ne demande donc rien dans ce sens.
    if (p.active && !(await dialog.confirm(
      t('admin.partners.deactivateConfirm', { name: p.name, count: p.userCount }) as string))) return;
    try {
      await axios.put(`${API_URL}/api/admin/partners/${p.id}`, { name: p.name, active: !p.active }, { headers: authHeaders() });
      await fetchPartners();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to update partner'); }
  };

  // Partner-manager-configurable Lead Source + Billing/Business contact info (user request
  // 2026-07-2x, after the Zoho screenshot showed Lead Source as a required, unmapped field).
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', leadSource: '', payoutRate: '', initialPayoutRate: '',
    billingContactName: '', billingContactEmail: '', billingContactPhone: '',
    businessContactName: '', businessContactEmail: '', businessContactPhone: '',
    // Inscription libre : l'interrupteur et les domaines autorisés. Le CODE, lui, vit à part —
    // il n'est pas saisi mais généré par le serveur.
    joinEnabled: false, joinEmailDomains: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Le code vit a part du formulaire : il n'est pas saisi, il est GENERE par le serveur.
  const [joinCode, setJoinCode] = useState('');
  const [rotating, setRotating] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const rotateJoinCode = async () => {
    if (!editingPartner) return;
    // Confirmation seulement s'il y a quelque chose a casser : remplacer un code EXISTANT
    // invalide celui qui circule deja, ce qui est precisement le but quand il a fuite — mais
    // une surprise quand on voulait juste en creer un.
    if (joinCode && !(await dialog.confirm(t('admin.partners.join.rotateConfirm') as string))) return;
    setRotating(true);
    try {
      const r = await axios.post(`${API_URL}/api/admin/partners/${editingPartner.id}/join-code`, {}, { headers: authHeaders() });
      setJoinCode(r.data.joinCode);
      await fetchPartners();
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || 'Failed to generate the code');
    } finally { setRotating(false); }
  };

  const openEdit = (p: Partner) => {
    setEditingPartner(p);
    setEditForm({
      name: p.name, leadSource: p.leadSource || '', payoutRate: p.payoutRate !== null ? String(p.payoutRate) : '',
      initialPayoutRate: p.initialPayoutRate !== null ? String(p.initialPayoutRate) : '',
      billingContactName: p.billingContactName || '', billingContactEmail: p.billingContactEmail || '', billingContactPhone: p.billingContactPhone || '',
      businessContactName: p.businessContactName || '', businessContactEmail: p.businessContactEmail || '', businessContactPhone: p.businessContactPhone || '',
      joinEnabled: !!p.joinEnabled, joinEmailDomains: p.joinEmailDomains || '',
    });
    setJoinCode(p.joinCode || '');
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPartner || !editForm.name.trim()) return;
    setSavingEdit(true);
    try {
      await axios.put(`${API_URL}/api/admin/partners/${editingPartner.id}`, {
        name: editForm.name.trim(), active: editingPartner.active,
        leadSource: editForm.leadSource.trim(), payoutRate: editForm.payoutRate.trim() === '' ? null : editForm.payoutRate.trim(),
        initialPayoutRate: editForm.initialPayoutRate.trim() === '' ? null : editForm.initialPayoutRate.trim(),
        billingContactName: editForm.billingContactName.trim(), billingContactEmail: editForm.billingContactEmail.trim(), billingContactPhone: editForm.billingContactPhone.trim(),
        businessContactName: editForm.businessContactName.trim(), businessContactEmail: editForm.businessContactEmail.trim(), businessContactPhone: editForm.businessContactPhone.trim(),
        joinEnabled: editForm.joinEnabled, joinEmailDomains: editForm.joinEmailDomains.trim(),
      }, { headers: authHeaders() });
      setEditingPartner(null);
      await fetchPartners();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to update partner'); }
    finally { setSavingEdit(false); }
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteFor || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await axios.post(`${API_URL}/api/admin/partners/${inviteFor.id}/invite-admin`,
        { email: inviteEmail.trim(), name: inviteName.trim(), locale: inviteLocale }, { headers: authHeaders() });
      setInviteFor(null); setInviteEmail(''); setInviteName('');
      await fetchPartners();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to send invite'); }
    finally { setInviting(false); }
  };

  // Opportunity Queue — always fetch the full set once and filter/search client-side (cheap at
  // this volume), so the status tiles below can show live counts across ALL statuses regardless
  // of which one is currently selected, and switching tiles/search needs no round-trip.
  const [allOpportunities, setAllOpportunities] = useState<Opportunity[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [queueSearch, setQueueSearch] = useState('');

  const fetchQueue = async () => {
    setLoadingQueue(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/partner-opportunities`, { headers: authHeaders() });
      setAllOpportunities(r.data.opportunities || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load the opportunity queue'); }
    finally { setLoadingQueue(false); }
  };
  const queueStats = {
    pending: allOpportunities.filter((o) => o.status === 'pending').length,
    approved: allOpportunities.filter((o) => o.status === 'approved').length,
    rejected: allOpportunities.filter((o) => o.status === 'rejected').length,
    all: allOpportunities.length,
  };
  // Filtre partenaire + tri par date + pagination (2026-08-05). La liste des partenaires vient des
  // opportunites elles-memes, pas de la table `partners` : on ne propose que des partenaires qui
  // ont effectivement quelque chose dans la file, et le filtre ne peut pas pointer dans le vide.
  const [partnerFilter, setPartnerFilter] = useState('');
  // Representant Cluster et etat du versement. Les options se deduisent des lignes de la VUE
  // COURANTE, pas de toute la file : un choix qui ne peut rien ramener ne doit pas etre propose.
  const [clusterRepFilter, setClusterRepFilter] = useState('');
  const [payoutFilter, setPayoutFilter] = useState('');
  const SANS_REP = '__sans__';
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(0);
  const QUEUE_PAGE_SIZE = 50;
  const partnerNames = [...new Set(allOpportunities.map((o) => o.partnerName))].sort((a, b) => a.localeCompare(b));
  // Nom -> fiche partenaire, pour afficher le logo quand il y en a un (convention du projet :
  // le logo seul s'il existe, le nom sinon).
  const partnerByName = new Map(partners.map((p) => [p.name, p]));

  // Partenaires reellement presents dans la liste des usagers, et lignes affichees.
  const invitePartnerNames = [...new Set(invites.map((i) => i.partnerName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // Recherche sur l'adresse ET le nom affiche : on cherche parfois « Shanna », parfois « @moneris ».
  const userSearchLower = userSearch.trim().toLowerCase();
  const shownInvites = invites.filter((i) =>
    (!userDirFilter || i.partnerName === userDirFilter)
    && (!userSearchLower
      || i.email.toLowerCase().includes(userSearchLower)
      || (i.name || '').toLowerCase().includes(userSearchLower)));
  // Meme raisonnement que pour le selecteur juste a cote : une colonne qui repete 177 fois la
  // meme valeur ne distingue rien, elle prend juste la largeur qui manque ailleurs.
  const showPartnerCol = !userDirFilter && invitePartnerNames.length > 1;
  // Tout selectionner = tout ce qui est AFFICHE et invitable, donc le filtre par partenaire est
  // respecte : on ne peut pas inviter tout Moneris en croyant ne cocher que ce qu'on voit.
  // ⚠️ Doit rester APRES shownInvites : declare plus haut, TypeScript refuse (usage avant
  // declaration) — les fonctions plus haut peuvent s'y referer, elles ne s'executent qu'apres.
  const invitableShown = shownInvites.filter(canInvite);
  const allShownSelected = invitableShown.length > 0 && invitableShown.every((iv) => selectedUsers.has(iv.id));
  // La selection ne doit JAMAIS contenir de lignes invisibles. Sans ceci : on coche cinq usagers,
  // on tape une recherche, et le bouton annonce toujours « Inviter (5) » alors qu'une seule ligne
  // est a l'ecran — pour un envoi de courriels irreversible. Filtrer ou chercher relache donc ce
  // qui sort du champ. Meme intention que « tout selectionner », qui ne prend que l'affiche.
  useEffect(() => {
    setSelectedUsers((prev) => {
      if (!prev.size) return prev;                       // rendu inutile evite
      const visibles = new Set(shownInvites.map((i) => i.id));
      const garde = [...prev].filter((id) => visibles.has(id));
      return garde.length === prev.size ? prev : new Set(garde);
    });
  }, [userDirFilter, userSearchLower]);

  // Lignes de la vue courante, avant les autres filtres : c'est la base des listes d'options.
  const queueInView = allOpportunities.filter((o) => statusFilter === 'all' || o.status === statusFilter);
  const clusterRepNames = [...new Set(queueInView.map((o) => o.crmOwnerName).filter(Boolean) as string[])]
    .sort((a, b) => a.localeCompare(b));
  const sansRepCount = queueInView.filter((o) => !o.crmOwnerName).length;
  const payoutStates = [...new Set(queueInView.map((o) => o.payoutStatus).filter(Boolean) as string[])].sort();

  const searchLower = queueSearch.trim().toLowerCase();
  const filteredQueue = allOpportunities
    .filter((o) =>
      (statusFilter === 'all' || o.status === statusFilter)
      && (!partnerFilter || o.partnerName === partnerFilter)
      && (!searchLower || o.businessName.toLowerCase().includes(searchLower) || o.partnerName.toLowerCase().includes(searchLower))
      // `SANS_REP` est un choix a part entiere : apres la reprise des 674 dossiers, « lesquels
      // n'ont personne » est exactement la question qu'on se pose.
      && (!clusterRepFilter || (clusterRepFilter === SANS_REP ? !o.crmOwnerName : o.crmOwnerName === clusterRepFilter))
      && (!payoutFilter || o.payoutStatus === payoutFilter)
    )
    // `filter` a deja produit un nouveau tableau, donc trier en place ne touche pas l'etat.
    .sort((a, b) => (dateSort === 'desc' ? 1 : -1) * (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  const queueTotal = filteredQueue.length;
  const opportunities = filteredQueue.slice(page * QUEUE_PAGE_SIZE, (page + 1) * QUEUE_PAGE_SIZE);
  // Changer de filtre en etant page 3 laissait un tableau vide sans explication.
  useEffect(() => { setPage(0); }, [statusFilter, queueSearch, partnerFilter, clusterRepFilter, payoutFilter]);
  // Changer de vue peut rendre un filtre impossible a satisfaire (un representant qui n'a aucune
  // ligne rejetee, par exemple). On le laisse tomber plutot que d'afficher un tableau vide dont
  // rien n'explique le vide.
  useEffect(() => {
    if (clusterRepFilter && clusterRepFilter !== SANS_REP && !clusterRepNames.includes(clusterRepFilter)) setClusterRepFilter('');
    if (clusterRepFilter === SANS_REP && !sansRepCount) setClusterRepFilter('');
    if (payoutFilter && !payoutStates.includes(payoutFilter)) setPayoutFilter('');
  }, [statusFilter, clusterRepNames.join('|'), payoutStates.join('|'), sansRepCount]);

  // Les colonnes SUIVENT la vue : reviser, suivre et archiver ne demandent pas les memes
  // informations, et tout empiler dans une colonne « Zoho CRM » fourre-tout la rendait illisible.
  const QUEUE_COLS: Record<typeof statusFilter, string[]> = {
    pending:  ['partner', 'business', 'duplicates', 'submitted'],
    approved: ['partner', 'business', 'deal', 'payout', 'submitted'],
    rejected: ['partner', 'business', 'reason', 'submitted'],
    all:      ['partner', 'business', 'state', 'submitted'],
  };
  const cols = QUEUE_COLS[statusFilter];
  const COL_LABEL: Record<string, string> = {
    partner:    t('admin.partners.queue.colPartner') as string,
    business:   t('partnerPortal.colBusinessContact') as string,
    duplicates: t('admin.partners.queue.colDuplicates') as string,
    deal:       t('admin.partners.queue.colDeal') as string,
    payout:     t('partnerPortal.colPayout') as string,
    reason:     t('admin.partners.queue.colReason') as string,
    state:      t('partnerPortal.colStatus') as string,
    submitted:  t('partnerPortal.colSubmitted') as string,
  };

  // Une cellule par cle de colonne, ecrite UNE fois : les quatre vues partagent ce rendu, donc
  // corriger « Entreprise / contact » le corrige partout, au lieu de quatre tableaux a maintenir.
  //
  // Les plafonds de troncature sont RESPONSIVES (`max-w-[Npx] xl:max-w-[Mpx]`). Ce sont eux, et
  // rien d'autre, qui fixaient la largeur minimale du tableau : une ligne `truncate` est en
  // white-space:nowrap, donc son minimum est son plafond. La vue « approuvees » a une colonne de
  // plus que les autres ; avec des noms et des courriels plus longs que les plafonds, son plancher
  // montait a 969 px alors que la table annonce `min-w-[820px]` — barre de defilement horizontale
  // sous 1307 px de fenetre, donc y compris sur un portable 1280. Plafonds reduits sous xl :
  // plancher mesure a 829 px, seuil ramene a 1167 px.
  //
  // ⚠️ Trois plafonds larges ont ete rabotes au passage (entreprise 185→160, reviseur 170→145,
  // etape du deal 150→140). Sans ca le plancher restait a 969 des xl, alors qu'une fenetre de
  // 1280 n'offre que ~942 px de carte (fenetre moins la barre laterale ouverte et les marges,
  // mesures : w-72.5 = 290 px et p-6 = 48 px) : le debordement
  // reapparaissait entre 1280 et 1307. Ces largeurs sont des points de rupture de FENETRE, pas de
  // conteneur — replier la barre laterale rend ~230 px de plus sans les declencher, ce qui va
  // dans le bon sens. Tout est tronque avec le texte entier en infobulle, rien ne se perd.
  const dupFieldLabel = (f: string) => t(`admin.partners.queue.on.${f}`) as string;
  const renderQueueCell = (o: Opportunity, c: string) => {
    switch (c) {
      case 'partner': {
        // Convention du projet : le logo SEUL quand il existe, le nom sinon.
        const p = partnerByName.get(o.partnerName);
        // Les DEUX representants sous l'identite du partenaire : celui du partenaire, qui a apporte
        // l'affaire, et celui de Cluster, a qui le Lead a ete assigne dans Zoho. Ici plutot que dans
        // une colonne de plus : le tableau tenait tout juste sans barre de defilement, et la ligne ne
        // grandit pas puisque la cellule « Entreprise / contact » fait deja trois lignes.
        const repPartenaire = [o.repFirstName, o.repLastName].filter(Boolean).join(' ') || o.repEmail || null;
        return (
          <div className="leading-tight">
            {p?.hasLogo ? (
              <img src={`${API_URL}/api/partner-portal/organization/logo/${p.id}?v=${logoV}`}
                alt={o.partnerName} title={o.partnerName}
                className="h-6 w-auto max-w-[110px] object-contain object-left" />
            ) : (
              <span className="whitespace-nowrap text-xs font-medium text-black dark:text-white">{o.partnerName}</span>
            )}
            {/* Representant du PARTENAIRE, celui qui a apporte l'affaire. Le libelle porte le nom du
                partenaire : sans lui, deux lignes de noms cote a cote ne disent pas qui est qui —
                c'est exactement l'erreur signalee par David. */}
            {repPartenaire && (
              <div className="max-w-[110px] xl:max-w-[128px] truncate text-[11px] text-gray-400"
                title={t('admin.partners.partnerRepHint', { partner: o.partnerName, name: repPartenaire }) as string}>
                {o.partnerName} · {repPartenaire}
              </div>
            )}
            {o.crmOwnerName && (
              <div className="max-w-[110px] xl:max-w-[128px] truncate text-[11px] text-primary"
                title={t('admin.partners.clusterRepHint', { name: o.crmOwnerName }) as string}>
                {t('admin.partners.clusterRepPrefix')} {o.crmOwnerName}
              </div>
            )}
          </div>
        );
      }
      case 'business': {
        const who = [o.contactFirstName, o.contactLastName].filter(Boolean).join(' ');
        const contact = [who, o.contactEmail].filter(Boolean).join(' · ');
        return (
          <div className="leading-tight">
            <div className="max-w-[140px] xl:max-w-[160px] truncate font-medium text-black dark:text-white" title={o.businessName}>{o.businessName}</div>
            {contact && <div className="max-w-[140px] xl:max-w-[160px] truncate text-[11px] text-gray-400" title={contact}>{contact}</div>}
            {o.submittedByEmail && (
              <div className="max-w-[140px] xl:max-w-[160px] truncate text-[11px] text-gray-400"
                title={`${t('admin.partners.colSubmittedBy')} : ${o.submittedByEmail}`}>↳ {o.submittedByEmail}</div>
            )}
          </div>
        );
      }
      case 'duplicates': {
        // SUR QUOI ca a matche, pas seulement combien : « 30 sur le courriel » est du bruit (adresse
        // partagee ou de test), « 1 sur le nom d'entreprise » est un vrai risque de doublon.
        // Les fiches verifiees avant 2026-08-05 n'ont pas ce detail : on retombe alors sur l'ancien
        // libelle plutot que d'afficher une phrase trouee.
        const fields = [...new Set((o.crmMatchRecords || []).flatMap((m) => m.matchedOn || []))];
        return (
          <div className="flex items-center gap-1">
            {o.crmMatchStatus === 'match_found' && (
              <button onClick={() => setViewingMatches(o)}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning hover:bg-warning/25">
                ⚠ {fields.length
                  ? t('admin.partners.queue.dupOn', { count: o.crmMatchRecords.length, fields: fields.map(dupFieldLabel).join(' + ') })
                  : t('admin.partners.crm.matchFoundShort', { count: o.crmMatchRecords.length })}
              </button>
            )}
            {o.crmMatchStatus === 'no_match' && (
              <span className="whitespace-nowrap rounded-full bg-gray-2 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-meta-4">{t('admin.partners.crm.noMatch')}</span>
            )}
            {o.crmMatchStatus === 'check_failed' && (
              <span className="whitespace-nowrap rounded-full bg-gray-2 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:bg-meta-4">{t('admin.partners.crm.checkFailed')}</span>
            )}
            {!o.crmMatchStatus && <span className="whitespace-nowrap text-xs text-gray-400">{t('admin.partners.crm.notChecked')}</span>}
            {o.status === 'pending' && (
              <button onClick={() => recheckCrm(o)} disabled={checkingCrmId === o.id}
                title={(o.crmMatchStatus ? t('admin.partners.crm.recheck') : t('admin.partners.crm.check')) as string}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10 disabled:opacity-50">
                {checkingCrmId === o.id ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4.5 9a7.5 7.5 0 0113-4.5M19.5 15a7.5 7.5 0 01-13 4.5" />
                  </svg>
                )}
              </button>
            )}
          </div>
        );
      }
      case 'deal':
        return (
          <div className="leading-tight">
            {/* Seule cellule du tableau sans plafond de largeur : « Deposit Information Received »
                imposait 207 px a la colonne. Tronquee comme les autres, avec le libelle entier en
                infobulle. */}
            <div className="max-w-[120px] xl:max-w-[140px] truncate text-body" title={o.crmDealStage || undefined}>{o.crmDealStage || '—'}</div>
            {/* 19 chiffres bruts ne disaient rien : l'identifiant devient un lien vers la fiche. */}
            {o.crmLeadId && (
              <a href={`https://crm.zoho.com/crm/tab/Leads/${o.crmLeadId}`} target="_blank" rel="noreferrer"
                title={t('admin.partners.crm.leadCreated', { id: o.crmLeadId }) as string}
                className="whitespace-nowrap text-[11px] text-primary hover:underline">{t('admin.partners.queue.viewInZoho')}</a>
            )}
            {o.crmLeadError && (
              <div className="whitespace-nowrap text-[11px] text-danger" title={o.crmLeadError}>⚠ {t('admin.partners.crm.leadFailed')}</div>
            )}
          </div>
        );
      case 'payout':
        return (
          <div className="flex flex-wrap items-center gap-1">
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAYOUT_BADGE[o.payoutStatus]}`}
              title={(o.crmDepositDate
                ? t('admin.partners.payout.depositOn', { date: new Date(o.crmDepositDate).toLocaleDateString(i18n.language) })
                : t('admin.partners.payout.awaitingDeposit')) as string}>
              {t(`admin.partners.payout.status.${o.payoutStatus}`)}
            </span>
            {o.payoutStatus === 'not_eligible' && o.crmDealLookup && (
              <span className="whitespace-nowrap rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger"
                title={t(`admin.partners.payout.${o.crmDealLookup === 'ambiguous' ? 'dealAmbiguousHint' : 'dealNotFoundHint'}`) as string}>
                ⚠ {t(`admin.partners.payout.${o.crmDealLookup === 'ambiguous' ? 'dealAmbiguous' : 'dealNotFound'}`)}
              </span>
            )}
            {o.linkedCustomerName ? (
              <button onClick={() => openLinking(o)} title={`${o.linkedCustomerName} — ${t('admin.partners.payout.relink')}`}
                className="inline-block max-w-[110px] xl:max-w-[140px] truncate text-[11px] text-gray-400 hover:text-primary hover:underline">
                🔗 {o.linkedCustomerName}
              </button>
            ) : (
              <button onClick={() => openLinking(o)}
                className="whitespace-nowrap text-[11px] font-medium text-primary hover:underline">
                🔗 {t('admin.partners.payout.linkButton')}
              </button>
            )}
          </div>
        );
      case 'reason':
        return o.rejectionReason
          ? <div className="max-w-[260px] text-[11px] leading-tight text-gray-400">{o.rejectionReason}</div>
          : <span className="text-gray-400">—</span>;
      case 'state':
        return (
          <div className="flex flex-wrap items-center gap-1">
            <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[o.status]}`}>{t(`partnerPortal.status.${o.status}`)}</span>
            {o.status === 'approved' && (
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${PAYOUT_BADGE[o.payoutStatus]}`}>
                {t(`admin.partners.payout.status.${o.payoutStatus}`)}
              </span>
            )}
          </div>
        );
      case 'submitted':
        return (
          <div className="leading-tight">
            <div className="whitespace-nowrap tabular-nums text-body">
              {new Date(o.createdAt).toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', year: '2-digit' })}
            </div>
            {/* Le reviseur sortait de la colonne « Actions », ou il n'etait pas une action. */}
            {o.status !== 'pending' && o.reviewedBy && (
              <div className="ml-auto max-w-[130px] xl:max-w-[145px] truncate text-[11px] text-gray-400"
                title={`${t('admin.partners.queue.reviewedBy')} : ${o.reviewedBy}`}>{o.reviewedBy}</div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  useEffect(() => { if (sub === 'queue') fetchQueue(); }, [sub]);

  const [rejecting, setRejecting] = useState<Opportunity | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [checkingCrmId, setCheckingCrmId] = useState<number | null>(null);

  const setStatus = async (o: Opportunity, status: 'approved' | 'rejected', rejectionReason?: string, crmOwnerId?: string, crmOwnerName?: string) => {
    setReviewing(true);
    try {
      const r = await axios.put(`${API_URL}/api/admin/partner-opportunities/${o.id}`, { status, rejectionReason, crmOwnerId, crmOwnerName }, { headers: authHeaders() });
      setRejecting(null); setRejectReason('');
      setApproving(null); setSelectedRepId('');
      await fetchQueue();
      // SH-30 — surface the Lead-creation result right away rather than making the admin dig
      // for it; a failure here doesn't mean the approval failed, just that the Lead needs to be
      // created manually (crm_lead_error stays visible in the table either way).
      if (status === 'approved' && r.data?.crmLead?.error) {
        dialog.alert(t('admin.partners.crm.leadFailedAlert', { error: r.data.crmLead.error }) as string);
      }
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to update the opportunity'); }
    finally { setReviewing(false); }
  };

  // SH-30 follow-up — the partner manager picks which Zoho CRM rep the Lead gets assigned to
  // (Owner field) right when approving, instead of a plain yes/no confirm.
  const [approving, setApproving] = useState<Opportunity | null>(null);
  const [crmReps, setCrmReps] = useState<{ id: string; name: string; email: string }[]>([]);
  const [loadingReps, setLoadingReps] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState('');

  const approve = async (o: Opportunity) => {
    setApproving(o);
    setSelectedRepId('');
    if (!crmReps.length) {
      setLoadingReps(true);
      try {
        const r = await axios.get(`${API_URL}/api/admin/partner-opportunities/crm-reps`, { headers: authHeaders() });
        setCrmReps(r.data.reps || []);
      } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load Zoho CRM reps'); }
      finally { setLoadingReps(false); }
    }
  };
  const confirmApprove = () => {
    const rep = crmReps.find((r) => r.id === selectedRepId);
    setStatus(approving as Opportunity, 'approved', undefined, selectedRepId || undefined, rep?.name);
  };

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const deleteOpportunity = async (o: Opportunity) => {
    const confirmKey = o.crmLeadId ? 'admin.partners.deleteOpportunityConfirmWithLead' : 'admin.partners.deleteOpportunityConfirm';
    if (!(await dialog.confirm(t(confirmKey, { name: o.businessName, id: o.crmLeadId }) as string))) return;
    setDeletingId(o.id);
    try {
      const r = await axios.delete(`${API_URL}/api/admin/partner-opportunities/${o.id}`, { headers: authHeaders() });
      setAllOpportunities((prev) => prev.filter((x) => x.id !== o.id));
      if (r.data?.crmDeleteError) {
        dialog.alert(t('admin.partners.crm.deleteFailedAlert', { error: r.data.crmDeleteError }) as string);
      }
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to delete the opportunity'); }
    finally { setDeletingId(null); }
  };

  const recheckCrm = async (o: Opportunity) => {
    setCheckingCrmId(o.id);
    try {
      const r = await axios.post(`${API_URL}/api/admin/partner-opportunities/${o.id}/crm-check`, {}, { headers: authHeaders() });
      setAllOpportunities((prev) => prev.map((x) => x.id === o.id
        ? { ...x, crmMatchStatus: r.data.crmMatchStatus, crmMatchSummary: r.data.crmMatchSummary, crmMatchRecords: r.data.crmMatchRecords || [] }
        : x));
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to check Zoho CRM'); }
    finally { setCheckingCrmId(null); }
  };

  // SH-28 — lets the partner manager actually look at what matched (name/phone/email/city) and
  // judge for themselves whether it's the same lead or just another location of a similar-named
  // business, instead of only seeing a flag and having to guess.
  const [viewingMatches, setViewingMatches] = useState<Opportunity | null>(null);

  // SH-40/41 — manually link a converted opportunity to the real, invoiced Sales Hub customer it
  // became (there's no automatic Zoho Lead → Sales Hub customer link), so payout eligibility can
  // be computed against that customer's actual paid invoices.
  const [linkingFor, setLinkingFor] = useState<Opportunity | null>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<string[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const openLinking = (o: Opportunity) => { setLinkingFor(o); setLinkQuery(o.linkedCustomerName || ''); setLinkResults([]); };
  useEffect(() => {
    if (!linkingFor || linkQuery.trim().length < 2) { setLinkResults([]); return; }
    setLinkSearching(true);
    const timer = setTimeout(() => {
      axios.get(`${API_URL}/api/admin/partner-opportunities/customer-search`, { params: { q: linkQuery.trim() }, headers: authHeaders() })
        .then((r) => setLinkResults(r.data.customers || []))
        .catch(() => setLinkResults([]))
        .finally(() => setLinkSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [linkQuery, linkingFor]);
  const saveLink = async (customerName: string | null) => {
    if (!linkingFor) return;
    setSavingLink(true);
    try {
      const r = await axios.put(`${API_URL}/api/admin/partner-opportunities/${linkingFor.id}/link-customer`, { customerName }, { headers: authHeaders() });
      setAllOpportunities((prev) => prev.map((x) => x.id === linkingFor.id
        ? { ...x, linkedCustomerName: r.data.linkedCustomerName, payoutStatus: r.data.payoutStatus }
        : x));
      setLinkingFor(null);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to link customer'); }
    finally { setSavingLink(false); }
  };

  // SH-41 — the quarterly payout run workflow: pending eligible opportunities grouped by
  // partner (with a rate-based suggested total the manager can override), draft runs, and history.
  const [pendingPartners, setPendingPartners] = useState<PendingPartnerPayout[]>([]);
  const [runs, setRuns] = useState<PayoutRun[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const fetchPayouts = async () => {
    setLoadingPayouts(true);
    try {
      const [pendingRes, runsRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/partner-payouts/pending`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/admin/partner-payouts/runs`, { headers: authHeaders() }),
      ]);
      setPendingPartners(pendingRes.data.partners || []);
      setRuns(runsRes.data.runs || []);
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to load payouts'); }
    finally { setLoadingPayouts(false); }
  };
  useEffect(() => { if (sub === 'payouts') fetchPayouts(); }, [sub]);

  // Depliage du detail d'un versement en attente. « 14 opportunites, 2800 $ » ne se verifie pas ;
  // la liste des 14, avec la facture qui rend chacune due, oui.
  const [openPendingKey, setOpenPendingKey] = useState<string | null>(null);

  const [creatingRunFor, setCreatingRunFor] = useState<PendingPartnerPayout | null>(null);
  const [runPeriod, setRunPeriod] = useState('');
  const [runAmount, setRunAmount] = useState('');
  const [runSelectedIds, setRunSelectedIds] = useState<Set<number>>(new Set());
  const [savingRun, setSavingRun] = useState(false);
  const openCreateRun = (p: PendingPartnerPayout) => {
    setCreatingRunFor(p);
    setRunPeriod('');
    setRunAmount(p.suggestedAmount !== null ? p.suggestedAmount.toFixed(2) : '');
    setRunSelectedIds(new Set(p.opportunities.map((o) => o.id)));
  };
  const toggleRunSelected = (id: number) => {
    setRunSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const submitCreateRun = async () => {
    if (!creatingRunFor || !runPeriod.trim() || !runSelectedIds.size) return;
    setSavingRun(true);
    try {
      await axios.post(`${API_URL}/api/admin/partner-payouts/runs`, {
        partnerId: creatingRunFor.partnerId, periodLabel: runPeriod.trim(), kind: creatingRunFor.kind,
        totalAmount: runAmount.trim() || 0, opportunityIds: [...runSelectedIds],
      }, { headers: authHeaders() });
      setCreatingRunFor(null);
      await fetchPayouts();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to create payout run'); }
    finally { setSavingRun(false); }
  };

  const [runningActionId, setRunningActionId] = useState<number | null>(null);
  const finalizeRun = async (run: PayoutRun) => {
    if (!(await dialog.confirm(t('admin.partners.payout.finalizeConfirm', { period: run.periodLabel, amount: run.totalAmount.toFixed(2) }) as string))) return;
    setRunningActionId(run.id);
    try {
      await axios.post(`${API_URL}/api/admin/partner-payouts/runs/${run.id}/finalize`, {}, { headers: authHeaders() });
      await fetchPayouts();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to finalize run'); }
    finally { setRunningActionId(null); }
  };
  const cancelRun = async (run: PayoutRun) => {
    if (!(await dialog.confirm(t('admin.partners.payout.cancelConfirm', { period: run.periodLabel }) as string))) return;
    setRunningActionId(run.id);
    try {
      await axios.delete(`${API_URL}/api/admin/partner-payouts/runs/${run.id}`, { headers: authHeaders() });
      await fetchPayouts();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to cancel run'); }
    finally { setRunningActionId(null); }
  };


  // --- Reprise de l'ancien portail (permission `partners:migrate`, invisible sans elle).
  // La transformation des exports Zoho est faite hors ligne ; cet ecran ne fait que porter la
  // charge utile deja normalisee, montrer ce qu'elle produirait, puis l'appliquer.
  const [migFile, setMigFile] = useState<File | null>(null);
  const [migReport, setMigReport] = useState<any>(null);
  const [migBusy, setMigBusy] = useState<'' | 'dry' | 'apply'>('');
  // « Appliquer » n'est ouvert qu'apres une simulation REUSSIE du MEME fichier : changer de fichier
  // remet le verrou. Sans ca, on pourrait ecrire 850 lignes sans avoir rien verifie.
  const [migSimulatedFor, setMigSimulatedFor] = useState<string>('');
  const migInput = useRef<HTMLInputElement>(null);

  const runMigration = async (dryRun: boolean) => {
    if (!migFile) return;
    setMigBusy(dryRun ? 'dry' : 'apply');
    setMigReport(null);
    try {
      const payload = JSON.parse(await migFile.text());
      const r = await axios.post(`${API_URL}/api/admin/partner-migration`,
        { ...payload, dryRun, fileName: migFile.name }, { headers: authHeaders() });
      setMigReport(r.data);
      if (dryRun) setMigSimulatedFor(migFile.name + ':' + migFile.size);
      else { setMigSimulatedFor(''); await fetchPartners(); await fetchQueue(); await fetchDataImports(); }
    } catch (e: any) {
      const d = e?.response?.data;
      dialog.alert(d?.error || e?.message || 'Migration failed');
      if (d?.report) setMigReport(d.report);
    } finally { setMigBusy(''); }
  };

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';

  return (
    <>
      <input
        ref={logoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadLogo(f); }}
      />
    <div>
      {/* Barre de pastilles, et non plus un fil d'Ariane « ← File d'opportunités / Users ».
          Ce fil prétendait une HIÉRARCHIE qui n'existe pas : les quatre vues sont sœurs, aucune
          n'est sous une autre. Il passait tant qu'il n'y avait que deux vues ; à quatre il ment,
          et il n'offre aucun moyen de passer directement d'une vue à l'autre.
          (L'ancien commentaire disait « pas de barre d'onglets, la barre latérale suffit » — vrai
          en juillet avec deux vues, faux maintenant. Les pastilles sont d'ailleurs le motif déjà
          utilisé par Commissions et par le portail.) */}
      <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-stroke bg-white p-1 shadow-default dark:border-strokedark dark:bg-boxdark">
        {([
          { key: 'queue',    to: '/admin/partners',              label: 'admin.partners.tabs.queue' },
          { key: 'partners', to: '/admin/partners?view=manage',  label: 'admin.partners.tabs.partners' },
          { key: 'users',    to: '/admin/partners?view=users',   label: 'admin.partners.tabs.users' },
          { key: 'payouts',  to: '/admin/partners?view=payouts', label: 'admin.partners.tabs.payouts' },
          // La reprise n'apparait que pour qui peut l'executer : une pastille qu'on ne peut pas
          // utiliser est du bruit pour tous les autres.
          ...(canMigrate ? [{ key: 'imports' as const, to: '/admin/partners?view=imports', label: 'admin.partners.tabs.imports' }] : []),
          // Meme raisonnement que pour la reprise : visible seulement pour qui a la permission.
          ...(canStats ? [{ key: 'stats' as const, to: '/admin/partners?view=stats', label: 'admin.partners.tabs.stats' }] : []),
        ] as const).map((tab) => (
          <button key={tab.key} onClick={() => navigate(tab.to)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              sub === tab.key ? 'bg-primary text-white shadow-sm' : 'text-body hover:bg-gray-50 dark:hover:bg-meta-4'
            }`}>
            {t(tab.label)}
            {/* Le nombre de dossiers à réviser se lit sur l'onglet, pas seulement dans la barre
                latérale : c'est la seule action qui attend vraiment quelqu'un. */}
            {tab.key === 'queue' && queueStats.pending > 0 && (
              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                sub === 'queue' ? 'bg-white/20 text-white' : 'bg-warning/20 text-warning'}`}>
                {queueStats.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {sub === 'partners' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
            <form onSubmit={createPartner} className="flex flex-wrap items-end gap-3">
              <input value={newPartnerName} onChange={(e) => setNewPartnerName(e.target.value)}
                placeholder={t('admin.partners.fName') as string} className={`${inputCls} max-w-xs`} />
              <button type="submit" disabled={creating}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                {creating ? t('admin.partners.creating') : t('admin.partners.addPartner')}
              </button>
            </form>
          </div>

          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            {loadingPartners ? (
              <div className="flex h-24 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
            ) : partners.length === 0 ? (
              <div className="p-8 text-center text-sm text-body">{t('admin.partners.noPartners')}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark">
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.fName')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.colUsers')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.colInvitations')}</th>
                    <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.colActive')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-black dark:text-white">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                      <td className="px-4 py-3 font-medium text-black dark:text-white">{p.name}</td>
                      <td className="px-4 py-3 text-body">
                        {p.userCount > 0 ? (
                          <button onClick={() => showPartnerUsers(p.name)}
                            title={t('admin.partners.seeUsersOf', { name: p.name }) as string}
                            className="font-semibold text-primary hover:underline">
                            {p.userCount}
                          </button>
                        ) : <span className="text-gray-400">0</span>}
                      </td>
                      {/* Ou en est l'adoption, sans ouvrir l'annuaire. Trois nombres plutot qu'un
                          seul : « 4 envoyees » sans le reste ne dit pas si quelqu'un est entre.
                          ⚠️ « Lien ouvert » n'est PAS « courriel lu » — l'infobulle le dit, parce
                          que confondre les deux ferait conclure a tort qu'un partenaire ignore
                          nos courriels. Voir le commentaire sur invite_opened_at cote serveur. */}
                      <td className="px-4 py-3">
                        {p.invitedCount === 0 ? (
                          <span className="whitespace-nowrap text-xs text-gray-400">{t('admin.partners.invNone')}</span>
                        ) : (
                          <button onClick={() => showPartnerUsers(p.name)}
                            title={t('admin.partners.invHint', {
                              invited: p.invitedCount, opened: p.openedCount, activated: p.activatedCount,
                              when: p.lastInvitedAt ? fmtDate(p.lastInvitedAt) : '—',
                            }) as string}
                            className="flex items-center gap-1.5 whitespace-nowrap text-xs hover:underline">
                            <span className="font-semibold text-black dark:text-white">{p.invitedCount}</span>
                            <span className="text-gray-400">→</span>
                            <span className={p.openedCount ? 'font-semibold text-primary' : 'text-gray-400'}>{p.openedCount}</span>
                            <span className="text-gray-400">→</span>
                            <span className={p.activatedCount ? 'font-semibold text-green-700 dark:text-success' : 'text-gray-400'}>{p.activatedCount}</span>
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleActive(p)}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.active ? 'bg-success/15 text-green-700 dark:text-success' : 'bg-gray-2 text-gray-500 dark:bg-meta-4'}`}>
                          {p.active ? t('common.active') : t('common.inactive')}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(p)}
                            className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">
                            {t('admin.partners.editPartner')}
                          </button>
                          <button onClick={() => setInviteFor(p)}
                            className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">
                            {t('admin.partners.inviteAdmin')}
                          </button>
                          {canDelete && (
                            <button onClick={() => deletePartner(p)} disabled={deletingPartnerId === p.id}
                              title={t('admin.partners.deletePartner') as string}
                              className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-danger hover:border-danger disabled:opacity-50 dark:border-strokedark">
                              {deletingPartnerId === p.id
                                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-danger border-t-transparent" />
                                : t('admin.partners.deletePartner')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      )}

      {/* Vue « Usagers » : les comptes du PORTAIL partenaire, et eux seuls. Ils ne figurent
          volontairement pas dans Admin Panel > Users, qui ne montre que les comptes
          Sales Hub — deux mondes distincts, deux endroits. */}
      {sub === 'users' && (
        <div className="flex flex-col gap-4">
        {/* Usagers du portail, par partenaire. Reste le suivi des invitations (envoyee -> lien
            ouvert -> compte active) : ce sont les memes lignes, vues comme un annuaire. */}
        <div ref={userDirRef} className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-black dark:text-white">{t('admin.partners.invitesTitle')}</h4>
                <p className="mt-0.5 text-xs text-body">{t('admin.partners.invitesHint')}</p>
              </div>
              {/* Disposition retenue partout ailleurs dans l'app : selecteurs a gauche, recherche
                  qui s'etire, action epinglee a droite. L'envoi etait a gauche, ce qui ne laissait
                  a la recherche aucune place pour s'etendre.
                  Le selecteur ne s'affiche qu'au-dela d'un partenaire — a un seul choix, ce n'est
                  pas un filtre, c'est du decor. `|| userDirFilter` est un garde-fou : un clic sur
                  le compte des usagers pose un filtre, et sans le selecteur rien ne l'annulerait. */}
              <div className="flex flex-1 flex-wrap items-center gap-3">
                {(invitePartnerNames.length > 1 || userDirFilter) && (
                  <Select
                    value={userDirFilter}
                    onChange={(v) => setUserDirFilter(v)}
                    options={[
                      { value: '', label: t('admin.partners.allPartnersUsers') as string },
                      ...invitePartnerNames.map((n) => ({ value: n, label: n })),
                    ]}
                    buttonClassName="min-w-[180px] rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
                  />
                )}
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={t('admin.partners.userSearchPh') as string}
                  className="min-w-[200px] flex-1 rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
                {/* Le nombre affiche vs le total : « un filtre mord » et « il n'y a que ca » ne
                    doivent pas se ressembler. */}
                {(userDirFilter || userSearchLower) && (
                  <span className="whitespace-nowrap text-xs text-body">
                    {t('admin.partners.usersShown', { shown: shownInvites.length, total: invites.length })}
                  </span>
                )}
              </div>
              {/* Le bouton dit COMBIEN il enverra : « Inviter » seul, sur 177 lignes, est une
                  promesse trop vague pour un geste irreversible. */}
              {invitableShown.length > 0 && (
                <div className="flex shrink-0 items-center gap-2">
                  {/* « Relancer » n'apparait que s'il y a des comptes DEJA invites dans la
                      selection : relancer quelqu'un qui n'a jamais rien recu n'a pas de sens,
                      et le gabarit sobre lui dirait « votre acces n'est pas encore active »
                      alors qu'il n'a jamais ete prevenu qu'il en avait un. */}
                  {shownInvites.some((iv) => selectedUsers.has(iv.id) && iv.status === 'invited') && (
                    <button onClick={() => inviteSelected(true)} disabled={!selectedUsers.size || !!inviteProgress}
                      title={t('admin.partners.remindHint') as string}
                      className="rounded-lg border border-stroke px-4 py-2 text-sm font-semibold text-body hover:border-primary hover:text-primary disabled:opacity-40 dark:border-strokedark">
                      {t('admin.partners.remindBulk', { count: selectedUsers.size })}
                    </button>
                  )}
                  <button onClick={() => inviteSelected(false)} disabled={!selectedUsers.size || !!inviteProgress}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-40">
                    {inviteProgress
                      ? t('admin.partners.inviteBulkSending', { done: inviteProgress.done, total: inviteProgress.total })
                      : t('admin.partners.inviteBulk', { count: selectedUsers.size })}
                  </button>
                </div>
              )}
            </div>
          </div>
          {shownInvites.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">
              {t(userSearchLower ? 'admin.partners.noUsersForSearch'
                 : userDirFilter ? 'admin.partners.noUsersForPartner'
                 : 'admin.partners.invitesEmpty')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark">
                    <th className="w-10 px-2 py-3 align-bottom">
                      {invitableShown.length > 0 && (
                        <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown}
                          title={t('admin.partners.selectAllShown') as string}
                          className="h-4 w-4 cursor-pointer accent-primary" />
                      )}
                    </th>
                    {showPartnerCol && (
                      <th className="px-4 py-3 align-bottom text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.colPartner')}</th>
                    )}
                    <th className="px-4 py-3 align-bottom text-left text-xs font-semibold uppercase tracking-wide text-body">{t('partnerPortal.fEmail')}</th>
                    <th className="px-4 py-3 align-bottom text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.colInvitation')}</th>
                    {/* Colonne d'actions COLLÉE à droite, fond opaque : David ne voyait pas les deux
                        boutons, alors qu'ils sont rendus sans condition. La seule explication tenable
                        était qu'ils sortaient du champ visible quand le tableau défile. Collée, la
                        colonne ne peut plus disparaître — c'est la convention déjà utilisée pour les
                        tableaux denses de l'app. */}
                    <th className="sticky right-0 bg-white px-4 py-3 text-right align-bottom text-xs font-semibold uppercase tracking-wide text-body dark:bg-boxdark">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {shownInvites.map((iv) => {
                    const pending = iv.status === 'invited';
                    const expired = pending && !!iv.expiresAt && new Date(iv.expiresAt) < new Date();
                    return (
                      <tr key={iv.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                        <td className="w-10 px-2 py-3">
                          {/* Pas de case sur un compte actif ou desactive : on ne propose pas un
                              geste que le serveur refusera. */}
                          {canInvite(iv) && (
                            <input type="checkbox" checked={selectedUsers.has(iv.id)}
                              onChange={() => toggleUserSelected(iv.id)}
                              className="h-4 w-4 cursor-pointer accent-primary" />
                          )}
                        </td>
                        {showPartnerCol && (
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-black dark:text-white">{iv.partnerName}</td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            <span className="max-w-[260px] truncate text-black dark:text-white" title={iv.email}>{iv.email}</span>
                            {iv.role === 'admin' && <span className="ml-2 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{t('partnerPortal.roleAdmin')}</span>}
                            {/* Repris de l'ancien portail et JAMAIS invite : sans cette pastille, la
                                ligne se lisait comme une invitation en attente qui n'existe pas.
                                Libelle court, sens complet dans l'infobulle : la version longue
                                imposait 100 px a la colonne et la faisait passer sur deux lignes. */}
                            {iv.status === 'imported' && (
                              <span className="ml-2 shrink-0 rounded-full bg-gray-2 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-500 dark:bg-meta-4"
                                title={t('admin.partners.migration.notInvitedHint') as string}>
                                {t('admin.partners.migration.notInvited')}
                              </span>
                            )}
                            {expired && <span className="ml-2 shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-danger">{t('admin.partners.inviteExpired')}</span>}
                            {iv.status === 'disabled' && <span className="ml-2 shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-danger">{t('partnerPortal.userStatus.disabled')}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <InviteCell iv={iv} pending={pending && !expired} expired={expired} />
                        </td>
                        <td className="sticky right-0 whitespace-nowrap bg-white px-4 py-3 text-right dark:bg-boxdark">
                          {/* Icones et non libelles : ce tableau tenait tout juste sans barre de
                              defilement, deux boutons textuels l'y auraient ramene. */}
                          <div className="flex items-center justify-end gap-1.5">
                            {pending && (
                              <button onClick={() => revokeInvite(iv)} disabled={revokingId === iv.id}
                                className="rounded-lg border border-stroke px-2 py-1 text-[11px] font-medium text-danger hover:border-danger disabled:opacity-50 dark:border-strokedark">
                                {t('admin.partners.revokeInvite')}
                              </button>
                            )}
                            <button
                              onClick={() => setUserStatus(iv, iv.status === 'disabled' ? 'active' : 'disabled')}
                              disabled={busyUserId === iv.id}
                              title={t(iv.status === 'disabled' ? 'partnerPortal.userMgmt.enable' : 'partnerPortal.userMgmt.disable') as string}
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-stroke disabled:opacity-50 dark:border-strokedark ${
                                iv.status === 'disabled' ? 'text-green-700 hover:border-success dark:text-success' : 'text-body hover:border-danger hover:text-danger'}`}>
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.36 6.64A9 9 0 1 1 5.64 6.64M12 2v10" />
                              </svg>
                            </button>
                            <button onClick={() => deletePartnerUser(iv)} disabled={busyUserId === iv.id}
                              title={t('partnerPortal.userMgmt.delete') as string}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-stroke text-body hover:border-danger hover:text-danger disabled:opacity-50 dark:border-strokedark">
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Categorie « Reprise » : les outils d'import a usage unique vivent ICI, et non en bas
          d'ecrans operationnels ou ils encombraient — la carte de migration s'etait meme
          retrouvee sur l'ecran Usagers en suivant la liste lors d'un deplacement anterieur.
          Visible uniquement avec `partners:migrate`, donc invisible pour tout le monde par
          defaut. */}
      {sub === 'stats' && canStats && <PartnerStats />}

      {sub === 'imports' && canMigrate && (
        <div className="flex flex-col gap-4">
          {canMigrate && (
            <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
              <h3 className="mb-1 text-sm font-semibold text-black dark:text-white">{t('admin.partners.migration.title')}</h3>
              <p className="mb-4 max-w-3xl text-xs text-body">{t('admin.partners.migration.hint')}</p>
              <input ref={migInput} type="file" accept="application/json,.json" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null; e.target.value = '';
                  setMigFile(f); setMigReport(null); setMigSimulatedFor('');
                }} />
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => migInput.current?.click()}
                  className="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">
                  {t('admin.partners.migration.pick')}
                </button>
                {migFile && <span className="text-xs text-body">{migFile.name} · {Math.round(migFile.size / 1024)} Ko</span>}
                <button onClick={() => runMigration(true)} disabled={!migFile || !!migBusy}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                  {migBusy === 'dry' ? t('admin.partners.migration.simulating') : t('admin.partners.migration.simulate')}
                </button>
                <button
                  onClick={async () => {
                    if (!await dialog.confirm(t('admin.partners.migration.applyConfirm') as string)) return;
                    runMigration(false);
                  }}
                  disabled={!migFile || !!migBusy || migSimulatedFor !== migFile.name + ':' + migFile.size}
                  title={migFile && migSimulatedFor !== migFile.name + ':' + migFile.size
                    ? (t('admin.partners.migration.needSimulation') as string) : undefined}
                  className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-green-900 hover:bg-opacity-90 disabled:opacity-40">
                  {migBusy === 'apply' ? t('admin.partners.migration.applying') : t('admin.partners.migration.apply')}
                </button>
              </div>
              {migReport && (
                <div className="mt-4 rounded-lg border border-stroke p-4 dark:border-strokedark">
                  <div className={`mb-3 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    migReport.dryRun ? 'bg-warning/15 text-warning' : 'bg-success/15 text-green-700 dark:text-success'}`}>
                    {t(migReport.dryRun ? 'admin.partners.migration.dryRunNotice' : 'admin.partners.migration.done')}
                  </div>
                  {/* OU les lignes atterrissent. Le partenaire vient du fichier, pas d'un menu — un
                      sélecteur permettrait de déposer 674 opportunités sur le mauvais partenaire.
                      Mais il doit se LIRE avant le clic : sans ça, la question se pose. */}
                  {migReport.partner && (
                    <div className="mb-3 rounded-lg bg-gray-2 px-3 py-2 text-xs dark:bg-meta-4">
                      <span className="text-body">{t('admin.partners.migration.targetPartner')} </span>
                      <span className="font-semibold text-black dark:text-white">{migReport.partner}</span>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        migReport.partnerCreated ? 'bg-primary/10 text-primary' : 'bg-success/15 text-green-700 dark:text-success'}`}>
                        {t(migReport.partnerCreated ? 'admin.partners.migration.partnerNew' : 'admin.partners.migration.partnerExisting')}
                      </span>
                      {migReport.source && <span className="ml-2 text-gray-400">· {migReport.source}</span>}
                    </div>
                  )}
                  <div className="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
                    <div className="font-semibold text-black dark:text-white">{t('admin.partners.migration.usersLine')}</div>
                    <div className="text-body">{t('admin.partners.migration.counts', {
                      created: migReport.users?.created ?? 0, already: migReport.users?.alreadyThere ?? 0,
                      refused: migReport.users?.refusedCount ?? 0 })}</div>
                    <div className="font-semibold text-black dark:text-white">{t('admin.partners.migration.oppsLine')}</div>
                    <div className="text-body">{t('admin.partners.migration.counts', {
                      created: migReport.opportunities?.created ?? 0, already: migReport.opportunities?.alreadyThere ?? 0,
                      refused: migReport.opportunities?.refusedCount ?? 0 })}</div>
                    <div className="font-semibold text-black dark:text-white">{t('admin.partners.migration.attributed')}</div>
                    <div className="text-body">{migReport.opportunities?.attributed ?? 0}</div>
                  </div>
                  {/* Les refus sont montres, jamais avales : une ligne ecartee en silence est une
                      ligne qu'on croit importee. */}
                  {[['users', migReport.users], ['opportunities', migReport.opportunities]].map(([k, sec]: any) => (
                    (sec?.refused?.length > 0) && (
                      <div key={k} className="mt-3">
                        <div className="mb-1 text-[11px] font-bold uppercase text-danger">
                          {t('admin.partners.migration.refusedTitle', { count: sec.refusedCount ?? sec.refused.length })}
                        </div>
                        <ul className="max-h-40 overflow-y-auto text-[11px] text-body">
                          {sec.refused.map((r: any, i: number) => (
                            <li key={i}>· {r.key || r.email || '?'} — {r.why}</li>
                          ))}
                        </ul>
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>
          )}
          {canMigrate && (
            <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
              <h3 className="mb-1 text-sm font-semibold text-black dark:text-white">{t('admin.partners.payoutImport.title')}</h3>
              <p className="mb-4 max-w-3xl text-xs text-body">{t('admin.partners.payoutImport.hint')}</p>
              <input ref={payInput} type="file" accept="application/json,.json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = '';
                  setPayFile(f); setPayReport(null); setPaySimulatedFor(''); }} />
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => payInput.current?.click()}
                  className="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">
                  {t('admin.partners.migration.pick')}
                </button>
                {payFile && <span className="text-xs text-body">{payFile.name} · {Math.round(payFile.size / 1024)} Ko</span>}
                <button onClick={() => runPayoutImport(true)} disabled={!payFile || !!payBusy}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                  {payBusy === 'dry' ? t('admin.partners.migration.simulating') : t('admin.partners.migration.simulate')}
                </button>
                <button
                  onClick={async () => {
                    if (!await dialog.confirm(t('admin.partners.payoutImport.applyConfirm') as string)) return;
                    runPayoutImport(false);
                  }}
                  disabled={!payFile || !!payBusy || paySimulatedFor !== payFile.name + ':' + payFile.size}
                  title={payFile && paySimulatedFor !== payFile.name + ':' + payFile.size
                    ? (t('admin.partners.migration.needSimulation') as string) : undefined}
                  className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-green-900 hover:bg-opacity-90 disabled:opacity-40">
                  {payBusy === 'apply' ? t('admin.partners.migration.applying') : t('admin.partners.migration.apply')}
                </button>
              </div>
              {payReport && (
                <div className="mt-4 rounded-lg border border-stroke p-4 dark:border-strokedark">
                  <div className={`mb-3 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    payReport.dryRun ? 'bg-warning/15 text-warning' : 'bg-success/15 text-green-700 dark:text-success'}`}>
                    {t(payReport.dryRun ? 'admin.partners.migration.dryRunNotice' : 'admin.partners.migration.done')}
                  </div>
                  <div className="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
                    <div className="font-semibold text-black dark:text-white">{t('admin.partners.payoutImport.settled')}</div>
                    <div className="text-body">{payReport.markedPaid ?? 0}</div>
                    <div className="font-semibold text-black dark:text-white">{t('admin.partners.payoutImport.due')}</div>
                    <div className="text-body">{payReport.markedDue ?? 0}</div>
                    <div className="font-semibold text-black dark:text-white">{t('admin.partners.payoutImport.unchanged')}</div>
                    <div className="text-body">{payReport.unchanged ?? 0}</div>
                  </div>
                  {/* Chaque catégorie non traitée est nommée avec son compte EXACT : une ligne
                      écartée en silence est une ligne qu'on croit reprise. */}
                  {/* Deux niveaux que la couleur doit distinguer : ROUGE = la ligne n'a PAS été
                      reprise ; ORANGE = elle l'a été, mais un point mérite un œil. */}
                  {([
                    ['settledWithoutInvoice', 'admin.partners.payoutImport.settledWithoutInvoice'],
                    ['notMatched',            'admin.partners.payoutImport.notMatched'],
                    ['ambiguous',             'admin.partners.payoutImport.ambiguous'],
                    ['wouldNotBeEligible',    'admin.partners.payoutImport.wouldNotBeEligible'],
                  ] as const).map(([key, label]) => (
                    (payReport[key + 'Count'] > 0) && (
                      <div key={key} className="mt-3">
                        <div className={`mb-1 text-[11px] font-bold uppercase ${
                          key === 'notMatched' || key === 'ambiguous' ? 'text-danger' : 'text-warning'}`}>
                          {t(label, { count: payReport[key + 'Count'] })}
                        </div>
                        <ul className="max-h-40 overflow-y-auto text-[11px] text-body">
                          {(payReport[key] || []).map((x: any, i: number) => (
                            <li key={i}>· {x.invoice || '?'} — {x.account || x.customer || ''}{x.invoiceStatus ? ` (facture ${x.invoiceStatus})` : ''}</li>
                          ))}
                        </ul>
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Historique. Seules les reprises APPLIQUEES y figurent : une simulation ne change rien,
              l'y inscrire ferait croire a une reprise qui n'a pas eu lieu. */}
          <div className="rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark">
            <h3 className="mb-1 text-sm font-semibold text-black dark:text-white">{t('admin.partners.importHistory.title')}</h3>
            <p className="mb-4 max-w-3xl text-xs text-body">{t('admin.partners.importHistory.hint')}</p>
            {dataImports.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">{t('admin.partners.importHistory.empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stroke dark:border-strokedark">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.partners.importHistory.colWhen')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.partners.importHistory.colKind')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.partners.importHistory.colResult')}</th>
                      <th className="w-full px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.partners.importHistory.colWho')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataImports.map((imp) => {
                      const r = imp.report || {};
                      // Un resume par type : les deux reprises ne comptent pas les memes choses.
                      const resume = imp.kind === 'portal-migration'
                        ? t('admin.partners.importHistory.sumMigration', {
                            users: r.users?.created ?? 0, opps: r.opportunities?.created ?? 0 })
                        : t('admin.partners.importHistory.sumPayouts', {
                            settled: r.markedPaid ?? 0, due: r.markedDue ?? 0 });
                      return (
                        <React.Fragment key={imp.id}>
                          <tr className="border-b border-stroke last:border-0 dark:border-strokedark">
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-body">
                              {new Date(imp.importedAt).toLocaleString(i18n.language, {
                                day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                imp.kind === 'portal-migration' ? 'bg-primary/10 text-primary' : 'bg-success/15 text-green-700 dark:text-success'}`}>
                                {t(`admin.partners.importHistory.kind.${imp.kind}`, { defaultValue: imp.kind })}
                              </span>
                              {imp.partnerName && <span className="ml-2 text-xs text-body">{imp.partnerName}</span>}
                            </td>
                            <td className="px-3 py-2 text-body">
                              <button onClick={() => setOpenImportId(openImportId === imp.id ? null : imp.id)}
                                className="text-left hover:text-primary hover:underline">
                                {resume} <span className="text-gray-400">· {t('admin.partners.importHistory.details')}</span>
                              </button>
                              {imp.fileName && <div className="max-w-[260px] truncate text-[11px] text-gray-400" title={imp.fileName}>{imp.fileName}</div>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="ml-auto max-w-[200px] truncate text-[11px] text-gray-400" title={imp.importedBy || undefined}>{imp.importedBy || '—'}</div>
                            </td>
                          </tr>
                          {openImportId === imp.id && (
                            <tr className="border-b border-stroke dark:border-strokedark">
                              {/* Le rapport COMPLET, tel qu'il a ete produit — y compris les lignes
                                  ecartees, qui sont justement ce qu'on cherche des semaines plus tard. */}
                              <td colSpan={4} className="bg-gray-2 px-3 py-3 dark:bg-meta-4">
                                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-tight text-body">
                                  {JSON.stringify(imp.report, null, 1)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {sub === 'queue' && (
        <div className="flex flex-col gap-4">
          {/* Status tiles double as the filter — clicking one both shows its count and narrows
              the table, so the "dashboard" framing and the filter are the same control. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3.5 text-left transition ${
                  statusFilter === s
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : 'border-stroke bg-white hover:border-primary/40 dark:border-strokedark dark:bg-boxdark'
                }`}>
                <span className="text-2xl font-bold text-black dark:text-white">{queueStats[s]}</span>
                <span className="text-xs font-medium text-body">{s === 'all' ? t('common.all') : t(`partnerPortal.status.${s}`)}</span>
              </button>
            ))}
          </div>
          {/* Barre de filtres en carte pleine largeur : selecteurs a gauche, recherche qui
              s'etire. Le filtre partenaire n'apparait que s'il y a plus d'un partenaire dans la
              file — un selecteur a un seul choix n'est pas un filtre, c'est du decor. */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stroke bg-white p-3 shadow-default dark:border-strokedark dark:bg-boxdark">
            {partnerNames.length > 1 && (
              <Select
                value={partnerFilter}
                onChange={(v) => setPartnerFilter(v)}
                options={[
                  { value: '', label: t('admin.partners.queue.allPartners') as string },
                  ...partnerNames.map((n) => ({ value: n, label: n })),
                ]}
                buttonClassName="w-full min-w-[200px] rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white sm:w-auto"
              />
            )}
            {/* Representant Cluster : ne s'affiche que s'il y a de quoi distinguer. « Sans
                representant » est propose seulement s'il existe de telles lignes. */}
            {(clusterRepNames.length > 1 || (clusterRepNames.length === 1 && sansRepCount > 0)) && (
              <Select
                value={clusterRepFilter}
                onChange={(v) => setClusterRepFilter(v)}
                options={[
                  { value: '', label: t('admin.partners.queue.allClusterReps') as string },
                  ...clusterRepNames.map((n) => ({ value: n, label: n })),
                  ...(sansRepCount ? [{ value: SANS_REP, label: `${t('admin.partners.queue.noClusterRep')} (${sansRepCount})` }] : []),
                ]}
                buttonClassName="w-full min-w-[190px] rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white sm:w-auto"
              />
            )}
            {payoutStates.length > 1 && (
              <Select
                value={payoutFilter}
                onChange={(v) => setPayoutFilter(v)}
                options={[
                  { value: '', label: t('admin.partners.queue.allPayouts') as string },
                  ...payoutStates.map((st) => ({ value: st, label: t(`admin.partners.payout.status.${st}`) as string })),
                ]}
                buttonClassName="w-full min-w-[170px] rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white sm:w-auto"
              />
            )}
            <input value={queueSearch} onChange={(e) => setQueueSearch(e.target.value)}
              placeholder={t('admin.partners.searchPh') as string}
              className="min-w-[200px] flex-1 rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
            {/* Combien on voit sur combien, et de quoi tout relacher d'un geste : une liste courte
                doit dire si c'est un filtre qui mord ou s'il n'y a vraiment rien. */}
            {(partnerFilter || clusterRepFilter || payoutFilter || searchLower) && (
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-xs text-body">
                  {t('admin.partners.queue.shown', { shown: queueTotal, total: queueInView.length })}
                </span>
                <button type="button"
                  onClick={() => { setPartnerFilter(''); setClusterRepFilter(''); setPayoutFilter(''); setQueueSearch(''); }}
                  className="whitespace-nowrap rounded-lg border border-stroke px-3 py-2 text-xs font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">
                  {t('admin.partners.queue.resetFilters')}
                </button>
              </div>
            )}
          </div>
          <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            {loadingQueue ? (
              <div className="flex h-24 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
            ) : opportunities.length === 0 ? (
              <div className="p-8 text-center text-sm text-body">{t('admin.partners.noOpportunities')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-stroke dark:border-strokedark">
                      {cols.map((c) => (
                        // whitespace-nowrap : « Doublons Zoho » etait le SEUL libelle a passer sur deux
                        // lignes, ce qui suffisait a faire paraitre toute la rangee d'en-tetes de
                        // travers. Mesure : ca ne ramene PAS la barre de defilement horizontale (la
                        // colonne « Soumis le » en w-full absorbe le supplement).
                        <th key={c} className={`whitespace-nowrap px-3 py-2.5 align-bottom text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${
                          c === 'submitted' ? 'w-full text-right' : 'text-left'
                        }`}>
                          {c === 'submitted' ? (
                            <button type="button" onClick={() => setDateSort((d) => (d === 'desc' ? 'asc' : 'desc'))}
                              title={t('partnerPortal.sortByDate') as string}
                              className="inline-flex items-center gap-1 font-semibold uppercase hover:text-primary">
                              {/* Le chevron AVANT le libelle, contrairement a l'usage. Colonne alignee a
                                  droite : place apres, c'est LUI qui touchait le bord, et le mot finissait
                                  16 px avant la date d'en dessous. L'oeil aligne des mots, pas des boites. */}
                              <svg className={`h-3 w-3 transition-transform ${dateSort === 'asc' ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                              {COL_LABEL[c]}
                            </button>
                          ) : COL_LABEL[c]}
                        </th>
                      ))}
                      {/* px-4 comme la CELLULE juste en dessous : avec px-3 ici et px-4 en bas, le libelle
                          « Actions » depassait les boutons de 4 px vers la droite. Mesure. */}
                      <th className="sticky right-0 bg-white px-4 py-2.5 text-right align-bottom text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-boxdark dark:text-gray-400">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.map((o) => (
                      <tr key={o.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                        {cols.map((c) => (
                          <td key={c} className={`px-3 py-2 align-top ${c === 'submitted' ? 'text-right' : ''}`}>
                            {renderQueueCell(o, c)}
                          </td>
                        ))}
                        <td className="sticky right-0 bg-white px-4 py-3 text-right dark:bg-boxdark">
                          <div className="flex items-center justify-end gap-1.5">
                            {o.status === 'pending' ? (
                              <>
                                <button onClick={() => approve(o)} disabled={reviewing}
                                  className="rounded-md border border-success/40 px-2 py-1 text-[11px] font-medium text-green-700 hover:bg-success/10 disabled:opacity-60 dark:text-success">
                                  {t('admin.partners.approve')}
                                </button>
                                <button onClick={() => { setRejecting(o); setRejectReason(''); }} disabled={reviewing}
                                  className="rounded-md border border-danger/40 px-2 py-1 text-[11px] font-medium text-danger hover:bg-danger/10 disabled:opacity-60">
                                  {t('admin.partners.reject')}
                                </button>
                              </>
                            ) : null}
                            <button onClick={() => deleteOpportunity(o)} disabled={deletingId === o.id}
                              title={t('common.delete') as string}
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-stroke text-body hover:border-danger hover:text-danger disabled:opacity-60 dark:border-strokedark">
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Pagination cote client : la file entiere est deja chargee (les compteurs des quatre
                cartes en dependent), on ne fait que decouper l'affichage. La recherche porte donc
                sur TOUT, pas seulement sur la page visible — l'inverse serait un piege.
                ⚠️ Plafond de cette approche : quelques milliers de lignes. Au-dela il faudra
                paginer cote serveur, et deplacer la recherche avec. */}
            {queueTotal > QUEUE_PAGE_SIZE && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stroke px-4 py-3 dark:border-strokedark">
                <span className="text-xs text-body">
                  {t('admin.partners.queue.pageInfo', {
                    from: page * QUEUE_PAGE_SIZE + 1,
                    to: Math.min((page + 1) * QUEUE_PAGE_SIZE, queueTotal),
                    total: queueTotal,
                  })}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((n) => Math.max(0, n - 1))} disabled={page === 0}
                    className="rounded-md border border-stroke px-3 py-1 text-xs font-medium text-body hover:border-primary hover:text-primary disabled:opacity-40 dark:border-strokedark">
                    {t('admin.partners.queue.prev')}
                  </button>
                  <button onClick={() => setPage((n) => n + 1)}
                    disabled={(page + 1) * QUEUE_PAGE_SIZE >= queueTotal}
                    className="rounded-md border border-stroke px-3 py-1 text-xs font-medium text-body hover:border-primary hover:text-primary disabled:opacity-40 dark:border-strokedark">
                    {t('admin.partners.queue.next')}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {sub === 'payouts' && (
        <div className="flex flex-col gap-6">
          {loadingPayouts ? (
            <div className="flex h-24 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : (
            <>
              <div>
                <h3 className="mb-3 text-sm font-bold text-black dark:text-white">{t('admin.partners.payout.pendingTitle')}</h3>
                {pendingPartners.length === 0 ? (
                  <div className="rounded-sm border border-stroke bg-white p-6 text-center text-sm text-body dark:border-strokedark dark:bg-boxdark">
                    {t('admin.partners.payout.noPending')}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {pendingPartners.map((p) => (
                      // Cle sur (partenaire, type) : le meme partenaire apparait deux fois quand il
                      // a de l'initial ET de la conversion en attente.
                      <div key={`${p.partnerId}:${p.kind}`} className="rounded-lg border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
                        <div className="flex items-center justify-between gap-3 p-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-black dark:text-white">{p.partnerName}</span>
                            </div>
                            <div className="text-xs text-gray-400">{t('admin.partners.payout.opportunityCount', { count: p.opportunities.length })}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            {p.payoutRate === null ? (
                              <span className="text-xs font-medium text-warning">{t('admin.partners.payout.noRateWarning')}</span>
                            ) : (
                              <div className="text-right">
                                <div className="font-bold text-black dark:text-white">${p.suggestedAmount?.toFixed(2)}</div>
                                {/* Le calcul, pas seulement son résultat : un total qu'on ne peut pas
                                    refaire de tête ne se vérifie pas. */}
                                <div className="text-[11px] text-gray-400">
                                  {t('admin.partners.payout.calc', { count: p.opportunities.length, rate: p.payoutRate.toFixed(2) })}
                                </div>
                              </div>
                            )}
                            <button
                              onClick={() => setOpenPendingKey(openPendingKey === `${p.partnerId}:${p.kind}` ? null : `${p.partnerId}:${p.kind}`)}
                              className="whitespace-nowrap rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">
                              {openPendingKey === `${p.partnerId}:${p.kind}`
                                ? t('admin.partners.payout.hideDetail')
                                : t('admin.partners.payout.showDetail')}
                            </button>
                            <button onClick={() => openCreateRun(p)} disabled={p.payoutRate === null}
                              className="whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90 disabled:opacity-40">
                              {t('admin.partners.payout.createRun')}
                            </button>
                          </div>
                        </div>
                        {openPendingKey === `${p.partnerId}:${p.kind}` && (
                          <div className="overflow-x-auto border-t border-stroke dark:border-strokedark">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-stroke dark:border-strokedark">
                                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('partnerPortal.colBusiness')}</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.partners.payout.colCustomer')}</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.partners.payout.colWhy')}</th>
                                  <th className="w-full px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('admin.partners.payout.colAmount')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.opportunities.map((o) => (
                                  <tr key={o.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                                    <td className="px-3 py-2">
                                      <div className="max-w-[220px] truncate font-medium text-black dark:text-white" title={o.businessName}>{o.businessName}</div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="max-w-[200px] truncate text-body" title={o.linkedCustomerName || undefined}>{o.linkedCustomerName || '—'}</div>
                                    </td>
                                    <td className="px-3 py-2 text-body">
                                      {/* La justification, ou son absence dite clairement : une ligne
                                          due sans facture payée signalerait une incohérence. */}
                                      {o.invoiceNumber ? (
                                        <span className="whitespace-nowrap">
                                          {o.invoiceNumber}
                                          {o.invoicePaidDate && (
                                            <span className="text-gray-400">
                                              {' · '}{t('admin.partners.payout.paidOn', {
                                                date: new Date(o.invoicePaidDate).toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', year: '2-digit' }) })}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        <span className="whitespace-nowrap text-warning">{t('admin.partners.payout.noInvoiceWhy')}</span>
                                      )}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-body">
                                      {p.payoutRate !== null ? '$' + p.payoutRate.toFixed(2) : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold text-black dark:text-white">{t('admin.partners.payout.historyTitle')}</h3>
                {runs.length === 0 ? (
                  <div className="rounded-sm border border-stroke bg-white p-6 text-center text-sm text-body dark:border-strokedark dark:bg-boxdark">
                    {t('admin.partners.payout.noRuns')}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-stroke dark:border-strokedark">
                          <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.payout.colPartner')}</th>
                          <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.payout.colPeriod')}</th>
                          <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.payout.colOpportunities')}</th>
                          <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.payout.colAmount')}</th>
                          <th className="px-4 py-3 text-left font-semibold text-black dark:text-white">{t('admin.partners.payout.colRunStatus')}</th>
                          <th className="px-4 py-3 text-right font-semibold text-black dark:text-white">{t('common.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((r) => (
                          <tr key={r.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                            <td className="px-4 py-3 font-medium text-black dark:text-white">{r.partnerName}</td>
                            <td className="px-4 py-3 text-body">{r.periodLabel}</td>
                            <td className="px-4 py-3 text-body">{r.opportunityCount}</td>
                            <td className="px-4 py-3 text-body">${r.totalAmount.toFixed(2)}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === 'finalized' ? 'bg-success/15 text-green-700 dark:text-success' : 'bg-warning/15 text-warning'}`}>
                                {t(`admin.partners.payout.runStatus.${r.status}`)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {r.status === 'draft' && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button onClick={() => finalizeRun(r)} disabled={runningActionId === r.id}
                                    className="rounded-md border border-success/40 px-2 py-1 text-[11px] font-medium text-green-700 hover:bg-success/10 disabled:opacity-60 dark:text-success">
                                    {t('admin.partners.payout.finalize')}
                                  </button>
                                  <button onClick={() => cancelRun(r)} disabled={runningActionId === r.id}
                                    className="rounded-md border border-stroke px-2 py-1 text-[11px] font-medium text-body hover:border-danger hover:text-danger disabled:opacity-60 dark:border-strokedark">
                                    {t('admin.partners.payout.cancel')}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </>
          )}
        </div>
      )}

      {creatingRunFor && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreatingRunFor(null); }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.payout.createRunFor', { name: creatingRunFor.partnerName })}</span>
              <button onClick={() => setCreatingRunFor(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.payout.fPeriod')}</label>
                <input value={runPeriod} onChange={(e) => setRunPeriod(e.target.value)}
                  placeholder={t('admin.partners.payout.fPeriodPh') as string} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.payout.fAmount')}</label>
                <input value={runAmount} onChange={(e) => setRunAmount(e.target.value)} type="number" min="0" step="0.01" className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.payout.fOpportunities', { count: runSelectedIds.size })}</label>
                <div className="flex flex-col gap-1 rounded-lg border border-stroke p-2 dark:border-strokedark">
                  {creatingRunFor.opportunities.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-1 dark:hover:bg-meta-4">
                      <input type="checkbox" checked={runSelectedIds.has(o.id)} onChange={() => toggleRunSelected(o.id)} />
                      <span className="text-black dark:text-white">{o.businessName}</span>
                      <span className="text-xs text-gray-400">— {o.linkedCustomerName}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={submitCreateRun} disabled={savingRun || !runPeriod.trim() || !runSelectedIds.size}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                {savingRun ? t('common.saving') : t('admin.partners.payout.createRun')}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingMatches && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setViewingMatches(null); }}>
          <div className="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.crm.matchesFor', { name: viewingMatches.businessName })}</span>
              <button onClick={() => setViewingMatches(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mb-4 text-xs text-body">{t('admin.partners.crm.matchesHint')}</p>
            <div className="flex flex-col gap-2">
              {viewingMatches.crmMatchRecords.map((m) => {
                const CardTag = m.crmUrl ? 'a' : 'div';
                return (
                  <CardTag key={`${m.module}:${m.id}`}
                    {...(m.crmUrl ? { href: m.crmUrl, target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className={`rounded-lg border border-stroke p-3 dark:border-strokedark ${m.crmUrl ? 'block transition hover:border-primary hover:bg-gray-1 dark:hover:bg-meta-4' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-black dark:text-white">{m.name}</span>
                      <span className="rounded-full bg-gray-2 px-2 py-0.5 text-[11px] font-semibold text-gray-500 dark:bg-meta-4">{m.module}</span>
                    </div>
                    {m.company && m.company !== m.name && (
                      <div className="mt-0.5 text-xs font-medium text-body">{m.company}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-body">
                      {m.phone && <span>📞 {m.phone}</span>}
                      {m.email && <span>✉ {m.email}</span>}
                      {m.city && <span>📍 {m.city}</span>}
                    </div>
                    {m.crmUrl && (
                      <div className="mt-1.5 text-xs font-medium text-primary">{t('admin.partners.crm.viewInCrm')} →</div>
                    )}
                  </CardTag>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {linkingFor && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setLinkingFor(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.payout.linkFor', { name: linkingFor.businessName })}</span>
              <button onClick={() => setLinkingFor(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="mb-3 text-xs text-body">{t('admin.partners.payout.linkHint')}</p>
            <input value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} autoFocus
              placeholder={t('admin.partners.payout.linkSearchPh') as string} className={inputCls} />
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-stroke dark:border-strokedark">
              {linkSearching ? (
                <div className="p-3 text-center text-xs text-body">{t('common.loading')}</div>
              ) : linkResults.length === 0 ? (
                <div className="p-3 text-center text-xs text-gray-400">
                  {linkQuery.trim().length < 2 ? t('admin.partners.payout.linkSearchHint') : t('admin.partners.payout.linkNoResults')}
                </div>
              ) : (
                linkResults.map((name) => (
                  <button key={name} onClick={() => saveLink(name)} disabled={savingLink}
                    className="block w-full px-3 py-2 text-left text-sm text-black hover:bg-gray-1 disabled:opacity-60 dark:text-white dark:hover:bg-meta-4">
                    {name}
                  </button>
                ))
              )}
            </div>
            {linkingFor.linkedCustomerName && (
              <button onClick={() => saveLink(null)} disabled={savingLink}
                className="mt-3 text-xs font-medium text-danger hover:underline disabled:opacity-60">
                {t('admin.partners.payout.unlink')}
              </button>
            )}
          </div>
        </div>
      )}

      {editingPartner && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditingPartner(null); }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.editPartnerFor', { name: editingPartner.name })}</span>
              <button onClick={() => setEditingPartner(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveEdit} className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.fName')}</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.fLeadSource')}</label>
                <input value={editForm.leadSource} onChange={(e) => setEditForm({ ...editForm, leadSource: e.target.value })}
                  placeholder={t('admin.partners.leadSourcePh') as string} className={inputCls} />
                <p className="mt-1 text-xs text-gray-400">{t('admin.partners.leadSourceHint')}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.logoLabel')}</label>
                {editingPartner.hasLogo ? (
                  <div className="flex items-center gap-3">
                    <img src={`${API_URL}/api/partner-portal/organization/logo/${editingPartner.id}?v=${logoV}`}
                      alt={editingPartner.name}
                      className="h-10 w-auto max-w-[140px] rounded border border-stroke bg-white object-contain p-1 dark:border-strokedark" />
                    <button type="button" onClick={() => pickLogo(editingPartner)} disabled={logoBusy === editingPartner.id}
                      className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-primary hover:text-primary disabled:opacity-50 dark:border-strokedark">
                      {logoBusy === editingPartner.id ? t('admin.partners.logoUploading') : t('admin.partners.logoReplace')}
                    </button>
                    <button type="button" onClick={() => removeLogo(editingPartner)} disabled={logoBusy === editingPartner.id}
                      className="text-xs font-medium text-danger hover:opacity-70 disabled:opacity-50">
                      {t('admin.partners.logoRemove')}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => pickLogo(editingPartner)} disabled={logoBusy === editingPartner.id}
                    className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-primary hover:text-primary disabled:opacity-50 dark:border-strokedark">
                    {logoBusy === editingPartner.id ? t('admin.partners.logoUploading') : t('admin.partners.logoAdd')}
                  </button>
                )}
              </div>
              {/* UN SEUL montant : le versement du par affaire conclue. Le second champ, ajoute puis
                  retire le 2026-08-06, promettait un versement a l'approbation que David ne veut pas. */}
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.fPayoutRate')}</label>
                {/* Inscription libre — encadre a part : c'est le seul reglage de cette fiche qui
                    ouvre une porte vers l'exterieur, il ne doit pas se confondre avec les taux. */}
                <div className="sm:col-span-2 rounded-lg border border-stroke p-4 dark:border-strokedark">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-black dark:text-white">{t('admin.partners.join.title')}</div>
                      <div className="mt-0.5 text-xs text-body">{t('admin.partners.join.hint')}</div>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={editForm.joinEnabled}
                        onChange={(e) => setEditForm({ ...editForm, joinEnabled: e.target.checked })}
                        className="h-4 w-4 cursor-pointer accent-primary" />
                      <span className="text-sm text-black dark:text-white">{t('admin.partners.join.enabled')}</span>
                    </label>
                  </div>

                  <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.join.domains')}</label>
                  <input value={editForm.joinEmailDomains}
                    onChange={(e) => setEditForm({ ...editForm, joinEmailDomains: e.target.value })}
                    placeholder="moneris.com"
                    className="w-full rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
                  {/* Dit la consequence, pas la regle : sans domaine, rien ne s'ouvre. */}
                  <p className={`mt-1 text-xs ${editForm.joinEnabled && !editForm.joinEmailDomains.trim() ? 'text-danger' : 'text-body'}`}>
                    {editForm.joinEnabled && !editForm.joinEmailDomains.trim()
                      ? t('admin.partners.join.domainsRequired')
                      : t('admin.partners.join.domainsHint')}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {joinCode ? (
                      <button type="button"
                        onClick={() => { navigator.clipboard?.writeText(joinCode); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1500); }}
                        title={t('admin.partners.join.copy') as string}
                        className="rounded-lg border border-stroke px-3 py-2 font-mono text-sm tracking-widest text-black hover:border-primary dark:border-strokedark dark:text-white">
                        {joinCode}
                      </button>
                    ) : <span className="text-xs text-gray-400">{t('admin.partners.join.none')}</span>}
                    {codeCopied && <span className="text-xs text-green-700 dark:text-success">{t('admin.partners.join.copied')}</span>}
                    <button type="button" onClick={rotateJoinCode} disabled={rotating}
                      className="rounded-lg border border-stroke px-3 py-2 text-xs font-medium text-body hover:border-primary hover:text-primary disabled:opacity-50 dark:border-strokedark">
                      {rotating ? '…' : t(joinCode ? 'admin.partners.join.rotate' : 'admin.partners.join.generate')}
                    </button>
                  </div>
                  {joinCode && (
                    <p className="mt-2 break-all text-xs text-body">
                      {t('admin.partners.join.linkHint')} <span className="font-mono">/partner-portal/signup?code={joinCode}</span>
                    </p>
                  )}
                </div>

                <input value={editForm.payoutRate} onChange={(e) => setEditForm({ ...editForm, payoutRate: e.target.value })}
                  type="number" min="0" step="0.01" placeholder={t('admin.partners.payoutRatePh') as string} className={inputCls} />
                <p className="mt-1 text-xs text-gray-400">{t('admin.partners.payoutRateHint')}</p>
              </div>
              <div className="rounded-lg border border-stroke p-3 dark:border-strokedark">
                <div className="mb-2 text-xs font-semibold text-black dark:text-white">{t('admin.partners.billingContact')}</div>
                <div className="flex flex-col gap-2">
                  <input value={editForm.billingContactName} onChange={(e) => setEditForm({ ...editForm, billingContactName: e.target.value })}
                    placeholder={t('admin.partners.fContactName') as string} className={inputCls} />
                  <input value={editForm.billingContactEmail} onChange={(e) => setEditForm({ ...editForm, billingContactEmail: e.target.value })}
                    type="email" placeholder={t('admin.partners.fContactEmail') as string} className={inputCls} />
                  <input value={editForm.billingContactPhone} onChange={(e) => setEditForm({ ...editForm, billingContactPhone: e.target.value })}
                    placeholder={t('admin.partners.fContactPhone') as string} className={inputCls} />
                </div>
              </div>
              <div className="rounded-lg border border-stroke p-3 dark:border-strokedark">
                <div className="mb-2 text-xs font-semibold text-black dark:text-white">{t('admin.partners.businessContact')}</div>
                <div className="flex flex-col gap-2">
                  <input value={editForm.businessContactName} onChange={(e) => setEditForm({ ...editForm, businessContactName: e.target.value })}
                    placeholder={t('admin.partners.fContactName') as string} className={inputCls} />
                  <input value={editForm.businessContactEmail} onChange={(e) => setEditForm({ ...editForm, businessContactEmail: e.target.value })}
                    type="email" placeholder={t('admin.partners.fContactEmail') as string} className={inputCls} />
                  <input value={editForm.businessContactPhone} onChange={(e) => setEditForm({ ...editForm, businessContactPhone: e.target.value })}
                    placeholder={t('admin.partners.fContactPhone') as string} className={inputCls} />
                </div>
              </div>
              <button type="submit" disabled={savingEdit}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                {savingEdit ? t('common.saving') : t('common.save')}
              </button>
            </form>
          </div>
        </div>
      )}

      {approving && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setApproving(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.approveFor', { name: approving.businessName })}</span>
              <button onClick={() => setApproving(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {approving.crmMatchStatus === 'match_found' && (
              <p className="mb-4 rounded-lg bg-warning/10 p-3 text-xs text-warning">
                {t('admin.partners.crm.duplicateConfirm', { name: approving.businessName, summary: approving.crmMatchSummary || '' })}
              </p>
            )}
            <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.assignRep')}</label>
            <Select value={selectedRepId} onChange={(v) => setSelectedRepId(v)} disabled={loadingReps} options={[{ value: '', label: t('admin.partners.assignRepNone') as string }, ...crmReps.map((rep) => ({ value: String(rep.id), label: `${rep.name}${rep.email ? ` · ${rep.email}` : ''}` }))]} buttonClassName={`${inputCls} mb-1`} />
            <p className="mb-4 text-xs text-gray-400">{loadingReps ? t('admin.partners.loadingReps') : t('admin.partners.assignRepHint')}</p>
            <button onClick={confirmApprove} disabled={reviewing}
              className="w-full rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
              {t('admin.partners.approve')}
            </button>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setRejecting(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.rejectFor', { name: rejecting.businessName })}</span>
              <button onClick={() => setRejecting(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3}
              placeholder={t('admin.partners.rejectReasonPh') as string} className={`${inputCls} mb-4`} />
            <button onClick={() => setStatus(rejecting, 'rejected', rejectReason.trim() || undefined)} disabled={reviewing}
              className="w-full rounded-lg bg-danger px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
              {t('admin.partners.reject')}
            </button>
          </div>
        </div>
      )}

      {inviteFor && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setInviteFor(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-stroke bg-white p-6 dark:border-strokedark dark:bg-boxdark">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-bold text-black dark:text-white">{t('admin.partners.inviteAdminFor', { name: inviteFor.name })}</span>
              <button onClick={() => setInviteFor(null)} className="flex h-8 w-8 items-center justify-center rounded-full border border-stroke text-gray-500 dark:border-strokedark">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={sendInvite} className="flex flex-col gap-3">
              <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" required
                placeholder={t('partnerPortal.fEmail') as string} className={inputCls} />
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder={t('partnerPortal.fName') as string} className={inputCls} />
              <Select
                value={inviteLocale}
                onChange={(v) => setInviteLocale(v as 'fr' | 'en')}
                options={[
                  { value: 'fr', label: t('partnerPortal.localeFr') as string },
                  { value: 'en', label: t('partnerPortal.localeEn') as string },
                ]}
                aria-label={t('partnerPortal.inviteLocaleHint') as string}
              />
              <button type="submit" disabled={inviting}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
                {inviting ? t('partnerPortal.inviting') : t('partnerPortal.invite')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
    </>
  );
};

export default PartnersAdmin;
