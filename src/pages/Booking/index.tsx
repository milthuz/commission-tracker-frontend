import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ClusterWordmark from '../../components/ClusterWordmark';
import { usePassFavicon } from '../Pass/passUi';

const API_URL = import.meta.env.VITE_API_URL;
const TZ = 'America/Toronto';

// Page PUBLIQUE où le marchand choisit, confirme, change ou annule l'appel de son représentant
// (/rdv?token=…, lien reçu dans le courriel de bienvenue). Aucune session : le jeton est
// l'autorisation. Backend : services/leadBooking.
//
// Marque CLUSTER, pas Sales Hub : le prospect fait affaire avec Cluster (même règle que /sign).
// La langue suit celle de la piste, avec une bascule FR/EN — via getFixedT, pour ne pas réécrire
// la préférence de langue enregistrée dans ce navigateur.
//
// Les heures sont TOUJOURS affichées en heure de Montréal, et c'est écrit : un marchand qui ouvre
// le lien depuis Vancouver ne doit pas croire que « 10 h » est chez lui.

interface Day { date: string; slots: string[] }
interface Info {
  lang: 'fr' | 'en';
  businessName: string;
  firstName: string | null;
  repName: string | null;
  // 'callback' (2026-09-29) : le représentant rappelle « d'ici une heure » ; rien n'est encore fixé.
  appointment: { at: string; status: 'proposed' | 'confirmed' | 'callback'; meetUrl: string | null } | null;
  cancelled: boolean;
  past: boolean;
  enabled: boolean;
  allowCancel: boolean;
  slotMinutes: number;
  days: Day[];
}
type Phase = 'loading' | 'invalid' | 'expired' | 'closed' | 'error' | 'ready' | 'done' | 'cancelledDone';

