import type React from 'react';

/**
 * Rend atteignable au clavier un élément cliquable qui n'est pas un bouton (ligne de tableau
 * qui se déplie, carte, zone de dépôt) : Tab l'atteint, Entrée ou Espace l'active, et
 * `data-pressable` lui donne le contour de focus orange (style.css).
 *
 * L'élément garde son propre `onClick` : on l'appelle ainsi
 *   <tr onClick={ouvrir} {...pressable(ouvrir)}>
 * Sans action (`fn` absent), rien n'est ajouté : la ligne reste une ligne ordinaire.
 *
 * `expanded` : pour une ligne qui déplie un détail, annonce l'état aux lecteurs d'écran.
 */
export function pressable(fn: (() => void) | undefined | false, expanded?: boolean) {
  if (!fn) return {};
  return {
    tabIndex: 0,
    'data-pressable': '',
    ...(expanded === undefined ? {} : { 'aria-expanded': expanded }),
    onKeyDown: (e: React.KeyboardEvent) => {
      // Seulement quand la ligne ELLE-MÊME a le focus : Entrée dans un champ ou sur un bouton
      // à l'intérieur garde son propre sens.
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    },
  };
}
