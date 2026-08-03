import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePassAuth, PASS_TOKEN_KEY } from '../../context/PassAuthContext';
import { PASS_API, PassMotion, StatusBadge, useFmt, useTierName } from './passUi';
import { PassPortal } from './PortalShell';

// Espace membre — écran 02 du deck. Fond SOMBRE, contrairement au formulaire d'adhésion :
// c'est le choix du designer, pas une incohérence (dans le deck, la page programme et
// l'espace membre sont sombres, les formulaires sont clairs).
//
// Tout ce qui est chiffré vient de l'API. Le palier, le montant par recommandation et le
// seuil du palier suivant sortent de la configuration vivante — jamais du client.

interface Referral {
  id: number;
  refCode: string;
  restaurant: { name: string; city: string; province: string };
  status: string;
  submittedAt: string;
  creditAmount: number | null;
}

const Hub = () => {
  const { member, refresh } = usePassAuth();
  const { t, tf, list, money, date, monthYear } = useFmt();
  const tierName = useTierName();

  const [referrals, setReferrals] = useState<Referral[] | null>(null);
  const [earnings, setEarnings] = useState<{ credited: number; pending: number } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setFailed(false);
    try {
      const res = await fetch(`${PASS_API}/api/pass/referrals`, {
        headers: { Authorization: `Bearer ${localStorage.getItem(PASS_TOKEN_KEY)}` },
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setReferrals(data.referrals || []);
      setEarnings(data.earnings || { credited: 0, pending: 0 });
    } catch {
      setFailed(true);
    }
  };

  useEffect(() => { load(); refresh(); }, []);

  if (!member) return null;

  const firstName = (member.fullName || member.email).split(' ')[0];
  const nextTier = member.nextTier;
  const live = member.lifetimeLiveReferrals;
  // Cible = le seuil du palier suivant. Quand il n'y en a plus (palier maximal), la barre
  // est pleine : il n'y a plus rien à atteindre, et afficher une progression vers un palier
  // inexistant laisserait croire le contraire.
  const target = nextTier ? live + nextTier.referralsAway : live;
  const pct = nextTier && target > 0 ? Math.min(100, Math.round((live / target) * 100)) : 100;
  const inProgress = (referrals || []).filter((r) => r.status === 'new' || r.status === 'contacted').length;

  const kpis = [
    { label: t('pass.hub.kpi.earned'), value: money(earnings?.credited ?? 0), tone: 'text-[#75E0A7]' },
    { label: t('pass.hub.kpi.pending'), value: money(earnings?.pending ?? 0), tone: 'text-[#F58345]' },
    { label: t('pass.hub.kpi.live'), value: String(live), tone: 'text-white' },
    { label: t('pass.hub.kpi.inProgress'), value: String(inProgress), tone: 'text-[#9CBBFF]' },
  ];

  return (
    <PassPortal title={t('pass.nav.hub')}>
      <PassMotion />
      <div className="mx-auto w-full max-w-[1160px]">
        {/* ── Salutation + action principale ──────────────────────────── */}
        <div className="pass-rise flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-[30px] font-medium leading-tight tracking-[-0.015em] sm:text-[34px]">
              {tf('pass.hub.greeting', { firstName })}
            </h1>
            <p className="mt-2 text-[14.5px] text-white/45">
              {tf('pass.hub.meta', {
                business: member.business || member.email,
                joinDate: monthYear(member.joinedAt),
              })}
            </p>
          </div>
          <Link
            to="/pass/referer"
            className="inline-flex items-center gap-2 rounded-xl bg-[#F58345] px-5 py-3 text-[14.5px] font-medium text-white transition-colors duration-150 hover:bg-[#E5723A] active:bg-[#D16630]"
          >
            <span className="text-[17px] leading-none">+</span>
            {t('pass.landing.referCta')}
          </Link>
        </div>

        {/* ── Progression de palier ───────────────────────────────────── */}
        <section className="pass-rise mt-8 rounded-[14px] border border-[#242424] bg-[#141414] p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#F58345]/35 bg-[#F58345]/10 px-3.5 py-1.5 text-[13px] font-semibold text-[#F79C6A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F58345]" />
                {tierName(member.tier.key)}
              </span>
              <p className="text-[15px] text-white/80">
                {tf('pass.hub.earning', { amount: money(member.tier.credit) })}
              </p>
            </div>
            {nextTier && (
              <p className="text-[14px] text-white/45">
                {tf('pass.hub.toNext', {
                  n: nextTier.referralsAway,
                  tier3: tierName(nextTier.key),
                })}
              </p>
            )}
          </div>

          <div
            className="mt-5 h-[6px] w-full overflow-hidden rounded-full bg-white/[0.07]"
            role="progressbar"
            aria-valuenow={live}
            aria-valuemin={0}
            aria-valuemax={target}
          >
            <div
              className="h-full rounded-full bg-[#F58345] transition-[width] duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-white/40">
              {tf('pass.hub.progress', { live, target })}
            </p>
            {nextTier && (
              <p className="text-[13px] text-white/40">
                {/* Variante paramétrée : la phrase du deck contient « 1 000 $ » en dur,
                    écrit pour sa persona. Le montant vient de la configuration. */}
                {tf('pass.hub.unlockDyn', { tier: tierName(nextTier.key), amount: money(nextTier.credit) })}
              </p>
            )}
          </div>
        </section>

        {/* ── Indicateurs ─────────────────────────────────────────────── */}
        <section className="pass-rise mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-[14px] border border-[#242424] bg-[#141414] p-5">
              <p className="text-[13px] text-white/40">{k.label}</p>
              <p className={`mt-2 text-[28px] font-medium leading-none tracking-[-0.02em] ${k.tone}`}>
                {k.value}
              </p>
            </div>
          ))}
        </section>

        {/* ── Recommandations + avantages ─────────────────────────────── */}
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          {/* `min-w-0` n'est pas décoratif : un enfant de grille vaut `min-width:auto` par
              défaut, donc la largeur minimale du tableau élargissait la COLONNE au lieu de
              laisser défiler le conteneur prévu pour ça — une deuxième barre de défilement,
              exactement ce que les conventions du projet interdisent. */}
          <section className="pass-rise min-w-0 rounded-[14px] border border-[#242424] bg-[#141414]">
            <div className="flex items-center justify-between gap-4 px-6 pt-6">
              <h2 className="text-[17px] font-medium">{t('pass.hub.tableTitle')}</h2>
              {!!referrals?.length && (
                <span className="text-[13px] text-white/35">
                  {tf('pass.hub.tableCount', { n: referrals.length })}
                </span>
              )}
            </div>

            {failed && (
              <div className="px-6 py-10 text-center">
                <p className="text-[14.5px] text-white/50">{t('pass.common.loadError')}</p>
                <button
                  type="button"
                  onClick={load}
                  className="mt-4 rounded-xl border border-white/15 px-4 py-2.5 text-[13.5px] font-semibold transition-colors duration-150 hover:border-white/35"
                >
                  {t('pass.common.retry')}
                </button>
              </div>
            )}

            {/* État vide : trou reconnu du design (« a brand-new member with zero
                referrals » n'est pas dessiné). Un tableau vide avec ses en-têtes aurait
                l'air cassé — on montre plutôt l'action qui manque. */}
            {!failed && referrals?.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-[16px] font-medium">{t('pass.hub.emptyTitle')}</p>
                <p className="mx-auto mt-2 max-w-[38ch] text-[14px] leading-[1.6] text-white/45">
                  {t('pass.hub.emptyBody')}
                </p>
                <Link
                  to="/pass/referer"
                  className="mt-6 inline-flex rounded-xl bg-[#F58345] px-5 py-3 text-[14px] font-bold text-white transition-colors duration-150 hover:bg-[#E5723A]"
                >
                  {t('pass.landing.referCta')}
                </Link>
              </div>
            )}

            {!failed && !!referrals?.length && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-y border-[#242424] text-[11px] uppercase tracking-[0.07em] text-white/35">
                      {/* Le deck donne maintenant ses propres en-têtes au tableau du
                          membre — on n'emprunte plus ceux du tableau ops. */}
                      <th className="px-6 py-3 font-medium">{t('pass.hub.columns.restaurant')}</th>
                      <th className="px-4 py-3 font-medium">{t('pass.hub.columns.submitted')}</th>
                      <th className="px-4 py-3 font-medium">{t('pass.hub.columns.status')}</th>
                      <th className="px-6 py-3 text-right font-medium">{t('pass.hub.columns.credit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((r) => (
                      <tr key={r.id} className="border-b border-[#242424]/70 last:border-0">
                        <td className="px-6 py-4">
                          <p className="text-[14.5px] font-medium">{r.restaurant.name}</p>
                          <p className="mt-0.5 text-[12.5px] text-white/35">
                            {r.restaurant.city}, {r.restaurant.province}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-[13.5px] text-white/55">
                          {date(r.submittedAt)}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-[14.5px] font-medium">
                          {r.status === 'not_qualified' || r.creditAmount === null ? (
                            <span className="text-white/25">—</span>
                          ) : (
                            <span className={r.status === 'credit_applied' ? 'text-[#75E0A7]' : 'text-[#F58345]'}>
                              {money(r.creditAmount)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Avantages ────────────────────────────────────────────── */}
          <section className="pass-rise rounded-[14px] border border-[#242424] bg-[#141414] p-6">
            <h2 className="text-[17px] font-medium">{t('pass.hub.perksTitle')}</h2>
            <ul className="mt-5 space-y-5">
              {/* Le palier de chaque avantage est DONNÉ par le deck depuis sa livraison
                  du 2026-08-03 (`tier`, et `locked` pour ceux à débloquer). La version
                  précédente le déduisait du regroupement de la page programme — juste,
                  mais une inférence qu'on n'a plus à porter. */}
              {list('pass.hub.perks').map((perk: { title: string; body: string; tier?: number }) => {
                const unlocked = member.tier.level >= (perk.tier ?? 1);
                return (
                  <li key={perk.title} className={unlocked ? '' : 'opacity-45'}>
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                          unlocked ? 'bg-[#F58345]' : 'bg-white/25'
                        }`}
                      />
                      <div>
                        <p className="text-[14px] font-medium">{perk.title}</p>
                        <p className="mt-1 text-[13px] leading-[1.55] text-white/45">
                          {/* Les avantages du deck citent le palier qui les débloque. */}
                          {perk.body
                            .split('{tier2}').join(tierName('sous'))
                            .split('{tier3}').join(tierName('chef'))}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </PassPortal>
  );
};

export default Hub;
