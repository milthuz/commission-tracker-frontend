// Import Excel du budget consolidé : les deux jeux de boutons de barre d'outils (avec leur fenêtre)
// que les pages Salaires et OPEX posent dans `actions`. Chaque jeu gère sa fenêtre lui-même.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, dialog } from '../../../components/ui';
import { consolidatedApi } from './api';
import { OpexImportModal } from './OpexImportModal';
import { RosterImportModal } from './RosterImportModal';

// Un modèle qui ne se génère pas : le message du serveur, dans une fenêtre (pas un toast, qui disparaît).
function useTemplate(run: (lang: string) => Promise<void>) {
  const { t, i18n } = useTranslation();
  return () => run(i18n.language).catch((e: any) => dialog.alert(t(`finance.consolidatedImport.error.${e?.body?.error || 'template_failed'}`, { defaultValue: t('finance.consolidatedImport.error.template_failed') })));
}

// Page Salaires & contractuels (finance:edit + finance:payroll, budget non approuvé).
export function RosterImportActions() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const download = useTemplate(consolidatedApi.rosterTemplate);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>{t('finance.consolidatedImport.import')}</Button>
      <Button size="sm" variant="ghost" onClick={download}>{t('finance.consolidatedImport.template')}</Button>
      <RosterImportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// Page OPEX, vue FY2027 (finance:edit, budget non approuvé).
export function OpexImportActions() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const download = useTemplate(() => consolidatedApi.opexTemplate());
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>{t('finance.consolidatedImport.import')}</Button>
      <Button size="sm" variant="ghost" onClick={download}>{t('finance.consolidatedImport.templateShort')}</Button>
      <OpexImportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
