import type { createAdminClient } from '@/lib/supabase/admin';
import { publicLessonBlocks, validateLessonBlocks } from '@/lib/lesson-blocks';
import { isReferenceCohort, reviewCohortKey } from './cohort-reader';
type Db = ReturnType<typeof createAdminClient>;

export async function reviewSelection(db: Db, cohort?: string, lesson?: string) {
  const { data, error } = await db.from('courses')
    .select('id,title,status,metadata,cohorts(id,name,archived_at),curriculum_weeks(week_number,title,archived_at,is_published,curriculum_lessons(id,title,day_number,archived_at,is_published))')
    .is('archived_at', null).order('title');
  if (error) throw error;
  const courses = data ?? [];
  const options = courses.flatMap(course => course.cohorts.filter(c => !c.archived_at)
    .map(c => ({ id: c.id, courseId: course.id, label: course.title + ' · ' + c.name })));
  const keys = options.map(c => reviewCohortKey(c.id));
  const settings = keys.length ? await db.from('site_settings').select('key,value').in('key', keys).eq('is_public', false) : {data:[], error:null};
  if (settings.error) throw settings.error;
  const labels = new Map(settings.data?.map(row => [row.key, row.value?.label]));
  const listed = options.flatMap(c => {
    const name = labels.get(reviewCohortKey(c.id));
    return typeof name === 'string' && name.trim() ? [{...c, name}] : [];
  }).sort((a,b) => a.name.localeCompare(b.name,'ko') || a.id.localeCompare(b.id));
  const selectedCohort = listed.find(c => c.id === cohort) ?? listed.find(c => !cohort && lesson &&
    courses.find(x => x.id === c.courseId)?.curriculum_weeks.some(w => w.curriculum_lessons.some(l => l.id === lesson))) ?? listed[0];
  const course = courses.find(c => c.id === selectedCohort?.courseId);
  // An unlisted DEV copy can serve a student cohort and a separate staff preview.
  const previewOnly = !!course && (course.status === 'draft' ||
    isReferenceCohort(course.metadata, selectedCohort?.id));
  const weeks = (course?.curriculum_weeks ?? [])
    .filter(week => !week.archived_at && (previewOnly || week.is_published))
    .sort((a, b) => a.week_number - b.week_number)
    .map(week => ({
      number: week.week_number,
      title: week.title,
      lessons: week.curriculum_lessons
        .filter(item => !item.archived_at && (previewOnly || item.is_published))
        .sort((a, b) => a.day_number - b.day_number)
        .map(item => ({
          id: item.id,
          title: item.title,
          day: item.day_number,
          position: week.week_number + '주차 · ' + item.day_number + '일차',
          unpublished: !week.is_published || !item.is_published,
        })),
    }))
    .filter(week => week.lessons.length > 0);
  const lessons = weeks.flatMap(week => week.lessons);
  const selected = lessons.find(l => l.id === lesson) ?? lessons[0];
  const nextLesson = selected ? lessons[lessons.indexOf(selected) + 1] : undefined;
  const addable = options.filter(c => !labels.has(reviewCohortKey(c.id)));
  return {listed, selectedCohort, course, previewOnly, weeks, lessons, selected, nextLesson, addable};
}
export async function readReviewLesson(db: Db, actor: string, id: string) {
    const [blocks, material] = await Promise.all([
      db.rpc('edu_read_lesson_blocks', { p_actor: actor, p_lesson: id, p_enrollment: null, p_revision: null }),
      db.from('curriculum_lessons').select('description,updated_at,lesson_contents(body_text,vod_url,external_url,resource_name,resource_storage_path)').eq('id',id).single(),
    ]);
    if (blocks.error || material.error) throw blocks.error || material.error;
    const row = material.data!;
    const content = Array.isArray(row.lesson_contents) ? row.lesson_contents[0] : row.lesson_contents;
    return {
      document: blocks.data?.document ? publicLessonBlocks(validateLessonBlocks(blocks.data.document)) : null,
      material: { description: row.description, updatedAt: row.updated_at, body: content?.body_text,
        video: content?.vod_url, link: content?.external_url, resourceName: content?.resource_storage_path ? content.resource_name || '학습 자료' : null },
    };
  }
