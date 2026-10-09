import axios from 'axios';

// Pastilles de la barre latérale (compteurs « à examiner » : pistes, opportunités partenaires,
// « À corriger »). Elles n'étaient relues que toutes les 2 minutes : après une attribution, un
// refus ou une correction, le nombre restait faux jusqu'au rechargement de la page (signalé par
// David le 2026-10-09). Règle GÉNÉRALE plutôt qu'un branchement écran par écran : toute action
// qui RÉUSSIT (requête autre que GET vers l'API) demande aux pastilles de se relire, groupé à
// 1 s près. Les pastilles se relisent aussi au retour sur l'onglet.

export const BADGES_CHANGED = 'sh:badges-changed';
// Gardé pour les écrans qui le signalent déjà explicitement (page Pistes).
export const LEADS_CHANGED = BADGES_CHANGED;

let timer: number | undefined;
export const notifyBadgesChanged = () => {
  try {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => window.dispatchEvent(new Event(BADGES_CHANGED)), 1000);
  } catch { /* rien */ }
};
export const notifyLeadsChanged = notifyBadgesChanged;

const isMutation = (method?: string) => !!method && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD';

let installed = false;
export function installBadgeRefreshOnMutations() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // axios (une partie de l'application)
  axios.interceptors.response.use((res) => {
    if (isMutation(res.config?.method) && res.status >= 200 && res.status < 300) notifyBadgesChanged();
    return res;
  });
  // fetch (le reste)
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await orig(input, init);
    try {
      const method = init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET');
      if (isMutation(method) && res.ok) notifyBadgesChanged();
    } catch { /* jamais bloquer la requête */ }
    return res;
  };
}

// Abonne une pastille : relecture à chaque changement signalé et au retour sur l'onglet, au plus
// une fois toutes les 5 s (la relecture d'« À corriger » enchaîne plusieurs requêtes en base).
export function subscribeBadgeRefresh(load: () => void): () => void {
  let last = 0;
  let pending: number | undefined;
  // Trop tôt depuis la dernière relecture : on la REPORTE à la fin des 5 s, on ne la perd pas
  // (deux actions rapprochées laisseraient sinon la pastille fausse jusqu'à la relecture de 2 min).
  const run = () => {
    const wait = last + 5000 - Date.now();
    if (wait > 0) {
      if (pending === undefined) pending = window.setTimeout(() => { pending = undefined; last = Date.now(); load(); }, wait);
      return;
    }
    last = Date.now();
    load();
  };
  const onVisible = () => { if (document.visibilityState === 'visible') run(); };
  window.addEventListener(BADGES_CHANGED, run);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearTimeout(pending);
    window.removeEventListener(BADGES_CHANGED, run);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
