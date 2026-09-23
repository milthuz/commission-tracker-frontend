import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

// Case de signature manuscrite (souris, doigt, stylet) — sans dépendance.
//
// Pointer Events plutôt que souris + toucher séparés : un seul chemin pour les trois, et
// `touch-action: none` empêche la page de défiler pendant qu'on signe au doigt sur téléphone.
// Le canevas est dimensionné en pixels PHYSIQUES (devicePixelRatio) pour qu'une signature faite
// sur un écran Retina ne sorte pas floue dans le PDF.
//
// ⚠️ Le serveur refuse une image de moins de ~1,5 Ko (une case vide exportée) : `isEmpty` n'est
// qu'un confort d'interface, pas la garde.

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataURL: () => string | null;
}

const SignaturePad = forwardRef<SignaturePadHandle, {
  height?: number;
  clearLabel: string;
  placeholder: string;
  onChange?: (empty: boolean) => void;
}>(({ height = 170, clearLabel, placeholder, onChange }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef(0);
  const [empty, setEmpty] = useState(true);

  const setupCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#111827';
    strokes.current = 0;
    setEmpty(true);
    onChange?.(true);
  };

  useEffect(() => {
    setupCanvas();
    // Un redimensionnement efface le canevas (le navigateur le vide en changeant sa taille) :
    // on repart d'une case propre plutôt que d'afficher une signature déformée.
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = e.currentTarget.getContext('2d');
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = '#111827';
      ctx.fill();
    }
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    strokes.current += 1;
    if (empty) { setEmpty(false); onChange?.(false); }
  };

  useImperativeHandle(ref, () => ({
    clear: setupCanvas,
    isEmpty: () => strokes.current === 0,
    toDataURL: () => (strokes.current === 0 || !canvasRef.current ? null : canvasRef.current.toDataURL('image/png')),
  }));

  return (
    <div>
      <div className="relative rounded-md border-2 border-dashed border-stroke bg-white dark:border-strokedark">
        <canvas
          ref={canvasRef}
          style={{ height, width: '100%', touchAction: 'none', display: 'block', cursor: 'crosshair' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            {placeholder}
          </span>
        )}
        <div className="pointer-events-none absolute bottom-6 left-6 right-6 border-b border-gray-300" />
      </div>
      <div className="mt-1.5 flex justify-end">
        <button type="button" onClick={setupCanvas} className="text-xs font-medium text-primary hover:underline">
          {clearLabel}
        </button>
      </div>
    </div>
  );
});

SignaturePad.displayName = 'SignaturePad';
export default SignaturePad;
