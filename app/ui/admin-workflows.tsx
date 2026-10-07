"use client";
import dynamic from "next/dynamic";
import { emptyOrderListScope, type OrderListScope } from "@/lib/admin-order-list";
import { FollowupTemplateSource } from "./followup-template-source";
const LandingAdmin = dynamic(() => import("./landing/admin").then(m => m.LandingAdmin));
const AdControlSettings = dynamic(() => import("./ad-control-settings").then(m => m.AdControlSettings));
const KakaoSyncSettings = dynamic(() => import("./kakao-sync-settings").then(m => m.KakaoSyncSettings));
import { type QuizDefinition, type QuizQuestion } from "@/lib/mission-quiz";
import {
  labels,
  money,
  object,
  safeUrl,
  text as t,
  type Row,
} from "@/lib/platform";
import { localDateTime } from "@/lib/platform-rules";
import { CalendarDays, Copy, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { SubmissionReviewWorkspace } from "./final/lesson-block-reviews";
import { LessonProgressionSettings } from './final/lesson-progression-settings';
import { AdminLearningProgress } from './final/admin-learning-progress';
import { MvpEditor } from './final/member-mvp';
import { LearningNoticeEditor } from './final/learning-notice';
import { AnalyticsExclusion } from './final/analytics-exclusion';
import { AppBrandingEditor } from './final/app-branding-editor';
import { timeLabel, type Data, type WorkflowSend } from "./learning-workflows";
import { EnrollmentGrant, RefundAction } from "./operations-actions";
import {
  AdminButton,
  AdminCheckbox,
  AdminDataTable,
  AdminDatePicker,
  AdminDialogBody,
  AdminDialogFooter,
  AdminDrawer,
  AdminEmptyState,
  AdminErrorState,
  AdminFilterBar,
  AdminFormField,
  AdminLinkButton,
  AdminLoadingState,
  AdminPagination,
  AdminQuickFilter,
  AdminSearchField,
  AdminSelect,
  AdminStatusBadge,
  AdminSummaryCard,
} from "@/features/admin-ui";

export const standaloneAdmin = [
  "staff",
  "templates",
  "campaigns",
  "automations",
  "members",
  "reviews",
  "landing",
  "analytics",
  "metrics",
  "seo",
  "settings",
  "orders",
];
type Props = {
  section: string;
  data: Data;
  send: WorkflowSend;
  pending: boolean;
  selection?: string[];
  pagination?: { page: number; pageSize: number; total: number } | null;
  setPage?: (page: number) => void;
  orderScope?: OrderListScope;
  onOrderScopeChange?: (scope: OrderListScope) => void;
  onAnalyticsChanged?: () => void;
  loading?: boolean;
};
const rows = (data: Data, key: string) => data[key] || [];
const named = (row?: Row) =>
  t(row, "title") || t(row, "name") || t(row, "full_name") || t(row, "email");
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return <AdminFormField className="field" label={label}>{children}</AdminFormField>;
}
function CrmTemplateFields({ editing }: { editing: Row | null }) {
  const [channel, setChannel] = useState(String(editing?.channel || "sms"));
  const [purpose, setPurpose] = useState(String(editing?.purpose || "marketing"));
  const [templateId, setTemplateId] = useState(String(editing?.alimtalk_template_id || ""));
  const [isActive, setIsActive] = useState(Boolean(editing ? editing.is_active : true));
  const hasApprovedTemplate = channel !== "alimtalk" || Boolean(templateId.trim());
  return <>
    <div className="grid2 mt24">
      <Field label="템플릿 이름">
        <input name="name" required maxLength={100} defaultValue={t(editing || undefined, "name")} />
      </Field>
      <Field label="발송 채널">
        <select name="channel" value={channel} onChange={event => {
          const next = event.target.value;
          setChannel(next);
          if (next === "alimtalk") {
            setPurpose("transactional");
            setTemplateId("");
            setIsActive(false);
          } else if (channel === "alimtalk") {
            setTemplateId("");
            setIsActive(true);
          }
        }}>
          <option value="sms">SMS</option>
          <option value="lms">LMS</option>
          <option value="alimtalk">카카오 알림톡</option>
        </select>
        <small className="muted">알림톡은 결제 안내 같은 정보성 문구에만 사용합니다. 모집·할인 안내는 광고 문자로 설정해 주세요.</small>
      </Field>
      <Field label="메시지 목적">
        <select name="purpose" value={channel === "alimtalk" ? "transactional" : purpose} disabled={!!editing?._followupKey || channel === "alimtalk"} onChange={event => setPurpose(event.target.value)}>
          <option value="marketing">마케팅 (수신 동의 회원만)</option>
          <option value="transactional">정보성·거래 안내</option>
        </select>
      </Field>
      <Field label="카카오 승인 템플릿 번호">
        <input name="alimtalk_template_id" maxLength={200} value={templateId} disabled={channel !== "alimtalk"} onChange={event => setTemplateId(event.target.value)} />
      </Field>
    </div>
    {channel === "alimtalk" && !templateId.trim() && <p className="meta">카카오 승인 전 문구를 저장하고 고칠 수 있습니다. 승인 번호를 입력하기 전에는 발송용으로 사용할 수 없습니다.</p>}
    <Field label="메시지 내용">
      <textarea name="content" required rows={7} maxLength={2000} defaultValue={t(editing || undefined, "content")} placeholder="{{name}} 또는 #{이름} 변수를 사용할 수 있습니다." />
    </Field>
    <label className="checkline">
      <input name="is_active" type="checkbox" checked={isActive && hasApprovedTemplate} disabled={!!editing?._followupKey || !hasApprovedTemplate} onChange={event => setIsActive(event.target.checked)} />
      {editing?._followupKey ? "준비용 템플릿은 사용 중지 상태로 저장됩니다" : channel === "alimtalk" && !hasApprovedTemplate ? "카카오 승인 번호를 받은 뒤 발송용으로 켤 수 있습니다" : "발송용 템플릿으로 사용"}
    </label>
  </>;
}
function useReport(url: string) {
  const [result, setResult] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      fetch(url, { signal: c.signal })
        .then(async (r) => {
          const v = await r.json();
          if (!r.ok) throw new Error(v.error);
          setResult(v);
          setLoading(false);
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setError(e.message);
            setLoading(false);
          }
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [url, retry]);
  return { result, loading, error, retry: () => setRetry(retry + 1) };
}
function Status({ message }: { message: string }) {
  return message ? (
    <p className="notice mt16" role="status">
      {message}
    </p>
  ) : null;
}
export function AdminWorkflows(props: Props) {
  const send: WorkflowSend = (body, success) =>
    props.send({ ...body, workflow: true }, success);
  const p = { ...props, send };
  if (props.section === "cohorts") return <><CohortTools {...p} /><AdControlSettings cohorts={props.data.cohorts || []} />{process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true' && <LessonProgressionSettings cohorts={props.data.cohorts || []} />}</>;
  if (props.section === "missions") return <QuizManager {...p} />;
  if (props.section === "members") return <Participants />;
  if (props.section === "reviews") return <SubmissionReviewWorkspace {...p} />;
  if (props.section === "customers")
    return (
      <>
        <CustomerActions {...p} />
        <EnrollmentGrant
          data={p.data}
          selection={p.selection || []}
          send={send}
          pending={p.pending}
        />
      </>
    );
  if (props.section === "staff") return <StaffPermissions {...p} />;
  if (["templates", "campaigns", "automations"].includes(props.section))
    return <CrmManager {...p} />;
  if (["seo", "settings"].includes(props.section))
    return (
      <>
      <SettingsForm
        key={props.section + JSON.stringify(props.data.site_settings || [])}
        {...p}
      />
      {props.section === "settings" && <KakaoSyncSettings />}
      </>
    );
  if (props.section === "landing" || props.section === "metrics") return <LandingAdmin />;
  if (props.section === "analytics") return <Analytics />;
  if (props.section === "orders") return <OrdersPanel {...p} />;
  return null;
}
const permissionLabels = {
  products: "클래스·상품",
  members: "회원·미션",
  orders: "주문·환불",
  content: "배너·아티클",
  marketing: "CRM·성과·설정",
} as const;
function StaffPermissions({ data, send, pending }: Props) {
  const settings = rows(data, "site_settings");
  const members = rows(data, "profiles").filter(
    (member) => member.status === "active",
  );
  const [memberId, setMemberId] = useState(() =>
    String(members.find((member) => member.role === "staff")?.id || ""),
  );
  const readPermissions = (id: string) => {
    const stored = object(
      settings.find((setting) => setting.key === `edu_staff_permissions_${id}`),
      "value",
    );
    return Object.fromEntries(
      Object.keys(permissionLabels).map((scope) => [
        scope,
        stored[scope] === true,
      ]),
    );
  };
  const selected = members.find((member) => member.id === memberId);
  const [permissions, setPermissions] = useState<Record<string, boolean>>(() =>
    readPermissions(memberId),
  );
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await send(
        { action: "staff-permissions", memberId, permissions },
        "스태프 권한을 저장했습니다.",
      );
      setMessage("권한 변경을 반영했습니다.");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  return (
    <form className="panel pad" onSubmit={submit}>
      <h2>스태프별 접근 권한</h2>
      <p className="meta mt16">
        선택한 업무 영역만 관리자 메뉴와 서버 API에서 허용됩니다. 모든 권한을
        끄면 일반 회원으로 전환됩니다.
      </p>
      <Field label="회원 선택">
        <select
          value={memberId}
          required
          onChange={(event) => {
            setMemberId(event.target.value);
            setPermissions(readPermissions(event.target.value));
            setMessage("");
          }}
        >
          <option value="">회원을 선택하세요</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {named(member) || "회원"} · {t(member, "email")}{" "}
              {member.role === "admin"
                ? "(관리자)"
                : member.role === "staff"
                  ? "(스태프)"
                  : ""}
            </option>
          ))}
        </select>
      </Field>
      {selected?.role === "admin" ? (
        <Status message="최고 관리자 권한은 이 화면에서 변경할 수 없습니다." />
      ) : memberId ? (
        <>
          <div className="permission-grid">
            {Object.entries(permissionLabels).map(([scope, label]) => (
              <label className="permission-card" key={scope}>
                <input
                  type="checkbox"
                  checked={permissions[scope] === true}
                  onChange={(event) =>
                    setPermissions((current) => ({
                      ...current,
                      [scope]: event.target.checked,
                    }))
                  }
                />
                <span>
                  <b>{label}</b>
                  <small>
                    {scope === "products"
                      ? "상품, 기수, 학습 콘텐츠와 미션"
                      : scope === "members"
                        ? "회원, 태그, 쿠폰, 제출물과 질문"
                        : scope === "orders"
                          ? "주문 내역과 환불 처리"
                          : scope === "content"
                            ? "메인 배너, 아티클과 고객 후기"
                            : "메시지, 랜딩 성과와 운영 설정"}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <AdminButton variant="primary" type="submit" className="mt24" loading={pending}>
            권한 저장
          </AdminButton>
        </>
      ) : null}
      <Status message={message} />
    </form>
  );
}
function CrmManager({ section, data, send, pending }: Props) {
  const [defaultSchedule] = useState(() =>
    new Date(Date.now() + 15 * 60000).toISOString(),
  );
  const table =
    section === "templates"
      ? "crm_templates"
      : section === "campaigns"
        ? "crm_campaigns"
        : "crm_automations";
  const delivery = rows(data, "crm_delivery_state")[0];
  const smsSettings = rows(data, "crm_sms_settings")[0];
  const items = rows(data, table);
  const templates = rows(data, "crm_templates").filter(
    (item) => item.is_active,
  );
  const tags = rows(data, "crm_tags");
  const courses = rows(data, "courses");
  const [editing, setEditing] = useState<Row | null>(null);
  const [dirty, setDirty] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [message, setMessage] = useState("");
  const [testPending, setTestPending] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const title =
    section === "templates"
      ? "메시지 템플릿"
      : section === "campaigns"
        ? "예약 캠페인"
        : "자동 메시지";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      if (section === "templates") {
        await send(
          {
            action: "crm-save",
            kind: "template",
            id: editing?.id || undefined,
            name: form.get("name"),
            channel: form.get("channel"),
            purpose: editing?._followupKey ? "marketing" : form.get("channel") === "alimtalk" ? "transactional" : form.get("purpose"),
            content: form.get("content"),
            alimtalkTemplateId: form.get("alimtalk_template_id"),
            isActive: editing?._followupKey ? false : form.get("is_active") === "on",
          },
          "템플릿을 저장했습니다.",
        );
      } else if (section === "campaigns") {
        await send(
          {
            action: "crm-save",
            kind: "campaign",
            id: editing?.id || undefined,
            name: form.get("name"),
            templateId: form.get("template_id"),
            tagId: form.get("target_tag_id"),
            scheduledAt: form.get("scheduled_at")
              ? new Date(String(form.get("scheduled_at"))).toISOString()
              : null,
          },
          "캠페인을 예약했습니다.",
        );
      } else {
        await send(
          {
            action: "crm-save",
            kind: "automation",
            id: editing?.id || undefined,
            name: form.get("name"),
            templateId: form.get("template_id"),
            triggerType: form.get("trigger_type"),
            tagId: form.get("trigger_tag_id"),
            courseId: form.get("trigger_course_id"),
            delayMinutes: Number(form.get("delay_minutes")),
            isActive: form.get("is_active") === "on",
          },
          "자동 메시지를 저장했습니다.",
        );
      }
      setEditing(null);
      setDirty(false);
      setFormVersion(value=>value+1);
      setMessage(
        section === "campaigns"
          ? "예약을 저장했습니다. 발송 기능이 활성화된 환경에서 예약 실행됩니다."
          : "변경사항을 저장했습니다.",
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  const selectedTemplate = templates.find(
    (item) => item.id === editing?.template_id,
  );
  const formKey = `${section}-${editing?.id || editing?._followupKey || "new"}-${formVersion}`;
  return (
    <>
      <form className="panel pad mb24" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
          await send({ action: "crm-sms-config", values: {
            senderPhone: form.get("sender_phone"),
            optoutPhone: form.get("optout_phone"),
            senderName: form.get("sender_name"),
            transactionalEnabled: form.get("transactional_enabled") === "on",
            marketingEnabled: form.get("marketing_enabled") === "on",
          } }, "문자 발송 설정을 저장했습니다.");
          setMessage("문자 발송 설정을 저장했습니다.");
        } catch (error) { setMessage((error as Error).message); }
      }}>
        <h2>문자 발송 설정</h2>
        <p className="meta mt8">발신번호와 080 번호는 SOLAPI에 등록된 번호만 선택할 수 있습니다. 설정한 번호는 발송 전 최종 확인합니다.</p>
        <div className="grid2 mt24">
          <Field label="문자 발신번호">
            <select name="sender_phone" defaultValue={String(smsSettings?.senderPhone || "")} disabled={!smsSettings?.canConfigure}>
              {(smsSettings?.senders as string[] || []).map((number) => <option key={number} value={number}>{number}</option>)}
            </select>
          </Field>
          <Field label="발신자명 (광고 문자에 표시)">
            <input name="sender_name" maxLength={40} defaultValue={String(smsSettings?.senderName || "브랜디액션")} disabled={!smsSettings?.canConfigure} />
          </Field>
          <Field label="080 무료수신거부 번호">
            <select name="optout_phone" defaultValue={String(smsSettings?.optoutPhone || "")} disabled={!smsSettings?.canConfigure}>
              <option value="">등록된 번호 없음</option>
              {(smsSettings?.optouts as string[] || []).map((number) => <option key={number} value={number}>{number}</option>)}
            </select>
          </Field>
        </div>
        <label className="checkline mt16"><input type="checkbox" name="transactional_enabled" defaultChecked={Boolean(smsSettings?.transactionalEnabled)} disabled={!smsSettings?.canConfigure} /> 결제·이용 안내 문자 허용</label>
        <label className="checkline"><input type="checkbox" name="marketing_enabled" defaultChecked={Boolean(smsSettings?.marketingEnabled)} disabled={!smsSettings?.canConfigure} /> 광고 문자 허용 (마케팅 동의·080 번호·오전 8시~오후 9시 적용)</label>
        <p className="meta mt16">광고 문자는 자동으로 <b>(광고) 발신자명</b>과 <b>무료수신거부 080번호</b>를 붙입니다. 정보성 결제 안내에는 광고 문구를 붙이지 않습니다. 전체 발송은 서버의 안전 스위치가 켜져야 실행됩니다.</p>
        {Boolean(smsSettings?.canConfigure) && <button className="btn small mt16" disabled={pending || !(smsSettings?.senders as string[] || []).length}>문자 설정 저장</button>}
      </form>
      {section === "templates" && <FollowupTemplateSource blocked={pending || dirty || !!editing} onApply={value => { setEditing(value); setMessage(""); }}/>}
      <form key={formKey} className="panel pad mb24" onChange={()=>setDirty(true)} onSubmit={submit}>
        <div className="between">
          <h2>
            {title} {editing?.id ? "수정" : "등록"}
          </h2>
          <AdminStatusBadge status={delivery?.enabled ? "active" : delivery?.configured ? "paused" : "not_configured"} label={delivery?.enabled ? "외부 발송 활성" : delivery?.configured ? "발송 안전 정지" : "SOLAPI 연결 필요"} />
          {(editing || dirty) && (
            <AdminButton
              type="button"
              size="sm" variant="outline"
              onClick={() => {
                setEditing(null);
                setDirty(false);
                setFormVersion(value=>value+1);
                setMessage("");
              }}
            >
              새로 등록
            </AdminButton>
          )}
        </div>
        {section === "templates" ? (
          <CrmTemplateFields key={formKey} editing={editing} />
        ) : section === "campaigns" ? (
          <div className="grid2 mt24">
            <Field label="캠페인 이름">
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={t(editing || undefined, "name")}
              />
            </Field>
            <Field label="템플릿">
              <select
                name="template_id"
                required
                defaultValue={String(editing?.template_id || "")}
              >
                <option value="">선택하세요</option>
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {named(item)} · {String(item.channel).toUpperCase()}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="대상 태그">
              <select
                name="target_tag_id"
                defaultValue={String(editing?.target_tag_id || "")}
              >
                <option value="">전체 활성 회원</option>
                {tags.map((item) => (
                  <option key={item.id} value={item.id}>
                    {named(item)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="예약 시각 (현재 기기 시간)">
              <input
                name="scheduled_at"
                type="datetime-local"
                required
                defaultValue={localDateTime(
                  editing?.scheduled_at || defaultSchedule,
                )}
              />
            </Field>
          </div>
        ) : (
          <>
            <div className="grid2 mt24">
              <Field label="자동화 이름">
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={t(editing || undefined, "name")}
                />
              </Field>
              <Field label="템플릿">
                <select
                  name="template_id"
                  required
                  defaultValue={String(editing?.template_id || "")}
                >
                  <option value="">선택하세요</option>
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {named(item)} · {String(item.channel).toUpperCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="실행 조건">
                <select
                  name="trigger_type"
                  defaultValue={
                    t(editing || undefined, "trigger_type") || "member_joined"
                  }
                >
                  <option value="member_joined">회원 가입</option>
                  <option value="marketing_consent">마케팅 수신 동의</option>
                  <option value="tag_assigned">태그 지정</option>
                  <option value="purchase_completed">결제 완료</option>
                </select>
              </Field>
              <Field label="지연 시간 (분)">
                <input
                  name="delay_minutes"
                  type="number"
                  min={0}
                  max={525600}
                  required
                  defaultValue={Number(editing?.delay_minutes || 0)}
                />
              </Field>
              <Field label="조건 태그 (태그 지정 시)">
                <select
                  name="trigger_tag_id"
                  defaultValue={String(editing?.trigger_tag_id || "")}
                >
                  <option value="">모든 태그</option>
                  {tags.map((item) => (
                    <option key={item.id} value={item.id}>
                      {named(item)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="조건 상품 (결제 완료 시)">
                <select
                  name="trigger_course_id"
                  defaultValue={String(editing?.trigger_course_id || "")}
                >
                  <option value="">모든 상품</option>
                  {courses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {named(item)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="checkline">
              <input
                name="is_active"
                type="checkbox"
                defaultChecked={Boolean(editing?.is_active)}
              />
              자동 실행 활성화
            </label>
          </>
        )}
        <p className="meta mt16">
          {editing?._followupKey
            ? "불러온 원본의 사본입니다. 사용 중지 상태로 저장되며 발송 대상·예약은 생성되지 않습니다."
            : section === "campaigns"
            ? "마케팅 템플릿은 수신 동의·활성 상태·정상 연락처를 모두 만족하는 회원에게만 발송되며, 캠페인 1회 대상은 최대 500명입니다."
            : selectedTemplate?.purpose === "marketing"
              ? "마케팅 수신 동의가 없는 회원은 자동 제외됩니다."
              : "발송 키가 없는 환경에서는 저장만 되고 외부 발송은 실행되지 않습니다."}
        </p>
        <AdminButton variant="primary" type="submit" className="mt24" loading={pending}>
          {section === "campaigns" ? "캠페인 예약" : "저장하기"}
        </AdminButton>
        <Status message={message} />
      </form>
      {section === "campaigns" && delivery?.configured && process.env.NEXT_PUBLIC_APP_ENV === "development" && (
        <div className="panel pad mb24">
          <h2>DEV 시험 발송</h2>
          <p className="meta mt8">
            설정된 시험번호에만 연결 확인 문자를 1건 보냅니다. 예약 캠페인과 자동 메시지 대기열은 실행하지 않습니다.
          </p>
          <AdminButton
            size="sm"
            variant="outline"
            className="mt16"
            disabled={testPending}
            onClick={async () => {
              setTestPending(true);
              setTestMessage("");
              try {
                const response = await fetch("/api/crm/test-send", { method: "POST" });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "시험 발송에 실패했습니다.");
                setTestMessage(`${result.recipient} 번호로 발송 접수했습니다. SOLAPI 발송 내역에서 최종 성공 여부를 확인해 주세요.`);
              } catch (error) {
                setTestMessage((error as Error).message);
              } finally {
                setTestPending(false);
              }
            }}
          >
            {testPending ? "발송 확인 중…" : "시험번호로 문자 1건 보내기"}
          </AdminButton>
          <Status message={testMessage} />
        </div>
      )}
      <AdminDataTable
        label={`${title} 목록`}
        rows={items}
        getRowId={item => item.id}
        columns={[
          { id: "name", header: "이름·내용", render: item => <div className="admin-crm-primary"><strong>{named(item)}</strong>{section === "templates" && <small title={t(item, "content")}>{t(item, "content")}</small>}{section === "campaigns" && <small>{item.recruitment_id ? "모집 연결 안내" : "일반 캠페인"}</small>}</div> },
          { id: "scope", header: section === "templates" ? "채널·목적" : section === "campaigns" ? "예약 시각" : "실행 조건", render: item => section === "templates" ? `${String(item.channel).toUpperCase()} · ${item.purpose === "marketing" ? "마케팅" : "정보성"}` : section === "campaigns" ? item.scheduled_at ? timeLabel(item.scheduled_at) : "예약 미정" : `${t(item, "trigger_type")} · ${Number(item.delay_minutes || 0)}분 후` },
          ...(section === "campaigns" ? [{ id: "delivery", header: "발송", render: (item: Row) => `대상 ${Number(item.recipient_count || 0)} · 성공 ${Number(item.success_count || 0)} · 실패 ${Number(item.failure_count || 0)}` }] : []),
          { id: "status", header: "상태", render: item => <AdminStatusBadge status={section === "campaigns" ? t(item, "status") : item.is_active ? "active" : "inactive"} label={section === "templates" && item.channel === "alimtalk" && (!item.is_active || !item.alimtalk_template_id) ? "준비 중 · 미발송" : section === "automations" ? item.is_active ? "자동 실행 중" : "중지" : undefined} /> },
          { id: "action", header: "관리", align: "action" as const, render: item => <AdminButton size="sm" variant="outline" disabled={section === "campaigns" && (!!item.recruitment_id || ["sending", "completed"].includes(t(item, "status")))} onClick={() => { setEditing(item); setDirty(false); setMessage(""); }}>수정</AdminButton> },
        ]}
        empty={<AdminEmptyState title={section === "templates" ? "등록된 메시지 템플릿이 없습니다." : section === "campaigns" ? "등록된 예약 캠페인이 없습니다." : "등록된 자동 메시지가 없습니다."} />}
      />
    </>
  );
}
function CohortTools({ data, send, pending }: Props) {
  const cohorts = rows(data, "cohorts");
  const [selected, setSelected] = useState("");
  const cohort = cohorts.find((c) => c.id === selected) || cohorts[0];
  const [session, setSession] = useState<Row | null>(null);
  const [mode, setMode] = useState<"schedule" | "clone">("schedule");
  const [message, setMessage] = useState("");
  const sessions = rows(data, "cohort_sessions")
    .filter((s) => s.cohort_id === cohort?.id)
    .sort((a, b) => Number(a.session_number) - Number(b.session_number));
  const content = rows(data, "cohort_session_contents").find(
    (c) => c.session_id === session?.id,
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      if (mode === "clone") {
        await send(
          {
            action: "clone-cohort",
            id: cohort?.id,
            name: f.get("name"),
            code: f.get("code"),
            shift: Number(f.get("shift")),
          },
          "새 기수를 복제했습니다. 회차 공개 여부와 입장 링크를 확인해 주세요.",
        );
        setMessage("기수를 복제했습니다.");
      } else {
        await send(
          {
            action: "session",
            id: session?.id,
            values: {
              cohort_id: cohort?.id,
              session_number: Number(f.get("session_number")),
              title: f.get("title"),
              description: f.get("description"),
              scheduled_at: f.get("scheduled_at")
                ? new Date(String(f.get("scheduled_at"))).toISOString()
                : null,
              is_public: f.get("is_public") === "on",
              live_url: f.get("live_url"),
              replay_url: f.get("replay_url"),
            },
          },
          "라이브 회차를 저장했습니다.",
        );
        setSession(null);
        setMessage("회차를 저장했습니다.");
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <section className="panel pad mb24">
      <div className="between">
        <h2>
          <CalendarDays size={20} /> 기수 운영
        </h2>
        <div className="flex gap8">
          <button
            className={"btn small " + (mode === "schedule" ? "primary" : "")}
            onClick={() => setMode("schedule")}
          >
            라이브 회차
          </button>
          <button
            className={"btn small " + (mode === "clone" ? "primary" : "")}
            onClick={() => setMode("clone")}
          >
            <Copy size={16} />
            기수 복제
          </button>
        </div>
      </div>
      <Field label="기수 선택">
        <select
          value={cohort?.id || ""}
          onChange={(e) => {
            setSelected(e.target.value);
            setSession(null);
            setMessage("");
          }}
        >
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {named(rows(data, "courses").find((p) => p.id === c.course_id))} ·{" "}
              {named(c)}
            </option>
          ))}
        </select>
      </Field>
      {cohort ? (
        <div className="grid2">
          <div>
            {sessions.map((s) => (
              <button
                type="button"
                key={s.id}
                className={
                  "workflow-list-button " +
                  (session?.id === s.id ? "selected" : "")
                }
                onClick={() => {
                  setSession(s);
                  setMode("schedule");
                  setMessage("");
                }}
              >
                <span>
                  <b>
                    {t(s, "session_number")}회 · {t(s, "title")}
                  </b>
                  <small>{timeLabel(s.scheduled_at)}</small>
                </span>
                <AdminStatusBadge status={s.is_public ? 'published' : 'hidden'} label={s.is_public ? '공개' : '비공개'}/>
              </button>
            ))}
            {!sessions.length && (
              <p className="muted">등록된 라이브 회차가 없습니다.</p>
            )}
            {mode === "schedule" && (
              <AdminButton className="mt16" onClick={() => setSession(null)}>
                <Plus size={16} />새 회차
              </AdminButton>
            )}
          </div>
          <form
            key={mode + cohort.id + (session?.id || "new")}
            onSubmit={submit}
          >
            {mode === "clone" ? (
              <>
                <h3>새 기수 정보</h3>
                <Field label="기수명">
                  <input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={named(cohort) + " 복사"}
                  />
                </Field>
                <Field label="새 기수 코드">
                  <input name="code" required maxLength={80} />
                </Field>
                <Field label="기존 일정에서 이동할 일수">
                  <input
                    name="shift"
                    type="number"
                    required
                    min={-3650}
                    max={3650}
                    defaultValue={30}
                  />
                </Field>
                <p className="meta">
                  모집·운영·라이브 날짜를 같은 일수만큼 이동합니다. 복제된
                  회차는 비공개이며, 입장·다시보기 주소는 새로 등록해 주세요.
                </p>
              </>
            ) : (
              <>
                <h3>{session ? "회차 수정" : "회차 등록"}</h3>
                <div className="grid2">
                  <Field label="회차 순서">
                    <input
                      name="session_number"
                      type="number"
                      min={1}
                      max={365}
                      required
                      defaultValue={
                        (session?.session_number as number) ||
                        Math.max(
                          0,
                          ...sessions.map((s) => Number(s.session_number)),
                        ) + 1
                      }
                    />
                  </Field>
                  <Field label="시작 일시 (현재 기기 시간)">
                    <input
                      name="scheduled_at"
                      type="datetime-local"
                      defaultValue={localDateTime(session?.scheduled_at)}
                    />
                  </Field>
                </div>
                <Field label="회차 제목">
                  <input
                    name="title"
                    required
                    maxLength={200}
                    defaultValue={t(session || undefined, "title")}
                  />
                </Field>
                <Field label="회차 안내">
                  <textarea
                    name="description"
                    rows={3}
                    maxLength={3000}
                    defaultValue={t(session || undefined, "description")}
                  />
                </Field>
                <Field label="라이브 입장 주소">
                  <input
                    name="live_url"
                    type="url"
                    defaultValue={t(content, "live_url")}
                  />
                </Field>
                <Field label="다시보기 주소">
                  <input
                    name="replay_url"
                    type="url"
                    defaultValue={t(content, "replay_url")}
                  />
                </Field>
                <label className="checkline">
                  <input
                    name="is_public"
                    type="checkbox"
                    defaultChecked={Boolean(session?.is_public)}
                  />{" "}
                  일정 공개
                </label>
                <p className="meta">
                  입장·다시보기 링크는 해당 기수의 수강 권한이 있는 회원에게
                  표시됩니다.
                </p>
              </>
            )}
            <AdminButton variant="primary" type="submit" className="mt16" loading={pending}>
              {mode === "clone" ? "새 기수 복제" : "회차 저장"}
            </AdminButton>
            <Status message={message} />
          </form>
        </div>
      ) : (
        <p className="muted">아래에서 먼저 기수를 등록해 주세요.</p>
      )}
    </section>
  );
}
function QuizManager(props: Props) {
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
  const pass = Number(current?.pass_percent || 100);
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
      <p className="meta mb16">
        정답은 운영자와 채점 서버에만 공개됩니다. 통과 기준은 기존 미션 설정을
        유지합니다.
      </p>
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
            <AdminButton
              size="sm"
              variant="outline"
              onClick={() =>
                setQuestions(questions.filter((_, i) => i !== index))
              }
            >
              <Trash2 size={16} />
              삭제
            </AdminButton>
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
        <AdminButton
          variant="outline"
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
        </AdminButton>
        <AdminButton variant="primary" type="submit" loading={pending}>
          {questions.length ? "퀴즈 저장" : "퀴즈 해제"}
        </AdminButton>
      </div>
      <Status message={message} />
    </form>
  );
}
function Participants() {
  const routeParams = useSearchParams();
  const [progressOpen, setProgressOpen] = useState(false);
  const [cohort, setCohort] = useState(routeParams.get('cohort') || "");
  const [search, setSearch] = useState(routeParams.get('search') || "");
  const [level, setLevel] = useState("");
  const [attention, setAttention] = useState(false);
  const [page, setPage] = useState(1);
  const [week, setWeek] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [localPage, setLocalPage] = useState(1);
  const [missionFilter, setMissionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<"priority" | "name" | "progress" | "missions">("priority");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const totalPageSize = 50;
  const params = new URLSearchParams({
    kind: "participants",
    cohort,
    search,
    level,
    attention: attention ? "1" : "0",
    page: String(page),
    week,
  });
  const { result, loading, error, retry } = useReport(
    "/api/platform/workflows?" + params,
  );
  const list = (result.rows || []) as Row[];
  const cohorts = (result.cohorts || []) as Row[];
  const stats = (result.stats || {}) as Record<string, number>;
  const weeks = (result.weeks || []) as Row[];
  const columns = (result.columns || []) as Row[];
  const matrix = (result.matrix || {}) as Record<
    string,
    {
      lessonId: string;
      status: string;
      submissionId: string | null;
      approved: number;
      total: number;
    }[]
  >;
  const cohortId = cohort || String(result.cohortId || "");
  const selectedCohort = cohorts.find((row) => row.id === cohortId);
  const weekId = week || String(result.weekId || "");
  const selectedWeek = weeks.find((row) => row.id === weekId);
  const lessonById = new Map(columns.map((lesson) => [String(lesson.id), lesson]));
  const cellLabels: Record<string, string> = {
    approved: "승인 완료",
    submitted: "검토 대기",
    changes_requested: "보완 요청",
    rejected: "반려",
    partial: "일부 승인",
    empty: "미제출",
    none: "필수 미션 미설정",
  };
  const memberCellsFor = (member: Row) => {
    const cells = matrix[String(member.id)] || [];
    return missionFilter ? cells.filter((cell) => cell.lessonId === missionFilter) : cells;
  };
  const memberStats = (member: Row) => {
    const cells = memberCellsFor(member);
    const total = cells.reduce((sum, cell) => sum + cell.total, 0);
    const submitted = cells.filter((cell) => cell.total > 0 && cell.status !== "empty" && cell.status !== "none").length;
    const review = cells.filter((cell) => cell.status === "submitted" && Boolean(cell.submissionId)).length;
    const followup = cells.filter((cell) => ["changes_requested", "rejected"].includes(cell.status) && Boolean(cell.submissionId)).length;
    const approved = cells.reduce((sum, cell) => sum + cell.approved, 0);
    const state = total === 0 ? "unconfigured" : review ? "review" : followup ? "followup" : submitted === 0 ? "missing" : approved === total ? "done" : submitted === total ? "submitted" : "progress";
    return { cells, total, submitted, review, followup, approved, state };
  };
  const stateLabels: Record<string, string> = { review: "검토 필요", missing: "미제출", followup: "재제출 필요", submitted: "제출 완료", done: "승인 완료", progress: "진행 중", unconfigured: "미션 미설정" };
  const rowStats = new Map(list.map((member) => [String(member.id), memberStats(member)]));
  const quickCounts = list.reduce<Record<string, number>>((counts, member) => {
    const state = rowStats.get(String(member.id))?.state || "unconfigured";
    counts[state] = (counts[state] || 0) + 1;
    return counts;
  }, {});
  const pendingSubmissionCount = list.reduce((sum, member) => sum + (rowStats.get(String(member.id))?.review || 0), 0);
  const submittedMemberCount = list.filter((member) => (rowStats.get(String(member.id))?.submitted || 0) > 0).length;
  const filteredList = list.filter((member) => {
    const state = rowStats.get(String(member.id))?.state;
    if (statusFilter === "all") return true;
    if (statusFilter === "missing") return state === "missing";
    if (statusFilter === "review") return state === "review";
    if (statusFilter === "followup") return state === "followup";
    if (statusFilter === "progress") return state === "progress" || state === "submitted" || state === "followup";
    return state === "done";
  }).toSorted((first, second) => {
    if (sortKey === "name") return t(first, "full_name").localeCompare(t(second, "full_name"), "ko");
    if (sortKey === "progress") return Number(t(second, "learning_percent")) - Number(t(first, "learning_percent"));
    if (sortKey === "missions") return Number(rowStats.get(String(second.id))?.submitted || 0) - Number(rowStats.get(String(first.id))?.submitted || 0);
    const priority = (member: Row) => ({ review: 0, followup: 1, missing: 2, progress: 3, submitted: 4, done: 5, unconfigured: 6 }[rowStats.get(String(member.id))?.state || "unconfigured"] ?? 7);
    return priority(first) - priority(second) || t(first, "full_name").localeCompare(t(second, "full_name"), "ko");
  });
  const localPageCount = Math.max(1, Math.ceil(Math.min(totalPageSize, filteredList.length) / pageSize));
  const displayRows = filteredList.slice((localPage - 1) * pageSize, localPage * pageSize);
  const selectedMember = list.find((member) => String(member.id) === selectedMemberId);
  const selectedStats = selectedMember ? memberStats(selectedMember) : null;
  const currentResultTotal = Number(result.total || 0);
  const displayedStart = filteredList.length ? (page - 1) * totalPageSize + (localPage - 1) * pageSize + 1 : 0;
  const displayedEnd = Math.min((page - 1) * totalPageSize + localPage * pageSize, (page - 1) * totalPageSize + filteredList.length);
  const changeServerFilter = () => { setPage(1); setLocalPage(1); };
  const changeWeek = (value: string) => { setWeek(value); setMissionFilter(""); setStatusFilter("all"); changeServerFilter(); };
  const selectReview = (member: Row) => {
    const cells = rowStats.get(String(member.id))?.cells || memberStats(member).cells;
    const target = cells.find((cell) => cell.submissionId && ["submitted", "changes_requested", "rejected"].includes(cell.status)) || cells.find((cell) => cell.submissionId);
    return target?.submissionId ? `/admin/reviews?submission=${encodeURIComponent(target.submissionId)}` : "";
  };
  const setupHref = `/admin/missions?course=${encodeURIComponent(t(selectedCohort, "course_id"))}&week=${encodeURIComponent(weekId)}`;
  const openMember = (memberId: string, trigger?: HTMLElement) => {
    trigger?.focus();
    setSelectedMemberId(memberId);
  };
  const closeMember = () => setSelectedMemberId("");
  return (
    <>
      {process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true' && <>
        <AdminButton className="mb16" aria-expanded={progressOpen} onClick={() => setProgressOpen(value => !value)}>과정별 진도 {progressOpen ? '접기' : '보기'}</AdminButton>
        {progressOpen && <AdminLearningProgress key={cohortId} cohort={cohortId}/>}
      </>}
      <AdminFilterBar className="admin-pilot-filter admin-pilot-member-filter"
        filters={<><AdminSelect label="조회 기수" labelHidden
          value={cohortId}
          onChange={(e) => {
            setCohort(e.target.value);
            setWeek("");
            changeServerFilter();
          }}
        >
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {t(c, "course_title")} · {t(c, "name")}
            </option>
          ))}
        </AdminSelect>
        <AdminSelect label="미션 현황 주차" labelHidden value={weekId} onChange={(event) => changeWeek(event.target.value)}>
          {weeks.map((row) => <option key={row.id} value={row.id}>{t(row, "week")}주차 · {t(row, "title")}</option>)}
        </AdminSelect>
        <AdminSelect label="미션 필터" labelHidden value={missionFilter} onChange={(event) => { setMissionFilter(event.target.value); setLocalPage(1); }}>
          <option value="">전체 미션</option>
          {columns.map((lesson) => <option key={lesson.id} value={lesson.id}>Day {t(lesson, "day_number")} · {t(lesson, "title")}</option>)}
        </AdminSelect>
        <AdminSelect label="회원 미션 상태 필터" labelHidden value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setLocalPage(1); }}>
          <option value="all">전체 상태</option><option value="review">검토 필요</option><option value="followup">재제출 필요</option><option value="missing">미제출</option><option value="progress">진행 중</option><option value="done">완료</option>
        </AdminSelect>
        <AdminSelect label="레벨 필터" labelHidden value={level} onChange={(e) => { setLevel(e.target.value); changeServerFilter(); }}>
          <option value="">전체 레벨</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>LEVEL {n}</option>)}
        </AdminSelect></>}
        search={<AdminSearchField
          placeholder="회원 이름 또는 이메일 검색"
          label="회원 검색"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            changeServerFilter();
          }}
        />}
        action={<AdminCheckbox label="3일 이상 활동 없음"
            checked={attention}
            onChange={(e) => { setAttention(e.target.checked); changeServerFilter(); }}
          />}
        appliedSummary="회원 검색·레벨·활동은 서버 조회 기준, 미션·상태는 현재 조회한 회원 기준"
      />
      <div className="participant-context" aria-live="polite">
        <strong>{t(selectedCohort, "course_title")} · {t(selectedCohort, "name")}</strong>
        <span>{selectedWeek ? `${t(selectedWeek, "week")}주차 · ${t(selectedWeek, "title")}` : "주차 미설정"}</span>
      </div>
      <div className="admin-pilot-summary" aria-label="회원 미션 요약">
        <AdminSummaryCard compact label="전체 회원" value={`${Number(stats.participants || 0)}명`} scope="현재 기수 · 서버 집계" />
        <AdminSummaryCard compact label="제출 회원" value={`${submittedMemberCount}명`} scope="현재 조회" />
        <AdminSummaryCard compact label="검토 필요" value={`${pendingSubmissionCount}건`} scope="현재 조회" />
        <AdminSummaryCard compact label="미제출" value={`${quickCounts.missing || 0}명`} scope="현재 조회" />
      </div>
      <div className="admin-pilot-quick-row">
        <AdminQuickFilter label="빠른 상태 필터" value={statusFilter} onChange={value => { setStatusFilter(value); setLocalPage(1); }} items={[
          { value: "all", label: "전체", count: list.length }, { value: "review", label: "검토 필요", count: quickCounts.review || 0 }, { value: "missing", label: "미제출", count: quickCounts.missing || 0 },
          { value: "progress", label: "진행 중", count: (quickCounts.progress || 0) + (quickCounts.submitted || 0) + (quickCounts.followup || 0) }, { value: "done", label: "완료", count: quickCounts.done || 0 },
        ]} />
        <span className="participant-quick-note">현재 조회한 회원 기준</span>
      </div>
      {error ? (
        <div className="notice">
          {error}
          <AdminButton size="sm" onClick={retry}>
            다시 시도
          </AdminButton>
        </div>
      ) : (
        <div className="admin-pilot-workspace" aria-busy={loading}>
          <div className="participant-table-toolbar">
            <span>{filteredList.length}명 표시 · 전체 {currentResultTotal}명</span>
            <label>정렬 <select aria-label="회원 정렬" value={sortKey} onChange={(event) => setSortKey(event.target.value as typeof sortKey)}><option value="priority">처리 우선순</option><option value="name">이름순</option><option value="progress">학습진도순</option><option value="missions">미션 제출순</option></select></label>
          </div>
          {loading ? <div className="participant-table-skeleton" role="status" aria-label="회원 현황 불러오는 중">{Array.from({ length: 6 }, (_, index) => <div key={index}><span /><span /><span /><span /><span /></div>)}</div> : (
          <><AdminDataTable label="회원별 미션 현황 표" density="standard">
            <thead><tr>
              <th aria-sort={sortKey === "name" ? "ascending" : undefined}><button type="button" onClick={() => setSortKey("name")}>회원</button></th>
              <th aria-sort={sortKey === "progress" ? "descending" : undefined}><button type="button" onClick={() => setSortKey("progress")}>학습진도</button></th>
              <th aria-sort={sortKey === "missions" ? "descending" : undefined}><button type="button" onClick={() => setSortKey("missions")}>미션 진행</button></th>
              <th>제출</th><th>검토 필요</th><th>최근 활동</th><th>상태</th><th>관리</th>
            </tr></thead>
            <tbody>
          {displayRows.map((r) => {
            const memberId = String(r.id);
            const statsForMember = rowStats.get(memberId) || memberStats(r);
            const reviewHref = selectReview(r);
            const manageHref = ["review", "followup", "submitted", "done"].includes(statsForMember.state) ? reviewHref : statsForMember.state === "missing" || statsForMember.state === "unconfigured" ? setupHref : "";
            const manageLabel = statsForMember.state === "review" ? "검토하기" : statsForMember.state === "followup" ? "재제출 확인" : statsForMember.state === "missing" || statsForMember.state === "unconfigured" ? "미션 설정하기" : statsForMember.state === "submitted" || statsForMember.state === "done" ? "제출물 보기" : "상세보기";
            return (
              <tr key={memberId} className={`participant-table-row ${statsForMember.state === "review" ? "needs-review" : ""}`} tabIndex={0} aria-label={`${t(r, "full_name") || "회원"}, ${stateLabels[statsForMember.state]}`} onClick={(event) => openMember(memberId, event.currentTarget)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openMember(memberId, event.currentTarget); } }}>
                <td><button type="button" className="participant-member-link" onClick={(event) => openMember(memberId, event.currentTarget.closest("tr") as HTMLElement)}><strong>{t(r, "full_name") || "회원"}</strong><span>{t(r, "email") || "이메일 정보 없음"}</span></button></td>
                <td><span className="participant-table-progress">{Number(t(r, "learning_percent") || 0)}%</span></td>
                <td>{statsForMember.total ? `${statsForMember.approved}/${statsForMember.total}` : "—"}</td>
                <td>{statsForMember.submitted}</td>
                <td>{statsForMember.review ? <span className="participant-review-count">{statsForMember.review}</span> : "—"}</td>
                <td className="participant-last-activity" title={r.last_activity ? timeLabel(r.last_activity) : "활동 기록 없음"}>{r.last_activity ? timeLabel(r.last_activity) : "활동 없음"}</td>
                <td><AdminStatusBadge status={statsForMember.state} label={stateLabels[statsForMember.state]} tone={statsForMember.state === "review" || statsForMember.state === "unconfigured" || statsForMember.state === "followup" ? "warning" : statsForMember.state === "done" ? "success" : statsForMember.state === "progress" || statsForMember.state === "submitted" ? "info" : "neutral"} /></td>
                <td>{manageHref ? <Link className={`participant-row-action ${statsForMember.state === "review" ? "primary" : ""}`} href={manageHref} onClick={(event) => event.stopPropagation()}>{manageLabel}</Link> : <button type="button" className="participant-row-action" onClick={(event) => { event.stopPropagation(); openMember(memberId, event.currentTarget); }}>{manageLabel}</button>}</td>
              </tr>
            );
          })}
            </tbody>
          </AdminDataTable>
          {!filteredList.length && <div className="participant-table-empty">조건에 맞는 회원이 없습니다. 검색어나 상태 필터를 조정해 주세요.</div>}</>
          )}
          <div className="participant-pagination">
            <label>페이지당 <select aria-label="페이지당 회원 수" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setLocalPage(1); }}><option value={20}>20명</option><option value={50}>50명</option></select></label>
            <span>{displayedStart}–{displayedEnd} / {currentResultTotal}명</span>
            <div>
              <AdminButton size="sm" disabled={loading || page === 1 && localPage === 1} onClick={() => { if (localPage > 1) setLocalPage(localPage - 1); else { setPage(page - 1); setLocalPage(1); } }}>이전</AdminButton>
              <AdminButton size="sm" disabled={loading || page * totalPageSize >= currentResultTotal && localPage >= localPageCount} onClick={() => { if (localPage < localPageCount) setLocalPage(localPage + 1); else { setPage(page + 1); setLocalPage(1); } }}>다음</AdminButton>
            </div>
          </div>
        </div>
      )}
      {selectedMember && selectedStats && <AdminDrawer title={t(selectedMember, "full_name") || "회원"} onClose={closeMember} size="large">
          <div className="admin-dialog-body participant-drawer-body">
            <p className="meta">{t(selectedMember, "email") || "이메일 정보 없음"}</p>
            <div className="participant-drawer-summary"><div><span>학습 진도</span><strong>{Number(t(selectedMember, "learning_percent") || 0)}%</strong></div><div><span>선택 주차 미션</span><strong>{selectedStats.approved} / {selectedStats.total}</strong></div></div>
            <div className="participant-drawer-week"><strong>{t(selectedWeek, "week")}주차 · {t(selectedWeek, "title")}</strong><span>필수 미션의 최신 제출 상태</span></div>
            <div className="participant-drawer-missions">
              {selectedStats.cells.map((cell) => {
                const lesson = lessonById.get(cell.lessonId);
                const state = cell.status === "none" ? "unconfigured" : cell.status === "empty" ? "missing" : cell.status === "submitted" ? "review" : ["changes_requested", "rejected"].includes(cell.status) ? "followup" : cell.status === "approved" ? "done" : "progress";
                const label = cell.total === 0 ? "필수 미션 미설정" : cellLabels[cell.status] || "상태 확인 필요";
                return <article key={cell.lessonId} className="participant-drawer-mission">
                  <div className="participant-drawer-mission-copy"><span>Day {t(lesson, "day_number") || "—"}</span><strong title={t(lesson, "title")}>{t(lesson, "title") || "학습 제목 없음"}</strong><small>{cell.total > 0 ? `필수 미션 · ${cell.approved}/${cell.total} 승인` : "운영자가 미션을 등록해야 합니다."}</small></div>
                  <AdminStatusBadge status={state} label={label} tone={state === "review" || state === "followup" || state === "unconfigured" ? "warning" : state === "done" ? "success" : state === "progress" ? "info" : "neutral"} />
                  {cell.submissionId && <Link className={`participant-row-action ${state === "review" || state === "followup" ? "primary" : ""}`} href={`/admin/reviews?submission=${encodeURIComponent(cell.submissionId)}`}>{state === "review" ? "제출물 검토" : state === "followup" ? "재제출 확인" : "제출물 보기"}</Link>}
                  {!cell.submissionId && cell.total === 0 && <Link className="participant-row-action" href={setupHref}>미션 설정하기</Link>}
                  {!cell.submissionId && cell.total > 0 && cell.status === "empty" && <Link className="participant-row-action" href={setupHref}>미션 설정하기</Link>}
                </article>;
              })}
              {!selectedStats.cells.length && <p className="participant-table-empty">선택한 주차에 표시할 미션이 없습니다.</p>}
            </div>
            {Boolean(selectedMember.user_id) && <Link className="participant-member-admin-link" href={`/admin/customers?member=${encodeURIComponent(t(selectedMember, "user_id"))}`}>회원 운영 정보 보기</Link>}
          </div>
      </AdminDrawer>}
    </>
  );
}
function CustomerActions({ data, selection = [], send, pending }: Props) {
  const [kind, setKind] = useState("tag");
  const [target, setTarget] = useState("");
  const [remove, setRemove] = useState(false);
  const [message, setMessage] = useState("");
  const available =
    kind === "tag"
      ? rows(data, "crm_tags").filter((t) => t.tag_kind === "manual")
      : rows(data, "coupons").filter((c) => c.is_active);
  async function assign(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await send(
        {
          action: "assign",
          ids: selection,
          kind,
          targetId: target,
          remove: kind === "tag" && remove,
        },
        "회원에게 적용했습니다.",
      );
      setMessage(
        `${String(r.result || 0)}건 반영했습니다. ${kind === "coupon" ? "이미 지급한 쿠폰은 중복 지급하지 않습니다." : remove ? "태그를 해제했습니다." : "태그를 지정했습니다."}`,
      );
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <form className="panel pad mb24" onSubmit={assign}>
      <h3>선택 회원 {selection.length}명 · 태그 및 쿠폰</h3>
      <div className="toolbar mt16">
        <select
          aria-label="회원 적용 작업"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setTarget("");
            setRemove(false);
          }}
        >
          <option value="tag">태그 지정</option>
          <option value="coupon">쿠폰 지급</option>
        </select>
        <select
          aria-label="적용 대상"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          required
        >
          <option value="">선택하세요</option>
          {available.map((r) => (
            <option key={r.id} value={r.id}>
              {named(r)}
            </option>
          ))}
        </select>
        {kind === "tag" && (
          <label className="checkline">
            <input
              type="checkbox"
              checked={remove}
              onChange={(e) => setRemove(e.target.checked)}
            />
            태그 해제
          </label>
        )}
        <AdminButton
          variant="primary"
          type="submit"
          disabled={pending || !selection.length || selection.length > 50}
        >
          선택 회원에 적용
        </AdminButton>
      </div>
      <p className="meta">
        목록에서 활성 회원을 최대 50명까지 선택하세요. 자동 태그는 구매·수강
        상태에 따라 갱신됩니다.
      </p>
      <Status message={message} />
    </form>
  );
}
function SettingsForm({ section, data, send, pending }: Props) {
  const key = section === "seo" ? "edu_seo" : "edu_operations";
  const initial = object(
    rows(data, "site_settings").find((r) => r.key === key),
    "value",
  );
  const [message, setMessage] = useState("");
  const [seoTab, setSeoTab] = useState<'search' | 'verification' | 'measurement'>('search');
  const [codeOpen, setCodeOpen] = useState(false);
  const [seoDraft, setSeoDraft] = useState(() => ({
    title: String(initial.title || 'BrandyAction EDU | 배운 것을, 내 일의 성과로.'),
    description: String(initial.description || 'AI와 마케팅을 배우고 내 업무에 적용하는 실행 중심 교육.'),
    googleVerification: String(initial.googleVerification || ''),
    naverVerification: String(initial.naverVerification || ''),
  }));
  const [metric, setMetric] = useState<Row | null>(null);
  const [paymentDays, setPaymentDays] = useState<{ day: number; count: number }[]>([{ day: 0, count: 0 }]);
  const measurementCodesValue = object(rows(data, "site_settings").find(row => row.key === "edu_measurement_codes"), "value");
  const measurementCodes = Array.isArray(measurementCodesValue.items) ? measurementCodesValue.items.filter(item => item && typeof item === "object") as Row[] : [];
  const metrics = rows(data, "site_settings")
    .filter((r) => t(r, "key").startsWith("edu_metric_"))
    .sort((a, b) =>
      String(object(b, "value").date).localeCompare(
        String(object(a, "value").date),
      ),
    );
  async function saveMeasurementCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await send({ action: "measurement-code", values: { name: form.get("name"), location: form.get("location"), scope: form.get("scope"), code: form.get("code"), purpose: form.get("purpose"), confirmed: form.get("confirmed") === "on" } }, "추가 코드를 초안으로 저장했습니다.");
      setCodeOpen(false);
      setMessage("추가 코드 초안을 저장했습니다.");
    } catch (error) { setMessage((error as Error).message); }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values = Object.fromEntries(f.entries()) as Record<string, unknown>;
    if (section === 'seo' && !String(values.title || '').trim()) {
      setSeoTab('search');
      setMessage('사이트 제목을 입력해 주세요.');
      return;
    }
    if (section === "settings")
      values.trackingEnabled = f.get("trackingEnabled") === "on";
    if (section === "metrics") {
      for (const key of ["spend", "impressions", "clicks", "leads", "revenue", "livePeak"])
        values[key] = Number(f.get(key) || 0);
      values.paymentDays = paymentDays;
    }
    try {
      await send(
        { action: "settings", kind: section, values },
        "설정을 반영했습니다.",
      );
      setMessage("저장했습니다.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const value =
    section === "metrics" ? object(metric || undefined, "value") : initial;
  return (
    <>
      {section === 'seo' && <nav className="tabs catalog-tabs seo-settings-tabs" aria-label="검색코드 설정 탭">
        {([['search', '검색·공유'], ['verification', '소유 확인'], ['measurement', '측정·추가 코드']] as const).map(([tab, label]) => <button key={tab} type="button" className={seoTab === tab ? 'tab active' : 'tab'} aria-pressed={seoTab === tab} onClick={() => setSeoTab(tab)}>{label}</button>)}
      </nav>}
      {section === 'settings' && process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true' && <><AppBrandingEditor/><LearningNoticeEditor/><MvpEditor name="미리보기"/></>}
      <div className={section === 'metrics' ? 'stack metrics-data-layout' : section === 'seo' && seoTab !== 'search' ? 'stack seo-settings-layout' : 'settings-layout'}>
        <form
          key={section + String(metric?.key || "new")}
          className="panel pad"
          onSubmit={submit}
        >
          {section === "seo" ? (
            <>
              <div hidden={seoTab !== 'search'}>
              <h2>사이트 기본 검색 정보</h2>
              <Field label="사이트 제목">
                <input
                  name="title"
                  required={seoTab === 'search'}
                  maxLength={200}
                  value={seoDraft.title}
                  onChange={e => setSeoDraft(previous => ({ ...previous, title: e.target.value }))}
                />
              </Field>
              <Field label="사이트 설명">
                <textarea
                  name="description"
                  rows={3}
                  maxLength={500}
                  value={seoDraft.description}
                  onChange={e => setSeoDraft(previous => ({ ...previous, description: e.target.value }))}
                />
              </Field>
              <Field label="사이트 대표 주소"><input value="https://brandyaction-edu.com" readOnly /></Field>
              <p className="notice mt16">운영 사이트의 공개 페이지는 검색에 노출됩니다. 관리자·학습실·회원 화면과 DEV 사이트는 검색에서 제외됩니다.</p>
              </div>
              <div hidden={seoTab !== 'verification'}>
              <h2>사이트 소유 확인</h2>
              <p className="meta mt16">검색엔진에서 발급받은 인증 메타 태그의 content 값만 입력해 주세요.</p>
              <div className="grid2">
                <Field label="Google 사이트 소유권 확인 코드">
                  <input
                    name="googleVerification"
                    maxLength={200}
                    value={seoDraft.googleVerification}
                    placeholder="인증 메타 태그의 content 값"
                    onChange={e => setSeoDraft(previous => ({ ...previous, googleVerification: e.target.value }))}
                  />
                </Field>
                <Field label="네이버 사이트 소유권 확인 코드">
                  <input
                    name="naverVerification"
                    maxLength={200}
                    value={seoDraft.naverVerification}
                    placeholder="인증 메타 태그의 content 값"
                    onChange={e => setSeoDraft(previous => ({ ...previous, naverVerification: e.target.value }))}
                  />
                </Field>
              </div>
              <p className="meta">
                저장한 인증 값은 사이트 메타 태그에 반영됩니다. 소유 확인 완료 여부는 Google Search Console 또는 네이버 서치어드바이저에서 확인하세요.
              </p>
              </div>
              {seoTab === 'measurement' && <>
                <div className="between wrap-flex"><div><h2>측정·추가 코드 관리</h2><p className="meta mt8">방문 기록과 무료클래스 광고 측정, 검토 전 추가 코드 초안을 관리합니다.</p></div><AdminButton variant="primary" type="button" onClick={() => setCodeOpen(true)}>+ 추가 코드</AdminButton></div>
                <AdminDataTable className="mt24" label="측정·추가 코드 목록"><thead><tr><th>항목</th><th>적용 범위</th><th>관리</th></tr></thead><tbody>
                  <tr><td><strong>공개 페이지 방문 기록</strong><p className="meta">방문·아티클·클래스 조회와 신청 버튼 클릭</p></td><td>사이트 공개 페이지</td><td><AdminLinkButton size="sm" href="/admin/settings">운영·트래킹 설정</AdminLinkButton></td></tr>
                  <tr><td><strong>무료클래스 픽셀·이벤트</strong><p className="meta">클래스별 CTA와 광고 이벤트 측정</p></td><td>선택한 무료클래스</td><td><AdminLinkButton size="sm" href="/admin/landing">무료클래스 트래킹</AdminLinkButton></td></tr>
                  {measurementCodes.map(code => <tr key={code.id}><td><strong>{t(code, "name")}</strong><p className="meta">{t(code, "purpose")}</p></td><td>{code.scope === "public" ? "사이트 공개 페이지" : "랜딩페이지만"} · {code.location === "body-end" ? "Body 끝" : "Head"}</td><td><AdminStatusBadge status="draft" label="초안" tone="warning" /></td></tr>)}
                </tbody></AdminDataTable>
                <p className="notice mt24">추가 코드는 초안으로만 저장되며 이 화면이나 고객 페이지에서 실행되지 않습니다. 검토·테스트·승인 후 별도 개발 단계에서 적용합니다.</p>
              </>}
            </>
          ) : section === "settings" ? (
            <>
              <h2>문의 채널과 방문 기록</h2>
              <Field label="문의 이메일">
                <input
                  type="email"
                  name="supportEmail"
                  maxLength={200}
                  defaultValue={String(value.supportEmail || "")}
                />
              </Field>
              <Field label="고객센터 주소">
                <input
                  type="url"
                  name="supportUrl"
                  maxLength={200}
                  placeholder="https://"
                  defaultValue={String(value.supportUrl || "")}
                />
              </Field>
              <label className="checkline">
                <input
                  type="checkbox"
                  name="trackingEnabled"
                  defaultChecked={value.trackingEnabled === true}
                />
                방문·아티클·클래스 조회와 신청 버튼 클릭 수집
              </label>
              <p className="meta mt16">
                활성화 이후의 공개 페이지 활동을 랜딩 성과에서 확인합니다.
                회원정보·학습실·결제 식별자가 포함된 주소는 기록하지 않습니다.
              </p>
            </>
          ) : (
            <>
              {metric && (
                <div className="between metrics-edit-actions">
                  <AdminStatusBadge status="info" label="선택 기록 수정 중" tone="info"/>
                  <AdminButton
                    size="sm"
                    onClick={() => { setMetric(null); setPaymentDays([{ day: 0, count: 0 }]); }}
                  >
                    새 기록
                  </AdminButton>
                </div>
              )}
              <div className="grid2">
                <Field label="기준일">
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={String(
                      value.date || new Date().toISOString().slice(0, 10),
                    )}
                    readOnly={Boolean(metric)}
                  />
                </Field>
                <Field label="캠페인명">
                  <input
                    name="campaign"
                    required
                    maxLength={200}
                    defaultValue={String(value.campaign || "")}
                    readOnly={Boolean(metric)}
                  />
                </Field>
                {[
                  ["spend", "광고비 (원)"],
                  ["impressions", "노출 수"],
                  ["clicks", "클릭 수"],
                  ["leads", "문의·신청 수"],
                  ["revenue", "확인한 매출 (원)"],
                  ["livePeak", "라이브 최대 동시시청"],
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      name={key}
                      type="number"
                      min={0}
                      step={1}
                      required
                      defaultValue={Number(value[key] || 0)}
                    />
                  </Field>
                ))}
                <section className="span2 metric-payment-group"><div className="between"><div><h3>일차별 결제 건수</h3><p className="meta">마감 일정에 맞춰 필요한 일차만 추가하세요.</p></div><button className="btn small" type="button" onClick={() => setPaymentDays(rows => [...rows, { day: Math.max(-1, ...rows.map(row => row.day)) + 1, count: 0 }])} disabled={paymentDays.length >= 31}>+ 일차 추가</button></div><div className="metric-payment-table"><div className="metric-payment-head"><span>결제 일차</span><span>결제 건수</span><span>관리</span></div>{paymentDays.map((row, index) => <div className="metric-payment-row" key={`${row.day}-${index}`}><label><span className="sr-only">결제 일차</span><select aria-label={`${index + 1}번째 결제 일차`} value={row.day} onChange={event => setPaymentDays(current => current.map((item, i) => i === index ? { ...item, day: Number(event.target.value) } : item))}>{Array.from({ length: 366 }, (_, day) => <option value={day} key={day}>{day === 0 ? "당일" : `${day}일차`}</option>)}</select></label><label><span className="sr-only">결제 건수</span><input aria-label={`${row.day === 0 ? "당일" : `${row.day}일차`} 결제 건수`} type="number" min={0} step={1} value={row.count} onChange={event => setPaymentDays(current => current.map((item, i) => i === index ? { ...item, count: Number(event.target.value) } : item))} /></label><button className="icon-btn" type="button" aria-label={`${row.day === 0 ? "당일" : `${row.day}일차`} 행 삭제`} onClick={() => setPaymentDays(current => current.length === 1 ? current : current.filter((_, i) => i !== index))} disabled={paymentDays.length === 1}><Trash2 /></button></div>)}</div></section>
                <div className="span2">
                  <Field label="메모">
                    <textarea name="memo" rows={4} maxLength={1000} defaultValue={String(value.memo || "")} placeholder="라이브 운영·결제 성과와 관련된 메모를 입력하세요." />
                  </Field>
                </div>
              </div>
              <p className="meta">
                같은 날짜·캠페인을 저장하면 기존 실측 기록을 수정합니다.
              </p>
            </>
          )}
          {(section !== 'seo' || seoTab !== 'measurement') && <AdminButton variant="primary" type="submit" className="mt24" loading={pending}>
            {section === 'seo' ? seoTab === 'verification' ? '인증 값 저장' : '검색 정보 저장' : '변경사항 저장'}
          </AdminButton>}
          <Status message={message} />
        </form>
        {section !== 'metrics' && (section !== 'seo' || seoTab === 'search') && <aside className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>
                {section === "seo"
                  ? "검색 노출 미리보기"
                  : "운영 설정 안내"}
              </h2>
            </div>
            <div className="panel-body">
              {section === "seo" ? (
                <div className="snippet">
                  <div className="snippet-url">brandyaction-edu.com</div>
                  <h3>{seoDraft.title || 'BrandyAction EDU'}</h3>
                  <p>
                    {seoDraft.description || '사이트 설명을 입력해 주세요.'}
                  </p>
                </div>
              ) : (
                <>
                  <h3>
                    저장 후 실제 서비스에 적용됩니다.
                  </h3>
                  <p className="meta mt16">
                    문의 채널과 공개 페이지 활동 수집 여부를 설정합니다. 비공개 학습·회원정보는 방문 기록에 포함하지 않습니다.
                  </p>
                </>
              )}
            </div>
          </section>
        </aside>}
      </div>
      {codeOpen && <AdminDrawer title="추가 코드 초안" onClose={() => setCodeOpen(false)}>
        <form className="admin-settings-drawer-form" onSubmit={saveMeasurementCode}>
          <div className="admin-dialog-body">
            <Field label="코드 이름 *"><input name="name" required maxLength={100} placeholder="용도를 알 수 있는 이름" /></Field>
            <div className="grid2">
              <Field label="삽입 위치"><select name="location" defaultValue="head"><option value="head">Head</option><option value="body-end">Body 끝</option></select></Field>
              <Field label="적용 범위"><select name="scope" defaultValue="landing"><option value="landing">랜딩페이지만</option><option value="public">사이트 공개 페이지</option></select></Field>
            </div>
            <Field label="코드 원문 *"><textarea name="code" required maxLength={20000} rows={12} spellCheck={false} placeholder="검토할 코드 입력 · 저장만 되며 실행되지 않습니다." /></Field>
            <Field label="등록 목적·책임자 *"><input name="purpose" required maxLength={300} placeholder="측정 목적 / 운영 책임자" /></Field>
            <label className="checkline"><input name="confirmed" type="checkbox" required />기존 픽셀 중복·개인정보 전송·적용 권한 확인</label>
            <p className="notice mt16">입력한 코드는 텍스트로만 취급합니다. 운영 적용은 검토·테스트·승인 이후 별도 개발 단계입니다.</p>
          </div>
          <footer className="admin-dialog-footer"><AdminButton variant="outline" type="button" onClick={() => setCodeOpen(false)}>취소</AdminButton><AdminButton variant="primary" type="submit" loading={pending}>입력 내용 확인</AdminButton></footer>
        </form>
      </AdminDrawer>}
      {section === "metrics" && (
        <AdminDataTable className="mt24" label="실측 데이터 목록">
            <thead>
              <tr>
                {[
                  "날짜 · 캠페인",
                  "광고비",
                  "클릭률",
                  "클릭당 비용",
                  "ROAS",
                  "최대 동시시청",
                  "일차별 결제",
                  "메모",
                  "관리",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => {
                const v = object(m, "value");
                return (
                  <tr key={String(m.key)}>
                    <td data-label="날짜 · 캠페인">
                      {String(v.date)}
                      <small>{String(v.campaign)}</small>
                    </td>
                    <td data-label="광고비">{money(Number(v.spend || 0))}</td>
                    <td data-label="클릭률">
                      {Number(v.impressions) > 0
                        ? (
                            (Number(v.clicks) * 100) /
                            Number(v.impressions)
                          ).toFixed(2) + "%"
                        : "—"}
                    </td>
                    <td data-label="클릭당 비용">
                      {Number(v.clicks) > 0
                        ? money(Math.round(Number(v.spend) / Number(v.clicks)))
                        : "—"}
                    </td>
                    <td data-label="ROAS">
                      {Number(v.spend) > 0
                        ? ((Number(v.revenue) * 100) / Number(v.spend)).toFixed(
                            1,
                          ) + "%"
                        : "—"}
                    </td>
                    <td data-label="최대 동시시청">{Number(v.livePeak || 0)}명</td>
                    <td data-label="일차별 결제"><div className="metric-payment-summary">{((Array.isArray(v.paymentDays) ? v.paymentDays : [0,1,2,3,4].map(day => ({ day, count: Number(v[`paymentsDay${day}`] || 0) }))) as Array<{ day: number; count: number }>).map(entry => <span key={entry.day}><b>{Number(entry.day) === 0 ? "당일" : `${entry.day}일차`}</b>{Number(entry.count || 0)}건</span>)}</div></td>
                    <td data-label="메모"><span className="metric-note-cell">{String(v.memo || "—")}</span></td>
                    <td data-label="관리">
                      <div className="row"><AdminButton
                        size="sm" variant="outline"
                        onClick={() => {
                          setMetric(m);
                          const value = object(m, "value");
                          const legacy = [0, 1, 2, 3, 4].map(day => ({ day, count: Number(value[`paymentsDay${day}`] || 0) }));
                          const saved = Array.isArray(value.paymentDays) ? value.paymentDays as { day: number; count: number }[] : legacy;
                          setPaymentDays(saved.length ? saved.map(row => ({ day: Number(row.day), count: Number(row.count) })) : [{ day: 0, count: 0 }]);
                          setMessage("");
                        }}
                      >
                        수정
                      </AdminButton><AdminButton size="sm" variant="danger" aria-label={`${String(v.campaign)} 실측 기록 삭제`} disabled={pending} onClick={async () => { if (!window.confirm(`${String(v.date)} · ${String(v.campaign)} 실측 기록을 삭제할까요?`)) return; await send({ action: "delete-metric", key: m.key }, "실측 기록을 삭제했습니다."); if (metric?.key === m.key) setMetric(null); }}><Trash2 size={16} aria-hidden="true" /></AdminButton></div>
                    </td>
                  </tr>
                );
              })}
              {!metrics.length && <tr><td colSpan={9}><AdminEmptyState compact title="저장된 실측 기록이 없습니다." /></td></tr>}
            </tbody>
        </AdminDataTable>
      )}
    </>
  );
}
function Analytics() {
  const [from, setFrom] = useState(() =>
    new Date(Date.now() + 9 * 3600000 - 29 * 86400000).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(() => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
  const end = Number.isFinite(Date.parse(to))
    ? new Date(Date.parse(to) + 86400000).toISOString()
    : "";
  const { result, error, loading, retry } = useReport(
    "/api/platform/workflows?" +
      new URLSearchParams({
        kind: "analytics",
        from: from ? from + "T00:00:00+09:00" : "",
        to: end ? new Date(Date.parse(end) - 9 * 3600000).toISOString() : "",
      }),
  );
  const stages = (result.stages || {}) as Record<string, number>;
  const paths = (result.paths || []) as Row[];
  const empty = !Number(result.visitors) && !Number(result.events) && !Number(result.paidOrders) && !Number(result.revenue) && !paths.length && !Object.values(stages).some(Number);
  return (
    <>
      <AdminFilterBar date={<><AdminDatePicker label="시작일 (한국 시간)" value={from} onChange={event => setFrom(event.target.value)} /><AdminDatePicker label="종료일" value={to} onChange={event => setTo(event.target.value)} /></>} action={<AdminButton variant="outline" onClick={retry} disabled={loading}>새로고침</AdminButton>} />
      {loading ? (
        <p className="notice mt24" role="status" aria-live="polite">선택한 기간의 유입 성과를 조회하고 있습니다.</p>
      ) : error ? (
        <AdminErrorState onRetry={retry}>{error}</AdminErrorState>
      ) : (
        <>
          {empty && <div className="mt24" role="status"><AdminEmptyState compact title="기간 내 기록 없음">조회 기간과 운영·트래킹 설정을 확인해 주세요.</AdminEmptyState></div>}
          <div className="admin-pilot-summary mt24">
            {[
              ["방문 세션", result.visitors || 0],
              ["신청 버튼 클릭 세션", stages.application_click || 0],
              ["기간 내 결제 완료", result.paidOrders || 0],
              ["기간 내 결제 완료액", money(Number(result.revenue || 0))],
            ].map(([label, value]) => (
              <AdminSummaryCard compact key={String(label)} label={String(label)} value={String(value)} scope="선택한 기간" />
            ))}
          </div>
          <p className="meta mb24">
            조회한 기간의 방문 세션과 주문을 각각 집계합니다. 세션 수는 순방문자
            수와 다르며, 결제액은 특정 유입 채널의 기여 매출을 뜻하지 않습니다.
          </p>
          <section className="panel mb24">
            <div className="panel-head">
              <h2>페이지별 참여 단계</h2>
              <span className="meta">각 이벤트의 방문 세션 수</span>
            </div>
            <div className="funnel">
              {[
                ["article_view", "아티클 조회"],
                ["class_view", "클래스 상세 조회"],
                ["checkout_view", "신청 화면 조회"],
                ["application_click", "신청 버튼 클릭"],
              ].map(([key, label]) => (
                <div className="funnel-step" key={key}>
                  <span className="label">{label}</span>
                  <div className="value">
                    {stages[key] || 0}
                    <small> 세션</small>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <AdminDataTable label="페이지별 유입 성과" rows={paths} getRowId={row => t(row, "path")} loading={loading} columns={[
            { id: "path", header: "페이지", value: row => t(row, "path") },
            { id: "views", header: "조회 수", value: row => Number(row.views || 0), align: "number" },
            { id: "visitors", header: "방문 세션", value: row => Number(row.visitors || 0), align: "number" },
            { id: "clicks", header: "클릭 수", value: row => Number(row.clicks || 0), align: "number" },
          ]} empty={<AdminEmptyState compact title="기간 내 페이지별 참여 기록이 없습니다." />} />
        </>
      )}
    </>
  );
}
function OrdersPanel({
  data, send, pending, pagination, setPage, loading,
  orderScope = emptyOrderListScope, onOrderScopeChange, onAnalyticsChanged,
}: Props) {
  const entrySourceLabels: Record<string, string> = { paid: '광고', organic: '오가닉', alumni: '기존 수강생', youtube: '유튜브' };
  const [opened, setOpened] = useState("");
  const [query, setQuery] = useState(orderScope.q);
  const { status, quick: quickStatus, course } = orderScope;
  const [from, setFrom] = useState(orderScope.from);
  const [to, setTo] = useState(orderScope.to);
  const [dateError, setDateError] = useState("");
  const registeredCourses = rows(data, "courses")
    .filter(item => !item.archived_at && item.status !== "archived")
    .toSorted((a, b) => named(a).localeCompare(named(b), "ko"));
  function changeScope(patch: Partial<OrderListScope>) {
    onOrderScopeChange?.({ ...orderScope, ...patch });
    setOpened("");
  }
  useEffect(() => {
    if (query.trim() === orderScope.q) return;
    const timer = setTimeout(() => onOrderScopeChange?.({ ...orderScope, q: query.trim() }), 300);
    return () => clearTimeout(timer);
  }, [query, orderScope, onOrderScopeChange]);
  function applyDates() {
    if (from && to && from > to) {
      setDateError("조회 종료일은 시작일 이후로 선택해 주세요.");
      return;
    }
    setDateError("");
    changeScope({ from, to });
  }
  function resetFilters() {
    setQuery(""); setFrom(""); setTo(""); setDateError(""); setOpened("");
    onOrderScopeChange?.({ ...emptyOrderListScope });
    setPage?.(1);
  }
  const orders = rows(data, "orders");
  const quickCounts = rows(data, "order_filter_counts")[0];
  const orderSummary = rows(data, "order_summary")[0];
  const paid = Number(orderSummary?.approvedRevenue || 0);
  const refunded = Number(orderSummary?.refundedRevenue || 0);
  const paymentIds = new Set(rows(data, "payments").map(payment => payment.id));
  const processingRefunds = rows(data, "edu_refund_requests").filter(
    request => request.status === "processing" && paymentIds.has(String(request.payment_id)),
  );
  const selectedOrder = orders.find(order => order.id === opened);
  const selectedItems = selectedOrder
    ? rows(data, "order_items").filter(item => item.order_id === selectedOrder.id)
    : [];
  const selectedPayments = selectedOrder
    ? rows(data, "payments").filter(payment => payment.order_id === selectedOrder.id)
    : [];
  const selectedEnrollments = rows(data, "enrollments").filter(enrollment =>
    selectedItems.some(item => item.id === enrollment.order_item_id),
  );
  const selectedRefunds = rows(data, "edu_refund_requests").filter(request =>
    selectedPayments.some(payment => payment.id === request.payment_id),
  );
  const selectedApproved = selectedPayments.reduce((sum, payment) => sum + Number(payment.approved_amount || 0), 0);
  const selectedRefundResults = rows(data, "refunds").filter(refund => selectedPayments.some(payment => payment.id === refund.payment_id));
  const selectedCancelled = selectedPayments.reduce((sum, payment) => sum + Number(payment.cancelled_amount || 0), 0);
  const selectedRemaining = Math.max(0, selectedApproved - selectedCancelled);
  return (
    <>
      <AdminFilterBar
        className="admin-pilot-filter admin-orders-filter"
        filters={<><AdminSelect label="상품" labelHidden value={course} onChange={event => { changeScope({ course: event.target.value }); }}><option value="">전체 상품</option>{course && !registeredCourses.some(item => item.id === course) && <option value={course}>선택한 상품</option>}{registeredCourses.map(item => <option key={item.id} value={item.id}>{named(item)}</option>)}</AdminSelect><AdminSelect label="결제 상태" labelHidden value={status} onChange={event => { changeScope({ status: event.target.value }); }}><option value="">전체 상태</option>{["paid", "pending", "payment_failed", "partially_refunded", "refunded", "cancelled"].map(value => <option key={value} value={value}>{labels[value] || value}</option>)}</AdminSelect></>}
        date={<><AdminDatePicker label="주문일 시작 · KST" value={from} error={dateError || undefined} onChange={event => setFrom(event.target.value)} /><AdminDatePicker label="주문일 종료 · KST" value={to} onChange={event => setTo(event.target.value)} /></>}
        search={<AdminSearchField value={query} label="주문 검색" placeholder="주문번호 · 회원명 · 상품명 검색" onChange={event => { setQuery(event.target.value); setOpened(""); }} />}
        onReset={resetFilters}
        action={<AdminButton variant="primary" disabled={loading} onClick={applyDates}>기간 조회</AdminButton>}
        appliedSummary={`적용 기간: ${orderScope.from || "전체 시작일"} ~ ${orderScope.to || "전체 종료일"} · 주문일/KST, 종료일 포함 · 목록은 전체 주문에서 검색 · 한 페이지 최대 100건 · 매출 카드는 검색 조건과 관계없이 고객 결제 기준`}
      />
      <div className="admin-pilot-summary" aria-busy={loading}>
        {[
          ["결제 완료액", money(paid), "고객 주문의 승인 결제 합계"],
          ["환불 완료액", money(refunded), "고객 주문의 취소 완료액"],
          ["순결제액", money(paid - refunded), "고객 결제 완료 − 고객 환불 완료"],
          ["환불 처리 확인", Number(orderSummary?.processingRefunds || 0) + "건", "전체 주문의 결과 확인 중인 환불"],
        ].map(([label, value, note], index) => (
          <AdminSummaryCard key={label} label={label} value={loading || !orderSummary ? "—" : value} scope={note} compact className={index === 2 ? "admin-pilot-summary-highlight" : undefined} />
        ))}
      </div>
      <p className="meta mt8 mb16">매출·유입 통계는 시험·내부·무료 주문과 탈퇴·미연결 회원을 제외합니다. 아래 주문 목록에는 모두 표시됩니다.</p>
      <section className="admin-pilot-workspace" aria-label="주문 목록" aria-busy={loading}>
        <AdminQuickFilter label="주문 예외 빠른 필터" value={quickStatus} onChange={value => { changeScope({ quick: value }); }} items={[{ value: "all", label: "전체", count: Number(quickCounts?.all || 0) }, { value: "failed", label: "결제 실패", count: Number(quickCounts?.failed || 0) }, { value: "refund", label: "환불 확인", count: Number(quickCounts?.refund || 0) }, { value: "access", label: "수강권 확인", count: Number(quickCounts?.access || 0) }]} />
        <AdminDataTable label="주문·결제·환불·수강권 연결 목록" density="standard" loading={loading}>
            <thead>
              <tr>
                {[
                  "주문",
                  "회원",
                  "유입",
                  "결제액",
                  "결제 상태",
                  "환불 상태",
                  "수강 권한",
                  "관리",
                ].map((label) => (
                  <th scope="col" key={label} data-align={label === "관리" ? "action" : undefined}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const orderItems = rows(data, "order_items").filter(item => item.order_id === order.id);
                const orderPayments = rows(data, "payments").filter(payment => payment.order_id === order.id);
                const approvedAmount = orderPayments.reduce((sum, payment) => sum + Number(payment.approved_amount || 0), 0);
                const cancelledAmount = orderPayments.reduce((sum, payment) => sum + Number(payment.cancelled_amount || 0), 0);
                const checkingRefund = processingRefunds.some(request => orderPayments.some(payment => payment.id === request.payment_id));
                const refundLabel = checkingRefund ? "결과 확인 중" : cancelledAmount > 0 ? (cancelledAmount >= approvedAmount ? "환불 완료" : "부분 환불") : "없음";
                const access = rows(data, "enrollments").filter(enrollment => orderItems.some(item => item.id === enrollment.order_item_id));
                const accessLabels = [...new Set(access.map(enrollment => labels[t(enrollment, "status")] || t(enrollment, "status")))];
                return (
                <tr key={order.id}>
                  <td data-label="주문">
                    <b>{t(order, "order_number")}</b>
                    {orderItems.map(item => <p className="table-excerpt" key={item.id}>{t(item, "item_name")}</p>)}
                    <p>{timeLabel(order.created_at)}</p>
                    {Boolean(order.analytics_exclusion) && <small>{t(order, "analytics_exclusion")}</small>}
                  </td>
                  <td data-label="회원">
                    <b>{t(order, "customer_name") || "이름 미등록"}</b>
                    <small>{t(order, "customer_email")}</small>
                  </td>
                  <td data-label="유입">{entrySourceLabels[t(order, 'entry_src')] || '미기록'}</td>
                  <td data-label="결제액">
                    <b>{money(approvedAmount)}</b>
                    <p>{[...new Set(orderPayments.map(payment => t(payment, "method")).filter(Boolean))].join(" · ") || (Number(order.total_amount) === 0 ? "무료 신청" : "승인 내역 없음")}</p>
                    {Number(order.discount_amount) > 0 && <p>할인 {money(Number(order.discount_amount))}</p>}
                  </td>
                  <td data-label="결제 상태">
                    <AdminStatusBadge status={t(order, "status")} label={labels[t(order, "status")] || t(order, "status")} />
                  </td>
                  <td data-label="환불 상태"><AdminStatusBadge status={checkingRefund ? "pending" : cancelledAmount > 0 ? "refunded" : "inactive"} label={refundLabel} tone={checkingRefund ? "warning" : "neutral"} />{cancelledAmount > 0 && <p>{money(cancelledAmount)}</p>}</td>
                  <td data-label="수강 권한">{accessLabels.join(" · ") || "부여 내역 없음"}</td>
                  <td data-label="관리" data-align="action">
                    <AdminButton
                      variant="outline" size="sm"
                      aria-haspopup="dialog"
                      onClick={() => setOpened(order.id)}
                    >
                      상세
                    </AdminButton>
                  </td>
                </tr>
              );})}
            </tbody>
        </AdminDataTable>
        {!orders.length && !loading && <AdminEmptyState title="해당 주문이 없습니다." action={<AdminButton onClick={resetFilters}>검색·필터 초기화</AdminButton>}>선택한 기간·상품·상태 또는 검색어를 확인해 주세요. 전체 주문에서 찾은 결과입니다.</AdminEmptyState>}
        {loading && <div className="pad"><AdminLoadingState title="주문 내역을 불러오는 중입니다." description="결제·환불·수강권 연결 상태를 함께 확인하고 있습니다."/></div>}
        <div className="table-foot"><span>검색 결과 {pagination?.total ?? orders.length}건 중 {orders.length}건 표시 · 한 페이지 최대 100건</span><span>정산·회계 매출은 결제액과 별도</span></div>
      </section>
      {selectedOrder && <AdminDrawer title="주문 상세" onClose={() => setOpened("")} size="large" className="order-detail-drawer">
            <AdminDialogBody>
              <h3 className="order-detail-number">{t(selectedOrder, "order_number")}</h3>
              <p className="meta mt8">{timeLabel(selectedOrder.created_at)} · {t(selectedOrder, "customer_name") || "이름 미등록"}</p>
              <p className="meta mt8">유입 경로: {entrySourceLabels[t(selectedOrder, 'entry_src')] || '미기록'}</p>
              <div className="order-detail-badges mt16">
                <AdminStatusBadge status={t(selectedOrder, 'status')} label={labels[t(selectedOrder, 'status')] || t(selectedOrder, 'status')}/>
                <AdminStatusBadge status={selectedCancelled > 0 ? selectedRemaining ? 'partially_refunded' : 'refunded' : 'neutral'} label={selectedCancelled > 0 ? selectedRemaining ? '부분 환불' : '환불 완료' : '환불 없음'}/>
                <AdminStatusBadge status={selectedEnrollments.some(enrollment => enrollment.status === 'active') ? 'active' : 'not_configured'} label={selectedEnrollments.some(enrollment => enrollment.status === 'active') ? '수강 가능' : '수강 권한 없음'}/>
              </div>
              <div className="divider" />
              <section className="order-detail-section">
                {selectedItems.map(item => {
                  const registeredCourse = registeredCourses.find(product => product.id === item.course_id);
                  const cohort = rows(data, "cohorts").find(entry => entry.id === item.cohort_id);
                  return <div className="order-detail-product" key={item.id}>
                    <h3>{named(registeredCourse) || t(item, "item_name") || "상품 정보 없음"}{named(cohort) ? ` · ${named(cohort)}` : ""}</h3>
                  </div>;
                })}
                {!selectedItems.length && <p className="meta">연결된 주문 상품이 없습니다.</p>}
                <dl className="order-detail-money">
                  <div><dt>상품 금액</dt><dd>{money(Number(selectedOrder.subtotal))}</dd></div>
                  <div><dt>쿠폰 할인</dt><dd>-{money(Number(selectedOrder.discount_amount || 0))}</dd></div>
                  <div><dt>결제 완료</dt><dd>{money(selectedApproved)}</dd></div>
                  <div><dt>환불 완료</dt><dd>-{money(selectedCancelled)}</dd></div>
                  <div className="total"><dt>남은 결제액</dt><dd>{money(selectedRemaining)}</dd></div>
                </dl>
              </section>
              <AnalyticsExclusion key={selectedOrder.id} kind="order" id={selectedOrder.id} onChanged={onAnalyticsChanged}/>
              <section className="order-detail-section">
                <h3>처리 이력</h3>
                <ol className="order-timeline mt16">
                  <li><b>주문 생성</b><time>{timeLabel(selectedOrder.created_at)}</time><p>{t(selectedOrder, "customer_email")}{t(selectedOrder, "customer_phone") ? ` · ${t(selectedOrder, "customer_phone")}` : ""}</p></li>
                  {selectedPayments.map(payment => <li key={payment.id}><b>결제 {payment.status === "paid" ? "완료" : labels[t(payment, "status")] || t(payment, "status")}</b><time>{timeLabel(payment.approved_at || payment.created_at)}</time><p>{t(payment, "method") || "결제수단 미확인"} · {money(Number(payment.approved_amount || 0))}</p></li>)}
                  {selectedRefunds.map(refund => <li key={refund.id}><b>환불 {refund.status === "processing" ? "요청" : labels[t(refund, "status")] || t(refund, "status")}</b><time>{timeLabel(refund.created_at)}</time><p>{money(Number(refund.amount || 0))}{t(refund, "reason") ? ` · ${t(refund, "reason")}` : ""}</p></li>)}
                  {selectedRefundResults.map(refund => <li key={`result-${refund.id}`}><b>결제 취소·환불 {refund.status === 'done' ? '완료' : refund.status === 'failed' ? '실패' : '처리 중'}</b><time>{timeLabel(refund.completed_at || refund.requested_at)}</time><p>{money(Number(refund.amount || 0))}{t(refund, 'reason') ? ` · ${t(refund, 'reason')}` : ''}</p></li>)}
                  {selectedEnrollments.map(enrollment => <li key={enrollment.id}><b>수강 권한 {labels[t(enrollment, "status")] || t(enrollment, "status")}</b><time>{timeLabel(enrollment.created_at)}</time><p>{enrollment.access_ends_at ? `${timeLabel(enrollment.access_ends_at)}까지` : "기한 제한 없음"}</p></li>)}
                </ol>
              </section>
              <section className="order-detail-section">
                <div className="between"><h3>수강 권한</h3><AdminStatusBadge status={selectedEnrollments.some(enrollment => enrollment.status === 'active') ? 'active' : 'not_configured'} label={selectedEnrollments.some(enrollment => enrollment.status === 'active') ? '수강 가능' : '권한 없음'}/></div>
                {selectedEnrollments.map(enrollment => <div className="setting-line mt16" key={enrollment.id}><span>{named(registeredCourses.find(product => product.id === enrollment.course_id)) || "연결 상품"}</span><b>{enrollment.access_ends_at ? timeLabel(enrollment.access_ends_at) : "기한 제한 없음"}</b></div>)}
                {!selectedEnrollments.length && <p className="order-detail-notice mt16">결제 실패·입금 대기에는 수강 권한을 부여하지 않습니다. 결제 완료와 권한 회수 결과도 각각 확인할 수 있습니다.</p>}
              </section>
              {selectedPayments.map(payment => <RefundAction key={payment.id} payment={payment} requests={rows(data, "edu_refund_requests")} send={send} pending={pending} />)}
            </AdminDialogBody>
            <AdminDialogFooter>
              {selectedPayments.map(payment => safeUrl(payment.receipt_url) ? <AdminLinkButton href={safeUrl(payment.receipt_url)} target="_blank" rel="noreferrer" key={payment.id}>영수증</AdminLinkButton> : null)}
              <AdminButton variant="outline" onClick={() => setOpened("")}>닫기</AdminButton>
            </AdminDialogFooter>
      </AdminDrawer>}
      {pagination && pagination.total > pagination.pageSize && (
        <><p className="admin-pagination-total">전체 {pagination.total}건</p><AdminPagination page={pagination.page} pages={Math.ceil(pagination.total / pagination.pageSize)} disabled={loading} onChange={nextPage => setPage?.(nextPage)}/></>
      )}
    </>
  );
}
