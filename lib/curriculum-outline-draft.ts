import type { AuthorSnapshot } from './lesson-author-drafts';
import type { Row } from './platform';

// Only the saved outline fields are retained here, never another copy of the body.
export type OutlineDraft = {
  lessonId: string; weekId: string; day: number; title: string; pending: boolean;
};

export function outlineDraft(snapshot: AuthorSnapshot): OutlineDraft {
  const basic = snapshot.payload.form.basic;
  return {
    lessonId: snapshot.lessonId, weekId: basic.week_id,
    day: Number(basic.day_number), title: basic.title,
    pending: Boolean(snapshot.revision && (snapshot.revision !== snapshot.publishedRevision || snapshot.publishedStamp !== snapshot.public.stamp)),
  };
}

export function draftOutlineLessons(data: Record<string, Row[]>, drafts: Record<string, OutlineDraft>): Row[] {
  return (data.curriculum_lessons || []).map(lesson => {
    const draft = drafts[lesson.id];
    const originalWeek = (data.curriculum_weeks || []).find(week => week.id === lesson.week_id);
    const draftWeek = draft && (data.curriculum_weeks || []).find(week => week.id === draft.weekId && !week.archived_at);
    if (!draft || lesson.archived_at || !draftWeek || draftWeek.course_id !== originalWeek?.course_id) return lesson;
    // A server ordinal describes the published row, not this editing preview.
    return { ...lesson, week_id: draft.weekId, day_number: draft.day, title: draft.title, curriculum_day_number: undefined };
  });
}
