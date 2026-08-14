import { useEffect } from 'react';

/**
 * Pose l'icône Cluster sur l'onglet, et la retire au démontage.
 *
 * Toutes les surfaces à marque CLUSTER l'utilisent — La Passe et le Portail partenaire, y compris
 * ses pages PUBLIQUES (connexion, activation, réinitialisation), qui vivent hors du gabarit et
 * gardaient donc l'icône Sales Hub. C'est ce que David a signalé le 2026-08-14.
 *
 * ⚠️ `usePassFavicon` (src/pages/Pass/passUi.tsx) contient encore une copie identique de cette
 * logique — non fusionnée ici, faute d'avoir été demandée. Si l'une des deux change, changer
 * l'autre : le fichier servi et sa taille doivent rester les mêmes des deux côtés.
 *
 * Deux fichiers, choisis par le RÔLE du lien. L'onglet reçoit le 32×32 officiel : servir le
 * 1000×1000 dans une pastille de 16 px laisse le navigateur le réduire lui-même — icône trouble,
 * et 12 Ko pour un onglet. L'icône d'écran d'accueil iOS garde le grand fichier, seul endroit où
 * sa taille sert.
 *
 * La restauration au démontage n'est pas cosmétique : sans elle, revenir de La Passe vers Sales
 * Hub garderait l'icône Cluster jusqu'au prochain rechargement complet.
 */
export const useClusterFavicon = () => {
  useEffect(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]')
    );
    const before = links.map((l) => l.href);
    links.forEach((l) => {
      l.href = l.rel === 'apple-touch-icon' ? '/cluster-favicon.png?v=2' : '/cluster-favicon-32.png?v=2';
    });
    return () => { links.forEach((l, i) => { l.href = before[i]; }); };
  }, []);
};
