import type { QuestionAiReference } from '@/lib/question-ai-context';
export function QuestionAiReferenceNote({ reference }: { reference?: QuestionAiReference | null }) {
 if (!reference) return null;
 if (reference.sources) return <aside className="meta"><p>커리큘럼 {reference.searchedLessons}개 수업에서 근거를 찾았습니다. {reference.needsMentor ? '담당자 확인이 필요한 내용이 있습니다.' : '등록 전 실제 수업과 답변을 확인해 주세요.'}{reference.imageIncluded ? ' 첨부 이미지도 참고했습니다.' : ''}</p>{reference.sources.map(source=><details key={source.id}><summary>{source.title} · {source.revision ? '본문 '+source.revision.slice(0,8) : '기존 본문'}</summary><p className="reading-copy">{source.excerpt}</p></details>)}</aside>;
 return <p className="meta">초안 참고 자료: {reference.lessonTitle || '질문 내용'}{reference.imageIncluded ? ' · 첨부 이미지' + (reference.imageFirstFrame ? '(첫 장)' : '') : ''}{reference.truncated ? ' · 긴 수업의 앞부분만 참고했습니다. 나머지 내용도 확인해 주세요.' : ''}{reference.contextMissing ? ' · 연결된 수업 본문이 없어 수업 내용 확인이 필요합니다.' : ''}</p>;
}
