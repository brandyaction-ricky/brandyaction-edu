import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { catalogTitle, catalogType, courseAvailability, courseSchedule } from '@/lib/course-catalog';
import { text, type Row } from '@/lib/platform';
import styles from './next-class-banner.module.css';

export function NextClassBanner({ courses, cohorts, now }: { courses: Row[]; cohorts: Row[]; now?: number }) {
  const course = courses.filter(row => catalogType(row) === 'free' && courseAvailability(row, cohorts, now).state === 'open')
    .sort((a, b) => {
      const start = (row: Row) => Date.parse(String(courseAvailability(row, cohorts, now).cohort?.operation_start_at || '')) || Infinity;
      return start(a) - start(b);
    })[0];
  const schedule = course ? courseSchedule(course, cohorts, now) : '';
  return <section className={styles.banner} aria-label="다음 학습 안내">
    <div>
      <span className={styles.label}>{course ? '모집 중인 무료 클래스' : '나의 다음 배움'}</span>
      <h2>{course ? catalogTitle(course) : '내 일에 맞는 클래스를 만나보세요.'}</h2>
      <p>{schedule || (course ? '클래스 일정과 참여 방법을 상세페이지에서 확인하세요.' : '새로운 모집 일정과 나에게 필요한 학습을 확인하세요.')}</p>
    </div>
    <Link className="btn primary" href={course ? '/classes/' + text(course, 'slug') : '/classes?type=free'}>
      {course ? '무료 클래스 신청 안내' : '무료 클래스 살펴보기'} <ArrowRight aria-hidden="true"/>
    </Link>
  </section>;
}
