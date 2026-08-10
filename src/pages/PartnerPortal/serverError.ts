import type { TFunction } from 'i18next';

// Le serveur renvoie des CODES pour les refus qu'un partenaire peut comprendre — aujourd'hui
// `partner_inactive`. Chaque ecran du portail affichait `d.error` tel quel, si bien qu'un code
// machine s'est retrouve sous le champ mot de passe : « partner_inactive ». Traduire dans UN
// seul endroit, sinon le prochain code ajoute cote serveur refera exactement le meme trajet.
const CODES: Record<string, string> = {
  partner_inactive: 'partnerPortal.serverError.partnerInactive',
};

/**
 * Rend le message a afficher pour une erreur venue du serveur.
 * `brut` : la valeur de `error` renvoyee par l'API (souvent deja une phrase en clair).
 * `repli` : le texte a utiliser quand le serveur n'a rien dit du tout.
 */
export function portalError(brut: unknown, t: TFunction, repli: string): string {
  const code = typeof brut === 'string' ? brut : '';
  if (CODES[code]) return t(CODES[code]) as string;
  return code || repli;
}
