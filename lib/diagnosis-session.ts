export type DiagnosisAnswer = { questionId: string; optionId?: string; values?: string[]; value?: string; ms?: number };
export type DiagnosisQuestion = {
  id: string; code: string; text: string; type: 'pair_choice' | 'single_choice' | 'multi_choice' | 'text';
  section: string; core: boolean; required: boolean; pickExactly: number | null;
  exclusiveOptionIds: string[]; reconfirmInstructions: boolean; confirmationOptionId: string | null;
  placeholder: string; pair: { left: string; right: string } | null; options: { id: string; label: string }[];
};
export type DiagnosisSession = {
  state: 'in_progress' | 'submitted'; revision: number; answers: DiagnosisAnswer[]; submittedAt: string | null; needsReview: boolean;
  survey: { code: string; version: string; title: string; coreQuestionCount: number; questions: DiagnosisQuestion[] };
};
export type DiagnosisOffer = { courseId: string; title: string };

export function diagnosisQuestionAnswered(question: DiagnosisQuestion, answer?: DiagnosisAnswer) {
  if (!answer) return false;
  if (question.type === 'text') return Boolean(answer.value?.trim());
  if (question.type === 'multi_choice') return question.pickExactly
    ? answer.values?.length === question.pickExactly : Boolean(answer.values?.length);
  return Boolean(answer.optionId);
}

export function diagnosisMissingQuestions(session: DiagnosisSession, answers: DiagnosisAnswer[]) {
  const byId = new Map(answers.map(answer => [answer.questionId, answer]));
  return session.survey.questions.filter(q => (q.required || q.pickExactly !== null)
    && !diagnosisQuestionAnswered(q, byId.get(q.id)));
}
