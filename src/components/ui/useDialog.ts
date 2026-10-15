import { useEffect, useRef } from 'react';

// Le comportement d'une fenêtre, sans son apparence. Le Modal commun s'en sert, et les fenêtres
// qui gardent leur propre cadre (talon de paie, relevé de prime, visionneuse, aperçu de
// facture…) aussi : Échap ferme, Tab reste dans la fenêtre, le focus revient où il était, la
// page derrière ne défile plus.
//
// Une seule PILE pour toute l'app : seule la fenêtre du dessus réagit à Échap et à Tab, qu'elle
// soit un Modal ou une fenêtre à cadre propre ouverte par-dessus.

const stack: number[] = [];
let seq = 0;

export const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * @param open      la fenêtre est affichée
 * @param onClose   appelé par Échap (la fenêtre décide elle-même si elle peut fermer)
 * @param boxRef    la boîte de la fenêtre : le focus y reste
 * @param bodySelector où chercher le premier champ à focaliser (défaut : toute la boîte)
 */
export function useDialog(
  open: boolean,
  onClose: () => void,
  boxRef: React.RefObject<HTMLElement>,
  bodySelector?: string,
) {
  const idRef = useRef(0);
  // La dernière version de onClose, sans relancer les effets à chaque rendu.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = ++seq;
    idRef.current = id;
    stack.push(id);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const box = boxRef.current;
      if (!box || box.contains(document.activeElement)) return;
      const first = box.querySelector<HTMLElement>('[autofocus]')
        // Chaque partie du sélecteur est préfixée : « [data-modal-body] a, button » ne limitait au
        // corps que la première, et le focus partait sur la croix de l'en-tête.
        || box.querySelector<HTMLElement>(bodySelector ? FOCUSABLE.split(',').map((s) => `${bodySelector} ${s}`).join(',') : FOCUSABLE)
        || box;
      if (first === box && !box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
      first.focus();
    });
    return () => {
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== idRef.current) return;
      if (document.querySelector('[data-dialog-host]')) return; // une confirmation est par-dessus
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return; }
      const box = boxRef.current;
      if (e.key !== 'Tab' || !box) return;
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if (!box.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && (active === first || active === box)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, boxRef]);
}
