import { lessonDocumentForEditor, normalizeLessonDocument, serializeLessonDocument, type LessonNode } from './lesson-body';
import type { LessonBlock } from './lesson-blocks';

export type CanvasNode = { type: string; attrs?: { block?: LessonBlock | null }; content?: LessonNode[] };
export const isCanvasText = (block: LessonBlock) => ['text', 'heading', 'subheading'].includes(block.type);

export function canvasTextContent(block: LessonBlock): LessonNode[] {
  if (block.type === 'text') return lessonDocumentForEditor(block.content || '').content || [{ type: 'paragraph' }];
  return [{ type: 'heading', attrs: { level: block.type === 'heading' ? 2 : 3 }, content: block.content ? [{ type: 'text', text: block.content }] : [] }];
}

export function lessonCanvasNodes(blocks: LessonBlock[]): CanvasNode[] {
  return blocks.map(block => ({ type: isCanvasText(block) ? 'lessonText' : 'lessonActivity', attrs: { block }, ...(isCanvasText(block) ? { content: canvasTextContent(block) } : {}) }));
}

// The canvas is an editing projection, never a new persistence format. Keep
// unchanged legacy text byte-for-byte and keep every question/tool/media ID.
export function blocksFromCanvas(nodes: CanvasNode[]): LessonBlock[] {
  const ids = new Set<string>();
  return nodes.map(node => {
    const block = node.attrs?.block;
    if (!block?.id || ids.has(block.id) || !['lessonText', 'lessonActivity'].includes(node.type)) throw new Error('문서 항목의 연결을 확인해 주세요. 내용을 다시 불러오기 전에 임시저장본을 보관해 주세요.');
    ids.add(block.id);
    if (node.type === 'lessonActivity') return block;
    const doc = normalizeLessonDocument({ type: 'doc', content: node.content });
    if (!doc) throw new Error('지원하지 않는 본문 서식입니다.');
    const original = normalizeLessonDocument({ type: 'doc', content: canvasTextContent(block) });
    if (JSON.stringify(doc) === JSON.stringify(original)) return block;
    const only = doc.content?.length === 1 ? doc.content[0] : undefined;
    if (block.type !== 'text' && only?.type === 'heading' && only.attrs?.level === (block.type === 'heading' ? 2 : 3) && (only.content || []).every(child => child.type === 'text' && !child.marks?.length)) {
      return { ...block, content: (only.content || []).map(child => child.text || '').join('') };
    }
    return { ...block, type: 'text', content: serializeLessonDocument(doc) };
  });
}

export function duplicateLessonBlock(block: LessonBlock, id: () => string): LessonBlock {
  const copy = structuredClone(block); copy.id = id();
  if (copy.fields) copy.fields = copy.fields.map(field => ({ ...field, id: id() }));
  if (copy.quiz) copy.quiz.questions = copy.quiz.questions.map(question => ({ ...question, id: id() }));
  return copy;
}
