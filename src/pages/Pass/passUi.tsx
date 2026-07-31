import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

// Pièces partagées par les écrans de La Passe. Elles existent pour une raison précise :
// le premier écran (adhésion) avait déjà une version bricolée du logo, et trois écrans de
// plus arrivent. Ce qui se répète vit ici, pas recopié à chaque fois.

export const PASS_API =
  import.meta.env.VITE_API_URL || 'https://commission-tracker-production-b7f9.up.railway.app';

// Le lockup du designer, repris au pixel depuis le chrome du deck : le mot, puis un point
// orange de 6 px APRÈS lui, aligné au milieu. (Placé sous le « c », il se lit « .cluster ».)
export const ClusterMark = ({ onDark = false }: { onDark?: boolean }) => (
  <span className={`text-[21px] font-bold leading-none tracking-[-0.02em] ${onDark ? 'text-white' : 'text-[#141414]'}`}>
    cluster
    <span className="ml-[2px] inline-block h-[6px] w-[6px] rounded-full bg-[#F58345] align-middle" />
  </span>
);

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
    <header className="mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-4 px-6 py-7 sm:px-8">
      <Link to="/pass" className="flex items-center gap-3.5">
        <ClusterMark onDark={onDark} />
        <span className={`h-[18px] w-px ${onDark ? 'bg-white/20' : 'bg-[#D1D1D1]'}`} />
        <span className={`text-[14px] font-medium ${onDark ? 'text-white/70' : 'text-[#61646C]'}`}>
          {t('pass.programName')}
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
