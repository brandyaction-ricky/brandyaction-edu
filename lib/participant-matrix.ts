import type { Row } from './platform';

export function participantMatrix(enrollments: Row[], lessons: Row[], missions: Row[], submissions: Row[]) {
  const latest = new Map<string, Row>();
  for (const submission of submissions) {
    const key = `${submission.enrollment_id}:${submission.mission_id}`;
    if (Number(submission.attempt_number) > Number(latest.get(key)?.attempt_number || 0)) latest.set(key, submission);
  }
  return Object.fromEntries(enrollments.map(enrollment => [enrollment.id, lessons.map(lesson => {
    const required = missions.filter(mission => mission.lesson_id === lesson.id);
    const attempts = required.map(mission => latest.get(`${enrollment.id}:${mission.id}`));
    const current = attempts.filter((row): row is Row => Boolean(row));
    const status = !required.length ? 'none' : attempts.every(row => row?.status === 'approved') ? 'approved' : ['submitted', 'changes_requested', 'rejected'].find(state => current.some(row => row.status === state)) || (current.length ? 'partial' : 'empty');
    const selected = current.find(row => row.status === status) || current[0];
    return { lessonId: lesson.id, status, submissionId: selected?.id || null, approved: current.filter(row => row.status === 'approved').length, total: required.length };
  })]));
}
