import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// The page is a fixed 792×612 pt landscape canvas (same as the cover / the PDF output).
// Elements are absolutely positioned in points with a TOP-LEFT origin — the backend pdf-lib
// renderer uses the exact same coordinates, so the on-screen canvas == the final PDF.
const PAGE_W = 792, PAGE_H = 612;

type LangText = { fr: string; en: string };
type Align = 'left' | 'center' | 'right';
interface ElBase { id: string; type: 'text' | 'image' | 'rect'; x: number; y: number; w: number; h: number; }
interface TextEl extends ElBase { type: 'text'; text: LangText; size: number; color: string; align: Align; bold: boolean; }
interface ImageEl extends ElBase { type: 'image'; assetId: number | null; }
interface RectEl extends ElBase { type: 'rect'; color: string; }
type El = TextEl | ImageEl | RectEl;
type NewEl = Omit<TextEl, 'id'> | Omit<ImageEl, 'id'> | Omit<RectEl, 'id'>;
interface Slide { id: string; bg: string; bgImageId: number | null; elements: El[]; }
interface Asset { id: number; filename: string; mime: string; }

const genId = () => `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lt = (fr = '', en = ''): LangText => ({ fr, en });
const isDark = (hex: string) => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return false; const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 140;
};

// Session cache of asset blob URLs (authenticated fetch — the endpoint needs the Bearer token).
const assetUrlCache = new Map<number, string>();
function useAssetUrl(id: number | null | undefined) {
  const [url, setUrl] = useState(id != null ? assetUrlCache.get(id) || '' : '');
  useEffect(() => {
    if (id == null) { setUrl(''); return; }
    if (assetUrlCache.has(id)) { setUrl(assetUrlCache.get(id)!); return; }
    let active = true;
    axios.get(`${API_URL}/api/proposals/deck/assets/${id}`, { headers: authHeaders(), responseType: 'blob' })
      .then(r => { const u = URL.createObjectURL(r.data); assetUrlCache.set(id, u); if (active) setUrl(u); }).catch(() => {});
    return () => { active = false; };
  }, [id]);
  return url;
}
const DeckImg: React.FC<{ id: number; className?: string; style?: React.CSSProperties }> = ({ id, className, style }) => {
  const url = useAssetUrl(id);
  return url ? <img src={url} className={className} style={style} alt="" draggable={false} /> : <div className={className} style={style} />;
};

const ProposalDeckEditor: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [, setAssets] = useState<Asset[]>([]);
  const [sel, setSel] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editLang, setEditLang] = useState<'fr' | 'en'>(i18n.language?.startsWith('en') ? 'en' : 'fr');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const [scale, setScale] = useState(1);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const curSlide: Slide | undefined = slides[sel];
  const selEl = curSlide?.elements.find(e => e.id === selId) || null;

  // --- load / save ---
  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/proposals/deck`, { headers: authHeaders() });
      const sl: Slide[] = r.data.deck?.slides?.length ? r.data.deck.slides : [{ id: genId(), bg: '#ffffff', bgImageId: null, elements: [] }];
      setSlides(sl); setAssets(r.data.assets || []);
    } catch { setSlides([{ id: genId(), bg: '#ffffff', bgImageId: null, elements: [] }]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    setSaving(true);
    try { await axios.put(`${API_URL}/api/proposals/deck`, { deck: { slides } }, { headers: authHeaders() }); setDirty(false); }
    catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };
  const loadStarter = async () => {
    const hasContent = slides.some(s => s.elements.length > 0 || s.bgImageId != null);
    if (hasContent && !(await dialog.confirm(t('deck.loadTemplateConfirm') as string, { danger: true, confirmText: t('deck.loadTemplate') as string }))) return;
    setBusy(true);
    try {
      const r = await axios.get(`${API_URL}/api/proposals/deck/starter`, { headers: authHeaders() });
      if (r.data.deck?.slides?.length) { setSlides(r.data.deck.slides); setSel(0); setSelId(null); setDirty(true); }
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const previewPdf = async () => {
    setBusy(true);
    try {
      if (dirty) await save();
      const r = await axios.get(`${API_URL}/api/proposals/deck/preview`, { headers: authHeaders(), params: { lang: editLang }, responseType: 'blob' });
      window.open(URL.createObjectURL(r.data), '_blank');
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('deck.previewError')); }
    finally { setBusy(false); }
  };

  // --- canvas scale tracking ---
  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const apply = () => { const s = el.clientWidth / PAGE_W; scaleRef.current = s; setScale(s); };
    apply();
    const ro = new ResizeObserver(apply); ro.observe(el); return () => ro.disconnect();
  }, [sel, loading]);

  // --- slide ops ---
  const patchSlide = (i: number, patch: Partial<Slide>) => { setSlides(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s)); setDirty(true); };
  const addSlide = () => { setSlides(prev => [...prev, { id: genId(), bg: '#ffffff', bgImageId: null, elements: [] }]); setSel(slides.length); setSelId(null); setDirty(true); };
  const delSlide = async (i: number) => {
    if (slides.length <= 1) { dialog.alert(t('deck.needOneSlide')); return; }
    if (!(await dialog.confirm(t('deck.delSlideConfirm') as string, { danger: true, confirmText: t('common.delete') as string }))) return;
    setSlides(prev => prev.filter((_, idx) => idx !== i)); setSel(p => Math.max(0, p >= i ? p - 1 : p)); setSelId(null); setDirty(true);
  };
  const moveSlide = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= slides.length) return;
    setSlides(prev => { const a = [...prev]; [a[i], a[j]] = [a[j], a[i]]; return a; }); setSel(j); setDirty(true);
  };

  // --- element ops ---
  const updateEl = (elId: string, patch: Partial<El> | ((e: El) => Partial<El>)) =>
    setSlides(prev => prev.map((s, i) => i !== sel ? s : { ...s, elements: s.elements.map(e => e.id !== elId ? e : ({ ...e, ...(typeof patch === 'function' ? patch(e) : patch) }) as El) }));
  const patchEl = (elId: string, patch: Partial<El>) => { updateEl(elId, patch); setDirty(true); };
  const addEl = (el: NewEl) => { const id = genId(); setSlides(prev => prev.map((s, i) => i !== sel ? s : { ...s, elements: [...s.elements, { ...el, id } as El] })); setSelId(id); setDirty(true); };
  const delEl = (elId: string) => { setSlides(prev => prev.map((s, i) => i !== sel ? s : { ...s, elements: s.elements.filter(e => e.id !== elId) })); setSelId(null); setDirty(true); };
  const reorderEl = (elId: string, toBack: boolean) => setSlides(prev => prev.map((s, i) => {
    if (i !== sel) return s; const e = s.elements.find(x => x.id === elId); if (!e) return s;
    const rest = s.elements.filter(x => x.id !== elId); setDirty(true);
    return { ...s, elements: toBack ? [e, ...rest] : [...rest, e] };
  }));

  const addText = () => addEl({ type: 'text', x: 80, y: 80, w: 380, h: 60, text: lt('Nouveau texte', 'New text'), size: 22, color: isDark(curSlide?.bg || '#fff') ? '#ffffff' : '#1c2434', align: 'left', bold: false });
  const addRect = () => addEl({ type: 'rect', x: 80, y: 80, w: 320, h: 110, color: '#1c2434' });

  // --- image upload ---
  const upload = async (f: File): Promise<number | null> => {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await axios.post(`${API_URL}/api/proposals/deck/assets`, fd, { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } });
      setAssets(a => [{ id: r.data.id, filename: r.data.filename, mime: r.data.mime }, ...a]);
      return r.data.id as number;
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Upload failed'); return null; }
    finally { setBusy(false); }
  };
  const naturalSize = (f: File) => new Promise<{ w: number; h: number }>(res => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 320, h: 220 }); im.src = URL.createObjectURL(f); });
  const onAddImage = async (f?: File) => {
    if (!f) return; const id = await upload(f); if (id == null) return;
    const dim = await naturalSize(f); const w = 320; const h = Math.round(w * (dim.h / dim.w)) || 220;
    addEl({ type: 'image', x: 80, y: 80, w, h, assetId: id });
  };
  const onReplaceImage = async (elId: string, f?: File) => { if (!f) return; const id = await upload(f); if (id != null) patchEl(elId, { assetId: id }); };
  const onSetBg = async (f?: File) => { if (!f) return; const id = await upload(f); if (id != null) patchSlide(sel, { bgImageId: id }); };

  // --- drag / resize ---
  const startDrag = (e: React.MouseEvent, elId: string, mode: 'move' | 'resize') => {
    if (editingId === elId) return;
    e.preventDefault(); e.stopPropagation(); setSelId(elId);
    const startX = e.clientX, startY = e.clientY, sc = scaleRef.current || 1;
    const el0 = curSlide!.elements.find(x => x.id === elId); if (!el0) return;
    const ox = el0.x, oy = el0.y, ow = el0.w, oh = el0.h, type = el0.type;
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / sc, dy = (ev.clientY - startY) / sc;
      updateEl(elId, () => mode === 'move'
        ? { x: clamp(Math.round(ox + dx), 0, PAGE_W - 10), y: clamp(Math.round(oy + dy), 0, PAGE_H - 10) }
        : type === 'text' ? { w: Math.max(30, Math.round(ow + dx)) }
          : { w: Math.max(16, Math.round(ow + dx)), h: Math.max(16, Math.round(oh + dy)) });
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); setDirty(true); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };

  // --- keyboard: Delete removes the selected element ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingId) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault(); delEl(selId);
      }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [selId, editingId, sel]);

  const beginEdit = (el: TextEl) => { setEditingId(el.id); setEditText(el.text[editLang] || ''); setSelId(el.id); };
  const commitEdit = () => { if (editingId) patchEl(editingId, { text: { ...(selEl as TextEl).text, [editLang]: editText } } as any); setEditingId(null); };

  // --- render one element on the canvas ---
  const renderEl = (el: El) => {
    const sa = el.id === selId;
    const common: React.CSSProperties = {
      position: 'absolute', left: `${(el.x / PAGE_W) * 100}%`, top: `${(el.y / PAGE_H) * 100}%`,
      width: `${(el.w / PAGE_W) * 100}%`, ...(el.type !== 'text' ? { height: `${(el.h / PAGE_H) * 100}%` } : {}),
      cursor: 'move', outline: sa ? '2px solid #fe6523' : 'none', outlineOffset: 1,
    };
    const handle = sa && (
      <div onMouseDown={(e) => startDrag(e, el.id, 'resize')} title={t('deck.resize') as string}
        style={{ position: 'absolute', right: -5, bottom: -5, width: 11, height: 11, background: '#fe6523', borderRadius: 2, cursor: 'nwse-resize', border: '1.5px solid #fff' }} />
    );
    if (el.type === 'text') {
      const editing = editingId === el.id;
      const style: React.CSSProperties = { ...common, fontFamily: 'Helvetica, Arial, sans-serif', fontSize: el.size * scale, lineHeight: 1.3, color: el.color, textAlign: el.align, fontWeight: el.bold ? 700 : 400, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
      if (editing) return (
        <textarea key={el.id} autoFocus value={editText} onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setEditText(e.target.value)} onBlur={commitEdit}
          style={{ ...style, cursor: 'text', outline: '2px solid #fe6523', background: 'rgba(255,255,255,0.06)', border: 'none', resize: 'none', overflow: 'hidden', padding: 0 }} />
      );
      return (
        <div key={el.id} style={style} onMouseDown={(e) => startDrag(e, el.id, 'move')} onDoubleClick={() => beginEdit(el)}>
          {(el.text[editLang] || el.text.fr || el.text.en || '') || <span style={{ opacity: 0.4 }}>{t('deck.textboxEmpty')}</span>}
          {handle}
        </div>
      );
    }
    if (el.type === 'rect') return (
      <div key={el.id} style={{ ...common, background: el.color }} onMouseDown={(e) => startDrag(e, el.id, 'move')}>{handle}</div>
    );
    return (
      <div key={el.id} style={common} onMouseDown={(e) => startDrag(e, el.id, 'move')}>
        {el.assetId != null ? <DeckImg id={el.assetId} style={{ width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eef2f7', color: '#94a3b8', fontSize: 12 }}>{t('deck.noImage')}</div>}
        {handle}
      </div>
    );
  };

  const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-stroke bg-white px-2.5 py-1.5 text-xs font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4';
  const numField = 'w-14 rounded border border-stroke bg-transparent px-1.5 py-1 text-xs dark:border-strokedark dark:bg-form-input';

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div>
      {/* Top toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-stroke bg-white p-3 shadow-default dark:border-strokedark dark:bg-boxdark">
        <button onClick={loadStarter} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          {t('deck.loadTemplate')}
        </button>
        <span className="mx-1 h-5 w-px bg-stroke dark:bg-strokedark" />
        <button onClick={addText} className={btn}>+ {t('deck.addText')}</button>
        <label className={`${btn} cursor-pointer`}>+ {t('deck.addImage')}<input ref={imgInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { onAddImage(e.target.files?.[0]); if (imgInputRef.current) imgInputRef.current.value = ''; }} /></label>
        <button onClick={addRect} className={btn}>+ {t('deck.addRect')}</button>
        <span className="mx-1 h-5 w-px bg-stroke dark:bg-strokedark" />
        <label className="flex items-center gap-1.5 text-xs text-body">{t('deck.pageBg')}
          <input type="color" value={curSlide?.bg || '#ffffff'} onChange={(e) => patchSlide(sel, { bg: e.target.value })} className="h-7 w-9 rounded border border-stroke dark:border-strokedark" /></label>
        <label className={`${btn} cursor-pointer`}>{t('deck.bgImage')}<input ref={bgInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { onSetBg(e.target.files?.[0]); if (bgInputRef.current) bgInputRef.current.value = ''; }} /></label>
        {curSlide?.bgImageId != null && <button onClick={() => patchSlide(sel, { bgImageId: null })} className="text-xs text-danger hover:underline">{t('deck.clearBg')}</button>}

        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-stroke p-1 dark:border-strokedark">
            {(['fr', 'en'] as const).map(l => (
              <button key={l} onClick={() => { if (editingId) commitEdit(); setEditLang(l); }} className={`rounded-md px-2.5 py-1 text-xs font-medium ${editLang === l ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`}>{l.toUpperCase()}</button>
            ))}
          </div>
          {dirty && <span className="text-xs text-warning">{t('deck.unsaved')}</span>}
          <button onClick={previewPdf} disabled={busy} className={btn}>{busy ? '…' : t('deck.previewPdf')}</button>
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : null}{t('common.save')}</button>
        </div>
      </div>

      {/* Selected-element property bar */}
      {selEl && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-semibold uppercase tracking-wide text-primary">{t(`deck.el_${selEl.type}`)}</span>
          {selEl.type === 'text' && (<>
            <label className="flex items-center gap-1">{t('deck.size')}<input type="number" min={6} max={120} value={selEl.size} onChange={(e) => patchEl(selEl.id, { size: parseInt(e.target.value) || 16 } as any)} className={numField} /></label>
            <label className="flex items-center gap-1">{t('deck.color')}<input type="color" value={selEl.color} onChange={(e) => patchEl(selEl.id, { color: e.target.value } as any)} className="h-7 w-8 rounded border border-stroke dark:border-strokedark" /></label>
            <button onClick={() => patchEl(selEl.id, { bold: !selEl.bold } as any)} className={`rounded px-2 py-1 font-bold ${selEl.bold ? 'bg-primary text-white' : 'border border-stroke dark:border-strokedark'}`}>B</button>
            <div className="flex items-center gap-0.5">
              {(['left', 'center', 'right'] as Align[]).map(a => <button key={a} onClick={() => patchEl(selEl.id, { align: a } as any)} className={`rounded px-2 py-1 ${selEl.align === a ? 'bg-primary text-white' : 'border border-stroke dark:border-strokedark'}`}>{t(`deck.align_${a}`)}</button>)}
            </div>
            <button onClick={() => beginEdit(selEl as TextEl)} className={btn}>{t('deck.editText')}</button>
          </>)}
          {selEl.type === 'rect' && (
            <label className="flex items-center gap-1">{t('deck.color')}<input type="color" value={selEl.color} onChange={(e) => patchEl(selEl.id, { color: e.target.value } as any)} className="h-7 w-8 rounded border border-stroke dark:border-strokedark" /></label>
          )}
          {selEl.type === 'image' && (
            <label className={`${btn} cursor-pointer`}>{t('deck.replaceImage')}<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => onReplaceImage(selEl.id, e.target.files?.[0])} /></label>
          )}
          <span className="mx-1 h-4 w-px bg-stroke dark:bg-strokedark" />
          <button onClick={() => reorderEl(selEl.id, false)} className={btn} title={t('deck.toFront') as string}>{t('deck.toFront')}</button>
          <button onClick={() => reorderEl(selEl.id, true)} className={btn} title={t('deck.toBack') as string}>{t('deck.toBack')}</button>
          <button onClick={() => delEl(selEl.id)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-danger px-2.5 py-1.5 font-medium text-danger hover:bg-danger hover:text-white">{t('common.delete')}</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[150px_minmax(0,1fr)]">
        {/* Slide rail */}
        <div className="space-y-2">
          {slides.map((s, i) => (
            <div key={s.id} onClick={() => { setSel(i); setSelId(null); }} className={`cursor-pointer overflow-hidden rounded-lg border ${i === sel ? 'border-primary ring-1 ring-primary' : 'border-stroke dark:border-strokedark'}`}>
              <div className="relative" style={{ background: s.bg, aspectRatio: `${PAGE_W}/${PAGE_H}` }}>
                {s.bgImageId != null && <DeckImg id={s.bgImageId} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
                <span className={`absolute left-1 top-1 rounded bg-black/40 px-1 text-[10px] font-semibold text-white`}>{i + 1}</span>
              </div>
              <div className="flex items-center justify-between px-1.5 py-1">
                <span className="text-[10px] text-gray-400">{t('deck.blockCount', { count: s.elements.length })}</span>
                <div className="flex gap-0.5">
                  <button className="px-1 text-xs text-gray-400 hover:text-primary disabled:opacity-30" disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveSlide(i, -1); }}>↑</button>
                  <button className="px-1 text-xs text-gray-400 hover:text-primary disabled:opacity-30" disabled={i === slides.length - 1} onClick={(e) => { e.stopPropagation(); moveSlide(i, 1); }}>↓</button>
                  <button className="px-1 text-xs text-gray-400 hover:text-danger" onClick={(e) => { e.stopPropagation(); delSlide(i); }}>✕</button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={addSlide} className="w-full rounded-lg border border-dashed border-stroke py-2 text-sm font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">+ {t('deck.addSlide')}</button>
        </div>

        {/* Canvas */}
        <div className="overflow-x-auto">
          {curSlide && (
            <div ref={canvasRef} onMouseDown={() => { if (editingId) commitEdit(); setSelId(null); }}
              className="relative mx-auto shadow-default"
              style={{ width: '100%', maxWidth: 980, aspectRatio: `${PAGE_W}/${PAGE_H}`, background: curSlide.bg, userSelect: 'none' }}>
              {curSlide.bgImageId != null && <DeckImg id={curSlide.bgImageId} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />}
              {curSlide.elements.map(renderEl)}
            </div>
          )}
          <p className="mt-2 text-center text-xs text-gray-400">{t('deck.canvasHint')}</p>
        </div>
      </div>
    </div>
  );
};

export default ProposalDeckEditor;
