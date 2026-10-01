import { isBlockEditorDocument, isLearningFormDraft, type LearningFormDraft } from './learning-editor-draft';
import { validateLessonBlocks, type LessonBlockDocument } from './lesson-blocks';
import { lessonBodyHasText } from './lesson-body';
import { safeUrl } from './platform';
import { uuid } from './edu-workflows';

export type AuthorPayload = { form: LearningFormDraft; blocks: { active: boolean; document: LessonBlockDocument } };
export type AuthorSnapshot = {
  lessonId: string; revision: string | null; publishedRevision: string | null; publishedStamp: string | null;
  baseStamp: string; payload: AuthorPayload;
  public: { stamp: string; payload: AuthorPayload; blockRevision: string | null };
  history: { revision: string; title: string; createdAt: string; baseline: boolean; published: boolean }[];
};
export function validateAuthorPayload(input: unknown, publishing = false): AuthorPayload {
  const v = input as AuthorPayload;
  if (!v || !isLearningFormDraft(v.form) || !v.blocks || typeof v.blocks.active !== 'boolean' || !isBlockEditorDocument(v.blocks.document)) throw new Error('초안의 형식을 확인해 주세요.');
  const b = v.form.basic;
  if (!uuid(b.week_id) || !/^\d+$/.test(b.day_number) || Number(b.day_number) < 1 || Number(b.day_number) > 2147483647 || b.title.length > 300 || b.description.length > 100000 || b.duration_label.length > 1000) throw new Error('주차·일차·제목을 확인해 주세요.');
  if (new TextEncoder().encode(JSON.stringify(v)).byteLength > 3_900_000) throw new Error('초안이 너무 큽니다. 본문이나 파일을 나눠 주세요.');
  if (publishing) {
    if (!b.title.trim()) throw new Error('수업 제목을 입력해 주세요.');
    if (v.blocks.active) {
      validateLessonBlocks(v.blocks.document);
      if (!v.blocks.document.blocks.length && !v.blocks.document.checklist.length) throw new Error('본문이나 질문을 한 개 이상 추가해 주세요.');
    } else {
      const f = v.form;
      if ((f.format === 'text' && !lessonBodyHasText(f.bodyText)) || (f.format === 'vod' && !safeUrl(f.videoUrl)) || (f.format === 'link' && !safeUrl(f.externalUrl)) || (f.format === 'material' && !f.resourcePath.trim())) throw new Error('학생에게 보여 줄 본문·영상·자료·링크를 입력해 주세요.');
    }
  }
  return structuredClone({form:v.form,blocks:{active:v.blocks.active,document:v.blocks.document}});
}
export function authorPublicChanged(snapshot: AuthorSnapshot) {
  return Boolean(snapshot.revision && snapshot.baseStamp !== snapshot.public.stamp && !(snapshot.revision === snapshot.publishedRevision && snapshot.publishedStamp === snapshot.public.stamp));
}
