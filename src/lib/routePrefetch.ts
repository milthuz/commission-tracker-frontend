// Préchargement des sections en arrière-plan.
//
// POURQUOI : chaque section est un fichier chargé à la demande (voir lazyRoute dans App.tsx).
// La première visite d'une section attendait donc son téléchargement — le rond qui tourne
// en passant d'une section à l'autre (signalé par David le 2026-10-01). Une fois la coquille
// affichée et le navigateur au repos, on télécharge les autres sections une à une : quand
// l'usager clique, le code est déjà là.
//
// Seules les sections INTERNES s'inscrivent (celles de la coquille connectée) : les pages
// publiques — signature, prise de rendez-vous, portail partenaire, La Passe — ne servent pas
// à un usager déjà dans Sales Hub.

type Factory = () => Promise<unknown>;
const registry: Factory[] = [];
const lastOnes: Factory[] = [];
let started = false;

// `last` : téléchargé après tout le reste (le panneau Admin, de loin le plus lourd, ne doit
// pas retarder les sections qu'un rep ouvre vraiment).
export function registerPrefetch(factory: Factory, last = false) {
  if (last) lastOnes.push(factory); else registry.push(factory);
}

const idle = (fn: () => void) => {
  const w = window as any;
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 3000 });
  else window.setTimeout(fn, 200);
};

// Une seule fois par chargement de page. Séquentiel et au repos : ne dispute jamais la bande
// passante à la section que l'usager est en train d'ouvrir.
export function prefetchRoutes(delayMs = 2500) {
  if (started || typeof window === 'undefined') return;
  started = true;
  const conn = (navigator as any).connection;
  // Forfait données réduites ou réseau très lent : on n'impose pas ~1 Mo de téléchargement.
  if (conn && (conn.saveData || /(^|-)2g$/.test(String(conn.effectiveType || '')))) return;

  const queue = [...registry, ...lastOnes];
  const next = () => {
    const f = queue.shift();
    if (!f) return;
    // Un échec ici est sans conséquence : la section se chargera normalement au clic (et la
    // relance automatique de lazyRoute reste celle du VRAI chargement, pas d'ici).
    f().catch(() => {}).finally(() => idle(next));
  };
  window.setTimeout(() => idle(next), delayMs);
}
