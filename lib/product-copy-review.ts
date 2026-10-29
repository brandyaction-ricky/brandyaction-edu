// Editorial reminders only: these are neither legal judgments nor publication gates.
export function productCopyReminders(input: string): string[] {
  const text = input.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
  const reminders: string[] = [];
  if (/\d[\d,.]*\s*(?:%|퍼센트|배|명\s*중)/.test(text)) reminders.push('성과 수치의 출처·측정 기간·대상을 확인하고, 개인마다 결과가 다를 수 있음을 안내해 주세요.');
  if (/무조건|반드시\s*(?:성공|수익|매출)|수익\s*보장|매출\s*보장|누구나\s*성공/.test(text)) reminders.push('성공이나 수익을 확정하는 표현은 실제 제공하는 학습 내용과 실행 지원으로 바꿔 주세요.');
  if (/국내\s*최초|업계\s*1위|유일한|최고의/.test(text)) reminders.push('최초·1위·유일 같은 비교 표현은 비교 범위와 확인 가능한 근거가 있을 때 사용해 주세요.');
  if (/\d{1,2}\s*월\s*\d{1,2}\s*일/.test(text)) reminders.push('본문의 행사 날짜가 모집 일정과 맞는지, 지난 날짜가 남아 있지 않은지 확인해 주세요.');
  return reminders;
}
