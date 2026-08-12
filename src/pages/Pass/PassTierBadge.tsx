/**
 * Pastille de palier de La Passe — Commis · Sous · Chef.
 *
 * POURQUOI des étoiles : les paliers portent les noms d'une brigade de cuisine. Une, deux,
 * trois étoiles est la façon dont le métier lui-même compte les rangs — un restaurateur la
 * lit sans légende. C'est aussi ce qui distingue les trois pastilles au premier coup d'œil :
 * l'emblème reste identique, seul le nombre d'étoiles change. Trois dessins différents
 * auraient obligé à les comparer pour comprendre lequel est le plus élevé.
 *
 * L'emblème est une toque, unique aux trois paliers. Dessinée en SVG dans le fichier, sans
 * ressource externe : la page programme est publique et doit s'afficher vite.
 *
 * ⚠️ Ce n'est PAS un symbole de marque pour La Passe. Le brief du designer interdit d'en
 * inventer un, et celui qui avait été dessiné le 2026-07-31 a été retiré pour cette raison.
 * Une pastille de RANG est un autre objet : elle nomme un niveau à l'intérieur du programme,
 * pas le programme lui-même. À faire valider par le designer s'il reprend la charte.
 */
const ORANGE = '#F58345';
const ORANGE_DEEP = '#D16630';

const Star = ({ x }: { x: number }) => (
  <path
    transform={`translate(${x}, 0)`}
    d="M0 -5.2 L1.5 -1.6 L5.3 -1.6 L2.2 0.7 L3.4 4.4 L0 2.1 L-3.4 4.4 L-2.2 0.7 L-5.3 -1.6 L-1.5 -1.6 Z"
    fill="#FFC24B"
  />
);

const PassTierBadge = ({
  level,
  className = 'h-14 w-14',
}: {
  level: number;
  className?: string;
}) => {
  // Les étoiles sont centrées en groupe : à deux, elles encadrent l'axe ; à trois, celle du
  // milieu est sur l'axe. Sans ça le groupe pencherait d'un côté.
  const n = Math.min(Math.max(level, 1), 3);
  const offsets = n === 1 ? [0] : n === 2 ? [-7, 7] : [-13, 0, 13];
  const id = `passTier${n}`;

  return (
    <svg viewBox="0 0 64 72" className={className} role="img" aria-label={`Palier ${n}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ORANGE} />
          <stop offset="1" stopColor={ORANGE_DEEP} />
        </linearGradient>
      </defs>

      {/* Hexagone : la forme d'un écusson, plus stable qu'un cercle à côté de cartes
          rectangulaires. */}
      <path
        d="M32 16 L56 29 L56 55 L32 68 L8 55 L8 29 Z"
        fill={`url(#${id})`}
      />

      {/* La toque, en blanc plein — un contour se perdrait à cette taille. */}
      <g transform="translate(32, 44)" fill="#FFFFFF">
        <path d="M-11 4 h22 v4 a2 2 0 0 1 -2 2 h-18 a2 2 0 0 1 -2 -2 Z" />
        <path d="M-11 2 v-6 a7 7 0 0 1 4.6 -12.2 a7.5 7.5 0 0 1 12.8 0 A7 7 0 0 1 11 -4 v6 Z" />
      </g>

      <g transform="translate(32, 10)">
        {offsets.map((x) => (
          <Star key={x} x={x} />
        ))}
      </g>
    </svg>
  );
};

export default PassTierBadge;
