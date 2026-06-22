import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { dialog } from '../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

type LangText = { fr: string; en: string };
type Align = 'left' | 'center' | 'right';
interface BlockBase { type: string; }
interface HeadingBlock extends BlockBase { type: 'heading' | 'text'; text: LangText; size?: number; align?: Align; color?: string; }
interface BulletsBlock extends BlockBase { type: 'bullets'; items: LangText[]; size?: number; color?: string; }
interface StatsBlock extends BlockBase { type: 'stats'; items: { value: LangText; label: LangText }[]; }
interface ImageBlock extends BlockBase { type: 'image'; assetId: number | null; widthPct?: number; align?: Align; }
interface DividerBlock extends BlockBase { type: 'divider'; color?: string; }
interface SpacerBlock extends BlockBase { type: 'spacer'; height?: number; }
type Block = HeadingBlock | BulletsBlock | StatsBlock | ImageBlock | DividerBlock | SpacerBlock;
interface Slide { id: string; bg: string; blocks: Block[]; }
interface Asset { id: number; filename: string; mime: string; }

const genId = () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const lt = (fr = '', en = ''): LangText => ({ fr, en });

const newBlock = (type: string): Block => {
  switch (type) {
    case 'heading': return { type: 'heading', text: lt(), size: 26, align: 'left' };
    case 'text': return { type: 'text', text: lt(), size: 13, align: 'left' };
    case 'bullets': return { type: 'bullets', items: [lt()], size: 13 };
    case 'stats': return { type: 'stats', items: [{ value: lt('3 800+', '3,800+'), label: lt('Marchands', 'Merchants') }] };
    case 'image': return { type: 'image', assetId: null, widthPct: 60, align: 'left' };
    case 'divider': return { type: 'divider' };
    default: return { type: 'spacer', height: 16 };
  }
};

// Thumbnail for an uploaded deck image (authenticated fetch → object URL).
const DeckImg: React.FC<{ id: number; className?: string }> = ({ id, className }) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true; let made = '';
    axios.get(`${API_URL}/api/proposals/deck/assets/${id}`, { headers: authHeaders(), responseType: 'blob' })
      .then(r => { if (active) { made = URL.createObjectURL(r.data); setUrl(made); } }).catch(() => {});
    return () => { active = false; if (made) URL.revokeObjectURL(made); };
  }, [id]);
  return url ? <img src={url} className={className} alt="" /> : <div className={`${className} bg-gray-100 dark:bg-meta-4`} />;
};

