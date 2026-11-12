/** Completion belongs to lesson IDs, never to the number of rows in an outline. */
export function legacyLessonUnlocked(lessons: readonly { id: string }[], completedIds: ReadonlySet<string>, lessonId: string): boolean {
  const index = lessons.findIndex(lesson => lesson.id === lessonId);
  if (index < 0) return false;
  // Keep earned lessons and the next step accessible when content is inserted
  // earlier. Inserted lessons remain incomplete and can be studied separately.
  const frontier = lessons.reduce((last, lesson, position) => completedIds.has(lesson.id) ? position : last, -1);
  return index <= frontier + 1;
}
