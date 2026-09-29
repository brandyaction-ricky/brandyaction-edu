import { useState } from 'react';
import Link from 'next/link';
import { LessonBlockSession } from '../../../app/ui/final/lesson-block-session';

export function LessonBlocksFixture() {
  const [lesson, setLesson] = useState('11111111-1111-4111-8111-111111111111');
  return <main className="edu-front" style={{ maxWidth: 850, margin: '0 auto', padding: 20 }}>
    <h1>혼합 학습 검수</h1>
    <button type="button" onClick={() => setLesson('22222222-2222-4222-8222-222222222222')}>다른 학습으로 전환</button>
    <Link href="/my">내 클래스로 이동</Link>
    <LessonBlockSession lessonId={lesson} enrollmentId="33333333-3333-4333-8333-333333333333" fallback={<p>기존 학습 본문 유지</p>} />
  </main>;
}