const ProposalDeckEditor: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sel, setSel] = useState(0);
  const [editLang, setEditLang] = useState<'fr' | 'en'>(i18n.language?.startsWith('en') ? 'en' : 'fr');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/proposals/deck`, { headers: authHeaders() });
      setSlides(r.data.deck?.slides?.length ? r.data.deck.slides : []);
      setAssets(r.data.assets || []);
    } catch { setSlides([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const mutate = (fn: (s: Slide[]) => Slide[]) => { setSlides(prev => fn(structuredClone(prev))); setDirty(true); };
  const curSlide = slides[sel];

  // --- Slide ops ---
  const addSlide = () => { mutate(s => [...s, { id: genId(), bg: '#ffffff', blocks: [] }]); setSel(slides.length); };
  const delSlide = async (i: number) => {
    if (!(await dialog.confirm(t('deck.delSlideConfirm') as string, { danger: true, confirmText: t('common.delete') as string }))) return;
    mutate(s => s.filter((_, idx) => idx !== i));
    setSel(p => Math.max(0, p > i ? p - 1 : p === i ? Math.min(p, slides.length - 2) : p));
  };
  const moveSlide = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= slides.length) return;
    mutate(s => { const a = [...s]; [a[i], a[j]] = [a[j], a[i]]; return a; }); setSel(j);
  };

  // --- Block ops (on the selected slide) ---
  const patchBlock = (bi: number, patch: any) => mutate(s => { Object.assign(s[sel].blocks[bi], patch); return s; });
  const addBlock = (type: string) => mutate(s => { s[sel].blocks.push(newBlock(type)); return s; });
  const delBlock = (bi: number) => mutate(s => { s[sel].blocks.splice(bi, 1); return s; });
  const moveBlock = (bi: number, dir: -1 | 1) => {
    const j = bi + dir; if (j < 0 || j >= curSlide.blocks.length) return;
    mutate(s => { const b = s[sel].blocks; [b[bi], b[j]] = [b[j], b[bi]]; return s; });
  };

  // --- Save / preview ---
  const save = async () => {
    setSaving(true);
    try { await axios.put(`${API_URL}/api/proposals/deck`, { deck: { slides } }, { headers: authHeaders() }); setDirty(false); }
    catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };
  const refreshPreview = async (lang?: 'fr' | 'en') => {
    const l = lang || editLang;
    setPreviewLoading(true);
    try {
      if (dirty) await save();
      const r = await axios.get(`${API_URL}/api/proposals/deck/preview`, { headers: authHeaders(), params: { lang: l }, responseType: 'blob' });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(r.data));
    } catch (e: any) { dialog.alert(e?.response?.data?.error || t('deck.previewError')); }
    finally { setPreviewLoading(false); }
  };

  // --- Image upload ---
  const upload = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await axios.post(`${API_URL}/api/proposals/deck/assets`, fd, { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } });
      setAssets(a => [{ id: r.data.id, filename: r.data.filename, mime: r.data.mime }, ...a]);
      return r.data.id as number;
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Upload failed'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const inputCls = 'w-full rounded-lg border border-stroke bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-form-input text-black dark:text-white';
  const lab = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400';
  const tinyBtn = 'rounded-md p-1 text-body hover:bg-gray-1 hover:text-primary disabled:opacity-30 dark:hover:bg-meta-4';

  // Bilingual text field — edits the {fr,en} value at the current editLang.
  const LText: React.FC<{ value: LangText; onChange: (v: LangText) => void; placeholder?: string; multiline?: boolean }> = ({ value, onChange, placeholder, multiline }) => {
    const v = value?.[editLang] || '';
    const set = (s: string) => onChange({ ...value, [editLang]: s });
    return multiline
      ? <textarea value={v} rows={2} onChange={e => set(e.target.value)} placeholder={placeholder} className={inputCls} />
      : <input value={v} onChange={e => set(e.target.value)} placeholder={placeholder} className={inputCls} />;
  };

  const blockEditor = (b: Block, bi: number) => {
    const head = (
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">{t(`deck.block_${b.type}`)}</span>
        <div className="flex items-center gap-0.5">
          <button className={tinyBtn} disabled={bi === 0} onClick={() => moveBlock(bi, -1)} title={t('deck.moveUp') as string}>↑</button>
          <button className={tinyBtn} disabled={bi === curSlide.blocks.length - 1} onClick={() => moveBlock(bi, 1)} title={t('deck.moveDown') as string}>↓</button>
          <button className="rounded-md p-1 text-body hover:text-danger" onClick={() => delBlock(bi)} title={t('common.delete') as string}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    );
    const alignColor = (bb: HeadingBlock | ImageBlock) => (
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {(['left', 'center', 'right'] as Align[]).map(a => (
            <button key={a} onClick={() => patchBlock(bi, { align: a })} className={`rounded px-2 py-1 text-xs ${bb.align === a || (!bb.align && a === 'left') ? 'bg-primary text-white' : 'border border-stroke text-body dark:border-strokedark'}`}>{t(`deck.align_${a}`)}</button>
          ))}
        </div>
      </div>
    );
    return (
      <div key={bi} className="rounded-xl border border-stroke bg-white p-3 dark:border-strokedark dark:bg-boxdark">
        {head}
        {(b.type === 'heading' || b.type === 'text') && (<>
          <LText value={b.text} onChange={v => patchBlock(bi, { text: v })} multiline={b.type === 'text'} placeholder={t(`deck.block_${b.type}`) as string} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-body">{t('deck.size')}
              <input type="number" min={8} max={64} value={b.size || (b.type === 'heading' ? 26 : 13)} onChange={e => patchBlock(bi, { size: parseInt(e.target.value) || undefined })} className="w-16 rounded border border-stroke bg-transparent px-2 py-1 dark:border-strokedark dark:bg-form-input" /></label>
            <label className="flex items-center gap-1.5 text-xs text-body">{t('deck.color')}
              <input type="color" value={b.color || '#1c2434'} onChange={e => patchBlock(bi, { color: e.target.value })} className="h-7 w-9 rounded border border-stroke dark:border-strokedark" /></label>
            <button onClick={() => patchBlock(bi, { color: undefined })} className="text-xs text-gray-400 hover:underline">{t('deck.autoColor')}</button>
          </div>
          {alignColor(b)}
        </>)}

        {b.type === 'bullets' && (<>
          {b.items.map((it, ii) => (
            <div key={ii} className="mb-1.5 flex items-center gap-1.5">
              <LText value={it} onChange={v => patchBlock(bi, { items: b.items.map((x, k) => k === ii ? v : x) })} placeholder={`• ${t('deck.block_bullets')}`} />
              <button className="rounded-md p-1 text-body hover:text-danger" onClick={() => patchBlock(bi, { items: b.items.filter((_, k) => k !== ii) })}><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          ))}
          <button onClick={() => patchBlock(bi, { items: [...b.items, lt()] })} className="text-xs font-medium text-primary hover:underline">+ {t('deck.addBullet')}</button>
        </>)}

        {b.type === 'stats' && (<>
          {b.items.map((it, ii) => (
            <div key={ii} className="mb-1.5 flex items-center gap-1.5">
              <LText value={it.value} onChange={v => patchBlock(bi, { items: b.items.map((x, k) => k === ii ? { ...x, value: v } : x) })} placeholder={t('deck.statValue') as string} />
              <LText value={it.label} onChange={v => patchBlock(bi, { items: b.items.map((x, k) => k === ii ? { ...x, label: v } : x) })} placeholder={t('deck.statLabel') as string} />
              <button className="rounded-md p-1 text-body hover:text-danger" onClick={() => patchBlock(bi, { items: b.items.filter((_, k) => k !== ii) })}><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
          ))}
          <button onClick={() => patchBlock(bi, { items: [...b.items, { value: lt(), label: lt() }] })} className="text-xs font-medium text-primary hover:underline">+ {t('deck.addStat')}</button>
        </>)}

        {b.type === 'image' && (<>
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1">
              <label className={lab}>{t('deck.chooseImage')}</label>
              <select value={b.assetId ?? ''} onChange={e => patchBlock(bi, { assetId: e.target.value ? parseInt(e.target.value) : null })} className={inputCls}>
                <option value="">{t('deck.noImage')}</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}
              </select>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" disabled={uploading}
                  onChange={async e => { const id = await upload(e.target.files?.[0]); if (id) patchBlock(bi, { assetId: id }); }} />
                {uploading ? t('deck.uploading') : `+ ${t('deck.uploadImage')}`}
              </label>
            </div>
            {b.assetId != null && <DeckImg id={b.assetId} className="h-16 w-24 rounded border border-stroke object-contain dark:border-strokedark" />}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-body">{t('deck.width')}
              <input type="range" min={10} max={100} value={b.widthPct || 60} onChange={e => patchBlock(bi, { widthPct: parseInt(e.target.value) })} />
              <span className="w-8 text-right">{b.widthPct || 60}%</span></label>
          </div>
          {alignColor(b)}
        </>)}

        {b.type === 'divider' && (
          <label className="flex items-center gap-1.5 text-xs text-body">{t('deck.color')}
            <input type="color" value={b.color || '#d2dae6'} onChange={e => patchBlock(bi, { color: e.target.value })} className="h-7 w-9 rounded border border-stroke dark:border-strokedark" /></label>
        )}
        {b.type === 'spacer' && (
          <label className="flex items-center gap-1.5 text-xs text-body">{t('deck.height')}
            <input type="number" min={2} max={300} value={b.height || 16} onChange={e => patchBlock(bi, { height: parseInt(e.target.value) || 16 })} className="w-20 rounded border border-stroke bg-transparent px-2 py-1 dark:border-strokedark dark:bg-form-input" /></label>
        )}
      </div>
    );
  };

  if (loading) return <div className="flex h-40 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-stroke bg-white p-3 shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="inline-flex rounded-lg border border-stroke p-1 dark:border-strokedark">
          {(['fr', 'en'] as const).map(l => (
            <button key={l} onClick={() => setEditLang(l)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${editLang === l ? 'bg-primary text-white' : 'text-body hover:bg-gray-1 dark:hover:bg-meta-4'}`}>{l === 'fr' ? 'Français' : 'English'}</button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{t('deck.editingLang')}</span>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-warning">{t('deck.unsaved')}</span>}
          <button onClick={() => refreshPreview()} disabled={previewLoading} className="inline-flex items-center gap-1.5 rounded-lg border border-stroke bg-white px-3 py-2 text-sm font-medium text-body hover:bg-gray-1 disabled:opacity-50 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
            {previewLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /> : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
            {t('deck.previewPdf')}
          </button>
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
            {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : null}{t('common.save')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
        {/* Slide rail */}
        <div className="space-y-2">
          {slides.map((s, i) => (
            <div key={s.id} onClick={() => setSel(i)} className={`cursor-pointer rounded-lg border p-2 text-sm ${i === sel ? 'border-primary ring-1 ring-primary' : 'border-stroke dark:border-strokedark'}`} style={{ background: s.bg }}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${isDark(s.bg) ? 'text-white' : 'text-black'}`}>{t('deck.slide')} {i + 1}</span>
                <div className="flex gap-0.5">
                  <button className="rounded px-1 text-xs text-gray-400 hover:text-primary disabled:opacity-30" disabled={i === 0} onClick={e => { e.stopPropagation(); moveSlide(i, -1); }}>↑</button>
                  <button className="rounded px-1 text-xs text-gray-400 hover:text-primary disabled:opacity-30" disabled={i === slides.length - 1} onClick={e => { e.stopPropagation(); moveSlide(i, 1); }}>↓</button>
                  <button className="rounded px-1 text-xs text-gray-400 hover:text-danger" onClick={e => { e.stopPropagation(); delSlide(i); }}>✕</button>
                </div>
              </div>
              <span className={`text-[10px] ${isDark(s.bg) ? 'text-white/70' : 'text-black/50'}`}>{t('deck.blockCount', { count: s.blocks.length })}</span>
            </div>
          ))}
          <button onClick={addSlide} className="w-full rounded-lg border border-dashed border-stroke py-2 text-sm font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">+ {t('deck.addSlide')}</button>
        </div>

        {/* Slide editor */}
        <div className="space-y-3">
          {!curSlide ? (
            <div className="rounded-xl border border-dashed border-stroke p-10 text-center text-sm text-gray-400 dark:border-strokedark">{t('deck.emptyHint')}</div>
          ) : (<>
            <div className="flex items-center gap-3 rounded-xl border border-stroke bg-white p-3 dark:border-strokedark dark:bg-boxdark">
              <label className="flex items-center gap-2 text-sm text-body">{t('deck.bg')}
                <input type="color" value={curSlide.bg} onChange={e => { const v = e.target.value; mutate(s => { s[sel].bg = v; return s; }); }} className="h-8 w-10 rounded border border-stroke dark:border-strokedark" /></label>
              <div className="ml-auto flex gap-1.5">
                <button onClick={() => mutate(s => { s[sel].bg = '#ffffff'; return s; })} className="rounded border border-stroke px-2 py-1 text-xs text-body dark:border-strokedark">{t('deck.bgLight')}</button>
                <button onClick={() => mutate(s => { s[sel].bg = '#1c2434'; return s; })} className="rounded border border-stroke px-2 py-1 text-xs text-body dark:border-strokedark">{t('deck.bgDark')}</button>
              </div>
            </div>
            {curSlide.blocks.map((b, bi) => blockEditor(b, bi))}
            <div className="flex flex-wrap gap-2 rounded-xl border border-dashed border-stroke p-3 dark:border-strokedark">
              {['heading', 'text', 'bullets', 'stats', 'image', 'divider', 'spacer'].map(type => (
                <button key={type} onClick={() => addBlock(type)} className="rounded-lg border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">+ {t(`deck.block_${type}`)}</button>
              ))}
            </div>
          </>)}
        </div>

        {/* Live PDF preview */}
        <div className="rounded-xl border border-stroke bg-gray-100 dark:border-strokedark dark:bg-meta-4/30">
          {previewUrl ? (
            <iframe title="deck-preview" src={previewUrl} className="h-[600px] w-full rounded-xl" style={{ border: 0 }} />
          ) : (
            <div className="flex h-[600px] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-gray-400">
              <p>{t('deck.previewHint')}</p>
              <button onClick={() => refreshPreview()} className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-opacity-90">{t('deck.previewPdf')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// local helper (mirrors the backend luminance check) for the slide rail labels
function isDark(hex: string) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 140;
}

export default ProposalDeckEditor;
