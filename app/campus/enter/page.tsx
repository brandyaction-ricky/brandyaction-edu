import theme from '@/features/campus/ui/theme.module.css';
import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {createClient} from '@/lib/supabase/server';
import {campusEntry,campusEntryPath} from '@/features/campus/entry';
import {isCampusId} from '@/features/campus/snapshot';
import styles from '@/features/campus/ui/entry.module.css';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 캠퍼스 입장',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(process.env.EDU_CAMPUS_ENABLED!=='true')notFound();
 const q=await searchParams,cohort=typeof q.cohort==='string'?q.cohort:undefined,welcome=q.welcome==='1';
 if(q.cohort!==undefined&&(!cohort||!isCampusId(cohort)))notFound();
 const user=await getAuthenticatedUser();if(!user)redirect('/login?next='+encodeURIComponent(campusEntryPath(cohort,welcome)));
 const db=await createClient();let query=db.from('enrollments').select('id,user_id,course_id,cohort_id,status,revoked_at,access_starts_at,access_ends_at').eq('user_id',user.id).eq('status','active').order('created_at',{ascending:false}).limit(200);
 if(cohort)query=query.eq('cohort_id',cohort);
 const r=await query;if(r.error)throw Error('수강권을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
 const candidates=(r.data||[]).flatMap(e=>{const entry=campusEntry(e,user.id,e.cohort_id);return entry?[{...e,...entry}]:[];});
 const ids=[...new Set(candidates.map(e=>e.course_id))],cohortIds=[...new Set(candidates.map(e=>e.cohort_id))];
 const [courses,cohorts]=ids.length?await Promise.all([db.from('courses').select('id,title').in('id',ids).eq('status','published').is('archived_at',null),db.from('cohorts').select('id,name,course_id').in('id',cohortIds).is('archived_at',null)]):[{data:[],error:null},{data:[],error:null}];
 if(courses.error||cohorts.error)throw Error('클래스를 확인하지 못했습니다. 다시 시도해 주세요.');
 const options=candidates.filter(e=>courses.data?.some(c=>c.id===e.course_id)&&cohorts.data?.some(c=>c.id===e.cohort_id&&c.course_id===e.course_id));
 const chosen=cohort||options.length===1?options[0]:null;
 if(chosen?.ready&&!welcome)redirect('/campus/workspace?enrollmentId='+chosen.id+'&section=space');
 const course=chosen&&courses.data?.find(c=>c.id===chosen.course_id),group=chosen&&cohorts.data?.find(c=>c.id===chosen.cohort_id);
 return <main className={`${theme.surface} ${styles.page}`}><Link href="/my/classes">← 내 클래스</Link><p className={styles.muted}>문샷 캠퍼스</p><h1>{chosen?'문샷에 오신 것을 환영해요':options.length?'입장할 클래스를 선택하세요':'이용 가능한 수강권을 확인해 주세요'}</h1>{chosen?<><p>{course?.title} · {group?.name}</p><p>{chosen.ready?'수업에서 배운 내용을 작업 공간에서 실천하고 동료와 나누세요.':<>정규 공부방은 {chosen.startsAt?new Date(chosen.startsAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'수강 시작일'}부터 열려요. 그전에는 아래 안내로 준비해 주세요.</>}</p><div className={styles.cards}><section className={styles.card}><h2>1. 수강 준비 확인</h2><p>내 클래스에서 일정과 공지를 확인해 주세요.</p><Link href="/my/classes">내 클래스 보기 →</Link></section><section className={styles.card}><h2>2. 캠퍼스에서는 이렇게 해요</h2><p>수업과 미션 확인 → 작업 공간에서 집중 → 결과물을 올리고 동료 의견 받기</p><p>내 캐릭터와 작업 기록은 계정에 연결됩니다.</p></section><section className={styles.card}><h2>3. 시작할 준비가 됐다면</h2>{chosen.ready?<Link className={styles.cta} href={'/campus/workspace?enrollmentId='+chosen.id+'&section=space'}>문샷 캠퍼스 입장 →</Link>:<p>개강 전에는 정규 수업과 수강생 공부방이 열리지 않습니다. 이 링크로 다시 방문해 주세요.</p>}</section></div></>:options.length?<div className={styles.cards}>{options.map(e=><section key={e.id} className={styles.card}><h2>{courses.data?.find(c=>c.id===e.course_id)?.title}</h2><p>{cohorts.data?.find(c=>c.id===e.cohort_id)?.name}</p><Link href={campusEntryPath(e.cohort_id,welcome)}>{e.ready?'캠퍼스 입장':'웰컴 안내 보기'} →</Link></section>)}</div>:<><p>신청한 계정으로 로그인했는지 확인해 주세요. 만료·환불·회수된 수강권으로는 입장할 수 없습니다.</p><Link href="/classes">클래스 둘러보기 →</Link></>}</main>;
}
