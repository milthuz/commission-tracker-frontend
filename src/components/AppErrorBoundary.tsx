import { Component, ReactNode } from 'react';

// L'application n'avait AUCUNE barrière d'erreur. Conséquence observée en production
// (signalée le 2026-08-03) : la moindre erreur pendant le rendu d'une route vidait la page
// entière — fond gris, rien d'autre — et l'utilisateur devait rafraîchir une deuxième fois
// pour retomber sur ses pieds. React démonte tout l'arbre quand personne n'attrape l'erreur ;
// c'est le comportement normal, mais il n'est acceptable que si quelqu'un l'attrape.
//
// Ici on attrape, on montre quelque chose, et on donne un bouton. Bilingue en dur : si le
// plantage vient de la couche i18n, aller lui demander une traduction rejouerait l'erreur.
export default class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Laisse une trace exploitable dans la console du navigateur : sans elle, un rapport
    // d'utilisateur se résume à « c'était blanc », ce qui ne se diagnostique pas.
    console.error('[SalesHub] rendu interrompu :', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-whiten px-6 dark:bg-boxdark-2">
        <div className="max-w-[46ch] text-center">
          <h1 className="text-title-md font-bold text-black dark:text-white">
            Cette page n’a pas pu s’afficher
          </h1>
          <p className="mt-3 text-sm text-bodydark2">
            Une erreur a interrompu l’affichage. Recharger règle presque toujours le problème.
            <br />
            <span className="opacity-70">
              This page failed to render. Reloading usually fixes it.
            </span>
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90"
          >
            Recharger · Reload
          </button>
        </div>
      </div>
    );
  }
}
