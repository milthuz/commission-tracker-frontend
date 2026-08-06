import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Select from '../../components/Select';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface Partner {
  id: number; name: string; active: boolean; createdAt: string; hasLogo: boolean; userCount: number;
  leadSource: string | null;
  billingContactName: string | null; billingContactEmail: string | null; billingContactPhone: string | null;
  businessContactName: string | null; businessContactEmail: string | null; businessContactPhone: string | null;
  payoutRate: number | null;
  initialPayoutRate: number | null;
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
  crmDepositDate: string | null;
  crmDealStage: string | null;
  crmDealLookup: 'ambiguous' | 'not_found' | null;
}
interface PendingPartnerPayout {
  partnerId: number; partnerName: string; payoutRate: number | null; suggestedAmount: number | null;
  // Un partenaire peut avoir DEUX groupes en attente : l'initial (dû pour le lead) et la
  // conversion. Ils ne se payent pas ensemble, donc un run porte un seul type.
  kind: 'initial' | 'conversion';
  opportunities: { id: number; businessName: string; linkedCustomerName: string | null; createdAt: string }[];
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

const PartnersAdmin: React.FC<{ canDelete?: boolean; canMigrate?: boolean }> = ({ canDelete, canMigrate }) => {
  const { t, i18n } = useTranslation();
  // Landing on this page is the Opportunity Queue "dashboard" (user request 2026-07-2x) — Manage
  // Partners is reached either via the in-page tab or the Sidebar's "Manage Partners" submenu
  // item, which links here with ?view=manage.
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subFromParams = (): 'partners' | 'payouts' | 'queue' => {
    const v = searchParams.get('view');
    if (v === 'manage') return 'partners';
    if (v === 'payouts') return 'payouts';
    return 'queue';
  };
  const [sub, setSub] = useState<'partners' | 'payouts' | 'queue'>(subFromParams());
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
  const userDirRef = useRef<HTMLDivElement>(null);
  const showPartnerUsers = (name: string) => {
    setUserDirFilter(name);
    // Le clic doit AMENER a la liste : filtrer une carte qu'on ne voit pas ne se remarque pas.
    setTimeout(() => userDirRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  useEffect(() => {
    axios.get(`${API_URL}/api/admin/partner-invites`, { headers: authHeaders() })
      .then((r) => setInvites(r.data.invites || []))
      .catch(() => {});
  }, []);
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
  // Un tiret plutot qu'une case vide : « rien ne s'est produit » et « la colonne ne
  // s'applique pas » ne doivent pas se ressembler.
  const Step = ({ at, pending }: { at: string | null; pending?: boolean }) =>
    at ? <span className="text-black dark:text-white">{fmtDate(at)}</span>
       : <span className={pending ? 'text-warning' : 'text-gray-400'}>{pending ? t('admin.partners.invitePending') : '—'}</span>;

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
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (p: Partner) => {
    setEditingPartner(p);
    setEditForm({
      name: p.name, leadSource: p.leadSource || '', payoutRate: p.payoutRate !== null ? String(p.payoutRate) : '',
      initialPayoutRate: p.initialPayoutRate !== null ? String(p.initialPayoutRate) : '',
      billingContactName: p.billingContactName || '', billingContactEmail: p.billingContactEmail || '', billingContactPhone: p.billingContactPhone || '',
      businessContactName: p.businessContactName || '', businessContactEmail: p.businessContactEmail || '', businessContactPhone: p.businessContactPhone || '',
    });
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
  const [dateSort, setDateSort] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(0);
  const QUEUE_PAGE_SIZE = 50;
  const partnerNames = [...new Set(allOpportunities.map((o) => o.partnerName))].sort((a, b) => a.localeCompare(b));
  // Nom -> fiche partenaire, pour afficher le logo quand il y en a un (convention du projet :
  // le logo seul s'il existe, le nom sinon).
  const partnerByName = new Map(partners.map((p) => [p.name, p]));

  // Partenaires reellement presents dans la liste des usagers, et lignes affichees.
  const invitePartnerNames = [...new Set(invites.map((i) => i.partnerName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const shownInvites = userDirFilter ? invites.filter((i) => i.partnerName === userDirFilter) : invites;

  const searchLower = queueSearch.trim().toLowerCase();
  const filteredQueue = allOpportunities
    .filter((o) =>
      (statusFilter === 'all' || o.status === statusFilter)
      && (!partnerFilter || o.partnerName === partnerFilter)
      && (!searchLower || o.businessName.toLowerCase().includes(searchLower) || o.partnerName.toLowerCase().includes(searchLower))
    )
    // `filter` a deja produit un nouveau tableau, donc trier en place ne touche pas l'etat.
    .sort((a, b) => (dateSort === 'desc' ? 1 : -1) * (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  const queueTotal = filteredQueue.length;
  const opportunities = filteredQueue.slice(page * QUEUE_PAGE_SIZE, (page + 1) * QUEUE_PAGE_SIZE);
  // Changer de filtre en etant page 3 laissait un tableau vide sans explication.
  useEffect(() => { setPage(0); }, [statusFilter, queueSearch, partnerFilter]);

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
  const dupFieldLabel = (f: string) => t(`admin.partners.queue.on.${f}`) as string;
  const renderQueueCell = (o: Opportunity, c: string) => {
    switch (c) {
      case 'partner': {
        // Convention du projet : le logo SEUL quand il existe, le nom sinon.
        const p = partnerByName.get(o.partnerName);
        return p?.hasLogo ? (
          <img src={`${API_URL}/api/partner-portal/organization/logo/${p.id}?v=${logoV}`}
            alt={o.partnerName} title={o.partnerName}
            className="h-6 w-auto max-w-[110px] object-contain object-left" />
        ) : (
          <span className="whitespace-nowrap text-xs font-medium text-black dark:text-white">{o.partnerName}</span>
        );
      }
      case 'business': {
        const who = [o.contactFirstName, o.contactLastName].filter(Boolean).join(' ');
        const contact = [who, o.contactEmail].filter(Boolean).join(' · ');
        return (
          <div className="leading-tight">
            <div className="max-w-[210px] truncate font-medium text-black dark:text-white" title={o.businessName}>{o.businessName}</div>
            {contact && <div className="max-w-[210px] truncate text-[11px] text-gray-400" title={contact}>{contact}</div>}
            {o.submittedByEmail && (
              <div className="max-w-[210px] truncate text-[11px] text-gray-400"
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
            <div className="whitespace-nowrap text-body">{o.crmDealStage || '—'}</div>
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
                className="inline-block max-w-[140px] truncate text-[11px] text-gray-400 hover:text-primary hover:underline">
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
              <div className="ml-auto max-w-[170px] truncate text-[11px] text-gray-400"
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
      const r = await axios.post(`${API_URL}/api/admin/partner-migration`, { ...payload, dryRun },
        { headers: authHeaders() });
      setMigReport(r.data);
      if (dryRun) setMigSimulatedFor(migFile.name + ':' + migFile.size);
      else { setMigSimulatedFor(''); await fetchPartners(); await fetchQueue(); }
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
      {/* No in-page tab strip here on purpose — Opportunity Queue is this page's default view,
          and Manage Partners is reached via the Sidebar's own submenu (user request
          2026-07-2x), so a second switcher on the page itself would be redundant. */}
      {sub !== 'queue' && (
        <div className="mb-4 flex items-center gap-2 text-sm text-body">
          <button onClick={() => navigate('/admin/partners')} className="flex items-center gap-1 font-medium text-primary hover:underline">
            ← {t('admin.partners.tabs.queue')}
          </button>
          <span>/</span>
          <span className="font-semibold text-black dark:text-white">{t(sub === 'partners' ? 'admin.partners.tabs.partners' : 'admin.partners.tabs.payouts')}</span>
        </div>
      )}

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

        {/* Usagers du portail, par partenaire. Reste le suivi des invitations (envoyee -> lien
            ouvert -> compte active) : ce sont les memes lignes, vues comme un annuaire. */}
        <div ref={userDirRef} className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-black dark:text-white">{t('admin.partners.invitesTitle')}</h4>
                <p className="mt-0.5 text-xs text-body">{t('admin.partners.invitesHint')}</p>
              </div>
              {/* Selecteur affiche seulement au-dela d'un partenaire : a un seul choix, ce n'est
                  pas un filtre, c'est du decor. `|| userDirFilter` est un garde-fou : un clic sur le
                  compte pose un filtre, et sans le selecteur il n'y aurait aucun moyen de l'annuler. */}
              {(invitePartnerNames.length > 1 || userDirFilter) && (
                <div className="flex items-center gap-2">
                  <Select
                    value={userDirFilter}
                    onChange={(v) => setUserDirFilter(v)}
                    options={[
                      { value: '', label: t('admin.partners.allPartnersUsers') as string },
                      ...invitePartnerNames.map((n) => ({ value: n, label: n })),
                    ]}
                    buttonClassName="min-w-[200px] rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
                  />
                  {/* Le nombre affiche vs le total : « filtre » et « il n'y a que ca » ne doivent
                      pas se ressembler. */}
                  <span className="whitespace-nowrap text-xs text-body">
                    {t('admin.partners.usersShown', { shown: shownInvites.length, total: invites.length })}
                  </span>
                </div>
              )}
            </div>
          </div>
          {shownInvites.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">{t(userDirFilter ? 'admin.partners.noUsersForPartner' : 'admin.partners.invitesEmpty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stroke dark:border-strokedark">
                    <th className="px-4 py-3 align-bottom text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.colPartner')}</th>
                    <th className="px-4 py-3 align-bottom text-left text-xs font-semibold uppercase tracking-wide text-body">{t('partnerPortal.fEmail')}</th>
                    <th className="px-4 py-3 align-bottom text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.inviteSent')}</th>
                    <th className="px-4 py-3 align-bottom text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.inviteOpened')}</th>
                    <th className="px-4 py-3 align-bottom text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.inviteAccepted')}</th>
                    <th className="px-4 py-3 align-bottom text-left text-xs font-semibold uppercase tracking-wide text-body">{t('admin.partners.inviteBy')}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {shownInvites.map((iv) => {
                    const pending = iv.status === 'invited';
                    const expired = pending && !!iv.expiresAt && new Date(iv.expiresAt) < new Date();
                    return (
                      <tr key={iv.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-black dark:text-white">{iv.partnerName}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            <span className="max-w-[170px] truncate text-black dark:text-white" title={iv.email}>{iv.email}</span>
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
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3"><Step at={iv.invitedAt} /></td>
                        <td className="whitespace-nowrap px-4 py-3"><Step at={iv.openedAt} pending={pending && !expired} /></td>
                        <td className="whitespace-nowrap px-4 py-3"><Step at={iv.activatedAt} pending={pending && !expired} /></td>
                        <td className="px-4 py-3 text-body">
                          <div className="max-w-[150px] truncate" title={iv.invitedBy || undefined}>{iv.invitedBy || '—'}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {pending && (
                            <button onClick={() => revokeInvite(iv)} disabled={revokingId === iv.id}
                              className="rounded-lg border border-stroke px-3 py-1 text-xs font-medium text-danger hover:border-danger disabled:opacity-50 dark:border-strokedark">
                              {t('admin.partners.revokeInvite')}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
            <input value={queueSearch} onChange={(e) => setQueueSearch(e.target.value)}
              placeholder={t('admin.partners.searchPh') as string}
              className="min-w-[200px] flex-1 rounded-lg border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
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
                        <th key={c} className={`px-3 py-2.5 align-bottom text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${
                          c === 'submitted' ? 'w-full text-right' : 'text-left'
                        }`}>
                          {c === 'submitted' ? (
                            <button type="button" onClick={() => setDateSort((d) => (d === 'desc' ? 'asc' : 'desc'))}
                              title={t('partnerPortal.sortByDate') as string}
                              className="inline-flex items-center gap-1 font-semibold uppercase hover:text-primary">
                              {COL_LABEL[c]}
                              <svg className={`h-3 w-3 transition-transform ${dateSort === 'asc' ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          ) : COL_LABEL[c]}
                        </th>
                      ))}
                      <th className="sticky right-0 bg-white px-3 py-2.5 text-right align-bottom text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-boxdark dark:text-gray-400">{t('common.actions')}</th>
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
                      <div key={`${p.partnerId}:${p.kind}`} className="flex items-center justify-between gap-3 rounded-lg border border-stroke bg-white p-4 dark:border-strokedark dark:bg-boxdark">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-black dark:text-white">{p.partnerName}</span>
                            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              p.kind === 'initial' ? 'bg-primary/10 text-primary' : 'bg-success/15 text-green-700 dark:text-success'}`}>
                              {t(`admin.partners.payout.kind.${p.kind}`)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400">{t('admin.partners.payout.opportunityCount', { count: p.opportunities.length })}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          {p.payoutRate === null ? (
                            <span className="text-xs font-medium text-warning">{t('admin.partners.payout.noRateWarning')}</span>
                          ) : (
                            <span className="font-bold text-black dark:text-white">${p.suggestedAmount?.toFixed(2)}</span>
                          )}
                          <button onClick={() => openCreateRun(p)} disabled={p.payoutRate === null}
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90 disabled:opacity-40">
                            {t('admin.partners.payout.createRun')}
                          </button>
                        </div>
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
                            <td className="px-4 py-3 text-body">
                              {/* Le type doit se lire sur la ligne : un run de 50 $ ne dit pas de
                                  lui-même s'il payait des leads ou des ventes. */}
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{r.periodLabel}</span>
                                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                                  r.kind === 'initial' ? 'bg-primary/10 text-primary' : 'bg-success/15 text-green-700 dark:text-success'}`}>
                                  {t(`admin.partners.payout.kind.${r.kind}`)}
                                </span>
                              </div>
                            </td>
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
              {/* Deux montants distincts, et le libelle doit dire LEQUEL : l'initial est du pour le
                  lead meme si l'affaire ne se conclut pas, celui de conversion recompense la vente. */}
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.fInitialPayoutRate')}</label>
                <input value={editForm.initialPayoutRate} onChange={(e) => setEditForm({ ...editForm, initialPayoutRate: e.target.value })}
                  type="number" min="0" step="0.01" placeholder={t('admin.partners.payoutRatePh') as string} className={inputCls} />
                <p className="mt-1 text-xs text-gray-400">{t('admin.partners.initialPayoutRateHint')}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-body">{t('admin.partners.fPayoutRate')}</label>
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
