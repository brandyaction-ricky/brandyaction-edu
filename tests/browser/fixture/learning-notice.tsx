import { LearningNoticeBar, LearningNoticeEditor } from '../../../app/ui/final/learning-notice';
import Link from 'next/link';
export function LearningNoticeFixture() {
  return <div className="edu-front"><header className="site-header"><div className="wrap header-inner"><b>BRANDYACTION EDU</b><Link href="/other">다른 화면</Link></div></header><LearningNoticeBar/><main className="wrap" style={{paddingTop:24}}><LearningNoticeEditor/><h2>기존 학습 본문</h2><p>공지 조회가 실패해도 학습을 계속할 수 있습니다.</p></main></div>;
}
