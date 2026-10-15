import React from 'react';

// Sofia's replies, rendered (audit UX, P2 : « les réponses s'affichent en texte brut, sans
// tableaux »). A deliberately SMALL Markdown subset, built as React elements — no HTML string is
// ever injected, so a reply quoting a CRM note can't smuggle markup into the page:
//   paragraphs · **bold** · *italic* · `code` · bullet and numbered lists · pipe tables
//   · ### headings (shown as bold lines) · [label](https://link)
// Anything else stays as plain text, which is exactly what the reply was before.

const inline = (text: string, key: string): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  // **bold**, *italic*, `code`, [label](http…)
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*[^*\s][^*]*\*)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k} className="rounded bg-black/5 px-1 text-[0.92em] dark:bg-white/10">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(tok);
      out.push(mm ? <a key={k} href={mm[2]} target="_blank" rel="noreferrer noopener" className="font-medium underline">{mm[1]}</a> : tok);
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

const SofiaMarkdown = ({ text }: { text: string }) => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0; let b = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const key = `b${b++}`;
    // Table: header row, divider, body rows.
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
      const numeric = head.map((_, c) => rows.length > 0 && rows.every((r) => /^[-+]?[\d\s.,]+\s*(\$|%|pts?)?$/.test(r[c] || '') || !(r[c] || '').trim()));
      blocks.push(
        <div key={key} className="my-1 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full border-collapse text-[13px]">
            <thead><tr>{head.map((h, c) => <th key={c} className={`whitespace-nowrap border-b border-black/10 px-2.5 py-1.5 font-bold dark:border-white/10 ${numeric[c] ? 'text-right' : 'text-left'}`}>{inline(h, `${key}h${c}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => (
              <tr key={ri}>{head.map((_, c) => <td key={c} className={`border-b border-black/5 px-2.5 py-1.5 last:border-b-0 dark:border-white/5 ${numeric[c] ? 'whitespace-nowrap text-right' : ''}`}>{inline(r[c] || '', `${key}r${ri}c${c}`)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    // Lists (one level).
    const bullet = /^\s*[-*•]\s+(.*)$/; const numbered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? numbered : bullet).test(lines[i])) { items.push((ordered ? numbered : bullet).exec(lines[i])![1]); i++; }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={key} className={`my-1 space-y-0.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`}>{items.map((it, k) => <li key={k}>{inline(it, `${key}-${k}`)}</li>)}</List>);
      continue;
    }
    // Heading → a bold line (a chat bubble has no room for big titles).
    const h = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (h) { blocks.push(<p key={key} className="mt-1 font-bold">{inline(h[1], key)}</p>); i++; continue; }
    // Paragraph: consecutive plain lines, line breaks kept.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isTableRow(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i]) && !/^\s*#{1,6}\s/.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={key} className="my-0.5">{para.map((p, k) => <React.Fragment key={k}>{k > 0 && <br />}{inline(p, `${key}-${k}`)}</React.Fragment>)}</p>);
  }
  return <div className="space-y-1.5">{blocks}</div>;
};

export default SofiaMarkdown;
