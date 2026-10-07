import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Check, HeartHandshake } from 'lucide-react';
import { useField } from './index';
import { Card, Chips, ScreenHeader, Segmented, Stepper, StickyCta, Toggle, btnPrimary } from './ui';
import { enqueueCheckin, flush, loadDraft, saveDraft, clearDraft } from './outbox';
import { haversine, fmtDistance, uuid, type Service, type ServiceType, type CheckinInput, type PaymentsBy } from '../api';
import { dialog } from '../../../lib/dialog';

// Écran 1d — check-in.
// Obligatoires : POS actuel, type de service, niveau d'intérêt. Le reste est facultatif.
// Visite d'un CLIENT Cluster (2026-10-08) : on vient voir s'il est satisfait et proposer les
// paiements. La satisfaction (1 à 5) devient obligatoire, on demande qui traite ses paiements,
// et l'intérêt porte sur les paiements Cluster. Le POS est prérempli à « Cluster ».
// Le brouillon est gardé sur le téléphone ; l'envoi passe par la file (hors ligne compris).
// À plus de 150 m du restaurant : avertissement, pas un refus.

// « Autre » ouvre un champ texte : l'opener écrit le nom du POS (demande de David, 2026-10-08) ;
// c'est ce nom qui est enregistré, pas « Autre ».
const POS = ['Lightspeed', 'Square', 'Toast', 'Clover', "Maitre'D", 'Veloce', 'Auphan', 'Cluster', 'Aucun', 'Autre'];
const FAR_M = 150;

// Position FRAÎCHE au moment d'enregistrer (pas celle gardée en mémoire par la carte, qui peut
// dater de l'arrivée dans le quartier) : c'est elle qui atteste la visite.
const freshPosition = () => new Promise<GeolocationPosition | null>((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
});

interface Form {
  id: string; currentPos: string | null; otherPos?: string; serviceType: ServiceType | null; terminals: number; onlineDelivery: boolean;
  decisionMaker: 'yes' | 'no' | 'later' | null; interest: number; services: Service[]; notes: string; createLead: boolean;
  satisfaction?: number; paymentsBy?: PaymentsBy | null;
  // Arrivée au restaurant : l'ouverture de cet écran (heure + position). Gardée dans le brouillon.
  startedAt?: string; startLat?: number | null; startLng?: number | null; startAccuracy?: number | null;
}

