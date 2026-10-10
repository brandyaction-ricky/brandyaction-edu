export type OnboardingProgress = {
  telegram: boolean; app: boolean; orientation: boolean; learning: boolean;
  orientationAt: string;
  lesson: { id: string; title: string; url: string; completed: boolean } | null;
  comment: string;
};
export function onboardingStep(progress: OnboardingProgress) {
  if (!progress.telegram) return 0;
  if (!progress.app) return 1;
  if (!progress.orientation) return 2;
  if (!progress.learning) return 3;
  return 4;
}
export function orientationLabel(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
