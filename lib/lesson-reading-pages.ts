import type { PublicLessonBlock } from './lesson-blocks';
import { LESSON_BODY_PREFIX, lessonBodyPlainText, parseLessonDocument, type LessonNode } from './lesson-body';
import { lessonEmbeddedImageIds, lessonImageReferences } from './lesson-toggle-images';
import { lessonImageRows } from './lesson-image-row';

const readingBudget = 1000;

function nodeWeight(node: LessonNode): number {
  if (node.type === 'text') return node.text?.length || 0;
  if (['lessonImage', 'lessonFile', 'lessonEmbed'].includes(node.type)) return 360;
  return (node.content || []).reduce((sum, child) => sum + nodeWeight(child), 12);
}

// Split only between complete rich-text nodes or plain-text lines. A toggle,
// list, linked phrase or prompt remains an intact unit with its original ID.
function chunks<T>(items: T[], weight: (item: T) => number, heading: (item: T) => boolean) {
  const result: T[][] = [];
  let current: T[] = [], size = 0;
  for (const item of items) {
    const next = weight(item);
    if (current.length && size > 60 && (heading(item) || size + next > readingBudget)) {
      result.push(current); current = []; size = 0;
    }
    current.push(item); size += next;
  }
  if (current.length) result.push(current);
  return result;
}

function textPieces(block: PublicLessonBlock) {
  const text = block.content || '';
  const doc = parseLessonDocument(text);
  if (doc) {
    // Empty rich-text spacer blocks still belong to the source document.
    if (!doc.content?.length || (!lessonBodyPlainText(text).trim() && !lessonImageReferences(doc).length)) {
      return [{block, weight: 0}];
    }
    const sections: LessonNode[][] = [];
    let titles: LessonNode[] = [];
    for (const node of doc.content) {
      if (node.type === 'heading') titles.push(node);
      else {
        sections.push([...titles, node]);
        titles = [];
      }
    }
    if (titles.length) {
      if (sections.length) sections[sections.length - 1].push(...titles);
      else sections.push(titles);
    }
    const groups = chunks(sections, nodes => nodes.reduce((sum, node) => sum + nodeWeight(node), 0),
      nodes => nodes[0].type === 'heading').map(group => group.flat());
    return groups.map(nodes => ({
      block: groups.length === 1 ? block : { ...block, content: LESSON_BODY_PREFIX + JSON.stringify({type:'doc',content:nodes}) },
      weight: nodes.reduce((sum,node) => sum + nodeWeight(node), 0),
    }));
  }
  // Single line breaks are often just the author's visual line wrapping.
  const paragraphs = text.match(/[\s\S]*?(?:\r?\n[ \t]*\r?\n|$)/g)?.filter(Boolean) || [];
  const groups = chunks(paragraphs.length ? paragraphs : [''], paragraph => paragraph.length, () => false);
  return groups.map(lines => {
    const content = lines.join('');
    return { block: groups.length === 1 ? block : { ...block, content }, weight: content.trim().length };
  });
}

type ReadingUnit = { blocks: PublicLessonBlock[]; weight: number; startsPage: boolean; kind: 'title' | 'text' | 'activity' | 'space' };

