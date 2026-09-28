import type { LessonBlockAnswers, PublicBlockDocument } from './lesson-blocks';

export type BlockSubmission = {
  id: string; revision: string; writeId: string; outcome: 'completed' | 'submitted'; createdAt: string;
  state?: 'completed' | 'submitted' | 'approved' | 'changes_requested' | 'reopened';
  stateId?: string; feedback?: string; reviewedAt?: string | null;
};
export type BlockSubmissionDetail = {
  document: PublicBlockDocument; values: LessonBlockAnswers; submission: BlockSubmission;
  memberName?: string; courseTitle?: string; lessonTitle?: string; isLatest?: boolean;
  previousSubmissions?: BlockSubmission[];
  history: { id: string; decision: string; feedback: string; createdAt: string }[];
};
export const blockReviewLabels: Record<string, string> = {
  submitted: '멘토 확인 대기', approved: '승인 완료', changes_requested: '수정 요청', reopened: '답변 수정 중', completed: '학습 완료',
};
export const blockSubmissionState = (submission: BlockSubmission) => submission.state || submission.outcome;
export const canEditBlockSubmission = (submission: BlockSubmission | null | undefined) => !submission || ['changes_requested', 'reopened'].includes(blockSubmissionState(submission));
