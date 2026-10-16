import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, CheckCircle2, Loader2, Save } from 'lucide-react';
import { useField } from './index';
import { loadFreePlace } from './freePlace';
import { Chips, Eyebrow, ScreenHeader, Segmented, StickyCta, btnPrimary, inputCls, labelCls } from './ui';
import { api, ApiError, uuid, type CheckinInput, type PlaceCard, type Service } from '../api';
import { enqueueLead, flush, type LeadInput } from './outbox';
import { dialog } from '../../../lib/dialog';

// Écran 1e — nouvelle piste, depuis le terrain. Même chemin que la saisie interne : file de
// révision, vérification des doublons Zoho, attribution. Source « opener ».
// `clientRef` est fixé à l'ouverture de l'écran : un double appui ou un renvoi après une coupure
// ne crée jamais deux pistes.
// /opener/leads/:leadId/edit (demande de Hao, 2026-10-12) : l'opener corrige SA piste tant qu'elle
// n'est pas révisée (nouvelle ou en révision). Après, elle vit dans Zoho.

const TIMELINES = ['lt1', '1to3', '3to6', 'unknown'] as const;
const BUSINESS_TYPES = ['restaurant', 'cafe', 'bar', 'bakery', 'quick_service', 'other'] as const;

export default function LeadForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { stopId, leadId } = useParams();
  const location = useLocation() as { state?: { checkin?: CheckinInput } };
  const checkin = location.state?.checkin || null;
  const { lng, route, online, markStop, demo } = useField();
  const stopOnRoute = route?.stops.find((s) => String(s.id) === stopId) || null;
  // Check-in libre (/opener/here/:placeId/lead) : le resto choisi autour, sans arrêt de route.
  const { placeId: freeId } = useParams();
  const freePlace = !stopId ? loadFreePlace(freeId) : null;
  const stop = stopOnRoute || (freePlace ? { id: null as number | null, placeId: freePlace.placeId, name: freePlace.name, address: freePlace.address } : null);
  const mark = (patch: Parameters<typeof markStop>[1]) => { if (stopOnRoute) markStop(stopOnRoute.id, patch); };
  const clientRef = useRef(uuid());
  const [card, setCard] = useState<PlaceCard | null>(null);
  const [f, setF] = useState({
    businessName: stop?.name || '', businessType: 'restaurant', phone: '', address: stop?.address || '', city: '', province: 'QC', postalCode: '',
    firstName: '', lastName: '', title: '', language: 'fr' as 'fr' | 'en', email: '',
    interest: (checkin?.services || []) as Service[], currentPos: checkin?.currentPos && !['Aucun', 'Autre'].includes(checkin.currentPos) ? checkin.currentPos : '',
    locationsCount: '', timeline: 'unknown' as (typeof TIMELINES)[number], notes: checkin?.notes || '',
  });
  const [sending, setSending] = useState(false);
  // refCode null = piste gardée sur le téléphone (pas de réseau), envoyée au retour du réseau.
  const [done, setDone] = useState<{ refCode: string | null } | null>(null);
  const [edit, setEdit] = useState<{ id: number; refCode: string; editable: boolean; website: string | null } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  // Le libellé enregistré (« Restaurant », « 1 à 3 mois »…) → la clé du formulaire, en FR ou en EN.
  const keyOf = <T extends string>(keys: readonly T[], prefix: string, label: string | null, fallback: T): T =>
    keys.find((k) => [t(`${prefix}.${k}`, { lng: 'fr' }), t(`${prefix}.${k}`, { lng: 'en' })].includes(label || '')) || fallback;
  useEffect(() => {
    if (!leadId) return;
    api<{ lead: any }>(`/api/opener/leads/${leadId}`).then(({ lead: l }) => {
      setEdit({ id: l.id, refCode: l.refCode, editable: l.editable, website: l.website });
      setF({
        businessName: l.businessName, businessType: keyOf(BUSINESS_TYPES, 'opener.field.businessType', l.businessType, 'restaurant'), phone: l.phone,
        address: l.address, city: l.city, province: l.province || 'QC', postalCode: l.postalCode, firstName: l.firstName, lastName: l.lastName,
        title: l.title, language: l.language, email: l.email, interest: l.interest, currentPos: l.currentPos,
        locationsCount: l.locationsCount === '' || l.locationsCount == null ? '' : String(l.locationsCount),
        timeline: keyOf(TIMELINES, 'opener.field.timeline', l.timeline, 'unknown'), notes: l.notes,
      });
    }).catch((e) => setEditError(e.message));
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (v: any) => setF((x) => ({ ...x, [k]: v }));

  // Préremplissage par la fiche Google (sans écraser ce que l'opener a déjà tapé).
  useEffect(() => {
    if (!stop || leadId) return;
    api<PlaceCard>(`/api/opener/place/${encodeURIComponent(stop.placeId)}?lang=${lng}`).then((c) => {
      setCard(c);
      const g = c.google;
      if (!g) return;
      setF((x) => ({
        ...x,
        businessName: x.businessName || g.name || '',
        phone: x.phone || g.phone || '',
        address: g.address ? g.address.split(',')[0] : x.address,
        city: x.city || g.city || '',
        province: g.province || x.province,
        postalCode: x.postalCode || g.postalCode || '',
      }));
    }).catch(() => {});
  }, [stop?.placeId, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (leadId && editError) return <div className="p-8 text-center text-sm text-[var(--of-bad)]"><ScreenHeader title="—" back="/opener/leads" />{editError}</div>;
  if (leadId && !edit) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!leadId && !stop) return <div className="p-8 text-center text-sm text-[var(--of-muted)]">{t('opener.field.stopNotFound')}</div>;

  const saveEdit = async () => {
    if (!edit) return;
    if (!f.businessName.trim()) { dialog.alert(t('opener.field.nameRequired')); return; }
    setSending(true);
    try {
      await api(`/api/opener/leads/${edit.id}`, { method: 'PUT', body: {
        businessName: f.businessName.trim(), businessType: t(`opener.field.businessType.${f.businessType}`), phone: f.phone,
        address: f.address, city: f.city, province: f.province, postalCode: f.postalCode, website: edit.website,
        firstName: f.firstName, lastName: f.lastName, title: f.title, language: f.language, email: f.email,
        interest: f.interest, currentPos: f.currentPos, locationsCount: f.locationsCount || null,
        timeline: f.timeline === 'unknown' ? null : t(`opener.field.timeline.${f.timeline}`), notes: f.notes,
      } });
      dialog.alert(t('opener.field.editLead.saved', { ref: edit.refCode }));
      navigate('/opener/leads', { replace: true });
    } catch (e: any) {
      dialog.alert(e?.body?.error === 'lead_locked' ? t('opener.field.editLead.locked') : e.message);
    } finally { setSending(false); }
  };

  const submit = async () => {
    if (!stop) return;
    if (!f.businessName.trim()) { dialog.alert(t('opener.field.nameRequired')); return; }
    // Démo : aucun lead créé dans Zoho ni dans la file ; un faux numéro montre l'écran de fin.
    if (demo) { mark({ outcome: 'done' }); setDone({ refCode: 'DEMO-0000' }); return; }
    const timeline = t(`opener.field.timeline.${f.timeline}`);
    const body: LeadInput = {
      clientRef: clientRef.current, placeId: stop.placeId, stopId: stop.id, checkinId: checkin?.id || null,
      businessName: f.businessName.trim(), businessType: t(`opener.field.businessType.${f.businessType}`), phone: f.phone,
      address: f.address, city: f.city, province: f.province, postalCode: f.postalCode, website: card?.google?.website || null,
      firstName: f.firstName, lastName: f.lastName, title: f.title, language: f.language, email: f.email,
      interest: f.interest, currentPos: f.currentPos, locationsCount: f.locationsCount || null,
      timeline: f.timeline === 'unknown' ? null : timeline, notes: f.notes,
    };
    // Sans réseau (audit UX, P2 — avant : « la création d'un lead demande du réseau ») : la piste
    // part dans la file du téléphone, APRÈS le check-in de la visite. Le serveur vérifie les
    // doublons à l'arrivée, et le `clientRef` empêche un double envoi.
    const keepOnPhone = () => {
      enqueueLead(body);
      flush().catch(() => {});
      mark({ outcome: 'done' });
      setDone({ refCode: null });
    };
    if (!online) { keepOnPhone(); return; }
    setSending(true);
    try {
      // Une visite faite hors ligne a peut-être encore son check-in dans la file : il part d'abord.
      await flush().catch(() => {});
      const r = await api<{ refCode: string }>('/api/opener/leads', { method: 'POST', body });
      mark({ outcome: 'done' });
      setDone({ refCode: r.refCode });
    } catch (e: any) {
      // Réseau perdu en route : on garde la piste. Refus du serveur : on le dit, rien n'est perdu.
      if (!(e instanceof ApiError) || e.status >= 500 || e.status === 408 || e.status === 429) keepOnPhone();
      else dialog.alert(t('opener.field.leadFailed', { error: e.message }));
    } finally { setSending(false); }
  };

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <CheckCircle2 className="h-14 w-14 text-[#57D193]" />
        <p className="text-lg font-bold text-[var(--of-title)]">{done.refCode ? t('opener.field.leadCreatedTitle') : t('opener.field.leadQueuedTitle')}</p>
        <p className="text-sm text-[var(--of-muted)]">{done.refCode ? t('opener.field.leadCreatedBody', { ref: done.refCode, name: f.businessName }) : t('opener.field.leadQueuedBody', { name: f.businessName })}</p>
        {done.refCode && <p className="rounded-[10px] border border-[var(--of-stroke)] bg-[var(--of-surface)] px-4 py-2 text-xl font-bold tracking-wide text-[var(--of-title)]">{done.refCode}</p>}
        <button onClick={() => navigate('/opener', { replace: true })} className={`${btnPrimary} mt-2 w-full`}>{t('opener.field.done')}</button>
      </div>
    );
  }

  const field = (label: string, el: React.ReactNode, cls = '') => <div className={cls}><label className={labelCls}>{label}</label>{el}</div>;

  return (
    <div className="pb-40">
      <ScreenHeader eyebrow={edit ? t('opener.field.editLead.eyebrow', { ref: edit.refCode }) : t('opener.field.newLead')} title={stop?.name || f.businessName} back={edit ? '/opener/leads' : undefined}
        right={<span className="rounded-full bg-[rgba(183,240,209,.12)] px-2 py-1 text-[11px] font-semibold text-[var(--of-ok)]">{t('opener.field.sourceDoor')}</span>} />
      <div className="space-y-5 px-4 pt-4">
        {edit && !edit.editable
          ? <p className="rounded-[10px] border border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.08)] p-3 text-xs text-[var(--of-bad)]">{t('opener.field.editLead.locked')}</p>
          : <p className="rounded-[10px] border border-[rgba(245,131,70,.3)] bg-[rgba(245,131,70,.08)] p-3 text-xs text-[var(--of-warn)]">{edit ? t('opener.field.editLead.notice') : t('opener.field.prefillNotice')}</p>}

        <div>
          <Eyebrow className="mb-2">{t('opener.field.section.business')}</Eyebrow>
          <div className="grid grid-cols-2 gap-3">
            {field(`${t('opener.field.f.businessName')} *`, <input className={inputCls} value={f.businessName} onChange={(e) => set('businessName')(e.target.value)} />, 'col-span-2')}
            {field(t('opener.field.f.type'), <select className={inputCls} value={f.businessType} onChange={(e) => set('businessType')(e.target.value)}>
              {BUSINESS_TYPES.map((b) => <option key={b} value={b}>{t(`opener.field.businessType.${b}`)}</option>)}</select>)}
            {field(t('opener.field.f.phone'), <input className={inputCls} type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone')(e.target.value)} />)}
            {field(t('opener.field.f.address'), <input className={inputCls} value={f.address} onChange={(e) => set('address')(e.target.value)} />, 'col-span-2')}
            {field(t('opener.field.f.city'), <input className={inputCls} value={f.city} onChange={(e) => set('city')(e.target.value)} />)}
            {field(t('opener.field.f.postalCode'), <input className={inputCls} value={f.postalCode} autoCapitalize="characters" onChange={(e) => set('postalCode')(e.target.value)} />)}
          </div>
        </div>

        <div>
          <Eyebrow className="mb-2">{t('opener.field.section.contact')}</Eyebrow>
          <div className="grid grid-cols-2 gap-3">
            {field(t('opener.field.f.firstName'), <input className={inputCls} value={f.firstName} autoComplete="off" onChange={(e) => set('firstName')(e.target.value)} />)}
            {field(t('opener.field.f.lastName'), <input className={inputCls} value={f.lastName} autoComplete="off" onChange={(e) => set('lastName')(e.target.value)} />)}
            {field(t('opener.field.f.title'), <input className={inputCls} value={f.title} placeholder={t('opener.field.f.titlePh') as string} onChange={(e) => set('title')(e.target.value)} />, 'col-span-2')}
            <div className="col-span-2">
              <label className={labelCls}>{t('opener.field.f.language')}</label>
              <Segmented options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]} value={f.language} onChange={set('language')} />
            </div>
            {field(t('opener.field.f.email'), <input className={inputCls} type="email" inputMode="email" autoCapitalize="none" value={f.email} onChange={(e) => set('email')(e.target.value)} />, 'col-span-2')}
          </div>
        </div>

        <div>
          <Eyebrow className="mb-2">{t('opener.field.section.qualification')}</Eyebrow>
          <div className="space-y-3">
            <div><label className={labelCls}>{t('opener.field.q.services')}</label>
              <Chips multi options={(['payments', 'pos', 'beverage_control'] as Service[]).map((s) => ({ value: s, label: t(`opener.serviceOf.${s}`) }))} value={f.interest} onChange={set('interest')} /></div>
            <div className="grid grid-cols-2 gap-3">
              {field(t('opener.field.f.currentPos'), <input className={inputCls} value={f.currentPos} onChange={(e) => set('currentPos')(e.target.value)} />)}
              {field(t('opener.field.f.locations'), <input className={inputCls} inputMode="numeric" value={f.locationsCount} onChange={(e) => set('locationsCount')(e.target.value.replace(/\D/g, '').slice(0, 4))} />)}
            </div>
            <div><label className={labelCls}>{t('opener.field.f.timeline')}</label>
              <Chips options={TIMELINES.map((v) => ({ value: v, label: t(`opener.field.timeline.${v}`) }))} value={f.timeline} onChange={set('timeline')} /></div>
            {field(t('opener.field.q.notes'), <textarea className={`${inputCls} h-auto min-h-[88px] py-2`} value={f.notes} onChange={(e) => set('notes')(e.target.value)} />)}
          </div>
        </div>
      </div>
      <StickyCta>
        <div className="w-full">
          {edit ? (
            <button onClick={saveEdit} disabled={sending || !edit.editable} className={`${btnPrimary} w-full`}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{t('opener.field.editLead.save')}
            </button>
          ) : (
            <>
              <button onClick={submit} disabled={sending} className={`${btnPrimary} w-full`}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{t('opener.field.createLeadCta')}
              </button>
              <p className="mt-2 text-center text-[11px] text-[var(--of-faint)]">{t('opener.field.dupNotice')}</p>
            </>
          )}
        </div>
      </StickyCta>
    </div>
  );
}
