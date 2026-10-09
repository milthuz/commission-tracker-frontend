// Pastilles de la barre latérale (compteurs « à examiner ») : un écran qui modifie ce qu'elles
// comptent le SIGNALE, et la barre se recharge tout de suite au lieu d'attendre sa relecture
// périodique (2 min). Signalé par David le 2026-10-09 : la pastille des pistes ne bougeait pas
// après une attribution tant que la page n'était pas rechargée.

export const LEADS_CHANGED = 'sh:leads-changed';

export const notifyLeadsChanged = () => {
  try { window.dispatchEvent(new Event(LEADS_CHANGED)); } catch { /* rien */ }
};
