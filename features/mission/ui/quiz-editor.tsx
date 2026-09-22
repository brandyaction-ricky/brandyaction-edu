'use client';
import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { text as t, type Row } from '@/lib/platform';
import type { QuizDefinition, QuizQuestion } from '../domain/quiz';
import type { MissionData, MissionSend } from '../api/contracts';
type Props = { data: MissionData; send: MissionSend; pending: boolean };
const rows = (data: MissionData, key: string) => data[key] || [];
const named = (row?: Row) => t(row, 'title') || t(row, 'name');
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Status({ message }: { message: string }) { return message ? <p className="notice mt16" role="status">{message}</p> : null; }
export function QuizManager(props: Props) {
  const [id, setId] = useState("");
  const missions = rows(props.data, "curriculum_missions");
  const mission = missions.find((m) => m.id === id) || missions[0];
  return (
    <section className="panel pad mb24">
      <h2>이해도 퀴즈 편집</h2>
      <Field label="미션 선택">
        <select
          value={mission?.id || ""}
          onChange={(e) => setId(e.target.value)}
        >
          {missions.map((m) => (
            <option key={m.id} value={m.id}>
              {named(
                rows(props.data, "curriculum_lessons").find(
                  (l) => l.id === m.lesson_id,
                ),
              )}{" "}
              · {named(m)}
            </option>
          ))}
        </select>
      </Field>
      {mission ? (
        <QuizEditor
          key={
            mission.id +
            String(
              rows(props.data, "mission_quizzes").find(
                (q) => q.mission_id === mission.id,
              )?.revision,
            )
          }
          {...props}
          mission={mission}
        />
      ) : (
        <p className="muted">아래에서 미션을 먼저 등록해 주세요.</p>
      )}
    </section>
  );
}
function QuizEditor({
  data,
  mission,
  send,
  pending,
}: Props & { mission: Row }) {
  const current = rows(data, "mission_quizzes").find(
    (q) => q.mission_id === mission.id,
  );
  const [questions, setQuestions] = useState<QuizQuestion[]>(
    (current?.questions as QuizQuestion[]) || [],
  );
  const [pass, setPass] = useState(Number(current?.pass_percent || 100));
  const [message, setMessage] = useState("");
  function update(index: number, patch: Partial<QuizQuestion>) {
    setQuestions(
      questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await send(
        {
          action: "quiz",
          missionId: mission.id,
          revision: current?.revision || null,
          quiz: questions.length
            ? ({ questions, passPercent: pass } satisfies QuizDefinition)
            : null,
        },
        "퀴즈를 저장했습니다.",
      );
      setMessage("저장했습니다.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="between">
        <p className="meta">
          정답은 운영자와 채점 서버에만 공개됩니다. 미션 제출 전 퀴즈를 통과해야
          합니다.
        </p>
        <Field label="통과 기준 (%)">
          <input
            type="number"
            min={1}
            max={100}
            value={pass}
            onChange={(e) => setPass(Number(e.target.value))}
            required
          />
        </Field>
      </div>
      {questions.map((q, index) => (
        <fieldset className="quiz-question" key={q.id}>
          <legend>문항 {index + 1}</legend>
          <div className="between">
            <Field label="질문">
              <input
                value={q.prompt}
                maxLength={1000}
                required
                onChange={(e) => update(index, { prompt: e.target.value })}
              />
            </Field>
            <button
              type="button"
              className="btn small"
              onClick={() =>
                setQuestions(questions.filter((_, i) => i !== index))
              }
            >
              <Trash2 size={16} />
              삭제
            </button>
          </div>
          {q.options.map((choice, i) => (
            <div className="quiz-edit-option" key={i}>
              <label>
                <input
                  type="radio"
                  name={"answer-" + q.id}
                  checked={q.correctIndex === i}
                  onChange={() => update(index, { correctIndex: i })}
                />{" "}
                정답 {i + 1}
              </label>
              <input
                aria-label={`문항 ${index + 1} 선택지 ${i + 1}`}
                value={choice}
                maxLength={500}
                required
                onChange={(e) =>
                  update(index, {
                    options: q.options.map((o, n) =>
                      n === i ? e.target.value : o,
                    ),
                  })
                }
              />
            </div>
          ))}
        </fieldset>
      ))}
      <div className="flex gap8 mt16">
        <button
          type="button"
          className="btn"
          disabled={questions.length >= 20}
          onClick={() =>
            setQuestions([
              ...questions,
              {
                id: crypto.randomUUID(),
                prompt: "",
                options: ["", "", "", ""],
                correctIndex: 0,
              },
            ])
          }
        >
          <Plus size={16} />
          문항 추가
        </button>
        <button className="btn primary" disabled={pending}>
          {questions.length ? "퀴즈 저장" : "퀴즈 해제"}
        </button>
      </div>
      <Status message={message} />
    </form>
  );
}
