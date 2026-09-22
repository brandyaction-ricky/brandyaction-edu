/** Answer keys are only loaded by the operator editor and trusted server. */
export type QuizQuestion = { id: string; prompt: string; options: string[]; correctIndex: number };
export type QuizDefinition = { questions: QuizQuestion[]; passPercent: number };
export type PublicQuiz = { revision: string; passPercent: number; questions: Omit<QuizQuestion, "correctIndex">[] };
export type QuizResult = { passed: boolean; score: number; correct: number; total: number; wrongQuestionIds: string[] };

export function validateQuiz(value: unknown): string | null {
  if (!value || typeof value !== "object") return "퀴즈 설정을 확인해 주세요.";
  const quiz = value as QuizDefinition;
  if (!Number.isInteger(quiz.passPercent) || quiz.passPercent < 1 || quiz.passPercent > 100) return "퀴즈 통과 기준은 1~100%입니다.";
  if (!Array.isArray(quiz.questions) || !quiz.questions.length || quiz.questions.length > 20) return "퀴즈는 1~20문항으로 구성해 주세요.";
  const ids = new Set<string>();
  for (const q of quiz.questions) {
    if (!q || typeof q.id !== "string" || !q.id || q.id.length > 100 || ids.has(q.id)) return "문항 ID가 중복되거나 올바르지 않습니다.";
    ids.add(q.id);
    if (typeof q.prompt !== "string" || !q.prompt.trim() || q.prompt.length > 1000) return "질문을 1~1,000자로 입력해 주세요.";
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6 || q.options.some((o) => typeof o !== "string" || !o.trim() || o.length > 500)) return "각 문항의 선택지 2~6개를 모두 입력해 주세요.";
    if (new Set(q.options.map((o) => o.trim())).size !== q.options.length) return "같은 문항에 중복된 선택지가 있습니다.";
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) return "각 문항의 정답을 선택해 주세요.";
  }
  return null;
}

export function publicQuiz(quiz: QuizDefinition, revision: string): PublicQuiz {
  return { revision, passPercent: quiz.passPercent, questions: quiz.questions.map(({ id, prompt, options }) => ({ id, prompt, options })) };
}

export function gradeQuiz(quiz: QuizDefinition, answers: unknown): QuizResult {
  const invalid = validateQuiz(quiz);
  if (invalid) throw new Error(invalid);
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new Error("모든 문항의 답을 선택해 주세요.");
  const selections = answers as Record<string, unknown>;
  const wrongQuestionIds: string[] = [];
  for (const q of quiz.questions) {
    const selected = selections[q.id];
    if (!Number.isInteger(selected) || Number(selected) < 0 || Number(selected) >= q.options.length) throw new Error("모든 문항의 답을 선택해 주세요.");
    if (selected !== q.correctIndex) wrongQuestionIds.push(q.id);
  }
  const total = quiz.questions.length;
  const correct = total - wrongQuestionIds.length;
  // Compare exact ratios. Rounding must never turn a failed quiz into a pass.
  return { passed: correct * 100 >= total * quiz.passPercent, score: Math.floor(correct * 100 / total), correct, total, wrongQuestionIds };
}
