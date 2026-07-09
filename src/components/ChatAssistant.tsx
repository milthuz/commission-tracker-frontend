import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import CleoAvatar from './CleoAvatar';

const API_URL = import.meta.env.VITE_API_URL;

interface ChatMsg { role: 'user' | 'assistant'; content: string; }

// Floating AI help assistant (bottom-right). Glassy translucent bubble that opens a
// chat panel; answers come from the backend /api/assistant/chat (Claude API).
const ChatAssistant: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const token = localStorage.getItem('token');
      const r = await axios.post(`${API_URL}/api/assistant/chat`,
        { messages: next.slice(-12), lang: i18n.language },
        { headers: { Authorization: `Bearer ${token}` } });
      setMsgs([...next, { role: 'assistant', content: r.data.reply || '…' }]);
    } catch (e: any) {
      const status = e?.response?.status;
      setError(
        status === 503 ? (t('assistant.notConfigured') as string)
        : status === 429 ? (t('assistant.rateLimited') as string)
        : (t('assistant.error') as string)
      );
    } finally { setBusy(false); }
  };

  const suggestions: string[] = t('assistant.suggestions', { returnObjects: true }) as unknown as string[];

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-4 z-[9990] flex h-[min(560px,calc(100vh-8rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          {/* Header */}
          <div className="flex items-center justify-between bg-[#1c2434] px-5 py-4">
            <div className="flex items-center gap-3">
              <CleoAvatar className="h-9 w-9" ring />
              <div>
                <p className="text-sm font-semibold text-white">{t('assistant.title')}</p>
                <p className="text-[11px] text-white/70">{t('assistant.subtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {msgs.length > 0 && (
                <button onClick={() => { setMsgs([]); setError(''); }} title={t('assistant.clear') as string}
                  className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
              )}
              <button onClick={() => setOpen(false)} title={t('assistant.close') as string}
                className="rounded p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {msgs.length === 0 && (
              <div>
                <div className="mb-3 rounded-2xl rounded-tl-sm bg-gray-2 px-4 py-3 text-sm text-black dark:bg-meta-4 dark:text-white">
                  {t('assistant.greeting')}
                </div>
                <button
                  onClick={() => { setOpen(false); window.dispatchEvent(new Event('cleo:tour')); }}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-opacity-90">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                  {t('assistant.startTour')}
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
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'rounded-br-sm bg-primary text-white'
                    : 'rounded-tl-sm bg-gray-2 text-black dark:bg-meta-4 dark:text-white'
                }`}>
                  {m.content}
                </div>
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
            className="flex items-center gap-2 border-t border-stroke bg-white px-3 py-3 dark:border-strokedark dark:bg-boxdark"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('assistant.placeholder') as string}
              maxLength={2000}
              className="flex-1 rounded-full border border-stroke bg-white px-4 py-2.5 text-sm text-black outline-none transition focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
            />
            <button type="submit" disabled={busy || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-opacity-90 disabled:opacity-40">
              <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </form>
          <p className="bg-white px-4 pb-2 text-center text-[10px] text-body dark:bg-boxdark">
            {t('assistant.disclaimer')}
          </p>
        </div>
      )}

      {/* Floating bubble — Cleo's Sales Hub mark; shows a close chevron when open */}
      <button
        data-tour="cleo-bubble"
        onClick={() => setOpen(!open)}
        title={t('assistant.title') as string}
        className="group fixed bottom-6 right-4 z-[9990] flex h-12 w-12 items-center justify-center rounded-full shadow-default transition-transform duration-200 hover:scale-110"
      >
        {open ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1c2434]">
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </span>
        ) : (
          <CleoAvatar className="h-12 w-12" ring />
        )}
      </button>
    </>
  );
};

export default ChatAssistant;
