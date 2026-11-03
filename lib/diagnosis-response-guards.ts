import type { DiagnosisAnswer, DiagnosisQuestion } from './diagnosis-session';

// MYIN client #168: instructed checks are excluded from timing and neutral-share checks.
export function diagnosisResponseTooFast(question: DiagnosisQuestion, elapsedMs: number, adminTest = false) {
  return !adminTest && !!question.pair && !question.requiredOptionId && elapsedMs >= 0 && elapsedMs < 1000;
}

export function diagnosisNeutralResponses(questions: DiagnosisQuestion[], answers: DiagnosisAnswer[]) {
  const byId = new Map(answers.map(answer => [answer.questionId, answer]));
  const pairs = questions.filter(question => question.pair && !question.requiredOptionId && question.options.length === 5);
  const answered = pairs.filter(question => question.options.some(option => option.id === byId.get(question.id)?.optionId));
  const neutral = answered.filter(question => byId.get(question.id)?.optionId === question.options[2].id);
  return {
    questionIds: neutral.map(question => question.id),
    share: answered.length ? neutral.length / answered.length : 0,
    // Strictly greater than the thresholds, matching MYIN. Wait for 20 answers before nudging.
    shouldNudge: answered.length >= 20 && neutral.length * 2 > answered.length,
    shouldBlock: neutral.length * 5 > answered.length * 3,
  };
}
