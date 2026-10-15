import React from 'react';

// « Une couleur = un sens, partout » (planche « Statuts et boutons »). Tout statut de tout
// module se range dans UNE de ces cinq familles — avant, l'orange voulait dire « nouvelle »,
// « envoyée » ou « doublon » selon la page. Toujours un libellé, jamais la couleur seule.
//
//   neutral  Rien à faire : brouillon, fermé, terminé sans suite.
//   new      Demande une première action ou suit son cours normal.
//   wait     Bloqué par quelque chose ou quelqu'un : relance, retenue, vérification.
//   ok       C'est fait et c'est positif : payé, accepté, signé.
//   err      Il faut corriger : erreur de synchro, donnée manquante.

export type StatusFamily = 'neutral' | 'new' | 'wait' | 'ok' | 'err';

export const STATUS_PILL_CLS: Record<StatusFamily, string> = {
  neutral: 'bg-[#ECECEE] text-[#424242] dark:bg-[#232323] dark:text-[#D1D1D1]',
  new: 'bg-[rgba(245,131,69,0.14)] text-accent-ink dark:bg-[rgba(245,131,69,0.16)] dark:text-[#F79C6A]',
  wait: 'bg-[rgba(253,176,34,0.18)] text-[#B54708] dark:bg-[rgba(253,176,34,0.16)] dark:text-[#FDB022]',
  ok: 'bg-[rgba(23,178,106,0.12)] text-[#067647] dark:bg-[rgba(23,178,106,0.18)] dark:text-[#57D193]',
  err: 'bg-[rgba(244,96,96,0.12)] text-[#D92D20] dark:bg-[rgba(244,96,96,0.16)] dark:text-[#F46060]',
};

/** Dot colour for the same families (list rows, map legends). */
export const STATUS_DOT_CLS: Record<StatusFamily, string> = {
  neutral: 'bg-[#575A61] dark:bg-[#999AA7]',
  new: 'bg-primary',
  wait: 'bg-[#FDB022]',
  ok: 'bg-[#17B26A]',
  err: 'bg-[#F46060]',
};

const StatusPill = ({ family, children, className = '', title }: {
  family: StatusFamily;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) => (
  <span
    title={title}
    className={`inline-flex items-center whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-bold ${STATUS_PILL_CLS[family]} ${className}`}
  >
    {children}
  </span>
);

export default StatusPill;
