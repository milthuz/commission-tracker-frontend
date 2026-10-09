import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Star, MapPin, Clock, Phone, Globe, Plus, Loader2, Ban, Undo2 } from 'lucide-react';
import { useField } from './index';
import { Card, Eyebrow, ScreenHeader, StatusBadge, StickyCta, btnPrimary, btnSecondary } from './ui';
import { api, type PlaceCard, type PlaceStatus, type SkipReason } from '../api';
import { dialog } from '../../../lib/dialog';

// Écran 1c — fiche du restaurant.
//
// Téléphone : un lien `tel:` ici, par EXCEPTION à la règle du projet (TelephoneCopiable partout
// ailleurs) : la règle existe parce qu'un `tel:` n'ouvre rien sur un poste Windows ; cette
// application ne sert que sur un téléphone.

export default function StopDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { stopId } = useParams();
  const { lng, route, markStop, demo } = useField();
  const stop = route?.stops.find((s) => String(s.id) === stopId) || null;
  const [card, setCard] = useState<PlaceCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [skipOpen, setSkipOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!stop) { setLoading(false); return; }
    api<PlaceCard>(`/api/opener/place/${encodeURIComponent(stop.placeId)}?lang=${lng}`)
      .then(setCard).catch(() => setCard(null)).finally(() => setLoading(false));
  }, [stop?.placeId, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!route || !stop) {
    return <div className="p-8 text-center text-sm text-[var(--of-muted)]"><ScreenHeader title="—" back="/opener" />{t('opener.field.stopNotFound')}</div>;
  }

  const n = route.stops.indexOf(stop) + 1;
  const g = card?.google;
  const c = card?.cluster || stop;
  const status = (c.status || 'new') as PlaceStatus;
  const fmtDate = (s: string) => new Date(s).toLocaleDateString(lng === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'long', year: 'numeric' });
  const open = route.status === 'published';

  const skip = async (reason: SkipReason) => {
    setBusy(true);
    try {
      if (!demo) await api(`/api/opener/stops/${stop.id}/skip`, { method: 'POST', body: { reason } });
      markStop(stop.id, { outcome: 'skipped', skipReason: reason });
      navigate('/opener/list');
    } catch (e: any) { dialog.alert(e.message); } finally { setBusy(false); setSkipOpen(false); }
  };
  // « Pas un restaurant » : l'arrêt est sauté ET le lieu exclu pour de bon (il ne revient plus
  // dans les scans ni dans la campagne). Seul un manager peut le rétablir.
  const excludeIt = async () => {
    if (!(await dialog.confirm(t('opener.field.excludeConfirm'), { confirmText: t('opener.campaign.exclude'), danger: true }))) return;
    setBusy(true);
    try {
      if (!demo) await api(`/api/opener/places/${encodeURIComponent(stop.placeId)}/exclude`, { method: 'POST', body: { reason: 'not_restaurant', stopId: stop.id } });
      markStop(stop.id, { outcome: 'skipped', skipReason: 'excluded' });
      navigate('/opener/list');
    } catch (e: any) { dialog.alert(e.message); } finally { setBusy(false); setSkipOpen(false); }
  };
  const unskip = async () => {
    setBusy(true);
    try {
      if (!demo) await api(`/api/opener/stops/${stop.id}/unskip`, { method: 'POST' });
      markStop(stop.id, { outcome: 'planned', skipReason: null });
    } catch (e: any) { dialog.alert(e.message); } finally { setBusy(false); }
  };

  const row = (Icon: any, children: React.ReactNode) => (
    <div className="flex items-start gap-2.5 py-1"><Icon className="mt-0.5 h-[15px] w-[15px] shrink-0 text-[var(--of-faint)]" /><div className="min-w-0 text-[13px] text-[var(--of-text)]">{children}</div></div>
  );
  const kv = (label: string, value: React.ReactNode, cls = 'text-[var(--of-title)]') => (
    <div><p className="text-[11px] font-medium text-[var(--of-faint)]">{label}</p><p className={`text-sm font-semibold ${cls}`}>{value}</p></div>
  );

  return (
    <div className="pb-36">
      <ScreenHeader eyebrow={t('opener.field.stopN', { n, total: route.stops.length })} title={stop.name}
        right={<StatusBadge status={status} version={c.version} />} back="/opener/list" />
      <div className="space-y-3 px-4 pt-4">
        {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}

        {/* Google */}
        {!loading && (
          <Card>
            <div className="mb-2 flex items-center justify-between"><Eyebrow>Google</Eyebrow>{!g && <span className="text-[11px] text-[var(--of-faint)]">{t('opener.field.googleUnavailable')}</span>}</div>
            {g ? (
              <>
                {g.rating != null && (
                  <p className="mb-1 text-[15px] font-bold text-[var(--of-title)]">
                    <Star className="mb-0.5 mr-1 inline h-4 w-4 fill-[#FDB022] text-[#FDB022]" />{g.rating.toLocaleString(lng === 'fr' ? 'fr-CA' : 'en-CA')}
                    <span className="ml-2 text-xs font-medium text-[var(--of-faint)]">
                      {[g.reviews != null ? t('opener.field.reviews', { n: g.reviews.toLocaleString(lng === 'fr' ? 'fr-CA' : 'en-CA') }) : null,
                        g.priceLevel ? priceSigns(g.priceLevel) : null, g.category].filter(Boolean).join(' · ')}
                    </span>
                  </p>
                )}
                {row(MapPin, g.address || stop.address)}
                {(g.openNow != null || g.hours.length > 0) && row(Clock, (
                  <details>
                    <summary className="cursor-pointer list-none">
                      {g.openNow != null && <span className={`font-semibold ${g.openNow ? 'text-[var(--of-ok)]' : 'text-[var(--of-bad)]'}`}>{g.openNow ? t('opener.field.openNow') : t('opener.field.closedNow')}</span>}
                      {g.hours.length > 0 && <span className="text-[var(--of-faint)]"> · {t('opener.field.hours')}</span>}
                    </summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-[var(--of-muted)]">{g.hours.map((h) => <li key={h}>{h}</li>)}</ul>
                  </details>
                ))}
                {g.phone && row(Phone, <a href={`tel:${g.phone.replace(/[^\d+]/g, '')}`} className="font-semibold text-primary">{g.phone}</a>)}
                {g.website && row(Globe, <a href={g.website} target="_blank" rel="noreferrer" className="break-all text-primary">{g.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>)}
              </>
            ) : row(MapPin, stop.address || '—')}
          </Card>
        )}

        {/* Cluster */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <Eyebrow>{t('opener.field.clusterData')}</Eyebrow>
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--of-ok)]"><span className="h-1.5 w-1.5 rounded-full bg-[#57D193]" />{t('opener.field.live')}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {kv(t('opener.field.status'), <>{t(`opener.status.${status}`)}{c.version ? ` · ${c.version.toUpperCase()}` : ''}{c.seasonal ? ` · ${t('opener.seasonal')}` : ''}</>, '')}
            {kv(t('opener.field.lead'), c.lead ? `${c.lead.refCode} · ${t(`leads.status.${c.lead.status}`, { defaultValue: c.lead.status })}` : <span className="text-[var(--of-faint)]">{t('opener.field.none')}</span>)}
            {kv(t('opener.field.lastVisit'), c.lastVisitAt ? `${fmtDate(c.lastVisitAt)}${c.lastVisitBy ? ` · ${c.lastVisitBy}` : ''}` : <span className="text-[var(--of-faint)]">{t('opener.field.never')}</span>)}
            {kv(t('opener.field.competitorPos'), c.competitorPos || <span className="text-[var(--of-faint)]">—</span>)}
            {kv(t('opener.field.clusterName'), c.clusterName || <span className="text-[var(--of-faint)]">{t('opener.field.none')}</span>)}
            {kv(t('opener.field.serviceType'), (g?.serviceType || c.serviceTypeSeen) ? t(`opener.serviceShort.${g?.serviceType || c.serviceTypeSeen}`) : <span className="text-[var(--of-faint)]">—</span>)}
            {status === 'client' && kv(t('opener.field.client.lastSatisfaction'), c.lastSatisfaction ? `${c.lastSatisfaction}/5` : <span className="text-[var(--of-faint)]">{t('opener.field.never')}</span>,
              c.lastSatisfaction != null && c.lastSatisfaction <= 2 ? 'text-[var(--of-bad)]' : 'text-[var(--of-title)]')}
            {status === 'client' && kv(t('opener.field.client.payments'), c.lastPaymentsBy ? t(`opener.field.client.paymentsBy.${c.lastPaymentsBy}`) : <span className="text-[var(--of-faint)]">—</span>)}
          </div>
          {status === 'client' && <p className="mt-3 text-xs leading-relaxed text-[var(--of-muted)]">{t('opener.field.client.goal')}</p>}
        </Card>

        {/* Historique */}
        {card && card.history.length > 0 && (
          <div>
            <Eyebrow className="mb-2">{t('opener.field.history')}</Eyebrow>
            <Card className="space-y-0">
              {card.history.map((h, i) => (
                <div key={h.id} className="relative flex gap-3 pb-3 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                    {i < card.history.length - 1 && <span className="mt-1 w-px flex-1 bg-[var(--of-stroke)]" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-[var(--of-title)]">{t('opener.field.checkinBy', { name: h.by })}</p>
                    <p className="text-xs leading-[1.4] text-[var(--of-muted)]">
                      {[h.satisfaction ? t('opener.field.client.satShort', { n: h.satisfaction }) : null, h.currentPos, t(`opener.serviceShort.${h.serviceType}`), t('opener.field.interestShort', { n: h.interest }), h.leadRef].filter(Boolean).join(' · ')}
                      {h.notes ? <><br />{h.notes}</> : null}
                    </p>
                    <p className="text-[11px] text-[var(--of-faint)]">{fmtDate(h.at)}</p>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Non visité */}
        {open && stop.outcome === 'planned' && (
          skipOpen ? (
            <Card>
              <p className="mb-2 text-sm font-semibold text-[var(--of-title)]">{t('opener.field.skipWhy')}</p>
              <div className="grid grid-cols-2 gap-2">
                {(['closed', 'no_time', 'refused', 'other'] as SkipReason[]).map((r) => (
                  <button key={r} disabled={busy} onClick={() => skip(r)} className="h-11 rounded-[10px] border border-[var(--of-stroke)] bg-[var(--of-page)] text-[13px] font-semibold text-[var(--of-text)]">{t(`opener.skip.${r}`)}</button>
                ))}
                <button disabled={busy} onClick={excludeIt} className="col-span-2 h-11 rounded-[10px] border border-[var(--of-stroke)] bg-[var(--of-page)] text-[13px] font-semibold text-[var(--of-bad)]">{t('opener.campaign.notRestaurant')}</button>
              </div>
              <button onClick={() => setSkipOpen(false)} className="mt-2 w-full py-2 text-xs text-[var(--of-faint)]">{t('opener.field.cancel')}</button>
            </Card>
          ) : (
            <button onClick={() => setSkipOpen(true)} className="flex w-full items-center justify-center gap-2 py-2 text-[13px] font-semibold text-[var(--of-faint)]">
              <Ban className="h-4 w-4" />{t('opener.field.markSkipped')}
            </button>
          )
        )}
        {open && stop.outcome === 'skipped' && stop.skipReason !== 'excluded' && (
          <button onClick={unskip} disabled={busy} className="flex w-full items-center justify-center gap-2 py-2 text-[13px] font-semibold text-primary">
            <Undo2 className="h-4 w-4" />{t('opener.field.unskip', { reason: t(`opener.skip.${stop.skipReason || 'other'}`) })}
          </button>
        )}
      </div>

      {open && (
        <StickyCta>
          <button onClick={() => navigate(`/opener/stop/${stop.id}/lead`)} className={`${btnSecondary} flex-1`}><Plus className="h-4 w-4" />{t('opener.field.createLead')}</button>
          {stop.outcome !== 'done' && <button onClick={() => navigate(`/opener/stop/${stop.id}/checkin`)} className={`${btnPrimary} flex-[1.2]`}>{t('opener.field.checkin')}</button>}
        </StickyCta>
      )}
    </div>
  );
}

const priceSigns = (level: string) => ({ PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$', PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' } as Record<string, string>)[level] || null;
