import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Check } from 'lucide-react';
import { useField } from './index';
import { Card, Chips, ScreenHeader, Segmented, Stepper, StickyCta, Toggle, btnPrimary } from './ui';
import { enqueueCheckin, flush, loadDraft, saveDraft, clearDraft } from './outbox';
import { haversine, fmtDistance, uuid, type Service, type ServiceType, type CheckinInput } from '../api';
import { dialog } from '../../../lib/dialog';

// Écran 1d — check-in.
// Obligatoires : POS actuel, type de service, niveau d'intérêt. Le reste est facultatif.
// Le brouillon est gardé sur le téléphone ; l'envoi passe par la file (hors ligne compris).
// À plus de 150 m du restaurant : avertissement, pas un refus.

const POS = ['Lightspeed', 'Square', 'Toast', "Maitre'D", 'Veloce', 'Cluster', 'Aucun', 'Autre'];
const FAR_M = 150;

// Position FRAÎCHE au moment d'enregistrer (pas celle gardée en mémoire par la carte, qui peut
// dater de l'arrivée dans le quartier) : c'est elle qui atteste la visite.
const freshPosition = () => new Promise<GeolocationPosition | null>((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
});

interface Form {
  id: string; currentPos: string | null; serviceType: ServiceType | null; terminals: number; onlineDelivery: boolean;
  decisionMaker: 'yes' | 'no' | 'later' | null; interest: number; services: Service[]; notes: string; createLead: boolean;
}

export default function CheckIn() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { stopId } = useParams();
  const { lng, route, position, accuracy, markStop } = useField();
  const stop = route?.stops.find((s) => String(s.id) === stopId) || null;
  const draftKey = `stop_${stopId}`;
  const [form, setForm] = useState<Form>(() => loadDraft<Form>(draftKey) || {
    id: uuid(), currentPos: null, serviceType: null, terminals: 1, onlineDelivery: false,
    decisionMaker: null, interest: 0, services: [], notes: '', createLead: false,
  });
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const now = useMemo(() => new Date().toLocaleTimeString(lng === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' }), [lng]);

  useEffect(() => { saveDraft(draftKey, form); }, [form, draftKey]);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (!route || !stop) return <div className="p-8 text-center text-sm text-[var(--of-muted)]">{t('opener.field.stopNotFound')}</div>;

  const missing = { pos: !form.currentPos, service: !form.serviceType, interest: !form.interest };
  const valid = !missing.pos && !missing.service && !missing.interest;
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
      lat: here?.[0] ?? null, lng: here?.[1] ?? null, accuracy: hereAcc ?? null,
      currentPos: form.currentPos!, serviceType: form.serviceType!, terminals: form.terminals, onlineDelivery: form.onlineDelivery,
      decisionMaker: form.decisionMaker, interest: form.interest, services: form.services, notes: form.notes.trim(),
    };
    enqueueCheckin(payload);
    await flush().catch(() => {});
    clearDraft(draftKey);
    markStop(stop.id, { outcome: 'done', doneAt: payload.at, checkin: { id: form.id, at: payload.at, interest: form.interest, leadId: null, decisionMaker: form.decisionMaker, currentPos: form.currentPos! } });
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
        right={<span className="inline-flex items-center gap-1 text-xs text-[var(--of-faint)]"><Clock className="h-3.5 w-3.5" />{now}</span>} />
      <div className="space-y-[22px] px-4 pt-4">
        {dist != null && dist > FAR_M && (
          <p className="rounded-[10px] border border-[rgba(245,131,70,.3)] bg-[rgba(245,131,70,.08)] p-3 text-xs text-[var(--of-warn)]">{t('opener.field.farNotice', { dist: fmtDistance(dist, lng) })}</p>
        )}
        {q(t('opener.field.q.pos'), true, missing.pos,
          <Chips options={POS.map((p) => ({ value: p, label: p === 'Aucun' ? t('opener.field.none') : p === 'Autre' ? t('opener.field.other') : p }))} value={form.currentPos} onChange={set('currentPos')} />)}
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
        {q(t('opener.field.q.interest'), true, missing.interest, (
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
            <div><p className="text-sm font-semibold text-[var(--of-title)]">{t('opener.field.createLeadWith')}</p><p className="text-xs text-[var(--of-faint)]">{t('opener.field.createLeadWithSub')}</p></div>
          </div>
        </Card>
        {tried && !valid && <p className="text-xs text-[var(--of-bad)]">{t('opener.field.requiredMissing')}</p>}
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
