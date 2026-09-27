"use client";

import { number as num, text as t, type Row } from "@/lib/platform";
import { useEffect, useState } from "react";
import type { Data, WorkflowSend } from "../learning-workflows";

type MissionDraft = {
  title: string;
  instructions: string;
  submission_type: string;
  is_required: boolean;
  is_published: boolean;
};

const emptyDraft: MissionDraft = { title: "", instructions: "", submission_type: "text", is_required: true, is_published: false };
const submissionLabels: Record<string, string> = { text: "텍스트", link: "링크", mixed: "텍스트·링크", quiz: "확인 퀴즈" };

function errorText(cause: unknown) {
  return cause instanceof Error ? cause.message : "미션을 처리하지 못했습니다. 다시 시도해 주세요.";
}

export function ProductMissionWorkspace({ course, pending, send }: {
  course?: Row;
  pending: boolean;
  send: WorkflowSend;
}) {
  const [snapshot, setSnapshot] = useState<Data | null>(null);
  const [readVersion, setReadVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [missionId, setMissionId] = useState("");
  const [weekId, setWeekId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [draft, setDraft] = useState<MissionDraft>(emptyDraft);

  useEffect(() => {
    if (!course?.id) return;
    const controller = new AbortController();
    let active = true;
    fetch(`/api/platform?admin=1&section=products&record=${encodeURIComponent(String(course.id))}&part=missions`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "상품 미션을 불러오지 못했습니다.");
        return result.data as Data;
      })
      .then((result) => { if (active) { setSnapshot(result); setReadError(""); setLoading(false); } })
      .catch((cause) => { if (active && !controller.signal.aborted) { setReadError(errorText(cause)); setLoading(false); } });
    return () => { active = false; controller.abort(); };
  }, [course?.id, readVersion]);

  const weeks = (snapshot?.curriculum_weeks || [])
    .filter((week) => week.course_id === course?.id && !week.archived_at)
    .sort((a, b) => num(a, "week_number") - num(b, "week_number"));
  const weekIds = new Set(weeks.map((week) => String(week.id)));
  const lessons = (snapshot?.curriculum_lessons || [])
    .filter((lesson) => weekIds.has(String(lesson.week_id)) && !lesson.archived_at)
    .sort((a, b) => num(a, "day_number") - num(b, "day_number"));
  const lessonIds = new Set(lessons.map((lesson) => String(lesson.id)));
  const missions = (snapshot?.curriculum_missions || [])
    .filter((mission) => lessonIds.has(String(mission.lesson_id)));
  const selectedMission = missions.find((mission) => mission.id === missionId && !mission.archived_at);
  const selectedWeekId = weekIds.has(weekId) ? weekId : String(weeks[0]?.id || "");
  const selectedLessons = lessons.filter((lesson) => lesson.week_id === selectedWeekId);
  const selectedLessonId = selectedLessons.some((lesson) => lesson.id === lessonId) ? lessonId : String(selectedLessons[0]?.id || "");
  const saving = pending || busy || loading || Boolean(readError);

  function editMission(mission: Row) {
    if (mission.archived_at) return;
    const lesson = lessons.find((item) => item.id === mission.lesson_id);
    setMissionId(String(mission.id));
    setWeekId(String(lesson?.week_id || ""));
    setLessonId(String(mission.lesson_id));
    setDraft({
      title: t(mission, "title"),
      instructions: t(mission, "instructions"),
      submission_type: t(mission, "submission_type") || "text",
      is_required: Boolean(mission.is_required),
      is_published: Boolean(mission.is_published),
    });
    setError("");
  }

  function newMission() {
    setMissionId("");
    setDraft(emptyDraft);
    setError("");
  }

  async function saveMission() {
    const title = draft.title.trim();
    if (!course?.id || !selectedWeekId || !selectedLessonId || !title) { setError("상품·주차·일차와 미션 제목을 확인해 주세요."); return; }
    setError(""); setBusy(true);
    try {
      const result = await send({ action: "save", section: "missions", id: selectedMission?.id, values: {
        course_id: course.id,
        week_id: selectedWeekId,
        lesson_id: selectedLessonId,
        title,
        instructions: draft.instructions.trim() || null,
        submission_type: draft.submission_type,
        is_required: draft.is_required,
        is_published: selectedMission ? draft.is_published : false,
      } }, selectedMission ? "상품 미션을 저장했습니다." : "상품에 비공개 미션을 추가했습니다.");
      const created = result.row as Row | undefined;
      if (created?.id) setMissionId(String(created.id));
      setLoading(true); setReadVersion((version) => version + 1);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  if (!course?.id) return <div className="section-pad"><p className="notice">상품을 먼저 저장하면 같은 화면에서 일차별 미션을 등록할 수 있습니다.</p></div>;

  return <div className="section-pad product-mission-workspace">
    <h2>상품별 미션</h2>
    <p className="meta">이 상품의 기존 일차와 미션을 그대로 보여 줍니다. 새 미션은 비공개로 등록되며, 공개 여부는 저장 후 변경할 수 있습니다.</p>
    {loading && <p className="meta" role="status">상품 미션을 불러오는 중입니다.</p>}
    {readError && <p className="notice warning" role="alert">{readError} <button className="btn small" type="button" onClick={() => { setLoading(true); setReadVersion((version) => version + 1); }}>다시 시도</button></p>}
    {!weeks.length && !loading && !readError && <p className="notice">등록된 주차가 없습니다. 커리큘럼 탭에서 주차와 일차를 먼저 추가해 주세요.</p>}
    {weeks.map((week) => <section key={week.id} className="product-mission-week" aria-label={`${num(week, "week_number")}주차 미션`}>
      <h3>{num(week, "week_number")}주차 · {t(week, "title")}</h3>
      {lessons.filter((lesson) => lesson.week_id === week.id).map((lesson) => <div key={lesson.id} className="product-mission-day">
        <b>Day {num(lesson, "day_number")} · {t(lesson, "title")}</b>
        {missions.filter((mission) => mission.lesson_id === lesson.id).length ? <ul>{missions.filter((mission) => mission.lesson_id === lesson.id).map((mission) => <li key={mission.id}><span>{t(mission, "title")} · {mission.archived_at ? "보관됨" : mission.is_published ? "공개" : "비공개"}{mission.is_required ? " · 필수" : " · 선택"}</span>{!mission.archived_at && <button className="btn small" type="button" disabled={saving} onClick={() => editMission(mission)}>미션 편집</button>}</li>)}</ul> : <p className="meta">연결된 미션이 없습니다.</p>}
      </div>)}
      {!lessons.some((lesson) => lesson.week_id === week.id) && <p className="meta">일차별 학습을 먼저 추가해 주세요.</p>}
    </section>)}
    {!!lessons.length && <section className="product-mission-fields" aria-label={selectedMission ? "기존 미션 편집" : "새 미션 등록"}>
      <div className="row"><h3>{selectedMission ? "기존 미션 편집" : "새 미션 등록"}</h3>{selectedMission && <button className="btn small" type="button" onClick={newMission} disabled={saving}>+ 새 미션</button>}</div>
      <div className="form-grid">
        <label>주차<select value={selectedWeekId} onChange={(event) => { setWeekId(event.target.value); setLessonId(""); }} disabled={saving || Boolean(selectedMission)}>{weeks.map((week) => <option key={week.id} value={week.id}>{num(week, "week_number")}주차 · {t(week, "title")}</option>)}</select></label>
        <label>일차<select value={selectedLessonId} onChange={(event) => setLessonId(event.target.value)} disabled={saving || Boolean(selectedMission)}>{selectedLessons.map((lesson) => <option key={lesson.id} value={lesson.id}>Day {num(lesson, "day_number")} · {t(lesson, "title")}</option>)}</select></label>
        <label>미션 제목<input value={draft.title} maxLength={300} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} disabled={saving} /></label>
        <label>제출 방식<select value={draft.submission_type} onChange={(event) => setDraft((current) => ({ ...current, submission_type: event.target.value }))} disabled={saving}>{Object.entries(submissionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      <label>미션 안내<textarea rows={5} value={draft.instructions} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} disabled={saving} /></label>
      <div className="product-mission-options"><label><input type="checkbox" checked={draft.is_required} onChange={(event) => setDraft((current) => ({ ...current, is_required: event.target.checked }))} disabled={saving} />필수 미션</label><label><input type="checkbox" checked={draft.is_published} onChange={(event) => setDraft((current) => ({ ...current, is_published: event.target.checked }))} disabled={saving || !selectedMission} />공개{!selectedMission ? " · 등록 후 설정" : ""}</label></div>
      {draft.submission_type === "quiz" && <p className="meta">확인 퀴즈는 비공개로 저장한 뒤 미션 관리에서 문항을 등록해야 공개할 수 있습니다.</p>}
      <button className="btn primary" type="button" onClick={() => void saveMission()} disabled={saving || !titleReady(draft.title) || !selectedLessonId}>{selectedMission ? "미션 저장" : "비공개 미션 추가"}</button>
    </section>}
    {error && <p className="notice warning" role="alert">{error}</p>}
  </div>;
}

function titleReady(value: string) { return Boolean(value.trim()); }