export function lessonReadingPages(blocks: PublicLessonBlock[]): PublicLessonBlock[][] {
  const embedded = lessonEmbeddedImageIds(blocks);
  const units: ReadingUnit[] = [];
  function add(unit: ReadingUnit) {
    const previous = units.at(-1);
    // Keep instructions with the control or illustration they introduce,
    // including any blank paragraphs between them. Measure the pair as one.
    if (previous && (unit.kind === 'space' || (previous.kind === 'text' && unit.kind === 'activity'))) {
      previous.blocks.push(...unit.blocks);
      previous.weight += unit.weight;
      if (unit.kind === 'activity') previous.kind = 'activity';
    } else {
      units.push(unit);
    }
  }

  for (const row of lessonImageRows(blocks.filter(block => !embedded.has(block.id)))) {
    const block = row[0];
    if (block.type === 'text') {
      for (const [i, piece] of textPieces(block).entries()) {
        add({blocks: [piece.block], weight: piece.weight, startsPage: i > 0, kind: piece.weight ? 'text' : 'space'});
      }
    } else {
      const title = block.type === 'heading' || block.type === 'subheading';
      add({blocks: row, weight: title ? 30 : block.type === 'divider' ? 0 : 360,
        startsPage: title, kind: title ? 'title' : block.type === 'divider' ? 'space' : 'activity'});
    }
  }

  const pages: PublicLessonBlock[][] = [];
  let page: PublicLessonBlock[] = [], size = 0, hasBody = false;
  for (const unit of units) {
    if (hasBody && (unit.startsPage || size + unit.weight > readingBudget)) {
      pages.push(page); page = []; size = 0; hasBody = false;
    }
    page.push(...unit.blocks); size += unit.weight;
    if (unit.kind === 'text' || unit.kind === 'activity') hasBody = true;
  }
  if (page.length) pages.push(page);
  return pages;
}

// A page whose blocks show nothing (an emptied title, spacer text) is folded into
// the previous page so readers never land on a blank step after an edit.
export function withoutBlankPages<L>(pages: PublicLessonBlock[][], labels: L[]) {
  const blank = (b: PublicLessonBlock) => ['text', 'heading', 'subheading', 'divider'].includes(b.type) && !lessonBodyPlainText(b.content || '').trim()
    && !(parseLessonDocument(b.content || '') && lessonImageReferences(parseLessonDocument(b.content || '')!).length);
  const out: { blocks: PublicLessonBlock[]; label: L }[] = [];
  pages.forEach((blocks, i) => {
    if (blocks.every(blank) && (out.length || i < pages.length - 1)) {
      if (out.length) out[out.length - 1].blocks.push(...blocks); else pages[i + 1] = [...blocks, ...pages[i + 1]];
    } else out.push({ blocks: [...blocks], label: labels[i] });
  });
  return out;
}

// A lesson whose reviewed step plan no longer matches is shown as its big tasks:
// a new section at every heading block and at every level-1/2 title inside rich text
// (smaller titles stay inside), never 1,000-character slices. Embedded media stays inline.
export function lessonSections(blocks: PublicLessonBlock[]): { blocks: PublicLessonBlock[]; label?: string }[] {
  const embedded = lessonEmbeddedImageIds(blocks);
  const sections: { blocks: PublicLessonBlock[]; label?: string }[] = [];
  const open = (label?: string) => { const last = sections.at(-1); if (last && !last.blocks.some(b => b.type !== 'heading')) { last.label ??= label; return; } sections.push({ blocks: [], label }); };
  const add = (block: PublicLessonBlock) => { if (!sections.length) sections.push({ blocks: [] }); sections.at(-1)!.blocks.push(block); };
  const title = (node: LessonNode) => (node.content || []).map(c => c.text || '').join('').trim().slice(0, 40) || undefined;
  for (const block of blocks) {
    if (embedded.has(block.id)) continue;
    if (block.type === 'heading') { open(lessonBodyPlainText(block.content || '').trim().slice(0, 40) || undefined); add(block); continue; }
    const doc = block.type === 'text' ? parseLessonDocument(block.content || '') : null;
    const nodes = doc?.content || [];
    const cuts = nodes.flatMap((n, i) => i > 0 && n.type === 'heading' && Number(n.attrs?.level ?? 1) <= 2 ? [i] : []);
    const leads = nodes[0]?.type === 'heading' && Number(nodes[0].attrs?.level ?? 1) <= 2;
    if (!doc || (!cuts.length && !leads)) { add(block); continue; }
    [0, ...cuts].forEach((start, k) => {
      const part = nodes.slice(start, cuts[k] ?? nodes.length);
      if (k > 0 || leads) open(title(part[0]));
      add(cuts.length ? { ...block, content: LESSON_BODY_PREFIX + JSON.stringify({ ...doc, content: part }) } : block);
    });
  }
  return sections;
}
