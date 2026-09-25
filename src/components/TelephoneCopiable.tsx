import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Un numero de telephone qu'on copie d'un clic.
//
// PAS un lien `tel:` : sur un poste de travail Windows sans logiciel de telephonie, il n'ouvre
// rien du tout — David a signale un « lien qui va nulle part » le 2026-09-25. Copier est le geste
// utile ici : on compose ensuite depuis son cellulaire ou son logiciel d'appel. Bonus la ou la
// rangee d'un tableau est elle-meme cliquable : selectionner le numero a la souris ouvrirait la
// fiche, alors qu'un bouton « copier » rend le numero recuperable sans se battre avec ce clic.
//
// Le temoin « Copie » est en position ABSOLUE, pour que rien ne bouge pendant 1,5 s : dans la file
// partenaires, un mot apparaissant en flux poussait un tableau qui tient deja a la largeur pres.
//
// ⚠️ Le PLACEMENT du temoin se MESURE, il ne se suppose pas. A droite du numero, il chevauchait la
// pastille « Aucune correspondance » de la file et devenait illisible. Regarder ce qu'il y a a
// cote AVANT de choisir :
//   - `dessous` quand la place manque a droite et que la ligne du dessous est vide ;
//   - a droite (defaut) quand la colonne des valeurs est large et que le dessous est occupe.
export default function TelephoneCopiable({ valeur, className, dessous }: {
  valeur: string; className?: string; dessous?: boolean;
}) {
  const { t } = useTranslation();
  const [copie, setCopie] = useState(false);
  return (
    <span className="relative inline-block">
      <button type="button"
        // `writeText` REJETTE dans plusieurs cas ordinaires (onglet non focalise, permission
        // refusee). Afficher « Copie » sans attendre, c'est promettre un numero que l'usager
        // n'a pas. On n'annonce donc qu'apres coup, et on retombe sur l'ancienne methode —
        // une zone de texte selectionnee puis `execCommand` — quand l'API moderne dit non.
        onClick={async () => {
          let ok = false;
          try {
            await navigator.clipboard.writeText(valeur);
            ok = true;
          } catch {
            const z = document.createElement('textarea');
            z.value = valeur;
            z.style.cssText = 'position:fixed;top:-1000px;opacity:0';
            document.body.appendChild(z);
            z.select();
            try { ok = document.execCommand('copy'); } catch { ok = false; }
            z.remove();
          }
          if (!ok) return;
          setCopie(true);
          setTimeout(() => setCopie(false), 1500);
        }}
        title={t('common.copyPhone') as string}
        className={`whitespace-nowrap tabular-nums hover:text-primary ${className || ''}`}>
        {valeur}
      </button>
      {copie && (
        <span className={`pointer-events-none absolute whitespace-nowrap text-[11px] font-medium text-green-700 dark:text-success ${
          dessous ? 'left-0 top-full mt-0.5' : 'left-full top-0 ml-2'}`}>
          {t('common.copied')}
        </span>
      )}
    </span>
  );
}
