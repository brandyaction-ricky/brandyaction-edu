import { cohortReaderEnabled } from '@/features/campus/cohort-reader';
import { saveReaderSetting } from './reader-setting';
import styles from './study.module.css';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { campusUser } from '@/features/campus/entry-user';
import { getOperatorUser } from '@/lib/operator-permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicLessonBlocks, validateLessonBlocks } from '@/lib/lesson-blocks';
import { StudyPreview } from './study-preview';

export const dynamic = 'force-dynamic';
export const metadata = { title: '공부방 수업 미리보기', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ lesson?: string; cohort?: string }> }) {
  const { lesson, cohort } = await searchParams;
  const user = await campusUser('/admin/campus/study', { lesson, cohort });
  if (!await getOperatorUser('products', user)) notFound();
  const db = createAdminClient();
  const { data, error } = await db.from('courses')
    .select('id,title,cohorts(id,name,archived_at),curriculum_weeks(week_number,archived_at,is_published,curriculum_lessons(id,title,day_number,archived_at,is_published))')
    .is('archived_at', null).order('title');
  if (error) throw error;
  const courses = data ?? [];
  const options = courses.flatMap(course => course.cohorts.filter(c => !c.archived_at)
    .map(c => ({ id: c.id, courseId: course.id, label: course.title + ' · ' + c.name })));
  const selectedCohort = options.find(c => c.id === cohort);
  if (cohort && !selectedCohort) notFound();
  const enabled = selectedCohort ? await cohortReaderEnabled(db, selectedCohort.id) : false;
  const groups = courses.filter(course => !selectedCohort || course.id === selectedCohort.courseId).map(course => ({
    title: course.title,
    lessons: course.curriculum_weeks.filter(w => !w.archived_at && w.is_published)
      .sort((a,b) => a.week_number-b.week_number)
      .flatMap(w => w.curriculum_lessons.filter(l => !l.archived_at && l.is_published)
        .sort((a,b) => a.day_number-b.day_number)
        .map(l => ({ id: l.id, title: l.title, label: w.week_number+'주차 · '+l.day_number+'일차 · '+l.title }))),
  })).filter(g => g.lessons.length);
  const selected = groups.flatMap(g => g.lessons).find(l => l.id === lesson);
  if (lesson && !selected) notFound();
  async function readLesson(id: string) {
    const [blocks, material] = await Promise.all([
      db.rpc('edu_read_lesson_blocks', { p_actor: user.id, p_lesson: id, p_enrollment: null, p_revision: null }),
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
  const content = selected ? await readLesson(selected.id) : null;
  return <main className={styles.page}>
    <Link href="/admin/campus/webinars">← 문샷 캠퍼스 관리</Link>
    <h1>공부방 수업 미리보기</h1>
    <div className={styles.controls}>
    <form action="/admin/campus/study" className={styles.row}>
      <label className={styles.field}>검수할 기수<select name="cohort" required defaultValue={cohort || ''}>
        <option value="" disabled>과정과 기수를 선택하세요</option>
        {options.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select></label>
      <button className="btn" type="submit">기수 보기</button>
    </form>
    {groups.length ? <form action="/admin/campus/study" className={styles.row}>
      {selectedCohort && <input type="hidden" name="cohort" value={selectedCohort.id}/>}
      <label className={styles.field}>수업 선택 <select name="lesson" required defaultValue={selected?.id ?? ''}>
        <option value="" disabled>과정과 수업을 선택하세요</option>
        {groups.map(g => <optgroup key={g.lessons[0].id} label={g.title}>{g.lessons.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</optgroup>)}
      </select></label>{' '}<button type="submit" className="btn primary">수업 열기</button>
    </form> : <p>미리볼 공개 수업이 없습니다.</p>}
    </div>
    {selectedCohort && <section className={styles.setting} aria-label="기수별 수강 방식">
      <h2>{selectedCohort.label}</h2>
      <p>현재 수강 방식: <strong>{enabled ? '캠퍼스 페이지 수업' : '기존 강의실'}</strong></p>
      <p>공개된 수업을 어디에서 여는지 정합니다. 주차와 수업의 공개 범위는 기존 강의실 설정을 따릅니다.</p>
      {(enabled || selected) ? <form action={saveReaderSetting} className={styles.row}>
        <input type="hidden" name="cohort" value={selectedCohort.id}/>
        <input type="hidden" name="mode" value={enabled ? 'classroom' : 'guided'}/>
        {!enabled && selected && <><input type="hidden" name="lesson" value={selected.id}/>
          <label><input type="checkbox" name="reviewed" required/> 수업 미리보기를 확인했습니다</label></>}
        <button className="btn" type="submit">{enabled ? '기존 강의실로 전환' : '이 기수에 캠퍼스 페이지 수업 켜기'}</button>
      </form> : <p>수업을 하나 열어 미리본 뒤 이 기수에 적용할 수 있습니다.</p>}
    </section>}
    {selected && content && <section aria-label="캠퍼스 수업"><h2>{selected.title}</h2><StudyPreview key={selected.id} lessonId={selected.id} {...content}/></section>}
  </main>;
}
