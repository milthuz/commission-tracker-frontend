import { useEffect, useRef, useState } from 'react';

// Graphiques du Cockpit. Une seule série par graphique, teinte Kaizen (#F58345) : la valeur se
// lit dans le texte (étiquettes, infobulle), jamais dans la couleur seule. SVG/HTML simples, les
// couleurs du texte et de la grille suivent le thème clair/sombre.

/** Colonnes mensuelles (12 mois) avec infobulle au survol / au focus. */
export function MonthlyColumns({ months, values, highlight, fmt, fmtAxis, tooltip, ariaLabel }: {
  months: string[];                 // libellés courts (janv., févr., …)
  values: number[];
  highlight?: number;               // index du mois en cours
  fmt: (v: number) => string;       // valeur complète (étiquette, infobulle)
  fmtAxis: (v: number) => string;   // valeur compacte (axe)
  tooltip: (i: number) => { label: string; value: string }[];
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Dessiné à sa largeur réelle (pas mis à l'échelle) : le texte reste à 11 px sur un téléphone.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 220, L = 52, R = W - 8, T = 18, B = 190;
  const n = months.length;
  const max = Math.max(...values, 1);
  // Graduations « rondes » : 1, 2 ou 5 × 10^k.
  const rough = max / 4, pow = 10 ** Math.floor(Math.log10(rough)), unit = [1, 2, 5, 10].map((m) => m * pow).find((u) => u >= rough) || pow;
  const top = Math.ceil(max / unit) * unit;
  const grid = Array.from({ length: Math.round(top / unit) + 1 }, (_, i) => i * unit);
  const slot = (R - L) / n, bw = Math.min(34, slot * 0.62);
  const crowded = slot < 36;   // trop serré pour « juill. » : l'initiale (le nom complet reste dans l'infobulle)
  const X = (i: number) => L + slot * i + (slot - bw) / 2;
  const Y = (v: number) => B - (v / top) * (B - T);
  const best = values.indexOf(Math.max(...values));
  const tip = hover != null ? tooltip(hover) : null;
  return (
    <div ref={box} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} className="block" onMouseLeave={() => setHover(null)}>
        {grid.map((g) => (
          <g key={g}>
            <line x1={L} x2={R} y1={Y(g)} y2={Y(g)} className="stroke-[#EFEFF1] dark:stroke-[#1F2023]" strokeWidth={1} />
            <text x={L - 8} y={Y(g) + 4} textAnchor="end" fontSize={11} className="fill-[#575A61] dark:fill-[#999AA7]">{fmtAxis(g)}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const h = Math.max(v > 0 ? 3 : 0, B - Y(v));
          const on = hover === i;
          return (
            <g key={i}>
              {/* rectangle de survol plus grand que la barre (toute la colonne) */}
              <rect x={L + slot * i} y={T} width={slot} height={B - T} fill="transparent"
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                tabIndex={0} aria-label={`${months[i]} : ${fmt(v)}`} className="cursor-default outline-none focus-visible:fill-[rgba(245,131,69,0.08)]" />
              {on && <rect x={L + slot * i + 2} y={T} width={slot - 4} height={B - T} rx={6} className="pointer-events-none fill-[rgba(245,131,69,0.08)]" />}
              <path pointerEvents="none"
                d={`M${X(i)} ${B} V${B - h + Math.min(4, h)} Q${X(i)} ${B - h} ${X(i) + Math.min(4, h)} ${B - h} H${X(i) + bw - Math.min(4, h)} Q${X(i) + bw} ${B - h} ${X(i) + bw} ${B - h + Math.min(4, h)} V${B} Z`}
                className={i === highlight ? 'fill-[rgba(245,131,69,0.45)]' : 'fill-primary'} />
              <text x={L + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} pointerEvents="none"
                className={i === highlight ? 'fill-[#141414] font-bold dark:fill-white' : 'fill-[#575A61] dark:fill-[#999AA7]'}>{crowded ? months[i].charAt(0).toUpperCase() : months[i]}</text>
            </g>
          );
        })}
        {/* étiquette directe sélective : le meilleur mois seulement */}
        {values[best] > 0 && hover == null && (
          <text x={X(best) + bw / 2} y={Y(values[best]) - 6} textAnchor="middle" fontSize={11} fontWeight={700} pointerEvents="none"
            className="fill-[#141414] dark:fill-white">{fmtAxis(values[best])}</text>
        )}
        <line x1={L} x2={R} y1={B} y2={B} className="stroke-[#C4C4CA] dark:stroke-[#3A3B40]" strokeWidth={1} />
      </svg>
      {tip && hover != null && (
        <div role="status" className="pointer-events-none absolute top-1 z-10 min-w-[170px] -translate-x-1/2 rounded-xl border border-stroke bg-white px-3 py-2 text-xs shadow-lg dark:border-strokedark dark:bg-[#1B1B1B]"
          style={{ left: `${((L + slot * hover + slot / 2) / W) * 100}%` }}>
          <p className="m-0 mb-1 font-bold text-black dark:text-white">{months[hover]}</p>
          {tip.map((r) => (
            <p key={r.label} className="m-0 flex justify-between gap-4"><span className="text-body dark:text-bodydark2">{r.label}</span><b className="text-black dark:text-white">{r.value}</b></p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Liste de barres horizontales (magnitude), libellé et valeur toujours écrits. */
export function BarList({ items, fmt, ariaLabel, max: maxIn }: {
  items: { key: string; label: string; value: number; sub?: string }[];
  fmt: (v: number) => string;
  ariaLabel: string;
  max?: number;
}) {
  const max = maxIn ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul aria-label={ariaLabel} className="m-0 flex list-none flex-col gap-3 p-0">
      {items.map((it) => (
        <li key={it.key} className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-black dark:text-white">{it.label}{it.sub && <span className="ml-1.5 text-xs text-body dark:text-bodydark2">{it.sub}</span>}</span>
            <b className="shrink-0 text-black dark:text-white">{fmt(it.value)}</b>
          </span>
          <span className="relative block h-2 rounded-full bg-[#ECECEE] dark:bg-[#232323]">
            <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
