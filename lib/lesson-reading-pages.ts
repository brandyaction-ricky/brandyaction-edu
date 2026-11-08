import type { PublicLessonBlock } from './lesson-blocks';
import { LESSON_BODY_PREFIX, parseLessonDocument, type LessonNode } from './lesson-body';
import { lessonEmbeddedImageIds } from './lesson-toggle-images';
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
  if (doc?.content?.length) {
    const groups = chunks(doc.content, nodeWeight, node => node.type === 'heading');
    return groups.map(nodes => ({
      block: groups.length === 1 ? block : { ...block, content: LESSON_BODY_PREFIX + JSON.stringify({type:'doc',content:nodes}) },
      weight: nodes.reduce((sum,node) => sum + nodeWeight(node), 0),
    }));
  }
  const groups = chunks(text.match(/[^\n]*\n|[^\n]+$/g) || [''], line => line.length, () => false);
  return groups.map(lines => {
    const content = lines.join('');
    return { block: groups.length === 1 ? block : { ...block, content }, weight: content.trim().length };
  });
}

export function lessonReadingPages(blocks: PublicLessonBlock[]): PublicLessonBlock[][] {
  const embedded = lessonEmbeddedImageIds(blocks);
  const pages: PublicLessonBlock[][] = [];
  let page: PublicLessonBlock[] = [], size = 0, hasBody = false;
  function append(row: PublicLessonBlock[], weight: number, startsSection: boolean) {
    const last = page.at(-1);
    const illustration = row[0].type === 'image' && last?.type === 'text' && size <= readingBudget;
    if (hasBody && weight > 0 && (startsSection || (!illustration && size + weight > readingBudget))) {
      pages.push(page); page = []; size = 0; hasBody = false;
    }
    page.push(...row); size += weight;
    if (weight && !['heading','subheading','divider'].includes(row[0].type)) hasBody = true;
  }
  for (const row of lessonImageRows(blocks.filter(block => !embedded.has(block.id)))) {
    const block = row[0];
    if (block.type === 'text') {
      for (const [i,piece] of textPieces(block).entries()) append([piece.block], piece.weight, i > 0);
    } else {
      const title = block.type === 'heading' || block.type === 'subheading';
      append(row, title ? 30 : block.type === 'divider' ? 0 : 360, title);
    }
  }
  if (page.length) pages.push(page);
  return pages;
}
