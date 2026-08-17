import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import SofiaAvatar from './SofiaAvatar';

const API_URL = import.meta.env.VITE_API_URL;

// What Sofia looked at to build an answer (read-only CRM tools she already ran).
interface ToolAction { tool: string; }

// A CRM write Sofia WANTS to make. It has not happened yet — the backend signed
// it and handed it back instead of executing, and it only runs if the user
// clicks Confirm. `summary` is built server-side from the actual arguments, so
// what is shown here is what will be sent, not a paraphrase from the model.
interface PendingAction {
  token: string;
  tool: string;
  // `details` is a generic [labelKey, value] list built server-side from the real
  // arguments, so a new write tool renders here without a frontend change.
  summary: {
    kind: string;
    details?: [string, string][];
    content?: string;
    // [field, before, after] — only on updates, where the new value is
    // meaningless without the value it replaces.
    changes?: [string, string, string][];
    error?: string;
  };
}

interface DownloadRef { token: string; filename: string; rowCount: number; }

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  actions?: ToolAction[];
  pending?: PendingAction;
  downloads?: DownloadRef[];
  done?: boolean;   // set once a pending action has been confirmed or cancelled
  // What the user decided. Kept so the thread still shows, on re-reading, that
  // an approval happened here — the card itself is gone by then.
  outcome?: 'sent' | 'cancelled';
}

interface ChatAssistantProps {
  // i18n namespace prefix for all strings below (default: internal Sales Hub copy).
  i18nPrefix?: string;
  // localStorage key holding the bearer token to send.
  tokenKey?: string;
  // Backend endpoint to POST { messages, lang } to.
  endpoint?: string;
  // Event name dispatched when "Start tour" is clicked — the matching tour component listens.
  tourEventName?: string;
  // Show the CRM starter prompts. Passed in rather than read from AuthContext
  // because the Partner Portal reuses this component outside that provider,
  // where useAuth() throws.
  crmEnabled?: boolean;
}

