import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Le compte Zoho sous lequel l'application ÉCRIT — pour le CRM et pour Books.
//
// Zoho estampille « Créé par » avec le propriétaire du jeton, jamais avec l'utilisateur de
// Sales Hub, et rien dans l'API ne permet de le corriger après coup. Tant que ce compte est
// celui d'une personne, deux choses sont vraies : tout ce que l'application écrit porte son
// nom, et le jour où son accès Zoho change, TOUT s'arrête d'un coup. D'où cet écran.
//
// La sonde n'est pas décorative, et elle ne vérifie pas la même chose des deux côtés :
//   • CRM   — un jeton peut exister, se rafraîchir, et ne rien pouvoir faire. C'est arrivé le
//             2026-09-03 avec un profil Zoho sans accès API, qui répondait 403 à tout.
//   • Books — un compte ne voit que les organisations auxquelles on l'a ajouté, et rien ne le
//             signale : il répond 200, avec une liste plus courte. Les trois doivent y être.
// Le serveur refuse d'épingler ce qu'il n'a pas réussi à lire.

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

type Service = 'crm' | 'books';
type Compte = { email: string; isAdmin: boolean; hasRefresh: boolean; updatedAt: string };
type Sonde = {
  email: string; ok: boolean; error?: string;
  zohoUser?: { name: string | null; profile: string | null };
  modules?: number;
  orgs?: { id: string; name: string; ok: boolean; status: number; subscriptions: number | null; message: string | null }[];
  invoicesOk?: boolean;
  missing?: string[];
};