// Un écran resté ouvert plus de 3 h n'est plus une visite en cours : le chronomètre repart.
const STALE_MS = 3 * 3600 * 1000;
const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export default function CheckIn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { stopId } = useParams();
  const { lng, route, position, accuracy, markStop, demo } = useField();
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
  useEffect(() => { const iv = window.setInterval(() => setTick(Date.now()), 1000); return () => window.clearInterval(iv); }, []);
  // Position À L'ARRIVÉE : lue une fois, fraîche ; à défaut, la dernière position connue.
  useEffect(() => {
    if (form.startLat != null) return;
    let cancelled = false;
    freshPosition().then((p) => {
      if (cancelled) return;
      const lat = p ? p.coords.latitude : position?.[0] ?? null;
      const lngv = p ? p.coords.longitude : position?.[1] ?? null;
      if (lat == null) return;
      setForm((f) => ({ ...f, startLat: lat, startLng: lngv, startAccuracy: p ? p.coords.accuracy : accuracy ?? null }));
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.startedAt]);
  const restart = () => setForm((f) => ({ ...f, startedAt: new Date().toISOString(), startLat: null, startLng: null, startAccuracy: null }));
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { saveDraft(draftKey, form); }, [form, draftKey]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (!route || !stop) return <div className="p-8 text-center text-sm text-[var(--of-muted)]">{t('opener.field.stopNotFound')}</div>;

  const isClient = stop.status === 'client';
  const otherPos = (form.otherPos || '').trim();
  const missing = { pos: !form.currentPos || (form.currentPos === 'Autre' && !otherPos), service: !form.serviceType, interest: !form.interest, satisfaction: isClient && !form.satisfaction };
  const posValue = form.currentPos === 'Autre' ? otherPos.slice(0, 40) : form.currentPos;
  const valid = !missing.pos && !missing.service && !missing.interest && !missing.satisfaction;
  const dist = position && stop.lat != null ? haversine(position, [stop.lat, stop.lng!]) : null;
  const levels = ['', t('opener.field.level.1'), t('opener.field.level.2'), t('opener.field.level.3'), t('opener.field.level.4'), t('opener.field.level.5')];

  const submit = async () => {
    setTried(true);
    if (!valid) return;
    setSending(true);
    const fresh = await freshPosition();
    const here: [number, number] | null = fresh ? [fresh.coords.latitude, fresh.coords.longitude] : position;
    const hereAcc = fresh ? fresh.coords.accuracy : accuracy;
    const d = here && stop.lat != null ? haversine(here, [stop.lat, stop.lng!]) : null;
    if (d != null && d > FAR_M) {
      const ok = await dialog.confirm(t('opener.field.farConfirm', { dist: fmtDistance(d, lng) }), { confirmText: t('opener.field.saveAnyway') });
      if (!ok) { setSending(false); return; }
    }
    const payload: CheckinInput = {
      id: form.id, placeId: stop.placeId, stopId: stop.id, at: new Date().toISOString(),
      startedAt: form.startedAt, startLat: form.startLat ?? null, startLng: form.startLng ?? null, startAccuracy: form.startAccuracy ?? null,
      lat: here?.[0] ?? null, lng: here?.[1] ?? null, accuracy: hereAcc ?? null,
      currentPos: posValue!, serviceType: form.serviceType!, terminals: form.terminals, onlineDelivery: form.onlineDelivery,
      decisionMaker: form.decisionMaker, interest: form.interest, services: form.services, notes: form.notes.trim(),
      satisfaction: isClient ? form.satisfaction || null : null, paymentsBy: isClient ? form.paymentsBy || null : null,
    };
    // Démo : rien n'est envoyé, seul l'écran change.
    if (!demo) {
      enqueueCheckin(payload);
      await flush().catch(() => {});
    }
    clearDraft(draftKey);
    markStop(stop.id, { outcome: 'done', doneAt: payload.at, checkin: { id: form.id, at: payload.at, interest: form.interest, leadId: null, decisionMaker: form.decisionMaker, currentPos: posValue! } });
    setSending(false);
    if (form.createLead) {
      navigate(`/opener/stop/${stop.id}/lead`, { replace: true, state: { checkin: payload } });
    } else {
      navigate('/opener', { replace: true });
    }
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
      <ScreenHeader eyebrow={t('opener.field.checkin')} title={stop.name}
        right={<span className="inline-flex items-center gap-1 rounded-full bg-[rgba(245,131,70,.12)] px-2.5 py-1 text-xs font-bold tabular-nums text-primary" aria-label={t('opener.field.visitTimer') as string}>
          <Clock className="h-3.5 w-3.5" />{fmtElapsed(tick - new Date(form.startedAt || tick).getTime())}</span>} />
      <div className="space-y-[22px] px-4 pt-4">
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--of-faint)]">
          {t('opener.field.arrivedAt', { time: new Date(form.startedAt || tick).toLocaleTimeString(lng === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' }) })}
          <span>·</span>
          <button type="button" onClick={restart} className="font-semibold text-primary">{t('opener.field.restartTimer')}</button>
        </p>
        {dist != null && dist > FAR_M && (
          <p className="rounded-[10px] border border-[rgba(245,131,70,.3)] bg-[rgba(245,131,70,.08)] p-3 text-xs text-[var(--of-warn)]">{t('opener.field.farNotice', { dist: fmtDistance(dist, lng) })}</p>
        )}
        {isClient && (
          <Card className="!border-[rgba(87,209,147,.45)]">
            <p className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--of-title)]">
              <HeartHandshake className="h-4 w-4 text-[var(--of-st-client)]" />{t('opener.field.client.title')}
              {stop.version && <span className="text-xs font-semibold text-[var(--of-faint)]">{stop.version.toUpperCase()}</span>}
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
              <input value={form.otherPos || ''} onChange={(e) => set('otherPos')(e.target.value)} maxLength={40} autoFocus
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
        <Card onClick={() => set('createLead')(!form.createLead)} className={form.createLead ? '!border-primary' : ''}>
          <div className="flex items-center gap-3">
            <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border ${form.createLead ? 'border-primary bg-primary' : 'border-[var(--of-input-stroke)]'}`}>
              {form.createLead && <Check className="h-4 w-4 text-[#1C2434]" />}
            </span>
            <div><p className="text-sm font-semibold text-[var(--of-title)]">{isClient ? t('opener.field.client.createLead') : t('opener.field.createLeadWith')}</p><p className="text-xs text-[var(--of-faint)]">{isClient ? t('opener.field.client.createLeadSub') : t('opener.field.createLeadWithSub')}</p></div>
          </div>
        </Card>
        {tried && !valid && <p className="text-xs text-[var(--of-bad)]">{t(isClient ? 'opener.field.client.requiredMissing' : 'opener.field.requiredMissing')}</p>}
        {/* Loi 25 : l'opener sait que sa position est recueillie, et pourquoi. */}
        <p className="text-[11px] leading-relaxed text-[var(--of-faint)]">{t('opener.field.gpsNotice')}</p>
      </div>
      <StickyCta>
        <button onClick={submit} disabled={sending} className={`${btnPrimary} flex-1`}>
          {sending ? t('opener.field.locating') : form.createLead ? t('opener.field.finishAndLead') : t('opener.field.finishCheckin')}
        </button>
      </StickyCta>
    </div>
  );
}
