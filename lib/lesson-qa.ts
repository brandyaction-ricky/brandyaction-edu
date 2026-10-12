import { lessonBodyPlainText, parseLessonDocument, serializeLessonDocument } from './lesson-body';
import { validateAuthorPayload, type AuthorPayload } from './lesson-author-drafts';

export type QaAnchor = { blockId: string; node: number; label: string };
export function qaPreviewBody(title: string, answer: string) {
  return serializeLessonDocument({ type: 'doc', content: [{ type: 'details', content: [
    { type: 'detailsSummary', content: [{ type: 'text', text: title }] },
    { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: answer }] }] },
  ] }] });
}
export function lessonQaAnchors(payload: AuthorPayload): QaAnchor[] {
  const checked = validateAuthorPayload(payload, true);
  if (!checked.blocks.active) throw new Error('기존 학습 블록 본문에서 삽입 위치를 선택해 주세요.');
  return checked.blocks.document.blocks.flatMap(block => {
    if (!['text', 'heading', 'subheading'].includes(block.type) || !block.content) return [];
    const doc = parseLessonDocument(block.content);
    if (doc) return (doc.content || []).flatMap((node, index) => {
      if (!['paragraph', 'heading', 'blockquote'].includes(node.type)) return [];
      const plain = lessonBodyPlainText('edu-lesson:v1\n' + JSON.stringify({ type: 'doc', content: [node] })).trim();
      return plain ? [{ blockId: block.id, node: index, label: plain.slice(0, 160) }] : [];
    });
    return [{ blockId: block.id, node: -1, label: lessonBodyPlainText(block.content).slice(0, 160) }];
  });
}
export function qaPlainText(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('공개할 질문 제목과 답변의 길이를 확인해 주세요.');
  const text = value.trim();
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{2,3}[- ]?\d{3,4}[- ]?\d{4}\b|[A-Za-z]:\\|\/Users\//i.test(text)) throw new Error('연락처·개인 폴더 경로를 지운 뒤 검토해 주세요.');
  return text;
}
