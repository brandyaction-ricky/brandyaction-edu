import type { QuestionAiReference } from '@/lib/question-ai-context';
export function QuestionAiReferenceNote({ reference }: { reference?: QuestionAiReference | null }) {
 if (!reference) return null;
 return <p className="meta">초안 참고 자료: {reference.lessonTitle || '질문 내용'}{reference.imageIncluded ? ' · 첨부 이미지' + (reference.imageFirstFrame ? '(첫 장)' : '') : ''}{reference.truncated ? ' · 긴 수업의 앞부분만 참고했습니다. 나머지 내용도 확인해 주세요.' : ''}{reference.contextMissing ? ' · 연결된 수업 본문이 없어 수업 내용 확인이 필요합니다.' : ''}</p>;
}
