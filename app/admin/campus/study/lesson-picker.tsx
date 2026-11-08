'use client';

import { useRouter } from 'next/navigation';
import { AdminSelect } from '@/features/admin-ui/components/admin-system';

type ReviewWeek = {
  number: number;
  title: string;
  lessons: { id: string; title: string; day: number }[];
};

export function LessonPicker({ cohort, selected, weeks }: {
  cohort: string;
  selected: string;
  weeks: ReviewWeek[];
}) {
  const router = useRouter();
  const active = weeks.find(week => week.lessons.some(lesson => lesson.id === selected));
  if (!active) return null;

  function openLesson(lesson: string) {
    router.push('/admin/campus/study?' + new URLSearchParams({ cohort, lesson }), { scroll: false });
  }

  return <>
    {weeks.length > 1 && <AdminSelect label="미리볼 주차" value={active.number} onChange={event => {
      const first = weeks.find(week => week.number === Number(event.target.value))?.lessons[0];
      if (first) openLesson(first.id);
    }}>
      {weeks.map(week => <option key={week.number} value={week.number}>{week.number}주차 · {week.title}</option>)}
    </AdminSelect>}
    <AdminSelect label="미리볼 수업" value={selected} onChange={event => openLesson(event.target.value)}>
      {active.lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.day}일차 · {lesson.title}</option>)}
    </AdminSelect>
  </>;
}
