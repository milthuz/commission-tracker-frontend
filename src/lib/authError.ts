import type { TFunction } from 'i18next';

// Les routes /api/auth/* (connexion par courriel, 2FA, invitation, mot de passe oublié)
// répondent par des phrases ANGLAISES fixes. Les écrans les affichaient telles quelles :
// « Invalid email or password » sous un formulaire en français. On les traduit ici, à un
// seul endroit — même principe que portalError() du portail partenaire.
const MESSAGES: Record<string, string> = {
  'Invalid email or password': 'auth.serverError.invalidCredentials',
  'Invalid code': 'auth.serverError.invalidCode',
  'Session expired — log in again': 'auth.serverError.sessionExpired',
  'Setup session expired — restart from the invite link': 'auth.serverError.setupExpired',
  'Too many attempts — try again later': 'auth.serverError.tooManyAttempts',
  'Account setup incomplete — use your invitation link': 'auth.serverError.setupIncomplete',
  'Invalid invitation': 'auth.serverError.invalidInvitation',
  'Invitation expired': 'auth.serverError.invitationExpired',
  'Invalid link': 'auth.serverError.invalidLink',
  'Link expired': 'auth.serverError.linkExpired',
  'Missing token': 'auth.serverError.invalidLink',
  'Invalid state': 'auth.serverError.sessionExpired',
  'Password must be at least 8 characters': 'auth.invite.pwTooShort',
};

/**
 * Message à afficher pour un refus venu du serveur.
 * `brut` : la valeur de `error` renvoyée par l'API ; `repliKey` : la clé à utiliser quand le
 * serveur n'a rien dit ou a dit quelque chose qu'on ne connaît pas.
 */
export function authError(brut: unknown, t: TFunction, repliKey = 'auth.serverError.generic'): string {
  const msg = typeof brut === 'string' ? brut : '';
  return t(MESSAGES[msg] || repliKey) as string;
}