const Booking = () => {
  usePassFavicon();
  const { i18n } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [lang, setLang] = useState<'en' | 'fr'>(i18n.language?.startsWith('en') ? 'en' : 'fr');
  const t = i18n.getFixedT(lang);
  const locale = lang === 'en' ? 'en-CA' : 'fr-CA';

  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<Info | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const [doneMeet, setDoneMeet] = useState<string | null>(null);

  const api = `${API_URL}/api/public/lead-booking/${encodeURIComponent(token)}`;

  const load = useCallback(async (keepLang = false) => {
    if (!token) { setPhase('invalid'); return; }
    try {
      const r = await fetch(api);
      const d = await r.json().catch(() => ({}));
      if (r.status === 410) { setPhase(d.error === 'expired' ? 'expired' : 'closed'); return; }
      if (!r.ok) { setPhase(r.status === 404 ? 'invalid' : 'error'); return; }
      setInfo(d);
      if (!keepLang) setLang(d.lang === 'en' ? 'en' : 'fr');
      const firstWithSlots = (d.days as Day[]).find((x) => x.slots.length);
      setDay(firstWithSlots?.date || d.days[0]?.date || null);
      setPicked(null);
      setPhase('ready');
    } catch { setPhase('error'); }
  }, [api, token]);

  useEffect(() => { document.title = 'Cluster'; load(); }, [load]);

  const fmtWhen = (iso: string) => new Date(iso).toLocaleString(locale, {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  });
  // « d'ici une heure » quand c'est vrai, sinon le jour et l'heure (même règle que le courriel).
  const callbackWhen = (iso: string) => {
    const mins = (new Date(iso).getTime() - Date.now()) / 60000;
    if (mins <= 65) return t('booking.withinHour') as string;
    if (mins <= 125) return t('booking.withinTwoHours') as string;
    return t('booking.onDay', { when: fmtWhen(iso) }) as string;
  };
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(locale, { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  // La date d'un jour (« AAAA-MM-JJ ») lue à midi UTC : aucun fuseau ne la fait changer de jour.
  const dayLabel = (date: string) => {
    const d = new Date(`${date}T12:00:00Z`);
    return {
      weekday: d.toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short' }),
      day: d.toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' }),
    };
  };

  const slots = useMemo(() => info?.days.find((d) => d.date === day)?.slots || [], [info, day]);

  const book = async (at: string) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${api}/book`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ at }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409 && d.error === 'slot_taken') {
        setError(t('booking.slotTaken') as string);
        await load(true);
        return;
      }
      if (!r.ok) throw new Error();
      setDoneAt(at);
      setDoneMeet(d.appointment?.meetUrl || null);
      setPhase('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { setError(t('booking.failed') as string); } finally { setBusy(false); }
  };

  const cancel = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`${api}/cancel`, { method: 'POST' });
      if (!r.ok) throw new Error();
      setPhase('cancelledDone');
      setConfirmCancel(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { setError(t('booking.failed') as string); } finally { setBusy(false); }
  };

  const message = (title: string, body: string, tone: 'ok' | 'warn' = 'warn', action?: React.ReactNode) => (
    <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-xl ${tone === 'ok' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-[#f26b21]'}`}>
        {tone === 'ok' ? '✓' : '!'}
      </div>
      <h1 className="mb-2 text-xl font-semibold text-gray-900">{title}</h1>
      <p className="text-[15px] leading-relaxed text-gray-600">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );

  const rep = info?.repName || (t('booking.yourAdvisor') as string);
  // Le lien Google Meet de l'événement du représentant (créé par Google, identique d'un
  // déplacement à l'autre).
  const meetLink = (url: string | null | undefined) => (url ? (
    <a href={url} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-xl border border-[#1a73e8]/30 bg-[#1a73e8]/5 px-4 py-2.5 text-sm font-semibold text-[#1a73e8] transition hover:bg-[#1a73e8]/10">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 10 4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>
      {t('booking.joinMeet')}
    </a>
  ) : null);
  const appt = info?.appointment;
  const againBtn = (
    <button type="button" onClick={() => { setPhase('loading'); load(true); }}
      className="text-sm font-medium text-[#f26b21] underline-offset-2 hover:underline">
      {t('booking.changeAgain')}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#f6f5f3] text-gray-900">
      <header className="bg-[#1f1f1f]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <ClusterWordmark tone="dark" className="h-[24px] w-auto" />
          <div className="flex rounded-full bg-white/10 p-0.5 text-xs font-medium">
            {(['fr', 'en'] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)}
                className={`rounded-full px-3 py-1 transition ${lang === l ? 'bg-white text-gray-900' : 'text-white/80 hover:text-white'}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="h-1 bg-[#f26b21]" />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        {phase === 'loading' && <p className="py-20 text-center text-gray-500">{t('booking.loading')}</p>}
        {phase === 'invalid' && message(t('booking.invalidTitle'), t('booking.invalidBody'))}
        {phase === 'expired' && message(t('booking.expiredTitle'), t('booking.expiredBody'))}
        {phase === 'closed' && message(t('booking.closedTitle'), t('booking.closedBody'))}
        {phase === 'error' && message(t('booking.errorTitle'), t('booking.errorBody'))}
        {phase === 'done' && doneAt && message(t('booking.doneTitle'), t('booking.doneBody', { rep, when: fmtWhen(doneAt) }), 'ok', (
          <div className="flex flex-col items-center gap-4">{meetLink(doneMeet)}{againBtn}</div>
        ))}
        {phase === 'cancelledDone' && message(t('booking.cancelledTitle'), t('booking.cancelledBody'), 'ok', againBtn)}

        {phase === 'ready' && info && (
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-[#f26b21]">{t('booking.eyebrow')}</p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
                {info.firstName ? t('booking.hello', { name: info.firstName }) : t('booking.helloAnon')}
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
                {info.appointment?.status === 'callback'
                  ? t('booking.introCallback', { rep, business: info.businessName })
                  : t('booking.intro', { rep, business: info.businessName, minutes: info.slotMinutes })}
              </p>
            </div>

            {/* Le rendez-vous actuel, s'il y en a un. */}
            {appt && (
              <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {appt.status === 'confirmed' ? t('booking.currentConfirmed')
                        : appt.status === 'callback' ? t('booking.currentCallback') : t('booking.currentProposed')}
                    </p>
                    <p className="mt-1 text-lg font-semibold first-letter:uppercase">
                      {appt.status === 'callback' ? t('booking.callbackLine', { rep, when: callbackWhen(appt.at) }) : fmtWhen(appt.at)}
                    </p>
                  </div>
                  {appt.status === 'proposed' && !info.past && (
                    <button type="button" onClick={() => book(appt.at)} disabled={busy}
                      className="rounded-xl bg-[#f26b21] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#dc5a14] disabled:opacity-40">
                      {t('booking.confirmThis')}
                    </button>
                  )}
                </div>
                {!info.past && appt.meetUrl && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {meetLink(appt.meetUrl)}
                    <span className="text-xs text-gray-500">{t('booking.meetNote')}</span>
                  </div>
                )}
                {info.past && <p className="mt-3 text-sm text-gray-600">{t('booking.pastBody')}</p>}
              </section>
            )}
            {!appt && info.cancelled && (
              <p className="rounded-xl bg-orange-50 px-4 py-3 text-sm text-gray-700">{t('booking.wasCancelled')}</p>
            )}

            {!info.past && info.enabled && (
              <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
                <h2 className="font-semibold">{appt?.status === 'callback' ? t('booking.pickInsteadOfCallback') : appt ? t('booking.pickOther') : t('booking.pick')}</h2>
                <p className="mb-4 mt-0.5 text-xs text-gray-500">{t('booking.tzNote')}</p>

                <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
                  {info.days.map((d) => {
                    const l = dayLabel(d.date);
                    const on = d.date === day;
                    return (
                      <button key={d.date} type="button" onClick={() => { setDay(d.date); setPicked(null); }}
                        className={`min-w-[76px] shrink-0 rounded-xl border px-3 py-2 text-center transition ${
                          on ? 'border-[#f26b21] bg-orange-50 text-gray-900' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                        } ${!d.slots.length ? 'opacity-50' : ''}`}>
                        <span className="block text-xs uppercase text-gray-500">{l.weekday}</span>
                        <span className="block text-sm font-semibold">{l.day}</span>
                      </button>
                    );
                  })}
                </div>

                {slots.length ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {slots.map((s) => {
                      const isCurrent = appt?.at === s;
                      const on = picked === s;
                      return (
                        <button key={s} type="button" disabled={isCurrent} onClick={() => setPicked(s)}
                          className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition ${
                            on ? 'border-[#f26b21] bg-[#f26b21] text-white'
                              : isCurrent ? 'cursor-default border-gray-200 bg-gray-100 text-gray-400'
                              : 'border-gray-200 text-gray-800 hover:border-[#f26b21]'
                          }`}>
                          {fmtTime(s)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">{t('booking.dayFull')}</p>
                )}

                {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

                <button type="button" onClick={() => picked && book(picked)} disabled={!picked || busy}
                  className="mt-5 w-full rounded-xl bg-[#f26b21] px-6 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#dc5a14] disabled:cursor-not-allowed disabled:opacity-40">
                  {busy ? t('booking.saving') : picked ? t('booking.confirmAt', { when: fmtWhen(picked) }) : t('booking.pickFirst')}
                </button>
              </section>
            )}

            {appt && !info.past && info.allowCancel && (
              <div className="text-center">
                {!confirmCancel ? (
                  <button type="button" onClick={() => setConfirmCancel(true)} className="text-sm text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline">
                    {appt?.status === 'callback' ? t('booking.cancelCallbackLink') : t('booking.cancelLink')}
                  </button>
                ) : (
                  <div className="rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-gray-200">
                    <h3 className="mb-1 font-semibold">{appt?.status === 'callback' ? t('booking.cancelCallbackTitle') : t('booking.cancelTitle')}</h3>
                    <p className="text-sm text-gray-600">{t('booking.cancelBody', { rep })}</p>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => setConfirmCancel(false)} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">{t('booking.back')}</button>
                      <button type="button" onClick={cancel} disabled={busy} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{t('booking.cancelConfirm')}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
      <footer className="pb-8 text-center text-xs text-gray-400">© {new Date().getFullYear()} Cluster Systems · clusterpos.com</footer>
    </div>
  );
};

export default Booking;
