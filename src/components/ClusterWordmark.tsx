import { CSSProperties } from 'react';
import clusterOnDark from '../images/logo/cluster-wordmark-on-dark.svg';
import clusterOnLight from '../images/logo/cluster-wordmark-on-light.svg';

/**
 * Le mot-symbole Cluster, pour les surfaces qui s'adressent à des gens EXTÉRIEURS à
 * Cluster — portail partenaire, La Passe, propositions commerciales. À l'intérieur,
 * c'est `SalesHubLogo` qui s'applique : un employé ouvre son outil, un partenaire
 * ouvre la marque avec laquelle il fait affaire.
 *
 * Les DEUX variantes sont rendues, et c'est le CSS qui montre la bonne. Une première
 * version choisissait en JavaScript via `useColorMode` — mais ce hook garde un état par
 * composant : la bascule mettait à jour le sien, jamais celui du logo, qui restait donc
 * en variante claire sur fond sombre jusqu'au prochain rechargement. Ici il n'y a aucun
 * état à synchroniser, donc rien à désynchroniser.
 *
 * `tone` force une variante quand le fond ne suit pas le thème — un panneau
 * volontairement sombre en thème clair, par exemple.
 */
const ClusterWordmark = ({
  className = 'h-[26px] w-auto',
  style,
  tone,
}: {
  className?: string;
  style?: CSSProperties;
  tone?: 'light' | 'dark';
}) => {
  if (tone) {
    return (
      <img
        src={tone === 'dark' ? clusterOnDark : clusterOnLight}
        alt="Cluster"
        className={className}
        style={style}
        draggable={false}
      />
    );
  }
  return (
    <>
      <img
        src={clusterOnLight}
        alt="Cluster"
        className={`${className} dark:hidden`}
        style={style}
        draggable={false}
      />
      <img
        src={clusterOnDark}
        alt="Cluster"
        className={`${className} hidden dark:block`}
        style={style}
        draggable={false}
      />
    </>
  );
};

export default ClusterWordmark;
