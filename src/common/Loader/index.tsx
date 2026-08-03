// Chargeur PLEIN ÉCRAN — réservé au tout premier affichage, quand il n'y a encore ni
// barre latérale ni en-tête à préserver.
//
// ⚠️ Ne PAS l'utiliser pour une navigation à l'intérieur du layout : il occupe tout
// l'écran et remplace donc la coquille de l'application, ce qui provoque un clignotement à
// chaque clic de menu. Pour ce cas, voir `ContentLoader` juste en dessous.
//
// Le fond était figé en `bg-white` : en thème sombre, chaque chargement produisait un
// éclair blanc. Signalé le 2026-08-03.
const Loader = () => {
  return (
    <div className="flex h-screen items-center justify-center bg-whiten dark:bg-boxdark-2">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
    </div>
  );
};

/**
 * Chargeur de ZONE DE CONTENU. Prend une hauteur raisonnable au lieu de tout l'écran, et
 * n'a pas de fond propre — la coquille reste visible autour de lui.
 *
 * C'est ce qui sépare une navigation d'un rechargement : barre latérale, en-tête et
 * bannières ne bougent plus, seul le contenu se renouvelle.
 */
export const ContentLoader = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
  </div>
);

export default Loader;
