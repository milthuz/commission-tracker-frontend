// Import Excel du budget consolidé — la mécanique commune aux deux fenêtres : choisir le fichier →
// aperçu (rien n'est écrit) → confirmer. Les erreurs du serveur restent dans la fenêtre, avec leur code.
import { useCallback, useRef, useState } from 'react';
import { errCode, type Msg } from './api';

export interface FlowError { code: string; items: Msg[]; warnings: Msg[] }
interface Previewable { token: string | null }

export function useImportFlow<P extends Previewable, R>(opts: {
  preview: (f: File) => Promise<{ preview: P }>;
  confirm: (p: P) => Promise<R>;
}) {
  const { preview, confirm } = opts;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pv, setPv] = useState<P | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<FlowError | null>(null);

  const reset = useCallback(() => {
    setFile(null); setPv(null); setError(null); setBusy(false); setReading(false);
    if (input.current) input.current.value = '';
  }, []);

  const pick = useCallback(async (f: File | null | undefined) => {
    setPv(null); setError(null); setFile(f || null);
    if (!f) return;
    setReading(true);
    try { setPv((await preview(f)).preview); }
    catch (e: any) { setError({ code: errCode(e), items: e?.body?.errors || [], warnings: e?.body?.warnings || [] }); }
    finally { setReading(false); if (input.current) input.current.value = ''; }
  }, [preview]);

  // Renvoie le résultat, ou null si le serveur a refusé (l'erreur est alors affichée).
  const apply = useCallback(async (): Promise<R | null> => {
    if (!pv || !pv.token) return null;
    setBusy(true); setError(null);
    try { return await confirm(pv); }
    catch (e: any) {
      const code = errCode(e);
      setError({ code, items: [], warnings: [] });
      // Jeton périmé / base changée / verrou : l'aperçu ne vaut plus, on le retire.
      if (['conflict', 'token_expired', 'locked'].includes(code)) setPv(null);
      return null;
    } finally { setBusy(false); }
  }, [pv, confirm]);

  return { input, file, pv, busy, reading, error, pick, apply, reset };
}
