import React from 'react';
import { linePath } from './points';

// Petits graphiques du suivi des points, en SVG simple : les couleurs passent par
// `currentColor` et des classes Tailwind, pour suivre le thème clair/sombre.

/** Courbe cumulée de l'équipe : réel, projection (tirets orange), rythme de l'objectif (tirets gris). */
export function TeamPaceChart({ cum, total, target, proj, today, ariaLabel, todayLabel, projLabel, targetLabel }: {
  cum: number[];           // points cumulés par jour ouvrable écoulé
  total: number;           // jours ouvrables du mois
  target: number;
  proj: number;
  today: boolean;          // mois en cours : ligne « Aujourd'hui » et projection
  ariaLabel: string;
  todayLabel: string;
  projLabel: string;
  targetLabel: string;
}) {
  const W = 640, H = 210, L = 36, R = 630, T = 22, B = 184;
  const n = Math.max(total, 2);
  const pts = cum.length ? cum[cum.length - 1] : 0;
  const ymax = Math.max(proj, target, pts, 10) * 1.08;
  const X = (i: number) => L + i * ((R - L) / (n - 1));
  const Y = (v: number) => B - (v / ymax) * (B - T);
  const step = ymax > 120 ? 40 : ymax > 50 ? 20 : ymax > 20 ? 10 : 5;
  const grid: number[] = [];
  for (let v = 0; v <= ymax; v += step) grid.push(v);
  const ticks = Array.from(new Set([1, 5, 10, 15, 20, total].filter((d) => d <= total)));
  const k = cum.length - 1;
  const projY = Y(proj), targY = Y(target);
  const close = Math.abs(projY - targY) < 16;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={ariaLabel} className="block">
      {grid.map((v) => (
        <g key={v}>
          <line x1={L} x2={R} y1={Y(v)} y2={Y(v)} className="stroke-[#EFEFF1] dark:stroke-[#1F2023]" strokeWidth={1} />
          <text x={L - 8} y={Y(v) + 4} textAnchor="end" fontSize={11} className="fill-[#575A61] dark:fill-[#999AA7]">{v}</text>
        </g>
      ))}
      {ticks.map((d) => (
        <text key={d} x={X(d - 1)} y={H - 6} textAnchor="middle" fontSize={11} className="fill-[#575A61] dark:fill-[#999AA7]">J{d}</text>
      ))}
      {/* rythme de l'objectif : de 0 à la cible en fin de mois */}
      <path d={`M${X(0)} ${Y(target / n)} L${X(n - 1)} ${Y(target)}`} fill="none" className="stroke-[#575A61] dark:stroke-[#999AA7]" strokeWidth={2} strokeDasharray="5 5" />
      {today && k >= 0 && (
        <>
          <line x1={X(k)} x2={X(k)} y1={T - 4} y2={B} className="stroke-[#C4C4CA] dark:stroke-[#3A3B40]" strokeWidth={1} />
          <text x={X(k)} y={12} textAnchor="middle" fontSize={11} fontWeight={700} className="fill-[#424242] dark:fill-[#D1D1D1]">{todayLabel}</text>
          <path d={`M${X(k)} ${Y(pts)} L${X(n - 1)} ${projY}`} fill="none" stroke="#F58345" strokeWidth={2} strokeDasharray="5 5" />
          <text x={R - 4} y={projY - 9} textAnchor="end" fontSize={12} fontWeight={700} className="fill-[#141414] dark:fill-white">{projLabel}</text>
        </>
      )}
      {cum.length > 0 && (
        <>
          <path d={linePath(cum, X, Y)} fill="none" stroke="#F58345" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={X(k)} cy={Y(pts)} r={5} fill="#F58345" className="stroke-white dark:stroke-[#141414]" strokeWidth={2} />
          <text x={X(k) - 10} y={Y(pts) - 8} textAnchor="end" fontSize={13} fontWeight={700} className="fill-[#141414] dark:fill-white">{pts}</text>
        </>
      )}
      <text x={R - 4} y={close ? targY + 22 : targY + (targY > projY ? 18 : -9)} textAnchor="end" fontSize={12} fontWeight={500} className="fill-[#575A61] dark:fill-[#999AA7]">{targetLabel}</text>
    </svg>
  );
}

