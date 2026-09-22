// Compatibility entry point; Mission owns quiz rules.
export { validateQuiz, publicQuiz, gradeQuiz } from '@/features/mission/index';
export type { QuizQuestion, QuizDefinition, PublicQuiz, QuizResult } from '@/features/mission/index';
