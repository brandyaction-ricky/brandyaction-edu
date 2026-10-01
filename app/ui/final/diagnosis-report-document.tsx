import { useMemo } from 'react';

type ReportBlock = { type: 'heading'; level: 1 | 2 | 3; text: string } | { type: 'paragraph' | 'quote'; text: string }
  | { type: 'list'; items: string[] } | { type: 'rule' } | { type: 'table'; columns: string[]; rows: string[][] };

// Decode the canonical MD serializer's escapes into React text, never markup.
export function reportText(value: string) {
  return value.replace(/\\([\\`*_{}\[\]()#+.!|~-])/g, '$1')
    .replace(/&(?:amp|lt|gt|quot|apos|#(?:\d+|x[a-f\d]+));/gi, entity => {
      const named: Record<string,string> = { '&amp;':'&', '&lt;':'<', '&gt;':'>', '&quot;':'"', '&apos;':"'" };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
      const hex = /^&#x/i.test(entity), point = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
      return Number.isInteger(point) && point >= 32 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : entity;
    });
}

export function reportTableCells(line: string) {
  const source = line.trim(), cells: string[] = []; let cell = '';
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\\' && i + 1 < source.length) { cell += source[i] + source[++i]; continue; }
    if (source[i] === '|') { cells.push(cell.trim()); cell = ''; } else cell += source[i];
  }
  cells.push(cell.trim());
  if (source.startsWith('|') && cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();
  return cells;
}

export function parseDiagnosisReport(markdown: string): ReportBlock[] {
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n'), blocks: ReportBlock[] = [];
  let i = 0;
  // Private version/provenance metadata remains in the downloaded MD, not the customer-facing preview.
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, n) => n > 0 && line.trim() === '---');
    if (end > 1 && lines.slice(1,end).every(line => /^[A-Za-z_][A-Za-z0-9_-]*:\s/.test(line))) i = end + 1;
  }
  const special = (line: string) => /^(?:#{1,3}\s|>\s?|[-*]\s|\|)/.test(line) || line.trim() === '---';
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    // Keep pathological files from creating hundreds of thousands of DOM elements.
    if (blocks.length >= 2000) { blocks.push({ type:'paragraph', text:reportText(lines.slice(i).join('\n')) }); break; }
    const line = lines[i], heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) { blocks.push({type:'heading',level:heading[1].length as 1|2|3,text:reportText(heading[2])}); i++; continue; }
    if (line.trim() === '---') { blocks.push({type:'rule'}); i++; continue; }
    if (line.startsWith('|') && i + 1 < lines.length) {
      const columns = reportTableCells(line), separator = reportTableCells(lines[i + 1]);
      if (columns.length && columns.length === separator.length && separator.every(cell => /^:?-{3,}:?$/.test(cell))) {
        const rows: string[][] = []; i += 2;
        while (i < lines.length && lines[i].startsWith('|') && rows.length < 1000) {
          const cells = reportTableCells(lines[i]); if (cells.length !== columns.length) break;
          rows.push(cells.map(cell => reportText(cell.replace(/<br>/g, '\n')))); i++;
        }
        blocks.push({type:'table',columns:columns.map(reportText),rows}); continue;
      }
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = []; while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({type:'quote',text:reportText(quote.join('\n'))}); continue;
    }
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i]) && items.length < 1000) {
        let item = lines[i++].replace(/^[-*]\s/, '');
        while (i < lines.length && /^ {2}/.test(lines[i])) item += '\n' + lines[i++].slice(2);
        items.push(reportText(item));
      }
      blocks.push({type:'list',items}); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !special(lines[i])) paragraph.push(lines[i++]);
    blocks.push({type:'paragraph',text:reportText(paragraph.join('\n'))});
  }
  return blocks;
}

export function DiagnosisReportDocument({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => parseDiagnosisReport(markdown), [markdown]);
  return <div className="diagnosis-report-document" tabIndex={0} aria-label="검사 결과 본문">
    {blocks.map((block, index) => {
      if (block.type === 'heading') {
        // The surrounding screen owns h1; report chapters begin at h2.
        return block.level === 1 ? <h2 key={index}>{block.text}</h2>
          : block.level === 2 ? <h3 key={index}>{block.text}</h3> : <h4 key={index}>{block.text}</h4>;
      }
      if (block.type === 'rule') return <hr key={index}/>;
      if (block.type === 'quote') return <blockquote key={index}>{block.text}</blockquote>;
      if (block.type === 'list') return <ul key={index}>{block.items.map((item,n) => <li key={n}>{item}</li>)}</ul>;
      if (block.type === 'table') return <div className="diagnosis-report-table" key={index}><table><thead><tr>{block.columns.map((column,n) => <th scope="col" key={n}>{column}</th>)}</tr></thead><tbody>{block.rows.map((row,n) => <tr key={n}>{row.map((cell,c) => <td key={c}>{cell}</td>)}</tr>)}</tbody></table></div>;
      if (block.text.startsWith('**질문 주제:** ')) return <p key={index}><strong>질문 주제:</strong> {block.text.slice('**질문 주제:** '.length)}</p>;
      return <p key={index}>{block.text}</p>;
    })}
  </div>;
}
