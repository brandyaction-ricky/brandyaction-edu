import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Mail } from "lucide-react";
import { LearnerShell } from "./learner-shell";
import { ResourceDownload, ReviewForm } from "./lesson-actions";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLearningHome } from "@/lib/learning-data";
import { getPublicSupport } from "@/lib/education-data";

const titles: Record<string, string> = { missions:"내 미션", resources:"내 자료실", reviews:"내 상품 후기", coupons:"내 쿠폰", questions:"학습 문의" };
const stateLabels: Record<string,string> = { submitted:"승인 대기", approved:"완료", changes_requested:"보완 요청", rejected:"반려" };
function one<T>(value:T | T[] | null) { return Array.isArray(value) ? value[0] || null : value; }
function date(value:string | null) { return value ? new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value)) : "기한 없음"; }

export async function AccountLibrary({ section, enrollmentId }: { section:string; enrollmentId?:string }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/my/"+section)}`);
  const supabase = await createClient();
  const now = new Date().toISOString();
  const [{data:profile}, enrollmentResult] = await Promise.all([
    supabase.from("profiles").select("full_name,status").eq("id",user.id).maybeSingle(),
    supabase.from("enrollments").select("id,course_id,cohort_id,courses(title),cohorts(name)").eq("user_id",user.id).eq("status","active").lte("access_starts_at",now).or(`access_ends_at.is.null,access_ends_at.gt.${now}`).order("created_at",{ascending:false}),
  ]);
  if (!profile || profile.status !== "active") return <LibraryError/>;
  const name = profile?.full_name || user.email?.split("@")[0] || "회원";
  const enrollments = enrollmentResult.data || [];
  const selected = enrollments.find(row => row.id === enrollmentId) || enrollments[0];
  const title = titles[section];
  let body: React.ReactNode;
  if (section === "questions") {
    const {supportEmail} = await getPublicSupport();
    body = <section className="ba-account-card"><span className="ba-badge">학습 지원</span><h2>학습 중 막히는 부분이 있나요?</h2><p>현재 학습 문의는 이메일로 접수합니다. 클래스명과 질문 내용을 함께 보내주시면 운영팀이 답변을 안내합니다.</p><a className="ba-button primary" href={`mailto:${supportEmail}?subject=${encodeURIComponent("[브랜디에듀 학습 문의]")}`}><Mail size={18}/>이메일로 문의하기</a><p>문의 내역과 답변은 이메일에서 확인할 수 있습니다.</p></section>;
  } else if (section === "coupons") {
    // Coupon definitions are admin-only under existing RLS. Read only wallets
    // owned by the verified user; never expose other customers or global codes.
    const {data:wallets,error} = await createAdminClient().from("customer_coupons").select("id,status,expires_at,coupons(name,description,discount_type,discount_value,starts_at,ends_at,is_active)").eq("user_id",user.id).order("issued_at",{ascending:false}).limit(100);
    body = error ? <LibraryError/> : wallets?.length ? <div className="ba-account-cards">{wallets.map(wallet => {
      const coupon = one(wallet.coupons);
      if (!coupon) return null;
      const expiresAt = [wallet.expires_at,coupon.ends_at].filter(Boolean).sort((a,b)=>new Date(a).getTime()-new Date(b).getTime())[0] || null;
      const expired = !!expiresAt && new Date(expiresAt).getTime() <= new Date(now).getTime();
      const future = !!coupon.starts_at && new Date(coupon.starts_at).getTime() > new Date(now).getTime();
      const status = wallet.status === "used" ? "사용 완료" : expired ? "기간 만료" : !coupon.is_active || wallet.status !== "available" ? "사용 불가" : future ? "사용 예정" : "사용 가능";
      return <article className="ba-account-card" key={wallet.id}><span className={`ba-badge ${status==="사용 가능"?"green":""}`}>{status}</span><h2>{Number(coupon.discount_value).toLocaleString("ko-KR")}{coupon.discount_type==="percentage"?"%":"원"} 할인</h2><strong>{coupon.name}</strong><p>{coupon.description}</p><p>유효기간 · {date(expiresAt)}</p><p>적용 상품·최소 금액 등 최종 사용 조건은 결제 화면에서 확인합니다.</p>{status==="사용 가능" && <Link className="ba-button" href="/classes">클래스 둘러보기 <ArrowRight size={18}/></Link>}</article>;
    })}</div> : <LibraryEmpty title="보유한 쿠폰이 없습니다." copy="발급받은 쿠폰이 있으면 유효기간과 함께 표시됩니다."/>;
  } else if (section === "reviews") {
    const {data:reviews,error} = await createAdminClient().from("reviews").select("id,course_id,cohort_id,rating,body,status,created_at,courses(title)").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100);
    body = error || enrollmentResult.error ? <LibraryError/> : <><div className="ba-account-cards">{reviews?.map(review => <article className="ba-account-card" key={review.id}><span className="ba-badge">{review.status==="published"?"공개":"검토·비공개"}</span><h2>{one(review.courses)?.title || "클래스 후기"}</h2><span aria-label={`5점 만점에 ${review.rating}점`}>{"★".repeat(review.rating)}</span><p style={{whiteSpace:"pre-line"}}>{review.body}</p><small>{date(review.created_at)}</small></article>)}</div><h2 className="ba-library-heading">작성 가능한 후기</h2>{enrollments.filter(row => !reviews?.some(review => review.course_id===row.course_id && review.cohort_id===row.cohort_id)).map(row => <section className="ba-account-card" key={row.id}><ReviewForm courseId={row.course_id} cohortId={row.cohort_id} authorName={name} courseTitle={one(row.courses)?.title || "클래스"}/></section>)}{!enrollments.length && !reviews?.length && <LibraryEmpty title="아직 작성 가능한 후기가 없습니다." copy="활성 수강권이 있는 클래스의 후기를 작성할 수 있습니다."/>}</>;
  } else if (enrollmentResult.error) body = <LibraryError/>;
  else if (!selected) body = <LibraryEmpty title={section==="missions"?"진행할 미션이 아직 없습니다.":"이용 가능한 자료가 아직 없습니다."} copy="수강 신청한 클래스의 미션과 자료를 이곳에서 모아볼 수 있습니다."/>;
  else {
    const learning = await getLearningHome(selected.id);
    if (!learning) body = <LibraryError/>;
    else {
      const lessons = learning.weeks.flatMap(week => week.lessons.map(lesson => ({...lesson,week:week.number})));
      const filtered = section === "missions" ? lessons.filter(lesson => lesson.mission) : lessons.filter(lesson => lesson.resourcePath);
      body = <><nav className="ba-chips ba-library-tabs" aria-label="클래스 선택">{enrollments.map(row => <Link className={row.id===selected.id?"active":""} key={row.id} href={`/my/${section}?enrollment=${row.id}`} aria-current={row.id===selected.id?"page":undefined}>{one(row.courses)?.title} · {one(row.cohorts)?.name}</Link>)}</nav>
        {section==="missions" && <><div className="ba-account-stats"><article><span>미션 달성도</span><strong>{learning.achievement.available ? `${learning.achievement.percent}%`:"집계 준비 중"}</strong></article><article><span>달성 레벨</span><strong>{learning.achievement.level ? `Lv.${learning.achievement.level.number} ${learning.achievement.level.name}`:"미등록"}</strong></article><article><span>승인 대기</span><strong>{filtered.filter(lesson=>lesson.mission?.submission?.status==="submitted").length}개</strong></article></div><p className="ba-result-count">달성도는 공개된 필수 미션 중 관리자 승인이 완료된 비율입니다. 학습 진도와 별도로 집계합니다.</p></>}
        <div className="ba-account-cards">{filtered.map(lesson => <article className="ba-account-card" key={lesson.id}><div className="ba-badges"><span className="ba-badge">WEEK {lesson.week} · DAY {lesson.day}</span>{section==="missions" && <span className={`ba-badge ${lesson.mission?.submission?.status==="approved"?"green":""}`}>{stateLabels[lesson.mission?.submission?.status || ""] || "진행 가능"}</span>}</div><h2>{section==="missions"?lesson.mission?.title:lesson.resourceName || lesson.title}</h2><p>{lesson.title}</p>{section==="missions" && lesson.mission?.submission?.feedback && <blockquote className="ba-feedback"><strong>관리자 피드백</strong><p>{lesson.mission.submission.feedback}</p></blockquote>}<footer>{section==="resources" ? <ResourceDownload enrollmentId={selected.id} lessonId={lesson.id} name={lesson.resourceName || lesson.title}/> : <Link className="ba-button primary" href={`/my/cohort/${selected.id}/lessons/${lesson.id}#mission`}>{lesson.mission?.submission?.status==="approved"?"제출·피드백 보기":"미션 확인하기"}<ArrowRight size={18}/></Link>}<Link className="ba-text-link" href={`/my/cohort/${selected.id}/lessons/${lesson.id}`}>학습 콘텐츠 보기</Link></footer></article>)}</div>
        {!filtered.length && <LibraryEmpty title={section==="missions"?"공개된 미션이 없습니다.":"등록된 자료가 없습니다."} copy="운영자가 공개한 콘텐츠가 이곳에 표시됩니다."/>}</>;
    }
  }
  return <LearnerShell active={section} userName={name}><header className="app-page-heading"><div><span>MY LEARNING</span><h1>{title}</h1></div></header>{body}</LearnerShell>;
}
function LibraryEmpty({title,copy}:{title:string;copy:string}) { return <section className="ba-empty"><h2>{title}</h2><p>{copy}</p><Link className="ba-button" href="/my/cohort">내 클래스 보기</Link></section>; }
function LibraryError() { return <section className="ba-empty" role="alert"><h2>내역을 불러오지 못했습니다.</h2><p>잠시 후 다시 시도해 주세요. 저장된 학습 기록은 변경되지 않았습니다.</p></section>; }
