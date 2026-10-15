// THE one place that reads the Sales Hub session token (audit UX, P1 « regrouper les lectures
// directes du jeton en un seul client d'API » — there were 235 copies of
// `localStorage.getItem('token')` in 65 files).
//
// `authHeaders()` also carries « view as » (X-Impersonate-As). axios already got it from the
// interceptor in main.tsx, but every `fetch(…, { headers: authHeaders() })` went WITHOUT it — so
// during a « view as », the fetch-based screens (leads, HR, proposals, pricing, IC+, credits…)
// showed the admin's own data instead of the rep's. Same header, same server middleware.
//
// The partner portal keeps its own token (`partnerToken`) on purpose and does not use this.

export const TOKEN_KEY = 'token';

/** The session token, or null (storage blocked, signed out). */
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/** Authorization (+ « view as » when an admin is impersonating) for a fetch or an axios call. */
export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${getToken()}` };
  try {
    const as = localStorage.getItem('impersonateAs');
    if (as) h['X-Impersonate-As'] = as;
  } catch { /* storage blocked: no impersonation either */ }
  return h;
}
