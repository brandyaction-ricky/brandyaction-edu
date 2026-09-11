"use client";
import {
  labels,
  money,
  number as num,
  object,
  sections,
  text as t,
  type Field,
  type Row,
  type Section,
} from "@/lib/platform";
import { localDateTime, recordId } from "@/lib/platform-rules";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { AdminWorkflows } from "../admin-workflows";
import { BlocksField, UploadField } from "../editor-fields";
import type { Data, WorkflowSend } from "../learning-workflows";
import { AdminHeading } from "./admin-shell";
import { Badge, Empty } from "./primitives";

function fieldValue(s: Section, row: Row | undefined, f: Field) {
  return s.table === "courses" &&
    ["thumbnail_url", "detail_image_url"].includes(f.key)
    ? object(row, "metadata")[f.key] ||
        object(row, "metadata")[
          f.key === "thumbnail_url" ? "thumbnailUrl" : "detailImageUrl"
        ]
    : row?.[f.key];
}
export function FieldControl({
  section,
  row,
  field: f,
  data,
  pending,
}: {
  section: Section;
  row?: Row;
  field: Field;
  data: Data;
  pending: boolean;
}) {
  const value = fieldValue(section, row, f),
    props = { name: f.key, id: "edit-" + f.key, required: f.required };
  if (f.type === "blocks") return <BlocksField name={f.key} value={value} />;
  if (["image", "resource"].includes(f.type || ""))
    return (
      <UploadField
        name={f.key}
        value={String(value || "")}
        image={f.type === "image"}
        disabled={pending}
      />
    );
  if (f.type === "checkbox")
    return <input {...props} type="checkbox" defaultChecked={Boolean(value)} />;
  if (["course", "week", "lesson"].includes(f.type || "")) {
    const table =
      f.type === "course"
        ? "courses"
        : f.type === "week"
          ? "curriculum_weeks"
          : "curriculum_lessons";
    return (
      <select {...props} defaultValue={String(value || "")}>
        <option value="">선택하세요</option>
        {(data[table] || []).map((r) => (
          <option key={r.id} value={r.id}>
            {t(r, "title")}
          </option>
        ))}
      </select>
    );
  }
  if (f.options)
    return (
      <select {...props} defaultValue={String(value || f.options[0])}>
        {f.options.map((v) => (
          <option key={v} value={v}>
            {labels[v] || v}
          </option>
        ))}
      </select>
    );
  if (f.type === "json" || f.type === "textarea")
    return (
      <textarea
        {...props}
        rows={f.type === "json" ? 8 : 5}
        defaultValue={
          f.type === "json"
            ? JSON.stringify(value ?? {}, null, 2)
            : String(value || "")
        }
      />
    );
  return (
    <input
      {...props}
      type={f.type || "text"}
      defaultValue={
        f.type === "datetime-local" && value
          ? localDateTime(value)
          : String(value ?? "")
      }
      min={
        f.type === "number"
          ? ["capacity", "week_number", "day_number", "usage_limit"].includes(
              f.key,
            )
            ? 1
            : 0
          : undefined
      }
    />
  );
}
export function formValues(section: Section, form: FormData) {
  const values: Record<string, unknown> = {};
  for (const f of section.fields) {
    const value = form.get(f.key);
    if (f.type === "checkbox") values[f.key] = value === "on";
    else if (f.type === "json" || f.type === "blocks")
      values[f.key] = value ? JSON.parse(String(value)) : {};
    else if (f.type === "number")
      values[f.key] =
        value === "" ? (f.key === "list_price" ? 0 : null) : Number(value);
    else if (f.type === "datetime-local")
      values[f.key] = value ? new Date(String(value)).toISOString() : null;
    else values[f.key] = value || null;
  }
  return values;
}
function Fields({
  section,
  row,
  data,
  pending,
  keys,
}: {
  section: Section;
  row?: Row;
  data: Data;
  pending: boolean;
  keys?: string[];
}) {
  return (
    <div className="form-grid">
      {section.fields
        .filter((f) => !keys || keys.includes(f.key))
        .map((f) => (
          <label
            className={
              "field " +
              (["textarea", "json", "blocks", "image", "resource"].includes(
                f.type || "",
              )
                ? "wide"
                : "")
            }
            key={f.key}
          >
            <span>
              {f.label}
              {f.required && <span className="required-mark"> *</span>}
            </span>
            <FieldControl
              section={section}
              row={row}
              field={f}
              data={data}
              pending={pending}
            />
          </label>
        ))}
    </div>
  );
}
export function ProductEditor({
  data,
  row,
  pending,
  send,
  back,
}: {
  data: Data;
  row?: Row;
  pending: boolean;
  send: WorkflowSend;
  back: () => void;
}) {
  const section = sections.find((s) => s.key === "products")!,
    [tab, setTab] = useState("basic"),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState({
      title: t(row, "title"),
      summary: t(row, "summary"),
      price: num(row, "list_price"),
      status: t(row, "status") || "draft",
    }),
    formRef = useRef<HTMLFormElement>(null);
  const groups = [
    [
      "basic",
      "기본·판매",
      [
        "title",
        "course_code",
        "category",
        "summary",
        "list_price",
        "instructor_name",
        "duration_label",
        "schedule_label",
        "thumbnail_url",
      ],
    ],
    ["detail", "상세페이지", ["description", "detail_image_url"]],
    ["resources", "제공 자료", []],
    ["access", "수강·권한", []],
    ["publish", "공개·검색", ["slug", "status"]],
  ] as const;
  function close() {
    if (
      !dirty ||
      window.confirm("저장하지 않은 변경사항이 있습니다. 목록으로 돌아갈까요?")
    )
      back();
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const invalid = Array.from(form.elements).find(
      (el) =>
        "checkValidity" in el && !(el as HTMLInputElement).checkValidity(),
    ) as HTMLInputElement | undefined;
    if (invalid) {
      const panel = invalid.closest("[data-tab]");
      if (panel) setTab(panel.getAttribute("data-tab")!);
      requestAnimationFrame(() => {
        invalid.focus();
        invalid.reportValidity();
      });
      return;
    }
    try {
      await send({
        action: "save",
        section: "products",
        id: row?.id,
        values: formValues(section, new FormData(form)),
      });
      setDirty(false);
      back();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <>
      <AdminHeading
        title={row ? "상품 수정" : "상품 등록"}
        description={t(row, "title") || "상품과 판매 정보를 입력하세요."}
        eyebrow="PRODUCT EDITOR"
      >
        {Boolean(row?.slug) && (
          <Link
            className="btn"
            href={"/classes/" + t(row, "slug")}
            target="_blank"
          >
            고객 화면 보기
          </Link>
        )}
      </AdminHeading>
      <form
        noValidate
        ref={formRef}
        onSubmit={submit}
        onChange={() => {
          setDirty(true);
          if (formRef.current) {
            const f = new FormData(formRef.current);
            setPreview({
              title: String(f.get("title") || ""),
              summary: String(f.get("summary") || ""),
              price: Number(f.get("list_price") || 0),
              status: String(f.get("status") || "draft"),
            });
          }
        }}
      >
        <div className="editor-layout">
          <div className="editor-main">
            <section className="panel">
              <div className="tabs" role="tablist" aria-label="상품 편집 영역">
                {groups.map(([key, label]) => (
                  <button
                    type="button"
                    className={"tab " + (tab === key ? "active" : "")}
                    role="tab"
                    aria-selected={tab === key}
                    key={key}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {groups.map(([key, label, keys]) => (
                <div
                  className="section-pad"
                  data-tab={key}
                  key={key}
                  hidden={tab !== key}
                  role="tabpanel"
                >
                  <h2 className="mb16">{label}</h2>
                  <Fields
                    section={section}
                    row={row}
                    data={data}
                    pending={pending}
                    keys={[...keys]}
                  />
                  {key === "resources" && (
                    <>
                      <p>
                        상품에 연결된 학습 자료를 등록하고 기존 수강 권한으로
                        제공합니다.
                      </p>
                      <Link className="btn mt24" href="/admin/contents">
                        영상·자료 등록
                        <ArrowRight />
                      </Link>
                      <div className="notice mt24">
                        현재 서비스의 학습 자료는 수강권 확인 후 다운로드됩니다.
                        공개 자료와 구매자 전용 자료의 권한을 임의로 변경하지
                        않습니다.
                      </div>
                    </>
                  )}
                  {key === "access" && (
                    <>
                      <h3>연결 기수</h3>
                      {(data.cohorts || [])
                        .filter((c) => c.course_id === row?.id)
                        .map((c) => (
                          <div className="setting-line" key={c.id}>
                            <b>{t(c, "name")}</b>
                            <Badge>
                              {labels[t(c, "status")] || t(c, "status")}
                            </Badge>
                          </div>
                        ))}
                      <Link className="btn mt24" href="/admin/cohorts">
                        기수·회차 관리
                      </Link>
                      <div className="notice mt24">
                        정원·모집 기간·교육 일정은 기수에서 관리합니다. 주문별
                        수강권 부여와 환불에 따른 회수는 기존 관리 기능을
                        사용합니다.
                      </div>
                    </>
                  )}
                  {key === "publish" && (
                    <div className="snippet">
                      <div className="snippet-url">
                        brandyaction-edu.com › classes ›{" "}
                        {t(row, "slug") || "상품 주소"}
                      </div>
                      <h3>{preview.title || "상품명"}</h3>
                      <p>{preview.summary || "한 줄 소개"}</p>
                    </div>
                  )}
                </div>
              ))}
            </section>
            <div className="editor-savebar">
              <button
                className="btn"
                type="button"
                disabled={pending}
                onClick={close}
              >
                <ArrowLeft />
                목록
              </button>
              <span className="dirty-note">
                {dirty
                  ? "저장하지 않은 변경사항"
                  : "변경 내용 저장 후 반영됩니다."}
              </span>
              <button className="btn primary" disabled={pending}>
                {pending ? "저장 중..." : "변경 내용 저장"}
              </button>
            </div>
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
          </div>
          <aside className="editor-aside">
            <div className="side-preview">
              <span className="section-code">고객에게 보이는 상품</span>
              <div className="preview-cover mt16">
                <p>BRANDYACTION EDU</p>
                <h3>{preview.title || "상품명"}</h3>
              </div>
              <div className="preview-meta">
                <b>{preview.price ? money(preview.price) : "무료"}</b>
              </div>
              <p className="meta mt8">
                {preview.summary || "상품 소개를 입력해 주세요."}
              </p>
              <div className="divider" />
              <div className="setting-line">
                <span>공개 상태</span>
                <Badge>{labels[preview.status]}</Badge>
              </div>
              <Link className="btn full mt16" href="/admin/cohorts">
                기수·회차 관리
              </Link>
            </div>
          </aside>
        </div>
      </form>
    </>
  );
}
export function LearningEditor({
  data,
  row,
  pending,
  send,
  back,
}: {
  data: Data;
  row?: Row;
  pending: boolean;
  send: WorkflowSend;
  back: () => void;
}) {
  const section = sections.find((s) => s.key === "learning")!,
    contents = sections.find((s) => s.key === "contents")!,
    content = (data.lesson_contents || []).find((c) => c.lesson_id === row?.id),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState(t(content, "body_text"));
  async function save(e: FormEvent<HTMLFormElement>, s: Section, id?: string) {
    e.preventDefault();
    const values = formValues(s, new FormData(e.currentTarget));
    try {
      const result = await send({ action: "save", section: s.key, id, values });
      setMessage("저장했습니다.");
      if (!row && result.row) back();
    } catch (cause) {
      setMessage((cause as Error).message);
    }
  }
  const scoped = {
    ...data,
    curriculum_missions: (data.curriculum_missions || []).filter(
      (m) => m.lesson_id === row?.id,
    ),
  };
  return (
    <>
      <AdminHeading
        title="학습 콘텐츠 편집"
        description={
          row
            ? `Day ${num(row, "day_number")} · ${t(row, "title")}`
            : "새로운 학습을 등록하세요."
        }
        eyebrow="LEARNING EDITOR"
      >
        <button className="btn" onClick={back}>
          목록으로
        </button>
      </AdminHeading>
      <form className="panel" onSubmit={(e) => void save(e, section, row?.id)}>
        <div className="panel-head">
          <h2>기본 정보</h2>
          <Badge color={row?.is_published ? "green" : ""}>
            {row?.is_published ? "공개" : "비공개"}
          </Badge>
        </div>
        <div className="section-pad">
          <Fields section={section} row={row} data={data} pending={pending} />
          <button className="btn primary" disabled={pending}>
            {row ? "기본 정보 저장" : "학습 등록"}
          </button>
        </div>
      </form>
      {row ? (
        <>
          <section className="panel mt24">
            <div className="panel-head">
              <h2>학습 본문·영상·자료</h2>
              <span className="meta">기존 업로드·수강 권한 유지</span>
            </div>
            <div className="section-pad lesson-body-grid">
              <form
                onSubmit={(e) =>
                  void save(
                    e,
                    contents,
                    content ? recordId(content) : undefined,
                  )
                }
                onChange={(e) => {
                  if (
                    e.target instanceof HTMLTextAreaElement &&
                    e.target.name === "body_text"
                  )
                    setPreview(e.target.value);
                }}
              >
                <input name="lesson_id" type="hidden" value={row.id} />
                <Fields
                  section={contents}
                  row={content}
                  data={data}
                  pending={pending}
                  keys={contents.fields
                    .filter((f) => f.key !== "lesson_id")
                    .map((f) => f.key)}
                />
                <button className="btn primary" disabled={pending}>
                  본문·자료 저장
                </button>
              </form>
              <aside className="preview-window">
                <div className="preview-window-top">
                  <b>학습자 화면</b>
                  <span>본문 미리보기</span>
                </div>
                <div className="safe-html-preview">
                  <Badge>DAY {num(row, "day_number")}</Badge>
                  <h2>{t(row, "title")}</h2>
                  <p className="intro-preview">{t(row, "description")}</p>
                  <div className="reading-copy">{preview}</div>
                </div>
              </aside>
            </div>
          </section>
          <section className="panel mt24">
            <div className="panel-head">
              <h2>확인 퀴즈</h2>
              <Link className="btn small" href="/admin/missions">
                연결 미션 관리
              </Link>
            </div>
            <div className="section-pad">
              {scoped.curriculum_missions.length ? (
                <AdminWorkflows
                  section="missions"
                  data={scoped}
                  pending={pending}
                  send={send}
                />
              ) : (
                <Empty title="연결된 미션이 없습니다.">
                  미션을 먼저 등록하면 이 학습의 퀴즈를 편집할 수 있습니다.
                </Empty>
              )}
            </div>
          </section>
        </>
      ) : (
        <div className="notice mt24">
          기본 정보를 등록한 뒤 본문·영상·자료와 퀴즈를 연결하세요.
        </div>
      )}
      {message && (
        <p className="notice mt24" role="status">
          {message}
        </p>
      )}
      <div className="editor-savebar">
        <button className="btn" onClick={back}>
          <ArrowLeft />
          학습 목록
        </button>
        <span className="meta">
          기본 정보·본문·퀴즈는 각 저장 버튼으로 반영합니다.
        </span>
      </div>
    </>
  );
}
