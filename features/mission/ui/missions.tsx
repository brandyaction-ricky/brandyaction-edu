'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { date, labels, number as num, text as t, type Row } from '@/lib/platform';
import type { MissionData as Data } from '../api/contracts';
import { missionEntries } from '../application/entries';
import { missionNextLabel } from '../application/submission';
import { Badge, Empty, Heading } from '@/app/ui/final/primitives';
const rows = (data: Data, key: string) => data[key] || [];
export function Missions({ data, active }: { data: Data; active: Row[] }) {
  const [enrollmentId, setEnrollmentId] = useState(""),
    [status, setStatus] = useState("전체");
  const entries = missionEntries(
    data,
    active.filter((e) => !enrollmentId || e.id === enrollmentId),
  ).map(entry => ({ ...entry, saved: rows(data, 'edu_mission_drafts').find(d => d.mission_id === entry.mission.id && d.enrollment_id === entry.enrollment.id) })).toSorted((a,b) => {
    const priority = (entry: {status: string; saved?: Row}) => ['changes_requested','rejected'].includes(entry.status) ? 0 : entry.status === 'draft' ? entry.saved ? 1 : 2 : entry.status === 'submitted' ? 3 : 4;
    return priority(a)-priority(b) || num(a.lesson, 'day_number')-num(b.lesson, 'day_number');
  });
  const needsWork = (value: string) => ['changes_requested', 'rejected'].includes(value);
  const matches = (value: string) => status === '전체' || (status === 'changes_requested' ? needsWork(value) : value === status);
  const next = entries.find(e => e.status === 'draft' || needsWork(e.status));
  const statuses = [
    "전체",
    "draft",
    "submitted",
    "changes_requested",
    "approved",
  ];
  return (
    <>
      <Heading
        title="내 미션"
        description="작은 실행을 쌓아 내 업무의 변화를 만들어 보세요. 보완할 미션과 작성 중인 미션부터 보여드립니다."
      />
      {next && <section className="mission-next-card"><div><span className="eyebrow">지금 이어서 할 미션</span><h2>{t(next.mission, 'title')}</h2><p>{needsWork(next.status) ? '운영자의 피드백을 확인하고 다시 도전해 보세요.' : next.saved ? '임시저장한 답변이 기다리고 있어요.' : '안내를 읽고 첫 실행을 기록해 보세요.'}</p></div><Link className="btn primary" href={next.href}>{missionNextLabel(next.status, Boolean(next.saved))}<ArrowRight size={16}/></Link></section>}
      <div className="member-mission-filter">
        <label>
          클래스 · 기수
          <select
            value={enrollmentId}
            onChange={(e) => {
              setEnrollmentId(e.target.value);
              setStatus("전체");
            }}
          >
            <option value="">전체 클래스</option>
            {active.map((e) => (
              <option key={e.id} value={e.id}>
                {t(
                  rows(data, "courses").find((c) => c.id === e.course_id),
                  "title",
                )}{" "}
                ·{" "}
                {t(
                  rows(data, "cohorts").find((c) => c.id === e.cohort_id),
                  "name",
                )}
              </option>
            ))}
          </select>
        </label>
        <div className="member-mission-summary">
          <span>
            전체 <b>{entries.length}</b>
          </span>
          <span>
            승인 완료{" "}
            <b>{entries.filter((e) => e.status === "approved").length}</b>
          </span>
        </div>
      </div>
      <div className="chips member-mission-tabs" aria-label="미션 상태">
        {statuses.map((s) => (
          <button
            key={s}
            className={"chip " + (status === s ? "active" : "")}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s === "전체" ? "전체" : s === "draft" ? "제출 전" : labels[s]}{" "}
            <span>
              {entries.filter((e) => s === "전체" || (s === "changes_requested" ? needsWork(e.status) : e.status === s)).length}
            </span>
          </button>
        ))}
      </div>
      <div className="member-mission-list">
        {entries
          .filter((e) => matches(e.status))
          .map((x) => (
            <article
              className="member-mission-row"
              key={x.mission.id + x.enrollment.id}
            >
              <span className="member-mission-day">
                DAY
                <strong>
                  {String(num(x.lesson, "day_number")).padStart(2, "0")}
                </strong>
              </span>
              <div className="row-text">
                <div className="flex gap8">
                  <Badge>
                    {t(
                      rows(data, "courses").find(
                        (c) => c.id === x.enrollment.course_id,
                      ),
                      "title",
                    )}
                  </Badge>
                  <Badge
                    color={
                      x.status === "approved"
                        ? "green"
                        : needsWork(x.status)
                          ? "red"
                          : x.status === "submitted"
                            ? "amber"
                            : ""
                    }
                  >
                    {x.status === "draft" ? x.saved ? "작성 중" : "시작 전" : needsWork(x.status) ? "보완 필요" : labels[x.status]}
                  </Badge>
                </div>
                <h3>{t(x.mission, "title")}</h3>
                <p>
                  {x.saved && (x.status === 'draft' || needsWork(x.status)) ? `${date(x.saved.updated_at)} 임시저장` : x.submission
                    ? date(x.submission.submitted_at) + " 제출"
                    : t(x.mission, "instructions")}
                </p>
              </div>
              <Link
                className={
                  "btn small " +
                  (needsWork(x.status) ? "primary" : "")
                }
                href={x.href}
              >
                {missionNextLabel(x.status, Boolean(x.saved))}
              </Link>
            </article>
          ))}
        {!entries.filter((e) => matches(e.status))
          .length && <Empty title="이 상태의 미션이 없습니다." />}
      </div>
    </>
  );
}
