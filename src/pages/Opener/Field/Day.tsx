import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Sun, Moon, CheckCircle2 } from 'lucide-react';
import { TabBar, useField } from './index';
import { Card, Eyebrow, btnPrimary } from './ui';
import { api, fmtDistance, fmtMinutes, STATUS_COLOR, type DaySummary, type PlaceStatus } from '../api';
import { statusTone, type LeadStatus } from '../../Leads/types';
import { dialog } from '../../../lib/dialog';

// Écran 1f — résumé de fin de journée.
// Distance : à vol d'oiseau entre les check-ins successifs (aucun suivi GPS continu).

export default function Day() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lng, dark, setTheme, route, reload, outbox, demo, endDemo, date } = useField();
  const [day, setDay] = useState<DaySummary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<DaySummary>('/api/opener/day').then(setDay).catch(() => setDay(null)), []);
  // Démo : le résumé est calculé sur le téléphone à partir de la route simulée.
  useEffect(() => {
    if (!demo || !route) return;
    const done = route.stops.filter((s) => s.outcome === 'done');
    setDay({ date: date || new Date().toISOString().slice(0, 10), route: { id: route.id, name: route.name, status: route.status },
      stats: { stops: route.stops.length, done: done.length, skipped: route.stops.filter((s) => s.outcome === 'skipped').length,
        checkins: done.length, leads: 0, decisionMakers: done.filter((s) => s.checkin?.decisionMaker === 'yes').length,
        distanceM: 0, durationMin: 0, visitMinutes: 0, avgVisitMin: null },
      leads: [], notVisited: route.stops.filter((s) => s.outcome !== 'done').map((s) => ({ id: s.id, name: s.name, status: (s.status || 'new'), outcome: s.outcome, skipReason: s.skipReason })) });
  }, [demo, route, date]);
  useEffect(() => { if (!demo) load(); }, [load, route, demo]);

  const postpone = async () => {
    if (!day?.route) return;
    if (!(await dialog.confirm(t('opener.field.postponeConfirm', { n: day.notVisited.length })))) return;
    if (demo) { await dialog.alert(t('opener.field.demo.simulated')); return; }
    setBusy(true);
    try {
      const r = await api<{ moved: number; date: string }>(`/api/opener/routes/${day.route.id}/postpone`, { method: 'POST' });
      await dialog.alert(t('opener.field.postponed', { n: r.moved }));
      await reload(); await load();
    } catch (e: any) { dialog.alert(e.message); } finally { setBusy(false); }
  };

  const close = async () => {
    if (!day?.route) return;
    if (outbox > 0) { dialog.alert(t('opener.field.closeWaitOutbox', { n: outbox })); return; }
    if (!(await dialog.confirm(t('opener.field.closeConfirm'), { confirmText: t('opener.field.closeDay') }))) return;
    if (demo) { await dialog.alert(t('opener.field.demo.ended')); endDemo(); navigate('/opener', { replace: true }); return; }
    setBusy(true);
    try {
      await api(`/api/opener/routes/${day.route.id}/close`, { method: 'POST' });
      await reload(); await load();
      navigate('/opener/day', { replace: true });
    } catch (e: any) { dialog.alert(e.message); } finally { setBusy(false); }
  };

  const dateLabel = day ? new Date(`${day.date}T12:00:00Z`).toLocaleDateString(lng === 'fr' ? 'fr-CA' : 'en-CA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const s = day?.stats;
  const h = s ? Math.floor(s.durationMin / 60) : 0;
  const m = s ? s.durationMin % 60 : 0;

  return (
    <div className="px-4 pb-44" style={{ paddingTop: 'calc(var(--of-top, env(safe-area-inset-top, 0px)) + 20px)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>{t('opener.field.tabs.day')}</Eyebrow>
          <h1 className="mb-4 text-2xl font-bold capitalize tracking-[-0.01em] text-[var(--of-title)]">{dateLabel}</h1>
        </div>
        <button onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={t('opener.field.toggleTheme') as string}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--of-stroke)] bg-[var(--of-surface)] text-[var(--of-text)]">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {!day && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
      {day && s && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2">
            {[
              { v: `${s.done} / ${s.stops}`, l: t('opener.field.stat.checkins') },
              { v: String(s.leads), l: t('opener.field.stat.leads'), cls: 'text-[var(--of-ok)]' },
              { v: String(s.decisionMakers), l: t('opener.field.stat.decisionMakers') },
              { v: `${fmtDistance(s.distanceM, lng)}${s.durationMin ? ` · ${h} h ${String(m).padStart(2, '0')}` : ''}`, l: t('opener.field.stat.covered') },
              { v: fmtMinutes(s.visitMinutes || 0), l: t('opener.field.stat.visitTime') },
              { v: s.avgVisitMin != null ? fmtMinutes(s.avgVisitMin) : '—', l: t('opener.field.stat.avgVisit') },
            ].map((x) => (
              <Card key={x.l}>
                <p className={`text-[28px] font-bold leading-tight tracking-[-0.02em] ${x.cls || 'text-[var(--of-title)]'} ${x.v.length > 10 ? '!text-xl' : ''}`}>{x.v}</p>
                <p className="text-xs font-medium text-[var(--of-muted)]">{x.l}</p>
              </Card>
            ))}
          </div>

          {day.leads.length > 0 && (
            <>
              <Eyebrow className="mb-2">{t('opener.field.leadsCreated')}</Eyebrow>
              <div className="mb-5 space-y-2">
                {day.leads.map((l) => (
                  <Card key={l.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold text-[var(--of-title)]">{l.businessName}</p>
                        <p className="text-xs text-[var(--of-faint)]">
                          {[l.refCode, l.interest.map((i) => t(`opener.serviceOf.${i}`, { defaultValue: i })).join(', ') || null,
                            l.level ? t('opener.field.interestShort', { n: l.level }) : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone[l.status as LeadStatus] || ''}`}>{t(`leads.status.${l.status}`, { defaultValue: l.status })}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          {day.notVisited.length > 0 && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <Eyebrow>{t('opener.field.notVisited', { n: day.notVisited.length })}</Eyebrow>
                {day.route && day.route.status === 'published' && (
                  <button onClick={postpone} disabled={busy} className="text-xs font-semibold text-primary">{t('opener.field.postpone')}</button>
                )}
              </div>
              <Card className="mb-5 !p-0">
                {day.notVisited.map((n, i) => (
                  <div key={n.id} className={`flex items-center gap-3 px-3.5 py-3 ${i ? 'border-t border-[var(--of-stroke)]' : ''}`}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[n.status as PlaceStatus] }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--of-title)]">{n.name}</p>
                      <p className="text-xs text-[var(--of-faint)]">{n.outcome === 'skipped' ? t(`opener.skip.${n.skipReason || 'other'}`) : t('opener.field.notYet')}</p>
                    </div>
                  </div>
                ))}
              </Card>
            </>
          )}

          {!day.route && <p className="text-sm text-[var(--of-muted)]">{t('opener.field.noRoute')}</p>}
          {day.route?.status === 'closed' && (
            <p className="flex items-center gap-2 rounded-[10px] border border-[var(--of-stroke)] bg-[var(--of-surface)] p-3 text-sm text-[var(--of-ok)]">
              <CheckCircle2 className="h-4 w-4" />{t('opener.field.dayClosed')}
            </p>
          )}
        </>
      )}

      {day?.route?.status === 'published' && (
        <div className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-4 pb-3 pt-6"
          style={{ bottom: 'calc(58px + env(safe-area-inset-bottom, 0px))', background: 'linear-gradient(to bottom, transparent, var(--of-page) 30%)' }}>
          <button onClick={close} disabled={busy} className={`${btnPrimary} w-full`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('opener.field.closeDay')}</button>
        </div>
      )}
      <TabBar />
    </div>
  );
}
