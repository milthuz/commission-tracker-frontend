import { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import clusterOnDark from '../../images/logo/cluster-wordmark-on-dark.svg';
import clusterOnLight from '../../images/logo/cluster-wordmark-on-light.svg';

// Pièces partagées par les écrans de La Passe. Elles existent pour une raison précise :
// le premier écran (adhésion) avait déjà une version bricolée du logo, et trois écrans de
// plus arrivent. Ce qui se répète vit ici, pas recopié à chaque fois.

export const PASS_API =
  import.meta.env.VITE_API_URL || 'https://commission-tracker-production-b7f9.up.railway.app';

// LE VRAI logo Cluster, les fichiers officiels de clusterpos.com — pas une reconstitution
// en texte. Le deck du designer dessinait « cluster » suivi d'un point orange : ce lockup
// appartient à la charte SALES HUB (sa ligne d'endossement « by cluster ● »), pas à celle
// de Cluster. Le reprendre donnait un faux logo sur un portail destiné à des marchands.
//
// Deux variantes officielles, choisies par la SURFACE et non par le thème de l'app : le
// mot est blanc sur fond sombre, encre foncée sur fond clair. Aucune n'est recolorable —
// l'orange du logo (#FE6523) n'est d'ailleurs pas celui du système de design du deck
// (#F58345), et c'est normal : un logo ne se reteinte pas pour s'accorder à une page.
export const ClusterMark = ({
  onDark = false,
  className = 'h-[26px] w-auto',
  style,
}: { onDark?: boolean; className?: string; style?: CSSProperties }) => (
  <img
    src={onDark ? clusterOnDark : clusterOnLight}
    alt="Cluster"
    className={className}
    style={style}
    draggable={false}
  />
);

/**
 * La pastille du programme — c'est ainsi, et SEULEMENT ainsi, que La Passe s'identifie.
 *
 * Le programme n'a pas de symbole : la livraison du designer (2026-08-03) n'en prévoit
 * aucun et son brief interdit d'en inventer un. Une première version en avait un, dessiné
 * ici puis retiré sur décision de l'utilisateur — ne pas le réintroduire sans que le
 * designer l'ait porté dans sa charte.
 */
export const PassPill = ({ className = '' }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-md bg-[#F58345] px-2.5 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.06em] text-white ${className}`}
    >
      {t('pass.programName')}
    </span>
  );
};

/**
 * Bascule de langue des surfaces PUBLIQUES de La Passe.
 *
 * Elle manquait sur la page programme et sur la page du lien — soit les deux seuls écrans
 * où le visiteur n'a aucune préférence enregistrée et aucun autre moyen de changer. Un
 * restaurateur francophone arrivant par le lien d'un membre depuis un navigateur anglais
 * était simplement coincé.
 *
 * Forme en GROUPE (FR|EN) plutôt que la pastille « code + chevron » du kit portail :
 * celle-ci est spécifiée pour la topbar du portail, alors qu'ici on est sur une page
 * publique où les deux langues doivent se voir d'un coup d'œil, en un clic.
 */
export const PassLangToggle = ({ onDark = false }: { onDark?: boolean }) => {
  const { i18n, fr } = useFmt();
  return (
    <div
      className={`inline-flex rounded-full p-1 text-[13px] font-medium ${
        onDark ? 'border border-white/12 bg-white/[0.04]' : 'border border-[#E0E0E0] bg-white'
      }`}
    >
      {(['fr', 'en'] as const).map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => {
            i18n.changeLanguage(lng);
            localStorage.setItem('language', lng);
          }}
          aria-pressed={(lng === 'fr') === fr}
          className={`rounded-full px-3.5 py-1.5 transition-colors duration-150 ${
            (lng === 'fr') === fr
              ? onDark ? 'bg-white text-[#141414]' : 'bg-[#141414] text-white'
              : onDark ? 'text-white/55 hover:text-white' : 'text-[#61646C] hover:text-[#141414]'
          }`}
        >
          {lng.toUpperCase()}
        </button>
      ))}
    </div>
  );
};