// Floating AI help assistant (bottom-right). Glassy translucent bubble that opens a
// chat panel; answers come from the backend /api/assistant/chat (Claude API) by default.
// Props let the Partner Portal reuse this exact component with its own copy/token/endpoint/tour
// (see PartnerHeader/PartnerChatAssistant.tsx) instead of duplicating the whole widget.
const ChatAssistant: React.FC<ChatAssistantProps> = ({
  i18nPrefix = 'assistant', tokenKey = 'token', endpoint = '/api/assistant/chat', tourEventName = 'sofia:tour',
  crmEnabled = false,
}) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  // Expanded is a real preference, not a per-open toggle: someone who works out
  // of Sofia wants the big panel every time, and re-clicking it on every visit
  // is the kind of small friction that makes people stop using a tool.
  const [expanded, setExpanded] = useState(() => localStorage.getItem('sofia:expanded') === '1');
  const toggleExpanded = () => setExpanded((v) => {
    localStorage.setItem('sofia:expanded', v ? '0' : '1');
    return !v;
  });
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- dictation ------------------------------------------------------------
  // Browser-native speech recognition: no backend, no vendor, no cost. The whole
  // point is the rep who has just hung up and will not open a keyboard to write
  // "called the owner, wants a quote next week".
  //
  // Chrome/Edge/Safari only — Firefox has no SpeechRecognition. The button
  // simply does not render where it is unsupported, rather than failing on click.
  const SR: any = typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);

  const toggleDictation = () => {
    if (!SR) return;
    if (listening) { recogRef.current?.stop(); return; }

    const r = new SR();
    r.lang = i18n.language?.startsWith('fr') ? 'fr-CA' : 'en-CA';
    r.interimResults = true;   // let the user watch it form, and catch mistakes early
    r.continuous = true;       // dictating a call summary takes more than one breath
    recogRef.current = r;

    // Keep whatever was already typed; dictation appends rather than replaces.
    const base = input ? input.trimEnd() + ' ' : '';
    r.onresult = (e: any) => {
      let text = '';
      for (let k = e.resultIndex; k < e.results.length; k++) text += e.results[k][0].transcript;
      setInput(base + text);
    };
    r.onerror = (e: any) => {
      setListening(false);
      // "no-speech" and a user-cancelled permission are not worth an error
      // banner; anything else the user should know about — and it should say
      // WHICH thing went wrong. A generic "dictation stopped" sent me looking at
      // my own code when the real cause was a Permissions-Policy header
      // blocking the microphone site-wide.
      if (!e?.error || ['no-speech', 'aborted'].includes(e.error)) return;
      const key = ['not-allowed', 'service-not-allowed'].includes(e.error)
        ? 'dictationBlocked'
        : e.error === 'network' ? 'dictationNetwork' : 'dictationError';
      setError(t(`${i18nPrefix}.${key}`) as string);
    };
    r.onend = () => { setListening(false); inputRef.current?.focus(); };
    try { r.start(); setListening(true); setError(''); }
    catch {
      // Never fail silently: a button that does nothing on click is the worst
      // possible outcome — the user cannot tell it apart from a broken app.
      setListening(false);
      setError(t(`${i18nPrefix}.dictationError`) as string);
    }
  };

  // Never leave the microphone open when the panel closes.
  useEffect(() => { if (!open && recogRef.current) { recogRef.current.stop(); } }, [open]);

  useEffect(() => {
    // Keep the latest message in view
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy, open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setError('');
    setInput('');
    const next: ChatMsg[] = [...msgs, { role: 'user', content }];
    setMsgs(next);
    setBusy(true);
    try {
      const token = localStorage.getItem(tokenKey);
      const r = await axios.post(`${API_URL}${endpoint}`,
        // Only the plain role/content pairs go back up — the server rebuilds its
        // own tool history, and sending ours would just be noise it discards.
        { messages: next.slice(-12).map(({ role, content }) => ({ role, content })), lang: i18n.language },
        { headers: { Authorization: `Bearer ${token}` } });
      setMsgs([...next, {
        role: 'assistant',
        content: r.data.reply || '…',
        actions: r.data.actions || undefined,
        pending: r.data.pendingAction || undefined,
        downloads: r.data.downloads?.length ? r.data.downloads : undefined,
      }]);
    } catch (e: any) {
      const status = e?.response?.status;
      setError(
        status === 503 ? (t(`${i18nPrefix}.notConfigured`) as string)
        : status === 429 ? (t(`${i18nPrefix}.rateLimited`) as string)
        : (t(`${i18nPrefix}.error`) as string)
      );
    } finally { setBusy(false); }
  };

  // Approve a pending CRM write. The signed token carries the exact call; the
  // server re-checks permission and record ownership before it runs.
  const confirmAction = async (idx: number, action: PendingAction) => {
    if (busy) return;
    setError('');
    setBusy(true);
    setMsgs((prev) => prev.map((m, i) => (i === idx ? { ...m, done: true, outcome: 'sent' } : m)));
    try {
      const token = localStorage.getItem(tokenKey);
      const r = await axios.post(`${API_URL}${endpoint.replace(/\/chat$/, '/confirm-action')}`,
        { token: action.token, lang: i18n.language },
        { headers: { Authorization: `Bearer ${token}` } });
      setMsgs((prev) => [...prev, { role: 'assistant', content: r.data.reply || '…' }]);
    } catch (e: any) {
      // Re-open the card on failure: a write the user approved but that never
      // reached Zoho must not look like it succeeded.
      setMsgs((prev) => prev.map((m, i) => (i === idx ? { ...m, done: false, outcome: undefined } : m)));
      setError(e?.response?.status === 400
        ? (t(`${i18nPrefix}.actionExpired`) as string)
        : (t(`${i18nPrefix}.error`) as string));
    } finally { setBusy(false); }
  };

  const cancelAction = (idx: number) => {
    setMsgs((prev) => [
      ...prev.map((m, i) => (i === idx ? { ...m, done: true, outcome: 'cancelled' as const } : m)),
      { role: 'assistant', content: t(`${i18nPrefix}.actionCancelled`) as string },
    ]);
  };

  // The export route is authenticated, so a plain <a href> would 401 — fetch it
  // as a blob with the bearer header, then hand it to the browser.
  const download = async (d: DownloadRef) => {
    setError('');
    try {
      const token = localStorage.getItem(tokenKey);
      const r = await axios.get(`${API_URL}/api/assistant/export`, {
        params: { token: d.token }, responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = d.filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError(t(`${i18nPrefix}.downloadFailed`) as string);
    }
  };

  const baseSuggestions = t(`${i18nPrefix}.suggestions`, { returnObjects: true }) as unknown as string[];
  // CRM prompts come FIRST when available — they are the reason to open the
  // panel now, and burying them under "how are commissions calculated" is how a
  // new capability goes unnoticed.
  const crmSuggestions = crmEnabled
    ? (t(`${i18nPrefix}.crmSuggestions`, { returnObjects: true, defaultValue: [] }) as unknown as string[])
    : [];
  const suggestions: string[] = [
    ...(Array.isArray(crmSuggestions) ? crmSuggestions : []),
    ...(Array.isArray(baseSuggestions) ? baseSuggestions : []),
  ];

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div className={`fixed bottom-24 right-4 z-[9990] flex flex-col overflow-hidden rounded-2xl border border-stroke bg-white shadow-default transition-[width,height] duration-200 dark:border-strokedark dark:bg-boxdark ${
          expanded
            // Roomy enough for a table of records or a before/after card without
            // every line wrapping. Caps keep it off the sidebar on wide screens
            // and inside the viewport on small ones.
            ? 'h-[calc(100vh-7.5rem)] w-[min(880px,calc(100vw-2rem))]'
            : 'h-[min(620px,calc(100vh-8rem))] w-[min(420px,calc(100vw-2rem))]'
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between bg-[#1c2434] px-5 py-4">
            <div className="flex items-center gap-3">
              <SofiaAvatar className="h-9 w-9" ring />
              <div>
                <p className="text-sm font-semibold text-white">{t(`${i18nPrefix}.title`)}</p>
                <p className="text-[11px] text-white/70">{t(`${i18nPrefix}.subtitle`)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {msgs.length > 0 && (
                <button onClick={() => { setMsgs([]); setError(''); }} title={t(`${i18nPrefix}.clear`) as string}
                  className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
              )}
              {/* Expand / collapse — hidden on phones, where the panel already
                  fills the screen and the control would only take space. */}
              <button onClick={toggleExpanded}
                title={t(`${i18nPrefix}.${expanded ? 'collapse' : 'expand'}`) as string}
                className="hidden rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white sm:block">
                {expanded ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                )}
              </button>
              <button onClick={() => setOpen(false)} title={t(`${i18nPrefix}.close`) as string}
                className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          {/* Expanded, the column is centred and capped: a 880px-wide line of
              text is measurably harder to read than a 700px one, so the extra
              width goes to tables and cards, not to prose. */}
          <div ref={bodyRef}
            className={`flex-1 space-y-3 overflow-y-auto px-4 py-4 ${expanded ? 'mx-auto w-full max-w-3xl' : ''}`}>
            {msgs.length === 0 && (
              <div>
                <div className="mb-3 rounded-2xl rounded-tl-sm bg-gray-2 px-4 py-3 text-sm text-black dark:bg-meta-4 dark:text-white">
                  {t(`${i18nPrefix}.greeting`)}
                </div>
                <button
                  onClick={() => { setOpen(false); window.dispatchEvent(new Event(tourEventName)); }}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-opacity-90">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                  {t(`${i18nPrefix}.startTour`)}
                </button>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(suggestions) && suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="rounded-full border border-stroke bg-white px-3 py-1.5 text-left text-xs text-body transition hover:border-primary hover:text-primary dark:border-strokedark dark:bg-meta-4 dark:text-bodydark">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className="space-y-2">
                {/* What Sofia consulted, above her answer — so a number in the
                    reply can be traced to a lookup instead of taken on faith. */}
                {m.role === 'assistant' && !!m.actions?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.actions.map((a, k) => (
                      <span key={k}
                        className="inline-flex items-center gap-1 rounded-full bg-gray-2 px-2 py-0.5 text-[10px] font-medium text-body dark:bg-meta-4 dark:text-bodydark">
                        <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {t(`${i18nPrefix}.tools.${a.tool}`, { defaultValue: a.tool })}
                      </span>
                    ))}
                  </div>
                )}

                <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-br-sm bg-primary text-white'
                      : 'rounded-tl-sm bg-gray-2 text-black dark:bg-meta-4 dark:text-white'
                  }`}>
                    {m.content}
                  </div>
                </div>

                {/* Settled write — the card is gone, but the thread should still
                    show that a decision was made here, and which one. */}
                {m.pending && m.done && m.outcome && (
                  <p className={`flex items-center gap-1.5 text-[11px] font-medium ${
                    m.outcome === 'sent' ? 'text-success' : 'text-body dark:text-bodydark'
                  }`}>
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round"
                        d={m.outcome === 'sent' ? 'M4.5 12.75l6 6 9-13.5' : 'M6 18L18 6M6 6l12 12'} />
                    </svg>
                    {t(`${i18nPrefix}.outcome.${m.outcome}`)}
                  </p>
                )}

                {/* Pending CRM write — nothing has been sent to Zoho yet. */}
                {m.pending && !m.done && (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-warning">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      {t(`${i18nPrefix}.confirmTitle.${m.pending.summary.kind}`, {
                        defaultValue: t(`${i18nPrefix}.confirmTitle.note`) as string,
                      })}
                    </p>
                    <dl className="mb-3 space-y-1 text-xs text-black dark:text-white">
                      {(m.pending.summary.details || []).map(([key, value]) => (
                        <div key={key}>
                          <dt className="inline text-body dark:text-bodydark">
                            {t(`${i18nPrefix}.field.${key}`, { defaultValue: key })}:{' '}
                          </dt>
                          <dd className="inline font-medium break-words">{value}</dd>
                        </div>
                      ))}
                      {/* Before → after. The struck-through value is what this
                          overwrites; updates have no undo, so it is shown, not
                          summarised. */}
                      {!!m.pending.summary.changes?.length && (
                        <div className="mt-1.5 space-y-1 rounded-lg bg-white p-2 dark:bg-boxdark">
                          {m.pending.summary.changes.map(([field, before, after]) => (
                            <div key={field} className="flex flex-wrap items-baseline gap-1.5">
                              <span className="text-body dark:text-bodydark">
                                {t(`${i18nPrefix}.field.${field}`, { defaultValue: field })}:
                              </span>
                              <span className="text-body line-through dark:text-bodydark">{before || t(`${i18nPrefix}.emptyValue`)}</span>
                              <span className="text-body dark:text-bodydark">→</span>
                              <span className="font-semibold text-black dark:text-white">{after}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {m.pending.summary.error && (
                        <p className="mt-1.5 text-xs font-medium text-danger">{m.pending.summary.error}</p>
                      )}
                      {m.pending.summary.content && (
                        <div className="mt-1.5 whitespace-pre-wrap rounded-lg bg-white p-2 font-medium dark:bg-boxdark">{m.pending.summary.content}</div>
                      )}
                    </dl>
                    <div className="flex gap-2">
                      {/* No Confirm when the preview already failed — offering it
                          would only send a write we know cannot succeed. */}
                      <button onClick={() => confirmAction(i, m.pending!)} disabled={busy || !!m.pending.summary.error}
                        className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-opacity-90 disabled:opacity-40">
                        {t(`${i18nPrefix}.confirmSend`)}
                      </button>
                      <button onClick={() => cancelAction(i)} disabled={busy}
                        className="rounded-lg border border-stroke bg-white px-3 py-2 text-xs font-medium text-body transition hover:border-danger hover:text-danger disabled:opacity-40 dark:border-strokedark dark:bg-boxdark dark:text-bodydark">
                        {t(`${i18nPrefix}.confirmCancel`)}
                      </button>
                    </div>
                  </div>
                )}

                {!!m.downloads?.length && m.downloads.map((d, k) => (
                  <button key={k} onClick={() => download(d)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-stroke bg-white px-3 py-2.5 text-left transition hover:border-primary dark:border-strokedark dark:bg-boxdark">
                    <svg className="h-5 w-5 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-black dark:text-white">{d.filename}</span>
                      <span className="block text-[10px] text-body dark:text-bodydark">{t(`${i18nPrefix}.rows`, { count: d.rowCount })}</span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-gray-2 px-4 py-3 dark:bg-meta-4">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-body [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-body [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-body [animation-delay:300ms]" />
                </div>
              </div>
            )}
            {error && <p className="px-1 text-xs text-danger">{error}</p>}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className={`flex w-full items-center gap-2 border-t border-stroke bg-white px-3 py-3 dark:border-strokedark dark:bg-boxdark ${
              expanded ? 'mx-auto max-w-3xl border-x-0' : ''
            }`}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t(`${i18nPrefix}.${listening ? 'listening' : 'placeholder'}`) as string}
              maxLength={2000}
              className="flex-1 rounded-full border border-stroke bg-white px-4 py-2.5 text-sm text-black outline-none transition focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
            />
            {/* Dictation. It fills the box and stops there — it never submits.
                Speech recognition mishears, and Sofia writes to real customer
                records; the user must get to read it back before it goes. */}
            {SR && (
              <button type="button" onClick={toggleDictation} disabled={busy}
                title={t(`${i18nPrefix}.${listening ? 'stopDictation' : 'dictate'}`) as string}
                aria-pressed={listening}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition disabled:opacity-40 ${
                  listening
                    ? 'animate-pulse bg-danger text-white'
                    : 'border border-stroke text-body hover:border-primary hover:text-primary dark:border-strokedark dark:text-bodydark'
                }`}>
                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </button>
            )}
            <button type="submit" disabled={busy || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-opacity-90 disabled:opacity-40">
              <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </form>
          <p className="bg-white px-4 pb-2 text-center text-[10px] text-body dark:bg-boxdark">
            {t(`${i18nPrefix}.disclaimer`)}
          </p>
        </div>
      )}

      {/* Floating bubble — Sofia's Sales Hub mark; shows a close chevron when open */}
      <button
        data-tour="sofia-bubble"
        onClick={() => setOpen(!open)}
        title={t(`${i18nPrefix}.title`) as string}
        className="group fixed bottom-6 right-4 z-[9990] flex h-12 w-12 items-center justify-center rounded-full shadow-default transition-transform duration-200 hover:scale-110"
      >
        {open ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1c2434]">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </span>
        ) : (
          <SofiaAvatar className="h-12 w-12" ring />
        )}
      </button>
    </>
  );
};

export default ChatAssistant;
