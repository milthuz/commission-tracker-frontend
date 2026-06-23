import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjsLib from 'pdfjs-dist';
// Vite bundles the worker and gives us a URL for it.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface Props {
  pdfBase64: string;
  presentationPageCount: number;
  estimatePageCount: number;
  selPages: number[];                // 1-based presentation pages to include
  setSelPages: (p: number[]) => void;
  inclEstimate: boolean;
  setInclEstimate: (b: boolean) => void;
  onDownload?: () => void;           // download the final (filtered) PDF
}

interface RenderedPage { num: number; thumb: string; w: number; h: number; }

const b64ToBytes = (b64: string) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

// Clickable-thumbnail PDF preview: each presentation page can be toggled in/out of the proposal,
// estimate pages are governed by the "include quote" toggle, and the focused page shows large.
const PdfThumbPreview: React.FC<Props> = ({ pdfBase64, presentationPageCount, selPages, setSelPages, inclEstimate, setInclEstimate, onDownload }) => {
  const { t } = useTranslation();
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [focused, setFocused] = useState(1);
  const [loading, setLoading] = useState(true);
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
  const included = (num: number) => isEstimate(num) ? inclEstimate : selPages.includes(num);
  // Final page number = position among INCLUDED pages (so numbering follows the selection).
  const finalNumber = (num: number) => {
    let n = 0;
    for (let i = 1; i <= num; i++) if (included(i)) n++;
    return n;
  };
  const totalIncluded = finalNumber(pages.length);
  const toggle = (num: number) => {
    if (isEstimate(num)) { setInclEstimate(!inclEstimate); return; }
    setSelPages(selPages.includes(num) ? selPages.filter((x) => x !== num) : [...selPages, num].sort((a, b) => a - b));
  };

  if (loading) return <div className="flex h-full items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!pages.length) return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">{t('proposals.previewError')}</div>;

  return (
    <div className="flex h-full">
      {/* Thumbnail rail — the only scrollable area */}
      <div className="w-[160px] shrink-0 overflow-y-auto border-r border-stroke dark:border-strokedark">
        <div className="space-y-2 p-2">
          {pages.map((p) => {
            const inc = included(p.num);
            const est = isEstimate(p.num);
            return (
              <div key={p.num} className={`group relative cursor-pointer rounded-md border-2 transition ${focused === p.num ? 'border-primary' : 'border-transparent'}`} onClick={() => setFocused(p.num)}>
                <img src={p.thumb} alt={`page ${p.num}`} className={`w-full rounded shadow-sm transition ${inc ? '' : 'opacity-25 grayscale'}`} />
                {/* include toggle */}
                <button onClick={(e) => { e.stopPropagation(); toggle(p.num); }}
                  title={(inc ? t('proposals.pageExclude') : t('proposals.pageInclude')) as string}
                  className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold shadow ${inc ? 'border-primary bg-primary text-white' : 'border-stroke bg-white text-gray-400 dark:border-strokedark dark:bg-boxdark'}`}>
                  {inc ? '✓' : ''}
                </button>
                {/* final page number (follows the selection) or excluded mark */}
                <span className={`absolute bottom-1 left-1 rounded px-1 text-[10px] font-semibold ${inc ? 'bg-primary text-white' : 'bg-gray-500/70 text-white line-through'}`}>{inc ? finalNumber(p.num) : '✕'}</span>
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
            <button onClick={onDownload} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-opacity-90">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m6 5v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1" /></svg>
              {t('proposals.downloadPdf')}
            </button>
          </div>
        )}
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-gray-100 p-4 dark:bg-meta-4/30">
          <canvas ref={bigRef} className={`max-h-full max-w-full rounded shadow-default ${included(focused) ? '' : 'opacity-40'}`} />
        </div>
      </div>
    </div>
  );
};

export default PdfThumbPreview;