/**
 * Formatage + interpolation pour La Passe.
 *
 * ⚠️ Le deck du designer écrit ses variables en accolades SIMPLES (`{firstName}`), alors
 * qu'i18next attend des accolades doubles. Plutôt que de changer la configuration globale
 * d'i18next — qui interpolerait alors ~2 500 chaînes existantes selon d'autres règles —
 * on remplit ici, après coup. `tf` gère les deux formes : les chaînes du deck (simples) et
 * les nôtres (doubles, déjà traitées par i18next). Les fichiers du designer restent donc
 * intacts, ce que le brief exige.
 */
export function useFmt() {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');

  const money = (n: number, withCents = false) =>
    new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: withCents ? 2 : 0,
      maximumFractionDigits: withCents ? 2 : 0,
    }).format(Number(n) || 0);

  const date = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'long' })
      : '';

  const monthYear = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { month: 'long', year: 'numeric' })
      : '';

  const tf = (key: string, vars: Record<string, string | number> = {}) => {
    let out = t(key, vars) as string;
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
    return out;
  };

  const list = (key: string) => (t(key, { returnObjects: true }) as unknown as any[]) || [];

  return { t, i18n, fr, money, date, monthYear, tf, list };
}

/** Nom affiché d'un palier — les clés viennent de la configuration, pas du code. */
export function useTierName() {
  const { t } = useTranslation();
  return (key?: string) => {
    if (!key) return '';
    const k = `pass.tiers.${key}`;
    const v = t(k);
    return v === k ? key : v;
  };
}

const STATUS_TONE: Record<string, string> = {
  new: 'bg-white/[0.07] text-white/70 ring-white/10',
  contacted: 'bg-[#FDB022]/12 text-[#FEDF89] ring-[#FDB022]/25',
  live: 'bg-[#608EFA]/12 text-[#9CBBFF] ring-[#608EFA]/25',
  credit_applied: 'bg-[#17B26A]/12 text-[#75E0A7] ring-[#17B26A]/25',
  not_qualified: 'bg-white/[0.04] text-white/35 ring-white/[0.08]',
};

export const StatusBadge = ({ status }: { status: string }) => {
  const { t } = useTranslation();
  const label = t(`pass.status.${status}`);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset ${
        STATUS_TONE[status] || STATUS_TONE.new
      }`}
    >
      {label === `pass.status.${status}` ? status : label}
    </span>
  );
};

/**
 * En-tête commun des écrans membres. Le sélecteur à six écrans du prototype n'est PAS
 * livré (brief, règle 7) : dans le vrai produit ce sont des routes distinctes, et un
 * membre n'a que deux destinations — son espace et le formulaire.
 */
export const PassHeader = ({
  onDark = true,
  right,
}: {
  onDark?: boolean;
  right?: ReactNode;
}) => {
  const { i18n, fr } = useFmt();
  return (
    <header className="mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-8 sm:py-7">
      {/* Identification du programme telle que le designer la définit : le logo Cluster,
          puis la pastille orange du programme. Pas de symbole, pas d'endossement rédigé —
          la hiérarchie parle d'elle-même, Cluster d'abord, le programme ensuite. */}
      <Link to="/pass" className="flex items-center gap-3">
        <ClusterMark onDark={onDark} className="h-[22px] w-auto" />
        <PassPill />
      </Link>

      <div className="flex items-center gap-3">
        {right}
        <div
          className={`inline-flex rounded-full p-1 text-[13px] font-medium ${
            onDark ? 'border border-white/12 bg-white/[0.04]' : 'border border-[#E0E0E0] bg-white'
          }`}
        >
          {(['fr', 'en'] as const).map((lng) => (
            <button
              key={lng}
              type="button"
              onClick={() => {
                i18n.changeLanguage(lng);
                localStorage.setItem('language', lng);
              }}
              className={`rounded-full px-3.5 py-1.5 transition-colors duration-150 ${
                (lng === 'fr') === fr
                  ? onDark
                    ? 'bg-white text-[#141414]'
                    : 'bg-[#141414] text-white'
                  : onDark
                    ? 'text-white/55 hover:text-white'
                    : 'text-[#61646C] hover:text-[#141414]'
              }`}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};

/** Animation d'entrée commune — 220 ms, la borne haute que le brief autorise. */
export const PassMotion = () => (
  <style>{`
    @keyframes passRise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
    .pass-rise { animation: passRise .22s cubic-bezier(.2,.8,.2,1) both }
  `}</style>
);
