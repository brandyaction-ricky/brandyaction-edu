import { FourSpacesPreview } from '@/features/campus/tour/preview';
import readerStyles from '@/features/campus/ui/lesson-task-panel.module.css';
import { AdminButton, AdminCheckbox, AdminControlRow, AdminInput, AdminLinkButton, AdminPageHeader, AdminSelect } from '@/features/admin-ui/components/admin-system';
import { LessonPicker } from './lesson-picker';
import { cohortReaderEnabled, reviewCohortKey } from '@/features/campus/cohort-reader';
import { editReviewCohort, saveReaderSetting } from './reader-setting';
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

export default async function Page({ searchParams }: { searchParams: Promise<{ lesson?: string; cohort?: string; manage?: string; notice?: string; view?: string }> }) {
  const { lesson, cohort, manage, notice, view } = await searchParams;
  const user = await campusUser('/admin/campus/study', { lesson, cohort, manage, view });
  if (!await getOperatorUser('products', user)) notFound();
  const db = createAdminClient();
  const { data, error } = await db.from('courses')
    .select('id,title,status,cohorts(id,name,archived_at),curriculum_weeks(week_number,title,archived_at,is_published,curriculum_lessons(id,title,day_number,archived_at,is_published))')
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
  const manageList = manage === '1';
  const selectedCohort = listed.find(c => c.id === cohort) ?? listed.find(c => !cohort && lesson &&
    courses.find(x => x.id === c.courseId)?.curriculum_weeks.some(w => w.curriculum_lessons.some(l => l.id === lesson))) ?? listed[0];
  const course = courses.find(c => c.id === selectedCohort?.courseId);
  const previewDraft = course?.status === 'draft';
  const weeks = (course?.curriculum_weeks ?? [])
    .filter(week => !week.archived_at && (previewDraft || week.is_published))
    .sort((a, b) => a.week_number - b.week_number)
    .map(week => ({
      number: week.week_number,
      title: week.title,
      lessons: week.curriculum_lessons
        .filter(item => !item.archived_at && (previewDraft || item.is_published))
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
  const enabled = !manageList && selectedCohort ? await cohortReaderEnabled(db, selectedCohort.id) : false;
  const addable = options.filter(c => !labels.has(reviewCohortKey(c.id)));
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
  const content = !manageList && selected ? await readLesson(selected.id) : null;
  const path = '/admin/campus/study';
  const lessonQuery = selectedCohort && selected ? new URLSearchParams({cohort:selectedCohort.id, lesson:selected.id}) : null;
  const previewHref = lessonQuery && path + '?' + lessonQuery + '&view=campus';
  const next = nextLesson && {id:nextLesson.id, position:nextLesson.position};
  if (view === 'campus' && !manageList && selectedCohort && selected && content && lessonQuery) {
    const returnHref = path + '?' + lessonQuery;
    return <FourSpacesPreview snapshot={{
      schemaVersion:1, fetchedAt:new Date().toISOString(), viewer:{id:user.id, displayName:'수업 검수'},
      scopes:[], selectedEnrollmentId:null, lessons:[], links:{classes:returnHref, questions:returnHref}, launchEligibility:null,
    }} review={{room:'study', role:'student', returnHref, lessonContent:
      <section className={readerStyles.reader} aria-label="캠퍼스 수업">
        <Link className="btn small" href={returnHref}>수업 목록으로</Link>
        <h2 id="review-lesson" tabIndex={-1}>{selected.title}</h2>
        <StudyPreview key={selected.id} inCampus cohort={selectedCohort.id} lessonId={selected.id} nextLesson={next} {...content}/>
      </section>
    }}/>;
  }
  const messages: Record<string,string> = {saved:'검수 목록에 저장했습니다.', removed:'목록에서 뺐습니다. 아래에서 다시 추가할 수 있습니다.',
    enabled:'이 기수는 캠퍼스 수강 중입니다. 기존 강의실로 전환한 뒤 목록에서 빼세요.',name:'표시 이름을 1~50자로 입력해 주세요.'};
  return <main className={'edu-admin '+styles.shell}><div className={styles.page}>
    <Link className={styles.back} href={manageList ? path : '/admin/campus/webinars'}>← {manageList ? '수업 검수로 돌아가기' : '캠퍼스 관리'}</Link>
    <AdminPageHeader compactActions eyebrow="문샷 캠퍼스" title={manageList ? '검수 목록 관리' : '캠퍼스 수업 검수'}
      description={manageList ? '검수에 쓸 기수와 이 화면에 표시할 이름을 정하세요. 실제 기수와 수강권은 그대로 유지됩니다.' : '기수를 선택해 수강생이 보게 될 수업을 한 장씩 확인하세요.'}
      actions={!manageList && <AdminLinkButton href={path+'?manage=1'}>검수 목록 관리</AdminLinkButton>}/>
    {manageList ? <>
      {notice && messages[notice] && <p role="status" className={styles.notice}>{messages[notice]}</p>}
      <section className={styles.panel}><h2>등록한 기수 <span>{listed.length}</span></h2>
        {listed.map(c => <div key={c.id} className={styles.entry}><p>{c.label}</p>
          <form action={editReviewCohort}><input type="hidden" name="cohort" value={c.id}/>
            <AdminControlRow><AdminInput label="표시 이름" name="label" maxLength={50} defaultValue={c.name} required/>
              <AdminButton type="submit" variant="outline" name="action" value="save">이름 저장</AdminButton>
              <AdminButton type="submit" variant="ghost" name="action" value="remove" formNoValidate>목록에서 빼기</AdminButton>
            </AdminControlRow></form></div>)}
        {!listed.length && <p>아직 등록한 기수가 없습니다.</p>}
      </section>
      {addable.length>0 && <section className={styles.panel}><h2>검수 기수 추가</h2>
        <form action={editReviewCohort}><AdminControlRow>
          <AdminSelect label="추가할 기수" name="cohort" required defaultValue=""><option value="" disabled>기수 선택</option>
            {addable.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</AdminSelect>
          <AdminInput label="검수용 이름" name="label" placeholder="예: 6기 개강 전 수업 검수" maxLength={50} required/>
          <AdminButton type="submit" name="action" value="save" variant="primary">목록에 추가</AdminButton>
        </AdminControlRow></form></section>}
    </> : <>
      <section className={styles.panel}><h2>검수할 기수</h2>
        <nav aria-label="검수 기수" className={styles.choices}>{listed.map(c =>
          <Link key={c.id} aria-current={selectedCohort?.id===c.id ? 'page' : undefined} href={path+'?cohort='+c.id}>{c.name}</Link>)}</nav>
        {!listed.length && <p>‘검수 목록 관리’에서 첫 기수를 추가하세요.</p>}
        {selectedCohort && (course?.status !== 'published' ? <p className={styles.note}>관리자 전용 원문 미리보기 · 수강생에게 공개되지 않습니다.</p>
          : <details className={styles.setting}><summary>수강 방식 설정 · {enabled ? '캠퍼스 페이지 수업' : '기존 강의실'}</summary>
            <p>이 기수에만 적용됩니다. 주차별 공개 일정과 수강 권한은 기존 강의실 설정을 따릅니다.</p>
            {(enabled || selected) && <form action={saveReaderSetting}><input type="hidden" name="cohort" value={selectedCohort.id}/>
              <input type="hidden" name="mode" value={enabled ? 'classroom' : 'guided'}/>
              <AdminControlRow>{!enabled && selected && <><input type="hidden" name="lesson" value={selected.id}/>
                <AdminCheckbox label="수업 미리보기를 확인했습니다" name="reviewed" required/></>}
                <AdminButton type="submit" variant="outline">{enabled ? '기존 강의실로 전환' : '이 기수에 캠퍼스 페이지 수업 켜기'}</AdminButton></AdminControlRow>
            </form>}</details>)}
      </section>
      {selectedCohort && <section className={styles.panel} aria-label="캠퍼스 수업">
        {lessons.length>1 && selected && <AdminControlRow><LessonPicker cohort={selectedCohort.id} selected={selected.id} weeks={weeks}/></AdminControlRow>}
        {selected && content ? <><header id="review-lesson" tabIndex={-1} className={styles.lessonHead}><small>{selected.position}{selected.unpublished && ' · 미공개 수업'}</small><h2>{selected.title}</h2></header>
          {previewHref && <AdminControlRow><AdminLinkButton href={previewHref}>캠퍼스 공부방에서 미리보기</AdminLinkButton></AdminControlRow>}
          <div className={styles.reader}><StudyPreview key={selected.id} lessonId={selected.id} cohort={selectedCohort.id} nextLesson={next} {...content}/></div></> : <p>미리볼 공개 수업이 없습니다.</p>}
      </section>}
    </>}
  </div></main>;
}
