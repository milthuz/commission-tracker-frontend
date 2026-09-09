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
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
    </div>
  );
};

/**
 * Chargeur de ZONE DE CONTENU. Prend une hauteur raisonnable au lieu de tout l'écran, et
 * n'a pas de fond propre — la coquille reste visible autour de lui.
 *
 * C'est ce qui sépare une navigation d'un rechargement : barre latérale, en-tête et
 * bannières ne bougent plus, seul le contenu se renouvelle.
 *
 * ⚠️ Les pages doivent l'utiliser AUSSI pour leur propre chargement de données, et ne pas
 * redessiner un rond à elles. Une navigation en montre deux à la suite — le module, puis
 * les données — et si les deux ne sont pas au MÊME endroit, le rond saute et se lit comme
 * un double chargement. Chaque page avait sa hauteur : `py-24` ici, `h-[60vh]` là.
 * Signalé le 2026-09-09.
 */
export const ContentLoader = ({ label }: { label?: string }) => (
  <div className="flex min-h-[50vh] items-center justify-center">
    {/* La legende est posee EN DEHORS du flux : dans une colonne flex elle deplacait le rond
        de 18 px vers le haut, donc le rond bougeait encore entre la phase sans legende
        (chargement du module) et celle avec (chargement des donnees). Ici le rond est au
        meme pixel dans les deux cas. */}
    <div className="relative flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
      {label && (
        <p className="absolute left-1/2 top-full mt-4 -translate-x-1/2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          {label}
        </p>
      )}
    </div>
  </div>
);

export default Loader;
