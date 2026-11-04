import type { QuestionContext } from './question-hub';

export const aiDraftKey = ({ enrollmentId, lessonId }: QuestionContext) => 'edu-ai-draft:' + enrollmentId + ':' + lessonId;

export function hasStoredAiDraft(context: QuestionContext): boolean {
 try {
  const key = aiDraftKey(context);
  return Boolean(sessionStorage.getItem(key)?.trim() || sessionStorage.getItem(key + ':request'));
 } catch {
  return false;
 }
}
