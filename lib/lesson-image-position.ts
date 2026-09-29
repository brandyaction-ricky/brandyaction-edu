import { lessonDocumentForEditor, serializeLessonDocument } from './lesson-body';
import type { LessonBlock } from './lesson-blocks';

// A text boundary refers to a direct child of the rich-text document, never a
// list item, heading's text, or toggle's inner content. Media stays in the
// existing top-level asset contract used by access checks and saved revisions.
export type LessonImagePosition = { blockId: string | null; after?: boolean; textBoundary?: number };
export function positionLessonImage(blocks: LessonBlock[], image: LessonBlock, position: LessonImagePosition, splitId: string): LessonBlock[] {
  const source = blocks.find(block => block.id === image.id);
  if (image.type !== 'image' || (source && source.type !== 'image')) throw new Error('이미지 항목만 이동할 수 있습니다.');
  if (position.blockId === image.id) return blocks;
  const next = blocks.filter(block => block.id !== image.id);
  const index = position.blockId === null ? next.length : next.findIndex(block => block.id === position.blockId);
  if (index < 0) throw new Error('넣을 위치가 바뀌었습니다. 다시 선택해 주세요.');
  const target = next[index];
  const boundary = position.textBoundary;
  if (boundary !== undefined) {
    if (target?.type !== 'text') throw new Error('본문 위치를 다시 선택해 주세요.');
    const nodes = lessonDocumentForEditor(target.content || '').content || [];
    if (!Number.isInteger(boundary) || boundary < 0 || boundary > nodes.length) throw new Error('본문 위치를 다시 선택해 주세요.');
    if (boundary === 0) next.splice(index, 0, image);
    else if (boundary === nodes.length) next.splice(index + 1, 0, image);
    else {
      if (blocks.some(block => block.id === splitId) || splitId === image.id) throw new Error('새 본문 번호를 만들지 못했습니다.');
      next.splice(index, 1,
        { ...target, content: serializeLessonDocument({ type: 'doc', content: nodes.slice(0, boundary) }) },
        image,
        { ...target, id: splitId, content: serializeLessonDocument({ type: 'doc', content: nodes.slice(boundary) }) });
    }
  } else next.splice(index + (target && position.after ? 1 : 0), 0, image);
  if (next.length > 1000) throw new Error('학습 항목은 최대 1,000개까지 넣을 수 있습니다.');
  return next;
}
