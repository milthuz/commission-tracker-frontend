import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Check, HeartHandshake, Loader2, RotateCcw, DoorClosed, SearchX } from 'lucide-react';
import { useField } from './index';
import { Card, Chips, GpsBanner, ScreenHeader, Segmented, Stepper, StickyCta, Toggle, btnPrimary } from './ui';
import { enqueueCheckin, flush, loadDraft, saveDraft, clearDraft } from './outbox';
import { api, haversine, fmtDistance, uuid, type Service, type ServiceType, type CheckinInput, type PaymentsBy, type Version } from '../api';
import { dialog } from '../../../lib/dialog';

// Écran 1d — check-in.
// Obligatoires : POS actuel, type de service, niveau d'intérêt. Le reste est facultatif.
// Visite d'un CLIENT Cluster (2026-10-08) : on vient voir s'il est satisfait et proposer les
// paiements. La satisfaction (1 à 5) devient obligatoire, on demande qui traite ses paiements,
// et l'intérêt porte sur les paiements Cluster. Le POS est prérempli à « Cluster ».
// Le brouillon est gardé sur le téléphone ; l'envoi passe par la file (hors ligne compris).
// À plus de 150 m du restaurant : avertissement, pas un refus.
//
// Demandes de Hao (2026-10-12) :
// - « Pas de visite possible » en haut de l'écran : revenir plus tard (fin de route), fermé,
//   n'existe pas — un seul appui, rien à remplir ;
// - MODIFIER un check-in déjà envoyé (/opener/checkin/:checkinId/edit) : les réponses seulement,
//   jamais l'heure ni la position ; et l'annuler si ce n'était pas une visite ;
// - localisation absente : avertissement visible (le 11 octobre, aucune visite n'avait de GPS).

// « Autre » ouvre un champ texte : l'opener écrit le nom du POS (demande de David, 2026-10-08) ;
// c'est ce nom qui est enregistré, pas « Autre ».
const POS = ['Lightspeed', 'Square', 'Toast', 'Clover', "Maitre'D", 'Veloce', 'Auphan', 'Cluster', 'Aucun', 'Autre'];
const FAR_M = 150;
// Intérêt « faible » (1 ou 2 sur 5) : créer un lead demande une confirmation.
const LOW_INTEREST = 2;

// Position FRAÎCHE au moment d'enregistrer (pas celle gardée en mémoire par la carte, qui peut
// dater de l'arrivée dans le quartier) : c'est elle qui atteste la visite.
// Si la position précise n'arrive pas (dans un centre commercial, sous un toit), on se contente
// d'une position approximative récente plutôt que de rien.
const freshPosition = () => new Promise<GeolocationPosition | null>((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(resolve, (e) => {
    if (e.code === 1) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: false, maximumAge: 120000, timeout: 8000 });
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
});

interface Form {
  id: string; currentPos: string | null; otherPos?: string; serviceType: ServiceType | null; terminals: number; onlineDelivery: boolean;
  decisionMaker: 'yes' | 'no' | 'later' | null; interest: number; services: Service[]; notes: string; createLead: boolean;
  satisfaction?: number; paymentsBy?: PaymentsBy | null;
  // Arrivée au restaurant : l'ouverture de cet écran (heure + position). Gardée dans le brouillon.
  startedAt?: string; startLat?: number | null; startLng?: number | null; startAccuracy?: number | null;
}
// Check-in envoyé, relu pour être corrigé.
interface Saved {
  id: string; placeId: string; stopId: number | null; name: string | null; at: string; currentPos: string; serviceType: ServiceType;
  terminals: number | null; onlineDelivery: boolean | null; decisionMaker: Form['decisionMaker']; interest: number; services: Service[];
  notes: string; satisfaction: number | null; paymentsBy: PaymentsBy | null; leadId: number | null; editable: boolean; isClient: boolean;
}
// Ce qu'il faut savoir du restaurant, qu'on vienne de la route du jour ou d'un check-in relu.
interface Subject { name: string; placeId: string; stopId: number | null; isClient: boolean; version?: Version | null; lat?: number | null; lng?: number | null }

