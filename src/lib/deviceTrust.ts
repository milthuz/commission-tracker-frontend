// "Remember this device for 30 days" — shared localStorage helpers for both TOTP login flows
// (internal ZohoLogin.tsx for local_users, PartnerLogin.tsx for partner_users). Keyed per-email
// so switching accounts on the same browser/device doesn't reuse another account's trust.
const keyFor = (prefix: string, email: string) => `${prefix}:${email.trim().toLowerCase()}`;

export function getDeviceToken(prefix: string, email: string): string | null {
  if (!email) return null;
  return localStorage.getItem(keyFor(prefix, email));
}

export function storeDeviceToken(prefix: string, email: string, token: string): void {
  if (!email || !token) return;
  localStorage.setItem(keyFor(prefix, email), token);
}
