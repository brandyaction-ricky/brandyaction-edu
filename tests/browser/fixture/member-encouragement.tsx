import { EncouragementEditor, EncouragementWall } from '../../../app/ui/final/member-encouragement';
import Link from 'next/link';
export function MemberEncouragementFixture() {
  return <main className="edu-front"><div className="wrap" style={{paddingTop:20}}><Link href="/other">다른 화면</Link><EncouragementWall/><EncouragementEditor/><h2>기존 학습 본문</h2></div></main>;
}
