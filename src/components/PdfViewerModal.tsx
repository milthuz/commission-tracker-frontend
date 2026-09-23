import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Visionneuse PDF DANS l'application (fenêtre superposée), au lieu d'un nouvel onglet.
//
// Rendue avec pdf.js page par page dans des <canvas> plutôt qu'avec un <iframe> : les navigateurs
// mobiles n'affichent pas un PDF dans un cadre (ils proposent de le télécharger), alors que des
// canevas s'affichent partout, avec un seul défilement. Le fichier est récupéré par fetch — avec
// l'en-tête d'autorisation quand il y en a un — donc aucun jeton ne passe dans une URL.

export interface PdfSource {
  url: string;
  headers?: Record<string, string>;
  title: string;
  filename: string;
}

// `tr` : traduction imposée par la page appelante (la page de signature a sa propre bascule
// FR/EN, indépendante de la langue de l'application).
const PdfViewerModal = ({ source, onClose, tr }: { source: PdfSource; onClose: () => void; tr?: (k: string, o?: any) => string }) => {
  const { t: tApp } = useTranslation();
  const t = (k: string, o?: any) => (tr ? tr(k, o) : (tApp(k, o) as string));
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await fetch(source.url, { headers: source.headers });
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        objectUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        if (!cancelled) setBlobUrl(objectUrl);
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        if (cancelled) return;
        setTotal(pdf.numPages);
        // Largeur cible = celle de la fenêtre, en pixels physiques (net sur écran Retina).
        const cssWidth = Math.min((bodyRef.current?.clientWidth || 800) - 32, 900);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport, canvas } as any).promise;
          if (cancelled) return;
          const img = canvas.toDataURL('image/png');
          setPages((p) => [...p, img]);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source.url]);

  // Échap ferme ; le défilement de la page derrière est bloqué pendant l'aperçu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const download = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl; a.download = source.filename;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-2 sm:p-4" onClick={onClose}>
      <div className="flex h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-boxdark" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-stroke px-4 py-3 dark:border-strokedark">
          <div className="min-w-0">
            <p className="truncate font-semibold text-black dark:text-white">{source.title}</p>
            {total != null && <p className="text-xs text-bodydark2">{t('pdfViewer.pages', { count: total })}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={download} disabled={!blobUrl}
              className="inline-flex items-center gap-1.5 rounded-md border border-stroke px-3 py-1.5 text-sm font-medium text-black hover:bg-gray-2 disabled:opacity-50 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12M6 10l6 6 6-6M4 20h16" /></svg>
              <span className="hidden sm:inline">{t('pdfViewer.download')}</span>
            </button>
            <button type="button" onClick={onClose} title={t('common.close') as string} className="rounded p-1 text-body transition hover:text-danger">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div ref={bodyRef} className="flex-1 overflow-y-auto bg-gray-2 px-4 py-4 dark:bg-meta-4">
          {error ? (
            <p className="py-16 text-center text-sm text-danger">{t('pdfViewer.failed')}</p>
          ) : (
            <div className="mx-auto flex max-w-[900px] flex-col gap-4">
              {pages.map((src, i) => (
                <img key={i} src={src} alt={`${source.title} — ${i + 1}`} className="w-full rounded-sm bg-white shadow-md" />
              ))}
              {(total == null || pages.length < total) && (
                <div className="flex justify-center py-10">
                  <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PdfViewerModal;
