import * as pdfjsLib from 'pdfjs-dist';
// Vite bundles the worker and gives us a URL for it — same setup as PdfThumbPreview.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Extraction du texte d'un relevé (§1).
 *
 * ⚠️ CE FICHIER NE FABRIQUE PAS DE LIGNES, ET C'EST VOLONTAIRE.
 *
 * Il fait uniquement ce que seul le navigateur peut faire : ouvrir le PDF et regrouper les
 * fragments de texte par coordonnée. Il renvoie des CELLULES — un fragment par entrée, dans
 * l'ordre de lecture — et le serveur en déduit les lignes.
 *
 * Pourquoi : l'écrasement des espaces décrit au §1 est l'étape dont dépend toute la détection
 * de sections en aval. Si le navigateur construisait ses propres lignes, cette étape existerait
 * en DEUX exemplaires, et la copie couverte par les tests ne serait pas celle qui tourne en
 * production. Les deux pourraient diverger en silence, avec tous les tests au vert.
 *
 * Les cellules servent aussi à autre chose : la mise en page Moneris française sépare les
 * milliers par une ESPACE, donc une fois les colonnes aplaties « Visa 2 400 128 900,50 »
 * devient indéchiffrable. Les frontières de colonnes du PDF, elles, tranchent la question.
 */

export interface ExtractResult {
  cells: string[][];
  pageCount: number;
}

export async function extractCells(file: File): Promise<ExtractResult> {
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buf),
    // Un relevé est un PDF texte : aucune police à rendre.
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;

  const out: string[][] = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    // Regroupement par coordonnée Y arrondie, puis tri gauche→droite par X.
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      if (!item || typeof item.str !== 'string' || !item.str.trim()) continue;
      const t = item.transform || [];
      const y = Math.round(Number(t[5]) || 0);
      const x = Number(t[4]) || 0;
      if (!rows.has(y)) rows.set(y, []);
      // Chaque cellule est normalisée individuellement : une valeur ne doit pas traîner
      // d'espaces de crénage. Le regroupement en lignes, lui, reste au serveur.
      rows.get(y)!.push({ x, str: item.str.replace(/\s+/g, ' ').trim() });
    }

    // Y croît vers le HAUT dans un PDF : l'ordre de lecture est donc décroissant.
    [...rows.keys()]
      .sort((a, b) => b - a)
      .forEach((y) => {
        const cells = rows.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.str).filter(Boolean);
        if (cells.length) out.push(cells);
      });
  }

  const pageCount = doc.numPages;
  // ⚠️ pdfjs v6 porte destroy() sur la TÂCHE de chargement, pas sur le document.
  await loadingTask.destroy();
  return { cells: out, pageCount };
}

/**
 * Un PDF numérisé (une image) ne rend aucun texte. On le détecte pour envoyer le rep vers la
 * saisie JSON (§7) au lieu de le laisser devant un écran vide sans explication.
 */
export function looksScanned(r: ExtractResult): boolean {
  const totalCells = r.cells.reduce((s, row) => s + row.length, 0);
  return totalCells < 20;
}
