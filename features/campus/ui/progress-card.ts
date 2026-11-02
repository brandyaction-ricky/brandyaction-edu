import type { CampusSnapshot } from '../contracts';
import { learnerMetrics } from '../learner-metrics';
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function progressCardSvg(snapshot: CampusSnapshot, demo = false) {
  const m = learnerMetrics(snapshot);
  const scope = snapshot.scopes.find(s => s.enrollmentId === snapshot.selectedEnrollmentId);
  const lines = [scope ? `${scope.courseTitle} · ${scope.cohortName}` : '문샷 캠퍼스',
    `완료한 수업  ${m.completedLessons} / ${m.totalLessons}`,
    `승인된 필수 과제  ${m.approvedRequired} / ${m.totalRequired}`,
    `피드백 대기 ${m.submittedCount}개 · 수정 필요 ${m.revisionCount}개`,
    `집계 시점 ${new Date(snapshot.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST`];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="660" viewBox="0 0 1000 660"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="#081d39"/><stop offset="1" stop-color="#2058a4"/></linearGradient></defs><rect width="1000" height="660" rx="32" fill="url(#b)"/><circle cx="880" cy="90" r="220" fill="none" stroke="#6f9ee0" opacity=".2"/><g font-family="sans-serif"><text x="64" y="80" fill="#9dc7ff" font-size="18" letter-spacing="4">MOONSHOT • MY PROGRESS</text><text x="64" y="160" fill="white" font-size="40">${escape(snapshot.viewer.displayName.slice(0,20))}님의 실행 기록</text>${lines.map((line,i) => `<text x="64" y="${240+i*58}" fill="${i===0?'#b9cfee':'#fff'}" font-size="${i===0?20:25}">${escape(line.slice(0,65))}</text>`).join('')}<text x="64" y="585" fill="#b4c7e0" font-size="17">${demo?'가상 예시 · 검수용 / ':''}개인 학습 기록 · 수료증/사업 성과 인증서가 아닙니다.</text><text x="64" y="620" fill="#8fa9cb" font-size="14">현재 공개된 수업·과제 기준. 실제 교육 효과나 매출 증가를 증명하지 않습니다.</text></g></svg>`;
}
export function downloadProgressCard(snapshot: CampusSnapshot, demo = false) {
  const url = URL.createObjectURL(new Blob([progressCardSvg(snapshot,demo)],{type:'image/svg+xml;charset=utf-8'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = demo ? 'moonshot-demo-progress.svg' : 'moonshot-my-progress.svg';
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
