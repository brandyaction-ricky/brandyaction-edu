import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, LockKeyhole, PlayCircle } from "lucide-react";
import { LearnerShell } from "../../../../../components/learner-shell";
import { MissionSubmissionForm, ProgressButton, ResourceDownload } from "../../../../../components/lesson-actions";
import { getLearningLesson, safeEmbedUrl } from "@/lib/learning-data";
import "../../../../../learning-content.css";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ enrollmentId: string; lessonId: string }> }) {
  const { enrollmentId, lessonId } = await params;
  const learning = await getLearningLesson(enrollmentId, lessonId);
  if (!learning) notFound();
  const embed = safeEmbedUrl(learning.lesson.vodUrl);

  return <LearnerShell active="classes">
    <div className="lesson-breadcrumb">
      <Link href={"/my/cohort/" + enrollmentId}><ArrowLeft/> {learning.cohort.name}</Link>
      <span>WEEK {learning.week.number} · Day {learning.lesson.day}</span>
    </div>
    <div className="lesson-learning-layout">
      <main>
        <section className="lesson-player">
          {learning.lesson.kind === "vod" ? embed
            ? <iframe src={embed} title={learning.lesson.title} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
            : learning.lesson.vodUrl ? <div className="material-hero"><PlayCircle/><a href={learning.lesson.vodUrl} target="_blank" rel="noopener noreferrer">영상 사이트에서 보기</a></div> : <div className="lesson-content-missing"><LockKeyhole/><strong>VOD 준비 중입니다.</strong><p>운영자가 영상 링크를 등록하면 이곳에 표시됩니다.</p></div>
            : <div className="material-hero"><FileText/><strong>{learning.lesson.kind === "text" ? "학습 콘텐츠" : learning.lesson.kind === "link" ? "외부 콘텐츠" : "학습 자료"}</strong><p>아래 콘텐츠를 확인하고 학습을 진행하세요.</p></div>}
        </section>
        <section className="lesson-description">
          <span>WEEK {learning.week.number} · DAY {learning.lesson.day}</span>
          <h1>{learning.lesson.title}</h1>
          <p>{learning.lesson.description}</p>
          {learning.lesson.kind === "text" && <div className="learning-text-content">{learning.lesson.bodyText || "콘텐츠를 준비 중입니다."}</div>}
          {learning.lesson.kind === "link" && learning.lesson.externalUrl && <a className="learning-download" href={learning.lesson.externalUrl} target="_blank" rel="noopener noreferrer">콘텐츠 링크 열기</a>}
          {learning.lesson.kind === "material" && learning.lesson.resourcePath
            ? <ResourceDownload enrollmentId={enrollmentId} lessonId={lessonId} name={learning.lesson.resourceName || "학습 자료"}/>
            : learning.lesson.kind === "material"
              ? <div className="lesson-content-missing compact"><FileText/><p>등록된 자료가 없습니다.</p></div>
              : null}
          <ProgressButton enrollmentId={enrollmentId} lessonId={lessonId} initial={learning.lesson.progress}/>
          {learning.lesson.mission && <MissionSubmissionForm enrollmentId={enrollmentId} mission={learning.lesson.mission}/>}
        </section>
      </main>
      <aside className="ba-lesson-outline">
        <span>이번 콘텐츠</span>
        <strong>{learning.lesson.kind === "vod" ? <PlayCircle/> : <FileText/>}{learning.lesson.kind === "vod" ? "VOD" : "자료"}</strong>
        <p>{learning.lesson.duration || "학습시간 별도 안내"}</p>
        {learning.lesson.mission && <p className="lesson-mission-note">과제 {learning.lesson.mission.submission?.status === "approved" ? "승인 완료" : learning.lesson.mission.submission?.status === "submitted" ? "검토 대기" : "제출 필요"}</p>}
        <Link href={"/my/cohort/" + enrollmentId}>전체 커리큘럼</Link>
        <nav aria-label="학습 커리큘럼">{learning.weeks.map(week => <details key={week.id} open={week.id === learning.week.id}><summary>WEEK {week.number} · {week.title}</summary>{week.lessons.map(lesson => <Link key={lesson.id} href={`/my/cohort/${enrollmentId}/lessons/${lesson.id}`} className={lesson.id === lessonId ? "active" : ""} aria-current={lesson.id === lessonId ? "page" : undefined}><span>{lesson.progress === 100 ? "✓" : String(lesson.day).padStart(2, "0")}</span><span>{lesson.title}<small>{lesson.mission ? "미션 포함" : lesson.kind === "vod" ? "동영상" : "학습 콘텐츠"}</small></span></Link>)}</details>)}</nav>
      </aside>
    </div>
  </LearnerShell>;
}
