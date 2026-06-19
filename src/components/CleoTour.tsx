import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import CleoAvatar from './CleoAvatar';

const API_URL = import.meta.env.VITE_API_URL;
const TOUR_KEY = 'cleo-tour-v1';

interface ChatMsg { role: 'user' | 'assistant'; content: string; }

interface Step { selector: string | null; titleKey: string; bodyKey: string; }

// Ordered steps. selector=null → centered (welcome). Steps whose target isn't on the page are
// auto-skipped (e.g. a rep without a given nav item).
const STEPS: Step[] = [
  { selector: null,                          titleKey: 'tour.welcomeTitle', bodyKey: 'tour.welcomeBody' },
  { selector: '[data-tour="sidebar-toggle"]', titleKey: 'tour.menuTitle',    bodyKey: 'tour.menuBody' },
  { selector: '[data-tour="nav-dashboard"]',  titleKey: 'tour.dashTitle',    bodyKey: 'tour.dashBody' },
  { selector: '[data-tour="nav-tracker"]',    titleKey: 'tour.trackerTitle', bodyKey: 'tour.trackerBody' },
  { selector: '[data-tour="nav-report"]',     titleKey: 'tour.reportTitle',  bodyKey: 'tour.reportBody' },
  { selector: '[data-tour="cleo-bubble"]',    titleKey: 'tour.cleoTitle',    bodyKey: 'tour.cleoBody' },
];

const PAD = 8;
const CARD_W = 320;

const CleoTour: React.FC = () => {
  const { t } = useTranslation();
  const [run, setRun] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // In-tour mini chat — ask Cleo a question without leaving the tour.
  const [askMsgs, setAskMsgs] = useState<ChatMsg[]>([]);
  const [askInput, setAskInput] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const askBodyRef = useRef<HTMLDivElement>(null);

  const sendAsk = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = askInput.trim();
    if (!content || askBusy) return;
    setAskInput('');
    const nextMsgs: ChatMsg[] = [...askMsgs, { role: 'user', content }];
    setAskMsgs(nextMsgs);
    setAskBusy(true);
    try {
      const token = localStorage.getItem('token');
      const r = await axios.post(`${API_URL}/api/assistant/chat`,
        { messages: nextMsgs.slice(-12) },
        { headers: { Authorization: `Bearer ${token}` } });
      setAskMsgs([...nextMsgs, { role: 'assistant', content: r.data.reply || '…' }]);
    } catch {
      setAskMsgs([...nextMsgs, { role: 'assistant', content: t('tour.askError') as string }]);
    } finally { setAskBusy(false); }
  };

  useEffect(() => { askBodyRef.current?.scrollTo({ top: askBodyRef.current.scrollHeight }); }, [askMsgs, askBusy]);

  // Resolve the visible steps (skip targets that don't exist for this user/page).
  const steps = STEPS.filter(s => s.selector === null || document.querySelector(s.selector));
  const step = steps[idx];

  const measure = useCallback(() => {
    if (!step) return;
    if (!step.selector) { setRect(null); return; }
    const el = document.querySelector(step.selector) as HTMLElement | null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useEffect(() => {
    if (!run) return;
    measure();
    const onMove = () => measure();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [run, idx, measure]);

  // Start: auto on first login (desktop only), or on the 'cleo:tour' event (from Cleo chat).
  useEffect(() => {
    const start = () => { setIdx(0); setRun(true); };
    window.addEventListener('cleo:tour', start);
    let timer: any;
    if (!localStorage.getItem(TOUR_KEY) && window.innerWidth >= 1024) {
      timer = setTimeout(start, 900);
    }
    return () => { window.removeEventListener('cleo:tour', start); if (timer) clearTimeout(timer); };
  }, []);

  const finish = () => { localStorage.setItem(TOUR_KEY, 'done'); setRun(false); setIdx(0); setAskMsgs([]); setAskInput(''); };
  const next = () => { if (idx < steps.length - 1) setIdx(idx + 1); else finish(); };
  const back = () => setIdx(Math.max(0, idx - 1));

  if (!run || !step) return null;

  const vw = window.innerWidth, vh = window.innerHeight;
  // Spotlight box (around the target) with padding.
  const spot = rect ? {
    top: Math.max(0, rect.top - PAD), left: Math.max(0, rect.left - PAD),
    width: rect.width + PAD * 2, height: rect.height + PAD * 2,
  } : null;

  // Card placement: centered when no target; else below the target, clamped to stay on-screen
  // (the mini chat can make the card taller, so we cap height + allow internal scroll).
  const EST = askMsgs.length ? 420 : 240;
  let cardStyle: React.CSSProperties = { maxHeight: 'calc(100vh - 16px)' };
  if (!rect) {
    cardStyle = { ...cardStyle, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
  } else {
    const left = Math.min(Math.max(8, rect.left), vw - CARD_W - 8);
    const top = Math.max(8, Math.min(rect.bottom + 12, vh - EST - 8));
    cardStyle = { ...cardStyle, top, left };
  }

  return (
    <div className="fixed inset-0 z-[10000]">
      {/* Click-blocker so the tour is modal (avoids navigating the app behind it). */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {/* Dim + spotlight. With a target, a transparent box casts a huge shadow over everything else. */}
      {spot ? (
        <div
          className="absolute rounded-xl ring-2 ring-white/80 transition-all duration-300"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, boxShadow: '0 0 0 9999px rgba(15,23,42,0.62)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(15,23,42,0.62)]" />
      )}

      {/* Cleo card */}
      <div className="absolute flex w-[320px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark" style={cardStyle}>
        <div className="overflow-y-auto p-4">
        <div className="flex items-start gap-3">
          <CleoAvatar className="h-10 w-10 shrink-0" ring />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-black dark:text-white">{t(step.titleKey)}</p>
            <p className="mt-1 text-sm leading-snug text-body dark:text-gray-300">{t(step.bodyKey)}</p>
          </div>
        </div>

        {/* In-tour mini chat */}
        <div ref={askBodyRef} className="mt-3 max-h-40 space-y-2 overflow-y-auto">
          {askMsgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2 text-xs leading-relaxed ${
                m.role === 'user' ? 'rounded-br-sm bg-primary text-white' : 'rounded-tl-sm bg-gray-2 text-black dark:bg-meta-4 dark:text-white'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {askBusy && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-xl rounded-tl-sm bg-gray-2 px-3 py-2 dark:bg-meta-4">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-body [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-body [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-body [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
        <form onSubmit={sendAsk} className="mt-2 flex items-center gap-2">
          <input
            value={askInput}
            onChange={(e) => setAskInput(e.target.value)}
            placeholder={t('tour.askPlaceholder') as string}
            maxLength={2000}
            className="flex-1 rounded-full border border-stroke bg-white px-3 py-1.5 text-xs text-black outline-none transition focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white"
          />
          <button type="submit" disabled={askBusy || !askInput.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-opacity-90 disabled:opacity-40">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          </button>
        </form>
        </div>

        {/* Pinned footer: progress + navigation */}
        <div className="flex items-center justify-between border-t border-stroke px-4 py-3 dark:border-strokedark">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-primary' : 'w-1.5 bg-gray-300 dark:bg-meta-4'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={finish} className="text-xs font-medium text-body hover:text-black dark:hover:text-white">{t('tour.skip')}</button>
            {idx > 0 && (
              <button onClick={back} className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:hover:bg-meta-4">{t('tour.back')}</button>
            )}
            <button onClick={next} className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90">
              {idx === steps.length - 1 ? t('tour.done') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CleoTour;