/** Courbe de rythme d'une ligne de représentant (96×28), avec la ligne du quota. */
export function Sparkline({ cum, total, quota, proj }: { cum: number[]; total: number; quota: number; proj: number }) {
  const n = Math.max(total, 2);
  const ymax = Math.max(quota, proj, 1) * 1.05;
  const X = (i: number) => 2 + i * (92 / (n - 1));
  const Y = (v: number) => 26 - (v / ymax) * 23;
  return (
    <svg viewBox="0 0 96 28" width={96} height={28} aria-hidden="true" className="block">
      <line x1={2} x2={94} y1={Y(quota)} y2={Y(quota)} className="stroke-[#575A61] dark:stroke-[#999AA7]" strokeWidth={1} strokeDasharray="2 3" />
      {cum.length > 0 && <path d={linePath(cum, X, Y)} fill="none" stroke="#F58345" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />}
    </svg>
  );
}

/** Graphique du panneau de détail (320×130) : réel, projection, rythme du quota. */
export function RepChart({ cum, total, quota, proj, today, ariaLabel, quotaLabel }: {
  cum: number[]; total: number; quota: number; proj: number; today: boolean; ariaLabel: string; quotaLabel: string;
}) {
  const n = Math.max(total, 2);
  const pts = cum.length ? cum[cum.length - 1] : 0;
  const cmax = Math.max(quota, proj, pts, 1) * 1.1;
  const X = (i: number) => 8 + i * (304 / (n - 1));
  const Y = (v: number) => 118 - (v / cmax) * 100;
  const k = cum.length - 1;
  return (
    <svg viewBox="0 0 320 130" width="100%" role="img" aria-label={ariaLabel} className="block">
      <line x1={8} x2={312} y1={118} y2={118} className="stroke-[#EFEFF1] dark:stroke-[#1F2023]" strokeWidth={1} />
      <path d={`M${X(0)} ${Y(quota / n)} L${X(n - 1)} ${Y(quota)}`} fill="none" className="stroke-[#575A61] dark:stroke-[#999AA7]" strokeWidth={1.5} strokeDasharray="4 4" />
      {today && k >= 0 && <path d={`M${X(k)} ${Y(pts)} L${X(n - 1)} ${Y(proj)}`} fill="none" stroke="#F58345" strokeWidth={1.75} strokeDasharray="4 4" />}
      {cum.length > 0 && (
        <>
          <path d={linePath(cum, X, Y)} fill="none" stroke="#F58345" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={X(k)} cy={Y(pts)} r={4} fill="#F58345" className="stroke-white dark:stroke-[#141414]" strokeWidth={2} />
        </>
      )}
      {/* halo de la couleur de la carte : les traits pointillés passent derrière l'étiquette sans la barrer */}
      <text x={312} y={Y(quota) - 6} textAnchor="end" fontSize={11} paintOrder="stroke" strokeWidth={4} strokeLinejoin="round"
        className="fill-[#575A61] stroke-white dark:fill-[#999AA7] dark:stroke-boxdark">{quotaLabel}</text>
    </svg>
  );
}

/** Barre d'une ligne : points faits, projection (orange pâle), trait du quota. Échelle 0–30+. */
export function RaceBar({ points, proj, quota, ariaLabel }: { points: number; proj: number; quota: number; ariaLabel: string }) {
  const pct = (v: number) => `${(Math.min(v, 30) / 30) * 100}%`;
  return (
    <span role="img" aria-label={ariaLabel} className="relative block h-3.5 rounded-full bg-[#ECECEE] dark:bg-[#232323]">
      <span className="absolute inset-y-0 left-0 rounded-full bg-[rgba(245,131,69,0.32)] dark:bg-[rgba(245,131,69,0.30)]" style={{ width: pct(proj) }} />
      <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: pct(points) }} />
      <span className="absolute -bottom-1 -top-1 w-0.5 bg-[#141414] dark:bg-white" style={{ left: pct(quota) }} />
    </span>
  );
}

export const Legend = ({ items }: { items: { swatch: React.ReactNode; label: React.ReactNode }[] }) => (
  <div className="flex flex-wrap gap-3.5 text-xs text-body dark:text-bodydark2">
    {items.map((it, i) => <span key={i} className="flex items-center gap-1.5">{it.swatch}{it.label}</span>)}
  </div>
);
