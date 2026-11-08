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
