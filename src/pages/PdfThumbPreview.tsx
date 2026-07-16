import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjsLib from 'pdfjs-dist';
// Vite bundles the worker and gives us a URL for it.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  pdfBase64: string;
  presentationPageCount: number;     // pages 1..this = presentation; beyond = the Zoho estimate
  order: number[];                   // full drag/display order — a permutation of every 1-based page number
  setOrder: (o: number[]) => void;
  excludedPages: number[];           // 1-based page numbers dropped from the final document
  setExcludedPages: (p: number[]) => void;
  onDownload?: () => void;           // download the final (reordered + filtered) PDF
  downloading?: boolean;
}

interface RenderedPage { num: number; thumb: string; w: number; h: number; }

const b64ToBytes = (b64: string) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

// Clickable + drag-and-drop-reorderable thumbnail PDF preview: every page (presentation or Zoho
// estimate) can be dragged to a new position and toggled in/out of the final proposal. The focused
// page shows large on the right.
const PdfThumbPreview: React.FC<Props> = ({ pdfBase64, presentationPageCount, order, setOrder, excludedPages, setExcludedPages, onDownload, downloading }) => {
  const { t } = useTranslation();
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [focused, setFocused] = useState(1);
  const [loading, setLoading] = useState(true);
  const [dragNum, setDragNum] = useState<number | null>(null);
  const [dragOverNum, setDragOverNum] = useState<number | null>(null);
  const bigRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<any>(null);

  // Render all pages to small thumbnails once when the PDF changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const doc = await pdfjsLib.getDocument({ data: b64ToBytes(pdfBase64) }).promise;
        if (cancelled) return;
        docRef.current = doc;
        const out: RenderedPage[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = 150 / base.width;
          const vp = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp } as any).promise;
          out.push({ num: i, thumb: canvas.toDataURL('image/jpeg', 0.7), w: base.width, h: base.height });
          if (cancelled) return;
        }
        setPages(out); setFocused(1);
      } catch { setPages([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [pdfBase64]);

  // Render the focused page large (crisp) on demand.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const doc = docRef.current; const cv = bigRef.current;
      if (!doc || !cv || focused < 1 || focused > doc.numPages) return;
      const page = await doc.getPage(focused);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const targetW = Math.min(560, (cv.parentElement?.clientWidth || 520) - 8);
      const vp = page.getViewport({ scale: (targetW * 2) / base.width }); // 2x for retina crispness
      cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      // Let CSS fit the canvas inside the pane (max-h/max-w) so it never needs its own scrollbar.
      cv.style.width = ''; cv.style.height = '';
      await page.render({ canvasContext: cv.getContext('2d')!, viewport: vp } as any).promise;
    })();
    return () => { cancelled = true; };
  }, [focused, pages]);

  const isEstimate = (num: number) => num > presentationPageCount;
  const isIncluded = (num: number) => !excludedPages.includes(num);
  // Final page order = the drag order, minus excluded pages. Numbering follows this, not the
  // original PDF order.
  const finalOrder = order.filter(isIncluded);
  const finalNumber = (num: number) => { const i = finalOrder.indexOf(num); return i === -1 ? 0 : i + 1; };
  const totalIncluded = finalOrder.length;
  // Defensive fallback: `order` should always be a full permutation of every rendered page once
  // ready, but guard against a transient mismatch right after the PDF changes.
  const displayOrder = order.length === pages.length ? order : pages.map((p) => p.num);

  const toggleIncluded = (num: number) => {
    setExcludedPages(isIncluded(num) ? [...excludedPages, num] : excludedPages.filter((x) => x !== num));
  };

  const onDropThumb = (targetNum: number) => {
    if (dragNum === null || dragNum === targetNum) { setDragNum(null); setDragOverNum(null); return; }
    const next = displayOrder.filter((n) => n !== dragNum);
    const idx = next.indexOf(targetNum);
    next.splice(idx, 0, dragNum);
    setOrder(next);
    setDragNum(null); setDragOverNum(null);
  };

  if (loading) return <div className="flex h-full items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!pages.length) return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">{t('proposals.previewError')}</div>;

  return (
    <div className="flex h-full">
      {/* Thumbnail rail — drag to reorder, scrolls on wheel/trackpad, scrollbar hidden */}
      <div className="no-scrollbar w-[160px] shrink-0 overflow-y-auto border-r border-stroke dark:border-strokedark">
        <p className="px-2 pt-2 text-[10px] leading-tight text-gray-400">{t('proposals.dragHint')}</p>
        <div className="space-y-2 p-2">
          {displayOrder.map((num) => {
            const p = pages.find((pg) => pg.num === num);
            if (!p) return null;
            const inc = isIncluded(num);
            const est = isEstimate(num);
            const isDragOver = dragOverNum === num && dragNum !== num;
            return (
              <div
                key={num}
                draggable
                onDragStart={() => setDragNum(num)}
                onDragOver={(e) => { e.preventDefault(); setDragOverNum(num); }}
                onDragLeave={() => setDragOverNum((d) => (d === num ? null : d))}
                onDrop={() => onDropThumb(num)}
                onDragEnd={() => { setDragNum(null); setDragOverNum(null); }}
                onClick={() => setFocused(num)}
                className={`group relative cursor-grab rounded-md border-2 transition ${focused === num ? 'border-primary' : isDragOver ? 'border-dashed border-primary/70' : 'border-transparent'}`}
              >
                <img src={p.thumb} alt={`page ${num}`} draggable={false} className={`w-full rounded shadow-sm transition ${inc ? '' : 'opacity-25 grayscale'}`} />
                {/* drag handle */}
                <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-white">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><circle cx="6" cy="5" r="1.4" /><circle cx="6" cy="10" r="1.4" /><circle cx="6" cy="15" r="1.4" /><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="10" r="1.4" /><circle cx="12" cy="15" r="1.4" /></svg>
                </span>
                {/* include toggle */}
                <button onClick={(e) => { e.stopPropagation(); toggleIncluded(num); }}
                  title={(inc ? t('proposals.pageExclude') : t('proposals.pageInclude')) as string}
                  className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold shadow ${inc ? 'border-primary bg-primary text-white' : 'border-stroke bg-white text-gray-400 dark:border-strokedark dark:bg-boxdark'}`}>
                  {inc ? '✓' : ''}
                </button>
                {/* final page number (follows the drag order) or excluded mark */}
                <span className={`absolute bottom-1 left-1 rounded px-1 text-[10px] font-semibold ${inc ? 'bg-primary text-white' : 'bg-gray-500/70 text-white line-through'}`}>{inc ? finalNumber(num) : '✕'}</span>
                {est && <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1 text-[9px] font-medium text-white">{t('proposals.quoteTag')}</span>}
              </div>
            );
          })}
        </div>
      </div>
      {/* Focused page */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {onDownload && (
          <div className="flex items-center justify-between border-b border-stroke px-3 py-2 dark:border-strokedark">
            <span className="text-xs text-gray-400">{t('proposals.finalDoc', { count: totalIncluded })}</span>
            <button onClick={onDownload} disabled={downloading} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90 disabled:opacity-60">
              {downloading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m6 5v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1" /></svg>}
              {t('proposals.downloadPdf')}
            </button>
          </div>
        )}
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-gray-100 p-4 dark:bg-meta-4/30">
          <canvas ref={bigRef} className={`max-h-full max-w-full rounded shadow-default ${isIncluded(focused) ? '' : 'opacity-40'}`} />
        </div>
      </div>
    </div>
  );
};

export default PdfThumbPreview;
