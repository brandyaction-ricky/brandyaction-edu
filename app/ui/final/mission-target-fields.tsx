"use client";

import { useState } from "react";
import { number as num, text as t, type Row } from "@/lib/platform";
import type { Data } from "../learning-workflows";

export type MissionContext = { courseId: string; weekId: string };

/** Selection context only: curriculum ownership remains lesson → week → course. */
export function MissionTargetFields({ data, row, context }: { data: Data; row?: Row; context?: MissionContext }) {
  const courses = data.courses || [], weeks = data.curriculum_weeks || [], lessons = data.curriculum_lessons || [];
  const originalLesson = lessons.find(item => item.id === row?.lesson_id);
  const originalWeek = weeks.find(item => item.id === originalLesson?.week_id);
  const [course, setCourse] = useState(String(originalWeek?.course_id || context?.courseId || weeks.find(item => item.id === context?.weekId)?.course_id || ""));
  const [week, setWeek] = useState(String(originalWeek?.id || context?.weekId || ""));
  const [lesson, setLesson] = useState(String(row?.lesson_id || ""));
  const scopedWeeks = weeks.filter(item => item.course_id === course && (!item.archived_at || item.id === originalWeek?.id));
  const scopedLessons = lessons.filter(item => item.week_id === week && scopedWeeks.some(target => target.id === item.week_id) && (!item.archived_at || item.id === originalLesson?.id));
  return <>
    <div className="field"><label htmlFor="mission-course">상품 *</label>
      <input type="hidden" name="course_id" value={course} />
      <select id="mission-course" required value={course} disabled={Boolean(row)} onChange={event => { setCourse(event.target.value); setWeek(""); setLesson(""); }}>
        <option value="">상품을 선택하세요</option>
        {courses.filter(item => !item.archived_at || item.id === course).map(item => <option key={item.id} value={item.id}>{t(item, "title")} · {item.id.slice(0, 8)}</option>)}
      </select>
      {row && <small className="meta">기존 미션의 상품은 변경할 수 없습니다.</small>}
    </div>
    <div className="field"><label htmlFor="mission-week">주차 *</label>
      <select id="mission-week" name="week_id" required value={week} disabled={!course} onChange={event => { setWeek(event.target.value); setLesson(""); }}>
        <option value="">{course ? "주차를 선택하세요" : "상품을 먼저 선택하세요"}</option>
        {scopedWeeks.map(item => <option key={item.id} value={item.id}>{num(item, "week_number")}주차 · {t(item, "title")}</option>)}
      </select>
    </div>
    <div className="field span2"><label htmlFor="edit-lesson_id">학습 *</label>
      <select id="edit-lesson_id" name="lesson_id" required value={lesson} disabled={!week} onChange={event => setLesson(event.target.value)}>
        <option value="">{week ? "학습을 선택하세요" : "주차를 먼저 선택하세요"}</option>
        {scopedLessons.map(item => <option key={item.id} value={item.id}>Day {num(item, "day_number")} · {t(item, "title")}{!item.is_published ? " · 비공개" : ""}</option>)}
      </select>
      <small className="meta">선택한 상품·주차의 학습만 연결됩니다.</small>
      {course && (!scopedWeeks.length || (week && !scopedLessons.length)) && <p className="notice" role="status">연결할 학습이 없습니다. 주차 구성과 학습 콘텐츠를 먼저 등록해 주세요.</p>}
    </div>
  </>;
}