// Un écran resté ouvert plus de 3 h n'est plus une visite en cours : le chronomètre repart.
const STALE_MS = 3 * 3600 * 1000;
const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export default function CheckIn() {
  const { checkinId } = useParams();
  return checkinId ? <EditCheckIn checkinId={checkinId} /> : <NewCheckIn />;
}

// ------------------------------------------------------------------ nouveau check-in
function NewCheckIn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { stopId } = useParams();
  const { lng, route, position, accuracy, markStop, demo, reload, gps, retryGps } = useField();
  const stop = route?.stops.find((s) => String(s.id) === stopId) || null;
  const draftKey = `stop_${stopId}`;
  const [form, setForm] = useState<Form>(() => {
    const d: Form = loadDraft<Form>(draftKey) || {
      id: uuid(), currentPos: stop?.status === 'client' ? 'Cluster' : null, serviceType: null, terminals: 1, onlineDelivery: false,
      decisionMaker: null, interest: 0, services: [], notes: '', createLead: false, satisfaction: 0, paymentsBy: null,
    };
    if (!d.startedAt || Date.now() - new Date(d.startedAt).getTime() > STALE_MS) {
      return { ...d, startedAt: new Date().toISOString(), startLat: null, startLng: null, startAccuracy: null };
    }
    return d;
  });
  const [tick, setTick] = useState(Date.now());
  const [gpsMissing, setGpsMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { const iv = window.setInterval(() => setTick(Date.now()), 1000); return () => window.clearInterval(iv); }, []);
  // Position À L'ARRIVÉE : lue une fois, fraîche ; à défaut, la dernière position connue.
  useEffect(() => {
    if (form.startLat != null) return;
    let cancelled = false;
    freshPosition().then((p) => {
      if (cancelled) return;
      const lat = p ? p.coords.latitude : position?.[0] ?? null;
      const lngv = p ? p.coords.longitude : position?.[1] ?? null;
      if (lat == null) { setGpsMissing(true); return; }
      setGpsMissing(false);
      setForm((f) => ({ ...f, startLat: lat, startLng: lngv, startAccuracy: p ? p.coords.accuracy : accuracy ?? null }));
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.startedAt]);
  const restart = () => setForm((f) => ({ ...f, startedAt: new Date().toISOString(), startLat: null, startLng: null, startAccuracy: null }));

  useEffect(() => { saveDraft(draftKey, form); }, [form, draftKey]);

  if (!route || !stop) return <div className="p-8 text-center text-sm text-[var(--of-muted)]">{t('opener.field.stopNotFound')}</div>;

  // Pas de visite possible : un appui, rien à remplir. Le brouillon est jeté.
  const noVisit = async (kind: 'later' | 'closed' | 'not_found') => {
    if (kind === 'not_found' && !(await dialog.confirm(t('opener.field.quick.notFoundConfirm'), { confirmText: t('opener.field.quick.notFound'), danger: true }))) return;
    setBusy(kind);
    try {
      if (!demo) {
        if (kind === 'later') await api(`/api/opener/stops/${stop.id}/later`, { method: 'POST' });
        else if (kind === 'closed') await api(`/api/opener/stops/${stop.id}/skip`, { method: 'POST', body: { reason: 'closed' } });
        else await api(`/api/opener/places/${encodeURIComponent(stop.placeId)}/exclude`, { method: 'POST', body: { reason: 'not_found', stopId: stop.id } });
      }
      clearDraft(draftKey);
      if (kind === 'later') { if (demo) markStop(stop.id, { outcome: 'planned' }); else await reload(); }
      else markStop(stop.id, { outcome: 'skipped', skipReason: kind === 'closed' ? 'closed' : 'excluded' });
      navigate('/opener', { replace: true });
    } catch (e: any) { dialog.alert(e.message); } finally { setBusy(null); }
  };

  const subject: Subject = { name: stop.name, placeId: stop.placeId, stopId: stop.id, isClient: stop.status === 'client', version: stop.version, lat: stop.lat, lng: stop.lng };

  const submit = async (f: Form, posValue: string, wantLead: boolean, setSending: (v: boolean) => void) => {
    setSending(true);
    const fresh = await freshPosition();
    const here: [number, number] | null = fresh ? [fresh.coords.latitude, fresh.coords.longitude] : position;
    const hereAcc = fresh ? fresh.coords.accuracy : accuracy;
    const d = here && stop.lat != null ? haversine(here, [stop.lat, stop.lng!]) : null;
    if (d != null && d > FAR_M) {
      const ok = await dialog.confirm(t('opener.field.farConfirm', { dist: fmtDistance(d, lng) }), { confirmText: t('opener.field.saveAnyway') });
      if (!ok) { setSending(false); return; }
    }
    const isClient = subject.isClient;
    const payload: CheckinInput = {
      id: f.id, placeId: stop.placeId, stopId: stop.id, at: new Date().toISOString(),
      startedAt: f.startedAt, startLat: f.startLat ?? null, startLng: f.startLng ?? null, startAccuracy: f.startAccuracy ?? null,
      lat: here?.[0] ?? null, lng: here?.[1] ?? null, accuracy: hereAcc ?? null,
      currentPos: posValue, serviceType: f.serviceType!, terminals: f.terminals, onlineDelivery: f.onlineDelivery,
      decisionMaker: f.decisionMaker, interest: f.interest, services: f.services, notes: f.notes.trim(),
      satisfaction: isClient ? f.satisfaction || null : null, paymentsBy: isClient ? f.paymentsBy || null : null,
    };
    // Démo : rien n'est envoyé, seul l'écran change.
    if (!demo) {
      enqueueCheckin(payload);
      await flush().catch(() => {});
    }
    clearDraft(draftKey);
    markStop(stop.id, { outcome: 'done', doneAt: payload.at, checkin: { id: f.id, at: payload.at, interest: f.interest, leadId: null, decisionMaker: f.decisionMaker, currentPos: posValue } });
    setSending(false);
    if (wantLead) navigate(`/opener/stop/${stop.id}/lead`, { replace: true, state: { checkin: payload } });
    else navigate('/opener', { replace: true });
  };

  return (
    <QuestionForm
      subject={subject} form={form} setForm={setForm} onSubmit={submit} mode="new"
      header={<ScreenHeader eyebrow={t('opener.field.checkin')} title={stop.name}
        right={<span className="inline-flex items-center gap-1 rounded-full bg-[rgba(245,131,70,.12)] px-2.5 py-1 text-xs font-bold tabular-nums text-primary" aria-label={t('opener.field.visitTimer') as string}>
          <Clock className="h-3.5 w-3.5" />{fmtElapsed(tick - new Date(form.startedAt || tick).getTime())}</span>} />}
      top={<>
        <QuickActions title={t('opener.field.quick.title')} busy={busy} onPick={noVisit} />
        {/* Le bandeau suit l'état réel ; « pas de position à l'arrivée » le montre même si le navigateur n'a rien signalé. */}
        <GpsBanner gps={gps === 'ok' && gpsMissing ? 'unavailable' : gps} onRetry={() => { retryGps(); restart(); }} />
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--of-faint)]">
          {t('opener.field.arrivedAt', { time: new Date(form.startedAt || tick).toLocaleTimeString(lng === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' }) })}
          <span>·</span>
          <button type="button" onClick={restart} className="font-semibold text-primary">{t('opener.field.restartTimer')}</button>
        </p>
      </>}
      position={position}
    />
  );
}

// ------------------------------------------------------------------ check-in envoyé, corrigé
function EditCheckIn({ checkinId }: { checkinId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lng, markStop, reload } = useField();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<{ checkin: Saved }>(`/api/opener/checkins/${checkinId}`).then(({ checkin: c }) => {
      setSaved(c);
      const known = POS.includes(c.currentPos);
      setForm({
        id: c.id, currentPos: known ? c.currentPos : 'Autre', otherPos: known ? '' : c.currentPos, serviceType: c.serviceType,
        terminals: c.terminals ?? 1, onlineDelivery: !!c.onlineDelivery, decisionMaker: c.decisionMaker, interest: c.interest,
        services: c.services || [], notes: c.notes || '', createLead: false, satisfaction: c.satisfaction || 0, paymentsBy: c.paymentsBy,
      });
    }).catch((e) => setError(e.message));
  }, [checkinId]);

  if (error) return <div className="p-8 text-center text-sm text-[var(--of-bad)]"><ScreenHeader title="—" back="/opener" />{error}</div>;
  if (!saved || !form) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const subject: Subject = { name: saved.name || '—', placeId: saved.placeId, stopId: saved.stopId, isClient: saved.isClient };
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/opener', { replace: true }));

  const submit = async (f: Form, posValue: string, _lead: boolean, setSending: (v: boolean) => void) => {
    setSending(true);
    try {
      await api(`/api/opener/checkins/${saved.id}`, { method: 'PUT', body: {
        currentPos: posValue, serviceType: f.serviceType, terminals: f.terminals, onlineDelivery: f.onlineDelivery,
        decisionMaker: f.decisionMaker, interest: f.interest, services: f.services, notes: f.notes.trim(),
        satisfaction: saved.isClient ? f.satisfaction || null : null, paymentsBy: saved.isClient ? f.paymentsBy || null : null,
      } });
      if (saved.stopId) markStop(saved.stopId, { checkin: { id: saved.id, at: saved.at, interest: f.interest, leadId: saved.leadId, decisionMaker: f.decisionMaker, currentPos: posValue } });
      dialog.alert(t('opener.field.edit.saved'));
      back();
    } catch (e: any) {
      dialog.alert(e?.body?.error === 'too_old' ? t('opener.field.edit.tooOld') : e.message);
    } finally { setSending(false); }
  };

  // « Ce n'était pas une visite » : le check-in est retiré, l'arrêt prend son vrai sort.
  const voidIt = async (kind: 'later' | 'closed' | 'not_found') => {
    if (!(await dialog.confirm(t(`opener.field.edit.voidConfirm.${kind}`), { confirmText: t('opener.field.edit.voidCta'), danger: kind === 'not_found' }))) return;
    setBusy(kind);
    try {
      await api(`/api/opener/checkins/${saved.id}/void`, { method: 'POST', body: { reason: kind } });
      if (saved.stopId) markStop(saved.stopId, kind === 'later' ? { outcome: 'planned', checkin: null, doneAt: null } : { outcome: 'skipped', skipReason: kind === 'closed' ? 'closed' : 'excluded', checkin: null });
      await reload();
      navigate('/opener', { replace: true });
    } catch (e: any) {
      const code = e?.body?.error;
      dialog.alert(code === 'has_lead' ? t('opener.field.edit.hasLead') : code === 'too_old' ? t('opener.field.edit.tooOld') : e.message);
    } finally { setBusy(null); }
  };

  return (
    <QuestionForm
      subject={subject} form={form} setForm={(u) => setForm((f) => (f ? (typeof u === 'function' ? u(f) : u) : f))} onSubmit={submit} mode="edit"
      header={<ScreenHeader eyebrow={t('opener.field.edit.eyebrow')} title={subject.name} back="/opener" />}
      top={<>
        {!saved.editable && <p className="rounded-[10px] border border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.08)] p-3 text-xs text-[var(--of-bad)]">{t('opener.field.edit.tooOld')}</p>}
        <p className="text-xs text-[var(--of-faint)]">{t('opener.field.edit.help', { date: new Date(saved.at).toLocaleString(lng === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })}</p>
        {saved.editable && !saved.leadId && <QuickActions title={t('opener.field.edit.voidTitle')} busy={busy} onPick={voidIt} />}
      </>}
      disabled={!saved.editable}
    />
  );
}

// ------------------------------------------------------------------ morceaux communs
function QuickActions({ title, busy, onPick }: { title: string; busy: string | null; onPick: (k: 'later' | 'closed' | 'not_found') => void }) {
  const { t } = useTranslation();
  const items: { k: 'later' | 'closed' | 'not_found'; Icon: any; label: string; cls: string }[] = [
    { k: 'later', Icon: RotateCcw, label: t('opener.field.quick.later'), cls: 'text-[var(--of-text)]' },
    { k: 'closed', Icon: DoorClosed, label: t('opener.field.quick.closed'), cls: 'text-[var(--of-text)]' },
    { k: 'not_found', Icon: SearchX, label: t('opener.field.quick.notFound'), cls: 'text-[var(--of-bad)]' },
  ];
  return (
    <Card>
      <p className="mb-2 text-xs font-semibold text-[var(--of-muted)]">{title}</p>
      <div className="grid grid-cols-3 gap-2">
        {items.map(({ k, Icon, label, cls }) => (
          <button key={k} type="button" disabled={!!busy} onClick={() => onPick(k)}
            className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[10px] border border-[var(--of-stroke)] bg-[var(--of-page)] px-1 text-center text-[12px] font-semibold leading-tight ${cls} disabled:opacity-50`}>
            {busy === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}{label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function QuestionForm({ subject, form, setForm, onSubmit, mode, header, top, position, disabled }: {
  subject: Subject; form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>;
  onSubmit: (f: Form, posValue: string, wantLead: boolean, setSending: (v: boolean) => void) => Promise<void>;
  mode: 'new' | 'edit'; header: React.ReactNode; top?: React.ReactNode; position?: [number, number] | null; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { lng } = useField();
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const isClient = subject.isClient;
  const otherPos = (form.otherPos || '').trim();
  const missing = { pos: !form.currentPos || (form.currentPos === 'Autre' && !otherPos), service: !form.serviceType, interest: !form.interest, satisfaction: isClient && !form.satisfaction };
  const posValue = form.currentPos === 'Autre' ? otherPos.slice(0, 40) : form.currentPos;
  const valid = !missing.pos && !missing.service && !missing.interest && !missing.satisfaction;
  const dist = mode === 'new' && position && subject.lat != null ? haversine(position, [subject.lat, subject.lng!]) : null;
  const levels = ['', t('opener.field.level.1'), t('opener.field.level.2'), t('opener.field.level.3'), t('opener.field.level.4'), t('opener.field.level.5')];

  const submit = async () => {
    setTried(true);
    if (!valid || disabled) return;
    // Garde-fou (2026-10-08) : le premier jour, l'opener créait un lead à CHAQUE visite, même à
    // un intérêt de 1/5. Un lead n'a de sens que si le restaurant est intéressé : à 1 ou 2, on
    // demande. « Terminer sans lead » garde le check-in tel quel.
    let wantLead = mode === 'new' && form.createLead;
    if (wantLead && form.interest > 0 && form.interest <= LOW_INTEREST) {
      wantLead = await dialog.confirm(t('opener.field.lowInterestConfirm', { n: form.interest }),
        { confirmText: t('opener.field.lowInterestCreate'), cancelText: t('opener.field.lowInterestSkip') });
    }
    await onSubmit(form, posValue!, wantLead, setSending);
  };

  const q = (label: string, req: boolean, bad: boolean, children: React.ReactNode, sub?: string) => (
    <section>
      <p className={`mb-2 text-sm font-semibold ${tried && bad ? 'text-[var(--of-bad)]' : 'text-[var(--of-title)]'}`}>{label}{req ? ' *' : ''}</p>
      {sub && <p className="-mt-1.5 mb-2 text-xs text-[var(--of-faint)]">{sub}</p>}
      {children}
    </section>
  );

  return (
    <div className="pb-36">
      {header}
      <div className={`space-y-[22px] px-4 pt-4 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
        {top}
        {dist != null && dist > FAR_M && (
          <p className="rounded-[10px] border border-[rgba(245,131,70,.3)] bg-[rgba(245,131,70,.08)] p-3 text-xs text-[var(--of-warn)]">{t('opener.field.farNotice', { dist: fmtDistance(dist, lng) })}</p>
        )}
        {isClient && (
          <Card className="!border-[rgba(87,209,147,.45)]">
            <p className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--of-title)]">
              <HeartHandshake className="h-4 w-4 text-[var(--of-st-client)]" />{t('opener.field.client.title')}
              {subject.version && <span className="text-xs font-semibold text-[var(--of-faint)]">{subject.version.toUpperCase()}</span>}
            </p>
            <p className="text-xs leading-relaxed text-[var(--of-muted)]">{t('opener.field.client.goal')}</p>
          </Card>
        )}
        {isClient && q(t('opener.field.client.satisfaction'), true, missing.satisfaction, (
          <div>
            <div className="flex items-center gap-3">
              <div className="grid flex-1 grid-cols-5 gap-1.5" role="radiogroup">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={form.satisfaction === v} onClick={() => set('satisfaction')(v)}
                    className={`h-12 rounded-xl text-sm font-bold ${v <= (form.satisfaction || 0) ? 'bg-[#57D193] text-[#1C2434]' : 'border border-[var(--of-stroke)] bg-[var(--of-surface)] text-[var(--of-muted)]'}`}>{v}</button>
                ))}
              </div>
              <span className="w-[68px] text-right text-xs font-semibold text-[var(--of-ok)]">{form.satisfaction ? t(`opener.field.client.sat.${form.satisfaction}`) : ''}</span>
            </div>
            {!!form.satisfaction && form.satisfaction <= 2 && (
              <p className="mt-2 rounded-[10px] border border-[rgba(248,113,113,.35)] bg-[rgba(248,113,113,.08)] p-2.5 text-xs text-[var(--of-bad)]">{t('opener.field.client.unhappy')}</p>
            )}
          </div>
        ))}
        {isClient && q(t('opener.field.client.payments'), false, false,
          <Segmented options={(['cluster', 'other', 'unknown'] as PaymentsBy[]).map((v) => ({ value: v, label: t(`opener.field.client.paymentsBy.${v}`) }))}
            value={form.paymentsBy || null} onChange={(v) => set('paymentsBy')(v as PaymentsBy)} />)}
        {q(t('opener.field.q.pos'), true, missing.pos,
          <div>
            <Chips options={POS.map((p) => ({ value: p, label: p === 'Aucun' ? t('opener.field.none') : p === 'Autre' ? t('opener.field.other') : p }))} value={form.currentPos} onChange={set('currentPos')} />
            {form.currentPos === 'Autre' && (
              <input value={form.otherPos || ''} onChange={(e) => set('otherPos')(e.target.value)} maxLength={40} autoFocus={mode === 'new'}
                placeholder={t('opener.field.otherPosPh') as string} aria-label={t('opener.field.otherPosPh') as string}
                className={`mt-2 h-11 w-full rounded-[10px] border bg-[var(--of-input)] px-3 text-sm text-[var(--of-text)] outline-none focus:border-primary ${tried && !otherPos ? 'border-[var(--of-bad)]' : 'border-[var(--of-input-stroke)]'}`} />
            )}
          </div>)}
        {q(t('opener.field.q.service'), true, missing.service,
          <Segmented options={(['tables', 'quick', 'both'] as ServiceType[]).map((v) => ({ value: v, label: t(`opener.service.${v}`) }))} value={form.serviceType} onChange={set('serviceType')} />)}
        {q(t('opener.field.q.terminals'), false, false,
          <Stepper value={form.terminals} onChange={set('terminals')} label={t('opener.field.q.terminals') as string} />, t('opener.field.q.terminalsSub') as string)}
        <section className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-[var(--of-title)]">{t('opener.field.q.delivery')}</p><p className="text-xs text-[var(--of-faint)]">{t('opener.field.q.deliverySub')}</p></div>
          <Toggle on={form.onlineDelivery} onChange={set('onlineDelivery')} label={t('opener.field.q.delivery') as string} />
        </section>
        {q(t('opener.field.q.decision'), false, false,
          <Segmented options={[{ value: 'yes', label: t('opener.field.yes') }, { value: 'no', label: t('opener.field.no') }, { value: 'later', label: t('opener.field.later') }]}
            value={form.decisionMaker} onChange={(v) => set('decisionMaker')(v as Form['decisionMaker'])} />)}
        {q(isClient ? t('opener.field.client.interest') : t('opener.field.q.interest'), true, missing.interest, (
          <div className="flex items-center gap-3">
            <div className="grid flex-1 grid-cols-5 gap-1.5" role="radiogroup">
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} type="button" role="radio" aria-checked={form.interest === v} onClick={() => set('interest')(v)}
                  className={`h-12 rounded-xl text-sm font-bold ${v <= form.interest ? 'bg-primary text-[#1C2434]' : 'border border-[var(--of-stroke)] bg-[var(--of-surface)] text-[var(--of-muted)]'}`}>{v}</button>
              ))}
            </div>
            <span className="w-[68px] text-right text-xs font-semibold text-[var(--of-warn)]">{levels[form.interest] || ''}</span>
          </div>
        ))}
        {q(t('opener.field.q.services'), false, false,
          <Chips multi options={(['payments', 'pos', 'beverage_control'] as Service[]).map((s) => ({ value: s, label: t(`opener.serviceOf.${s}`) }))} value={form.services} onChange={set('services')} />)}
        {q(t('opener.field.q.notes'), false, false,
          <textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} maxLength={2000}
            className="min-h-[88px] w-full rounded-[10px] border border-[var(--of-input-stroke)] bg-[var(--of-input)] p-3 text-sm text-[var(--of-text)] outline-none focus:border-primary" />)}
        {mode === 'new' && (
          <Card onClick={() => set('createLead')(!form.createLead)} className={form.createLead ? '!border-primary' : ''}>
            <div className="flex items-center gap-3">
              <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border ${form.createLead ? 'border-primary bg-primary' : 'border-[var(--of-input-stroke)]'}`}>
                {form.createLead && <Check className="h-4 w-4 text-[#1C2434]" />}
              </span>
              <div><p className="text-sm font-semibold text-[var(--of-title)]">{isClient ? t('opener.field.client.createLead') : t('opener.field.createLeadWith')}</p><p className="text-xs text-[var(--of-faint)]">{isClient ? t('opener.field.client.createLeadSub') : t('opener.field.createLeadWithSub')}</p></div>
            </div>
          </Card>
        )}
        {mode === 'new' && form.createLead && form.interest > 0 && form.interest <= LOW_INTEREST && (
          <p className="-mt-3 text-xs text-[var(--of-warn)]">{t('opener.field.lowInterestHint', { n: form.interest })}</p>
        )}
        {tried && !valid && <p className="text-xs text-[var(--of-bad)]">{t(isClient ? 'opener.field.client.requiredMissing' : 'opener.field.requiredMissing')}</p>}
        {/* Loi 25 : l'opener sait que sa position est recueillie, et pourquoi. */}
        {mode === 'new' && <p className="text-[11px] leading-relaxed text-[var(--of-faint)]">{t('opener.field.gpsNotice')}</p>}
      </div>
      <StickyCta>
        <button onClick={submit} disabled={sending || disabled} className={`${btnPrimary} flex-1`}>
          {mode === 'edit'
            ? (sending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('opener.field.edit.save'))
            : sending ? t('opener.field.locating') : form.createLead ? t('opener.field.finishAndLead') : t('opener.field.finishCheckin')}
        </button>
      </StickyCta>
    </div>
  );
}
