import { lessonBodyPlainText, parseLessonDocument, serializeLessonDocument } from './lesson-body';
import { validateAuthorPayload, type AuthorPayload } from './lesson-author-drafts';

export class LessonQaUnavailableError extends Error {
  readonly code = 'QA_LESSON_UNAVAILABLE';
  constructor(reason: 'legacy' | 'empty' | 'no-anchor') {
    super(reason === 'legacy'
      ? '이 수업은 기존 본문 형식이라 질문·답변을 수업에 넣는 기능을 아직 지원하지 않습니다. 기존 수업 내용은 바뀌지 않았습니다.'
      : '이 수업에는 질문·답변을 넣을 수 있는 설명 위치가 없습니다. 설명 문단이 있는 수업에서 사용할 수 있습니다.');
    this.name = 'LessonQaUnavailableError';
  }
}

export type QaAnchor = { blockId: string; node: number; label: string };
export function qaPreviewBody(title: string, answer: string) {
  return serializeLessonDocument({ type: 'doc', content: [{ type: 'details', content: [
    { type: 'detailsSummary', content: [{ type: 'text', text: title }] },
    { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: answer }] }] },
  ] }] });
}
export function lessonQaAnchors(payload: AuthorPayload): QaAnchor[] {
  const checked = validateAuthorPayload(payload);
  if (!checked.blocks.active) throw new LessonQaUnavailableError('legacy');
  if (!checked.blocks.document.blocks.length && !checked.blocks.document.checklist.length) throw new LessonQaUnavailableError('empty');
  validateAuthorPayload(checked, true);
  const anchors = checked.blocks.document.blocks.flatMap(block => {
    if (!['text', 'heading', 'subheading'].includes(block.type) || !block.content) return [];
    const doc = parseLessonDocument(block.content);
    if (doc) return (doc.content || []).flatMap((node, index) => {
      if (!['paragraph', 'heading', 'blockquote'].includes(node.type)) return [];
      const plain = lessonBodyPlainText('edu-lesson:v1\n' + JSON.stringify({ type: 'doc', content: [node] })).trim();
      return plain ? [{ blockId: block.id, node: index, label: plain.slice(0, 160) }] : [];
    });
    const label = lessonBodyPlainText(block.content).slice(0, 160);
    return label.trim() ? [{ blockId: block.id, node: -1, label }] : [];
  });
  if (!anchors.length) throw new LessonQaUnavailableError('no-anchor');
  return anchors;
}
export function qaPlainText(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('공개할 질문 제목과 답변의 길이를 확인해 주세요.');
  const text = value.trim();
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{2,3}[- ]?\d{3,4}[- ]?\d{4}\b|[A-Za-z]:\\|\/Users\//i.test(text)) throw new Error('연락처·개인 폴더 경로를 지운 뒤 검토해 주세요.');
  return text;
}
