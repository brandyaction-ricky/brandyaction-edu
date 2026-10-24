import { lessonDocumentForEditor, normalizeLessonDocument, serializeLessonDocument, type LessonNode } from './lesson-body';
import type { LessonBlock } from './lesson-blocks';
import { lessonEmbeddedImageIds } from './lesson-toggle-images';

export type CanvasNode = { type: string; text?: string; marks?: LessonNode['marks']; attrs?: Record<string, unknown> & { block?: LessonBlock | null }; content?: CanvasNode[] };
export const isCanvasText = (block: LessonBlock) => ['text', 'heading', 'subheading'].includes(block.type);

// ProseMirror puts open ancestor attributes into data-pm-slice. The original
// body is a round-trip cache, not part of the selection: carrying it here
// makes even a one-line copy include the entire lesson (and retain it on paste).
// Keep selected content and block metadata; never mutate the live document.
export function lessonClipboardNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map(node => ({
    ...node,
    ...(node.type === 'lessonText' && node.attrs?.block ? { attrs: { ...node.attrs, block: { ...node.attrs.block, content: '' } } } : {}),
    ...(node.content ? { content: lessonClipboardNodes(node.content) } : {}),
  }));
}

export function canvasTextContent(block: LessonBlock): LessonNode[] {
  if (block.type === 'text') return lessonDocumentForEditor(block.content || '').content || [{ type: 'paragraph' }];
  return [{ type: 'heading', attrs: { level: block.type === 'heading' ? 2 : 3 }, content: block.content ? [{ type: 'text', text: block.content }] : [] }];
}

export function lessonCanvasNodes(blocks: LessonBlock[]): CanvasNode[] {
  const embedded = lessonEmbeddedImageIds(blocks), images = new Map(blocks.filter(block => ['image', 'file'].includes(block.type)).map(block => [block.id, block]));
  function hydrate(node: LessonNode): CanvasNode {
    if (['lessonImage', 'lessonFile'].includes(node.type)) return { type: node.type, attrs: { blockId: node.attrs?.blockId, block: images.get(String(node.attrs?.blockId)) || null } };
    return { ...node, ...(node.content ? { content: node.content.map(hydrate) } : {}) };
  }
  return blocks.filter(block => !embedded.has(block.id)).map(block => ({ type: isCanvasText(block) ? 'lessonText' : 'lessonActivity', attrs: { block }, ...(isCanvasText(block) ? { content: canvasTextContent(block).map(hydrate) } : {}) }));
}

// The canvas is an editing projection, never a new persistence format. Keep
// unchanged legacy text byte-for-byte and keep every question/tool/media ID.
export function blocksFromCanvas(nodes: CanvasNode[]): LessonBlock[] {
  const ids = new Set<string>();
  function identity(block: LessonBlock | null | undefined) {
    if (!block?.id || ids.has(block.id)) throw new Error('문서 항목의 연결을 확인해 주세요. 내용을 다시 불러오기 전에 임시저장본을 보관해 주세요.');
    ids.add(block.id); return block;
  }
  function images(node: CanvasNode): LessonBlock[] {
    if (['lessonImage', 'lessonFile'].includes(node.type)) {
      const block = identity(node.attrs?.block);
      if (block.type !== (node.type === 'lessonFile' ? 'file' : 'image') || node.attrs?.blockId !== block.id) throw new Error('첨부 자료 연결을 확인해 주세요.');
      return [block];
    }
    return (node.content || []).flatMap(images);
  }
  return nodes.flatMap(node => {
    const block = node.attrs?.block;
    if (!['lessonText', 'lessonActivity'].includes(node.type)) throw new Error('문서 항목의 연결을 확인해 주세요.');
    const originalBlock = identity(block);
    if (node.type === 'lessonActivity') return [originalBlock];
    const nested = (node.content || []).flatMap(images);
    const doc = normalizeLessonDocument({ type: 'doc', content: node.content });
    if (!doc) throw new Error('지원하지 않는 본문 서식입니다.');
    const original = normalizeLessonDocument({ type: 'doc', content: canvasTextContent(originalBlock) });
    if (JSON.stringify(doc) === JSON.stringify(original)) return [originalBlock, ...nested];
    const only = doc.content?.length === 1 ? doc.content[0] : undefined;
    if (originalBlock.type !== 'text' && only?.type === 'heading' && only.attrs?.level === (originalBlock.type === 'heading' ? 2 : 3) && (only.content || []).every(child => child.type === 'text' && !child.marks?.length)) {
      return [{ ...originalBlock, content: (only.content || []).map(child => child.text || '').join('') }];
    }
    return [{ ...originalBlock, type: 'text' as const, content: serializeLessonDocument(doc) }, ...nested];
  });
}

export function duplicateLessonBlock(block: LessonBlock, id: () => string): LessonBlock {
  const copy = structuredClone(block); copy.id = id();
  delete copy.imageGroup;
  if (copy.fields) copy.fields = copy.fields.map(field => ({ ...field, id: id() }));
  if (copy.quiz) copy.quiz.questions = copy.quiz.questions.map(question => ({ ...question, id: id() }));
  return copy;
}
