"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, RefreshCw, Search, Target } from "lucide-react";
import type { CurriculumLesson, CurriculumWeek } from "@/app/data";
import { missionIsVisible, missionSummary, reorderWeekMissions, type MissionWorkspace } from "@/lib/admin-missions";
import { directUpload } from "@/lib/product-admin";
import { useAdminUnsavedChanges } from "./use-admin-unsaved-changes";

const ContentDialog = dynamic(() => import("./curriculum-editor").then((mod) => mod.ContentDialog));
const empty: MissionWorkspace = { courses: [], courseId: null, weeks: [], revision: "", counts: {} };
type Editor = { weekId: string; lesson: CurriculumLesson; isNew: boolean };

async function requestWorkspace(courseId?: string | null, body?: object): Promise<MissionWorkspace> {
  const response = await fetch(`/api/admin/missions${courseId ? `?course=${encodeURIComponent(courseId)}` : ""}`, body ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "미션 목록을 불러오지 못했습니다.");
  return result;
}

export function AdminMissionsManager({ initial, initialError = "", quizOnly = false, canReview = false }: { initial: MissionWorkspace | null; initialError?: string; quizOnly?: boolean; canReview?: boolean }) {
  const [data, setData] = useState(initial || empty);
  const [weekId, setWeekId] = useState("all");
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Editor | null>(null);
  const [drag, setDrag] = useState<{ weekId: string; lessonId: string } | null>(null);
  const [dropId, setDropId] = useState("");
  useAdminUnsavedChanges(Boolean(editing) || busy);
  const summary = missionSummary(quizOnly ? data.weeks.map((week) => ({ ...week, lessons: week.lessons.filter((lesson) => lesson.mission?.quiz) })) : data.weeks);
  const course = data.courses.find((item) => item.id === data.courseId);
  const matchesType = (lesson: CurriculumLesson) => Boolean(lesson.mission && (!quizOnly || lesson.mission.quiz));
  const positions = new Map(data.weeks.flatMap((week) => week.lessons.filter((lesson) => lesson.mission)).map((lesson, i) => [lesson.id, i + 1]));
  const visible = data.weeks.filter((week) => weekId === "all" || week.id === weekId).map((week) => ({ week, lessons: week.lessons.filter((lesson) => matchesType(lesson) && (lesson.mission?.title.toLowerCase().includes(query.trim().toLowerCase()) || lesson.title.toLowerCase().includes(query.trim().toLowerCase())) && (visibility === "all" || missionIsVisible(week, lesson) === (visibility === "public"))) }));

  const load = async (id = data.courseId) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try { const next = await requestWorkspace(id); setData(next); setWeekId("all"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "불러오지 못했습니다."); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const save = async (weeks: CurriculumWeek[], success: string) => {
    if (busyRef.current) throw new Error("저장이 끝난 뒤 다시 시도해 주세요.");
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try { const next = await requestWorkspace(null, { courseId: data.courseId, revision: data.revision, weeks }); setData(next); setMessage(success); }
    catch (reason) { const detail = reason instanceof Error ? reason.message : "저장하지 못했습니다."; setError(detail); throw new Error(detail); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const move = (week: CurriculumWeek, fromId: string, toId: string) => {
    if (busyRef.current || fromId === toId) return;
    setDrag(null); setDropId("");
    void save(reorderWeekMissions(data.weeks, week.id, fromId, toId), "미션 순서를 저장했습니다.").catch(() => undefined);
  };
  const addWeek = async () => {
    const title = window.prompt("새 주차의 학습 주제를 입력해 주세요.", `${data.weeks.length + 1}주차`);
    if (!title?.trim()) return;
    const id = crypto.randomUUID();
    try { await save([...data.weeks, { id, label: "", title: title.trim(), goal: "", isPublished: true, lessons: [] }], "주차를 추가했습니다."); setWeekId(id); } catch { /* Error is displayed above the list. */ }
  };
  const add = (id?: string) => {
    const target = id || (weekId !== "all" ? weekId : data.weeks[0]?.id);
    if (!target) { void addWeek(); return; }
    setEditing({ weekId: target, isNew: true, lesson: { id: crypto.randomUUID(), day: 0, title: "", description: "", kind: "텍스트", duration: "", isPublished: true, accessMode: "enrolled", mission: { title: "", instructions: "", required: true, submissionType: quizOnly ? "quiz" : "text", isPublished: true, ...(quizOnly ? { quiz: { passPercent: 100, questions: [{ id: crypto.randomUUID(), prompt: "", options: ["", ""], correctIndex: 0 }] } } : {}) } } });
  };
  const apply = async (lesson: CurriculumLesson, file?: File) => {
    if (!editing || !data.courseId) return;
    const stored = file ? { ...lesson, resourcePath: await directUpload(data.courseId, file, "resource"), resourceName: file.name } : lesson;
    const weeks = data.weeks.map((week) => week.id !== editing.weekId ? week : { ...week, lessons: editing.isNew ? [...week.lessons, stored] : week.lessons.map((item) => item.id === stored.id ? stored : item) });
    await save(weeks, editing.isNew ? "미션을 등록했습니다." : "미션과 확인 퀴즈를 저장했습니다.");
    setEditing(null);
  };

  return <div className="mission-workspace" aria-busy={busy}>
    <header className="mission-page-header"><div><h1>{quizOnly ? "확인 퀴즈" : "미션 관리"}</h1><p>{quizOnly ? "미션별 문항·정답·통과 기준을 설정합니다. 퀴즈 통과 후 관리자 승인을 받아야 완료됩니다." : "주차별로 미션을 등록·정렬합니다. 미션을 선택해 콘텐츠와 확인 퀴즈를 편집하세요."}</p></div><button className="admin-primary mission-add" disabled={busy || !data.courseId} onClick={() => add()}><Plus/>{quizOnly ? "퀴즈 미션 등록" : "미션 등록"}</button></header>
    <div className="mission-course-bar"><label>클래스<select value={data.courseId || ""} disabled={busy} onChange={(e) => void load(e.target.value)}><option value="" disabled>클래스 선택</option>{data.courses.map((item) => <option key={item.id} value={item.id}>{item.title}{item.status !== "published" ? " · 비공개 클래스" : ""}</option>)}</select></label><span>모든 기수에 공통 적용</span><div>{canReview && <Link className="admin-outline" href="/admin/submissions">미션 승인</Link>}<button className="admin-outline" disabled={busy} onClick={() => void load()} aria-label="미션 새로고침"><RefreshCw/></button></div></div>
    {course?.status !== "published" && course && <p className="studio-help">클래스가 비공개 상태입니다. 미션을 공개해도 클래스가 공개되기 전에는 모집 페이지에 표시되지 않습니다.</p>}
    <div className="mission-filters"><div className="mission-week-tabs" role="group" aria-label="주차 필터"><button aria-pressed={weekId === "all"} onClick={() => setWeekId("all")}>전체 <b>{quizOnly ? summary.quizzes : summary.total}</b></button>{data.weeks.map((week, i) => <button key={week.id} aria-pressed={weekId === week.id} onClick={() => setWeekId(week.id)}>Week {i + 1} <b>{week.lessons.filter(matchesType).length}</b></button>)}</div><span className="mission-visibility-count">공개 {summary.published} · 비공개 {summary.private}</span></div>
    <div className="mission-search-row"><label className="mission-search"><Search/><input placeholder="미션 이름 검색" aria-label="미션 이름 검색" value={query} onChange={(e) => setQuery(e.target.value)}/></label><select aria-label="미션 공개 상태" value={visibility} onChange={(e) => setVisibility(e.target.value)}><option value="all">전체 공개 상태</option><option value="public">공개</option><option value="private">비공개</option></select><button className="admin-outline" disabled={busy || !data.courseId || data.weeks.length >= 52} onClick={() => void addWeek()}><Plus/>주차 추가</button></div>
    <div aria-live="polite">{message && <p className="admin-save-success">{message}</p>}{error && <p className="admin-save-error" role="alert">{error}</p>}</div>
    {!data.courses.length && !error && <div className="studio-empty"><Target/><h2>클래스 등록부터 시작하세요</h2><p>클래스에 주차와 미션을 연결해 교육생의 실행 과정을 관리합니다.</p><Link className="admin-outline" href="/admin/products">강의 상품 관리</Link></div>}
    {data.courseId && !data.weeks.length && <div className="studio-empty"><Target/><h2>첫 주차를 추가해 주세요</h2><p>주차를 만든 뒤 미션과 확인 퀴즈를 등록할 수 있습니다.</p><button className="admin-primary" disabled={busy} onClick={() => void addWeek()}><Plus/>주차 추가</button></div>}
    {visible.map(({ week, lessons }) => <section className="mission-week-card" key={week.id} aria-label={`${week.label} 미션`}><header><h2><span>WEEK {data.weeks.indexOf(week) + 1}</span>{week.title}</h2><div>{week.isPublished === false && <span className="studio-badge">주차 비공개</span>}<button className="admin-outline" disabled={busy} onClick={() => add(week.id)}><Plus/>이 주차에 미션 추가</button></div></header>
      {lessons.length ? <ol>{lessons.map((lesson) => {
        const allMissions = week.lessons.filter((item) => item.mission);
        const index = allMissions.findIndex((item) => item.id === lesson.id);
        const count = data.counts[lesson.id] || { approved: 0, pending: 0 };
        const published = missionIsVisible(week, lesson);
        return <li key={lesson.id} className={`${drag?.lessonId === lesson.id ? "dragging" : ""} ${dropId === lesson.id ? "drop-target" : ""}`} onDragOver={(e) => { if (!busy && drag?.weekId === week.id && drag.lessonId !== lesson.id) { e.preventDefault(); setDropId(lesson.id); } }} onDrop={(e) => { e.preventDefault(); if (drag?.weekId === week.id) move(week, drag.lessonId, lesson.id); }}>
          <button className="mission-drag" draggable={!busy && !query && visibility === "all" && !quizOnly} disabled={busy || Boolean(query) || visibility !== "all" || quizOnly} onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", lesson.id); setDrag({ weekId: week.id, lessonId: lesson.id }); }} onDragEnd={() => { setDrag(null); setDropId(""); }} aria-label={`${lesson.mission!.title} 드래그로 순서 변경`}><GripVertical/></button>
          <span className="mission-number">{String(positions.get(lesson.id)).padStart(2, "0")}</span><button className="mission-row-title" disabled={busy} onClick={() => setEditing({ weekId: week.id, lesson: structuredClone(lesson), isNew: false })}><strong>{lesson.mission!.title}</strong><small>{lesson.kind === "텍스트" && !lesson.bodyText ? "연결 콘텐츠 없음" : `${lesson.kind}${lesson.duration ? ` ${lesson.duration}` : ""}`} · {lesson.mission!.quiz ? `확인 퀴즈 ${lesson.mission!.quiz.questions.length}문항` : "퀴즈 없음"} · {lesson.mission!.required ? "필수" : "선택"}</small></button>
          <span className={`studio-badge ${published ? "live" : ""}`} title={!published && lesson.mission!.isPublished ? "연결 콘텐츠 또는 주차가 비공개입니다." : undefined}>{published ? "공개" : "비공개"}</span><span className="mission-counts" title="전체 기수의 수강권별 승인·대기 현황">완료 {count.approved} · 대기 {count.pending}</span>
          <div className="mission-row-actions"><button className="mission-order" disabled={busy || index === 0} aria-label={`${lesson.mission!.title} 위로 이동`} onClick={() => move(week, lesson.id, allMissions[index - 1].id)}><ArrowUp/></button><button className="mission-order" disabled={busy || index === allMissions.length - 1} aria-label={`${lesson.mission!.title} 아래로 이동`} onClick={() => move(week, lesson.id, allMissions[index + 1].id)}><ArrowDown/></button><button className="admin-outline" disabled={busy} onClick={() => setEditing({ weekId: week.id, lesson: structuredClone(lesson), isNew: false })}>편집</button></div>
        </li>;
      })}</ol> : <p className="mission-empty">{query || visibility !== "all" || quizOnly ? "조건에 맞는 미션이 없습니다." : "이 주차의 첫 미션을 등록해 보세요."}</p>}
    </section>)}
    {data.weeks.length > 0 && <p className="studio-help">순서 변경은 같은 주차 안에서 저장됩니다. 연결된 학습 콘텐츠도 함께 이동하며, 일반 강의·자료의 자리는 유지됩니다. 완료 수는 관리자 승인 기준입니다.</p>}
    {editing && <ContentDialog key={editing.lesson.id} missionMode lesson={editing.lesson} isNew={editing.isNew} courseId={data.courseId!} onClose={() => { if (!busy && window.confirm("편집을 닫을까요? 저장하지 않은 입력은 사라집니다.")) setEditing(null); }} onApply={apply} context={<label>연결 주차<select disabled={!editing.isNew} value={editing.weekId} onChange={(e) => setEditing({ ...editing, weekId: e.target.value })}>{data.weeks.map((week) => <option key={week.id} value={week.id}>{week.label || `${data.weeks.indexOf(week) + 1}주차`} · {week.title}</option>)}</select><small>저장 즉시 미션 목록과 해당 클래스의 커리큘럼에 반영됩니다.</small></label>}/>}
  </div>;
}