export default function ZohoSystemAccount() {
  const { t } = useTranslation();
  const [service, setService] = useState<Service>('crm');
  const [pinned, setPinned] = useState<string | null>(null);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [sonde, setSonde] = useState<Sonde | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nouveau, setNouveau] = useState('');

  const charger = async (svc: Service, probe?: string) => {
    try {
      const q = `?service=${svc}${probe ? `&probe=${encodeURIComponent(probe)}` : ''}`;
      const r = await fetch(`${API_URL}/api/admin/zoho-system-account${q}`, { headers: authHeaders() });
      if (!r.ok) return;
      const d = await r.json();
      setPinned(d.pinned || null);
      setComptes(d.accounts || []);
      if (probe) setSonde(d.probe || null);
    } catch { /* l'écran reste utilisable sans la liste */ }
  };

  useEffect(() => { setSonde(null); setMsg(null); void charger(service); }, [service]);

  // Brancher un compte qui n'a PAS de session Sales Hub : `as` dit sous quelle adresse ranger
  // la subvention, et c'est sur l'écran de Zoho qu'on signe en tant que compte de service.
  // Books n'a pas d'équivalent : son flux EST la connexion à Sales Hub, donc le jeton s'y range
  // tout seul sous l'adresse du compte Zoho qui vient de signer.
  const brancher = async (email: string) => {
    const cible = email.trim().toLowerCase();
    if (!cible) return;
    setOccupe('connect');
    try {
      const r = await fetch(`${API_URL}/api/auth/zoho-crm?as=${encodeURIComponent(cible)}`, { headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) { setMsg({ ok: false, text: d.error || `HTTP ${r.status}` }); setOccupe(null); return; }
      window.location.href = d.authUrl;
    } catch (e) { setMsg({ ok: false, text: String(e) }); setOccupe(null); }
  };

  const verifier = async (email: string) => {
    setOccupe(`probe:${email}`); setSonde(null); setMsg(null);
    await charger(service, email);
    setOccupe(null);
  };

  const epingler = async (email: string) => {
    setOccupe(`pin:${email}`); setMsg(null);
    try {
      const r = await fetch(`${API_URL}/api/admin/zoho-system-account`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, service }),
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        setPinned(d.pinned);
        setSonde({ email, ...d.probe });
        setMsg({ ok: true, text: t('admin.crmSystem.pinned', { email: d.pinned }) });
      } else {
        if (d.probe) setSonde({ email, ...d.probe });
        setMsg({ ok: false, text: d.error || `HTTP ${r.status}` });
      }
    } catch (e) { setMsg({ ok: false, text: String(e) }); }
    setOccupe(null);
  };

  const onglet = (v: Service, libelle: string) => (
    <button key={v} onClick={() => setService(v)}
      className={`rounded px-3 py-1.5 text-sm font-medium ${service === v
        ? 'bg-primary text-white'
        : 'text-body hover:bg-gray-2 dark:hover:bg-meta-4'}`}>
      {libelle}
    </button>
  );

  return (
    <div className="mt-6 rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
        <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.crmSystem.title')}</h3>
        <p className="mt-1 text-sm text-body">{t('admin.crmSystem.subtitle')}</p>
      </div>

      <div className="p-7">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {onglet('crm', t('admin.crmSystem.svcCrm'))}
          {onglet('books', t('admin.crmSystem.svcBooks'))}
        </div>

        <div className="mb-5 rounded-md border border-stroke px-4 py-3 dark:border-strokedark">
          <div className="text-xs uppercase tracking-wide text-body">{t('admin.crmSystem.current')}</div>
          <div className="mt-0.5 text-base font-semibold text-black dark:text-white">
            {pinned || t('admin.crmSystem.none')}
          </div>
          <p className="mt-1 text-sm text-body">
            {service === 'crm' ? t('admin.crmSystem.crmWhat') : t('admin.crmSystem.booksWhat')}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-stroke text-left text-xs uppercase tracking-wide text-body dark:border-strokedark">
                <th className="py-2 pr-3">{t('admin.crmSystem.account')}</th>
                <th className="py-2 pr-3">{t('admin.crmSystem.grant')}</th>
                <th className="py-2 pr-3 text-right">{t('admin.crmSystem.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {comptes.map(c => {
                const estEpingle = !!pinned && c.email.toLowerCase() === pinned.toLowerCase();
                return (
                  <tr key={c.email} className="border-b border-stroke last:border-0 dark:border-strokedark">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-black dark:text-white">{c.email}</span>
                      {estEpingle && (
                        <span className="ml-2 rounded-full bg-success bg-opacity-10 px-2 py-0.5 text-xs font-semibold text-success">
                          {t('admin.crmSystem.inUse')}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-body">
                      {c.hasRefresh ? t('admin.crmSystem.durable') : t('admin.crmSystem.shortLived')}
                    </td>
                    <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                      <button onClick={() => verifier(c.email)} disabled={occupe !== null}
                        className="rounded border border-stroke px-2.5 py-1 text-xs font-medium hover:bg-gray-2 disabled:opacity-50 dark:border-strokedark dark:hover:bg-meta-4">
                        {occupe === `probe:${c.email}` ? t('admin.crmSystem.checking') : t('admin.crmSystem.check')}
                      </button>
                      {!estEpingle && (
                        <button onClick={() => epingler(c.email)} disabled={occupe !== null}
                          className="ml-2 rounded bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                          {occupe === `pin:${c.email}` ? t('admin.crmSystem.pinning') : t('admin.crmSystem.pin')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {comptes.length === 0 && (
                <tr><td colSpan={3} className="py-4 text-body">{t('admin.crmSystem.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Le résultat de la sonde, en clair. C'est le seul endroit où l'on voit si un jeton
            peut réellement faire quelque chose, et — pour Books — s'il voit bien les trois
            organisations. Un compte qui n'en voit que deux répond 200 comme les autres. */}
        {sonde && (
          <div className={`mt-4 rounded-md px-4 py-3 text-sm ${sonde.ok
            ? 'bg-success bg-opacity-10 text-success'
            : 'bg-danger bg-opacity-10 text-danger'}`}>
            <div className="font-semibold">{sonde.email}</div>
            {sonde.ok && service === 'crm' && (
              <div className="mt-0.5">
                {t('admin.crmSystem.probeOk', {
                  name: sonde.zohoUser?.name || '?',
                  profile: sonde.zohoUser?.profile || '?',
                  modules: sonde.modules ?? 0,
                })}
              </div>
            )}
            {!sonde.ok && <div className="mt-0.5">{sonde.error}</div>}
            {/* Une organisation a la fois : savoir QU'IL en manque une ne suffit pas, il faut
                savoir LAQUELLE pour aller y ajouter le compte. */}
            {service === 'books' && sonde.orgs && (
              <ul className="mt-1.5 space-y-0.5">
                {sonde.orgs.map(o => (
                  <li key={o.id}>
                    {o.ok ? '✓' : '✕'} {o.name}
                    {o.ok
                      ? (o.subscriptions != null ? ` — ${o.subscriptions} ${t('admin.crmSystem.subs')}` : '')
                      : ` — ${o.message || o.status}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Brancher un compte de service. Les deux chemins diffèrent, et c'est irréductible :
            le flux CRM range le jeton sous le compte Sales Hub connecté, le flux Books est la
            connexion elle-même et se range sous le compte Zoho qui signe. */}
        <div className="mt-6 border-t border-stroke pt-5 dark:border-strokedark">
          <div className="text-sm font-medium text-black dark:text-white">{t('admin.crmSystem.addTitle')}</div>
          {service === 'crm' ? (
            <>
              <p className="mt-1 text-sm text-body">{t('admin.crmSystem.addHelp')}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={nouveau} onChange={e => setNouveau(e.target.value)}
                  placeholder="saleshub@clustersystems.com"
                  className="w-full max-w-xs rounded border border-stroke bg-transparent px-3 py-2 text-sm outline-none focus:border-primary dark:border-strokedark"
                />
                <button onClick={() => brancher(nouveau)} disabled={occupe !== null || !nouveau.trim()}
                  className="rounded bg-[#E8542A] px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
                  {occupe === 'connect' ? t('admin.crmSystem.redirecting') : t('admin.crmSystem.connectAs')}
                </button>
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-body">{t('admin.crmSystem.addHelpBooks')}</p>
          )}
        </div>

        {msg && (
          <div className={`mt-4 rounded-md px-4 py-3 text-sm ${msg.ok
            ? 'bg-success bg-opacity-10 text-success'
            : 'bg-danger bg-opacity-10 text-danger'}`}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
