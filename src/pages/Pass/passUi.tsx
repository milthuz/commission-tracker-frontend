import { ReactNode } from 'react';
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
export const ClusterMark = ({ onDark = false, className = 'h-[26px] w-auto' }: { onDark?: boolean; className?: string }) => (
  <img
    src={onDark ? clusterOnDark : clusterOnLight}
    alt="Cluster"
    className={className}
    draggable={false}
  />
);

/**
 * Le symbole de La Passe — le bon de commande au rail (direction B, choisie par
 * l'utilisateur 2026-07-31).
 *
 * Aucun mot dans le dessin, et c'est le point : le programme s'appelle « La Passe » en
 * français et « The Pass » en anglais. Un logotype construit sur des lettres anglaises
 * aurait cassé dans la moitié des cas ; ici le nom reste du texte composé à côté.
 *
 * Le contour utilise `currentColor` : le symbole prend la couleur du texte de son
 * conteneur, donc une seule définition sert les fonds clairs et sombres. Seul l'accent
 * orange est fixe.
 *
 * `detail={false}` retire les deux lignes intérieures. C'était la faiblesse relevée de
 * cette direction — sous ~24 px, le bord déchiré ET deux traits deviennent une bouillie.
 * Le seuil est appliqué automatiquement d'après la taille demandée, plutôt que laissé à
 * la vigilance de chaque appel.
 */
export const PassMark = ({ size = 32, className = '' }: { size?: number; className?: string }) => {
  const detail = size >= 24;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M17 10h30a3 3 0 0 1 3 3v35l-6-4-6 4-6-4-6 4-6-4-6 4V13a3 3 0 0 1 3-3Z"
        stroke="currentColor"
        strokeWidth={detail ? 4.5 : 5.5}
        strokeLinejoin="round"
      />
      {detail && (
        <>
          <path d="M23 23h18" stroke="#F58345" strokeWidth={4.5} strokeLinecap="round" />
          <path d="M23 31h12" stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" opacity={0.4} />
        </>
      )}
    </svg>
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
  const { t, i18n, fr } = useFmt();
  return (
    <header className="mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-8 sm:py-7">
      {/* Lockup ENDOSSÉ : le symbole et le nom du programme d'abord, puis « par » et le
          logo Cluster. La Passe se présente comme une marque à elle, mais jamais sans dire
          d'où elle vient — l'inverse (Cluster en tête) faisait du programme une sous-page. */}
      <Link to="/pass" className="flex items-center gap-3">
        <PassMark size={30} className={onDark ? 'text-white' : 'text-[#141414]'} />
        <span className={`text-[17px] font-bold leading-none tracking-[-0.01em] ${onDark ? 'text-white' : 'text-[#141414]'}`}>
          {t('pass.programName')}
        </span>
        <span className={`ml-1 h-[18px] w-px ${onDark ? 'bg-white/18' : 'bg-[#D1D1D1]'}`} />
        <span className={`flex items-center gap-2 text-[12.5px] ${onDark ? 'text-white/40' : 'text-[#94969C]'}`}>
          {t('pass.common.by')}
          <ClusterMark onDark={onDark} className="h-[15px] w-auto opacity-80" />
        </span>
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
