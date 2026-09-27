import { conversionDatabaseError, conversionError } from './conversion-review-server';
export function attendanceError(error: {code?: string; message?: string}) {
  const message = error.message || '';
  if (message.includes('ATTENDANCE_REGISTER_FIRST')) conversionError('먼저 무료 웨비나를 신청해 주세요.',403);
  if (message.includes('ATTENDANCE_CLOSED')) conversionError('출석 접수가 닫혀 있습니다.',409);
  if (message.includes('ATTENDANCE_URL_LOCKED')) conversionError('출석 기록이 있어 영상 주소를 변경할 수 없습니다.',409);
  if (message.includes('CONVERSION_STALE')) conversionError('라이브 설정이 변경됐습니다. 새로고침해 주세요.',409);
  conversionDatabaseError(error);
}
