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
}

interface RenderedPage { num: number; thumb: string; w: number; h: number; }

const b64ToBytes = (b64: string) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

// Clickable-thumbnail PDF preview: each presentation page can be toggled in/out of the proposal,
// estimate pages are governed by the "include quote" toggle, and the focused page shows large.
const PdfThumbPreview: React.FC<Props> = ({ pdfBase64, presentationPageCount, selPages, setSelPages, inclEstimate, setInclEstimate }) => {
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
      cv.style.width = '100%'; cv.style.height = 'auto';
      await page.render({ canvasContext: cv.getContext('2d')!, viewport: vp } as any).promise;
    })();
    return () => { cancelled = true; };
  }, [focused, pages]);

  const isEstimate = (num: number) => num > presentationPageCount;
  const included = (num: number) => isEstimate(num) ? inclEstimate : selPages.includes(num);
  const toggle = (num: number) => {
    if (isEstimate(num)) { setInclEstimate(!inclEstimate); return; }
    setSelPages(selPages.includes(num) ? selPages.filter((x) => x !== num) : [...selPages, num].sort((a, b) => a - b));
  };

  if (loading) return <div className="flex h-full items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!pages.length) return <div className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">{t('proposals.previewError')}</div>;

  return (
    <div className="flex h-full">
      {/* Thumbnail rail */}
      <div className="w-[150px] shrink-0 space-y-2 overflow-y-auto border-r border-stroke p-2 dark:border-strokedark">
        {pages.map((p) => {
          const inc = included(p.num);
          const est = isEstimate(p.num);
          return (
            <div key={p.num} className={`group relative cursor-pointer rounded-md border-2 transition ${focused === p.num ? 'border-primary' : 'border-transparent'}`} onClick={() => setFocused(p.num)}>
              <img src={p.thumb} alt={`page ${p.num}`} className={`w-full rounded shadow-sm transition ${inc ? '' : 'opacity-30 grayscale'}`} />
              {/* include toggle */}
              <button onClick={(e) => { e.stopPropagation(); toggle(p.num); }}
                title={(inc ? t('proposals.pageExclude') : t('proposals.pageInclude')) as string}
                className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold shadow ${inc ? 'border-primary bg-primary text-white' : 'border-stroke bg-white text-gray-400 dark:border-strokedark dark:bg-boxdark'}`}>
                {inc ? '✓' : ''}
              </button>
              <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[10px] font-medium text-white">{est ? t('proposals.quoteTag') : p.num}</span>
            </div>
          );
        })}
      </div>
      {/* Focused page */}
      <div className="flex flex-1 items-start justify-center overflow-y-auto bg-gray-100 p-4 dark:bg-meta-4/30">
        <canvas ref={bigRef} className={`rounded shadow-default ${included(focused) ? '' : 'opacity-40'}`} />
      </div>
    </div>
  );
};

export default PdfThumbPreview;
