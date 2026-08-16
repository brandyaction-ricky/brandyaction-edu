"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Download,
  Eye,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Video,
} from "lucide-react";

type Member = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
  enrollments: Array<{
    id: string;
    status: string;
    courses: { title: string } | Array<{ title: string }> | null;
    cohorts: { name: string } | Array<{ name: string }> | null;
  }>;
  orders: Array<{
    total_amount: number;
    status: string;
    payments: Array<{ approved_amount: number; cancelled_amount: number }>;
  }>;
};
type CohortOption = {
  id: string;
  name: string;
  status: string;
  courses: { title: string } | Array<{ title: string }> | null;
};
type AdminOrder = {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  created_at: string;
  order_items: Array<{ item_name: string }>;
  payments: Array<{
    provider_payment_key: string | null;
    method: string | null;
    status: string;
    approved_amount: number;
    cancelled_amount: number;
    receipt_url: string | null;
  }>;
};
type AdminReview = {
  id: string;
  author_name: string;
  author_nickname: string | null;
  rating: number;
  body: string;
  status: string;
  is_featured: boolean;
  created_at: string;
  profiles:
    | { email: string; phone: string | null }
    | Array<{ email: string; phone: string | null }>
    | null;
  courses: { title: string } | Array<{ title: string }> | null;
  cohorts: { name: string } | Array<{ name: string }> | null;
};
type AdminReviewVideo = {
  id: string;
  title: string;
  reviewer_name: string;
  reviewer_role: string | null;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  is_published: boolean;
  display_order: number;
};
const emptyReviewVideo = { title: "", reviewerName: "", reviewerRole: "수강생", description: "", videoUrl: "", thumbnailUrl: "", isPublished: false, displayOrder: 0 };

function one<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] || null : value;
}
function date(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(value))
    .replace(/\.\s/g, ". ")
    .trim();
}
function todayInput(offsetDays = 0) {
  const value = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    value,
  );
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
  }
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
  return result;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
const statusLabel: Record<string, string> = {
  active: "활성",
  suspended: "이용 정지",
  withdrawn: "탈퇴",
  pending: "입금·승인 대기",
  paid: "결제 완료",
  payment_failed: "결제 실패",
  cancelled: "주문 취소",
  partially_refunded: "부분 환불",
  refunded: "환불 완료",
  published: "공개",
  hidden: "숨김",
  draft: "초안",
};

export function AdminMembersManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [cohorts, setCohorts] = useState<CohortOption[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);
  const [cohortId, setCohortId] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await requestJson<{ members?: Member[]; cohorts?: CohortOption[] }>("/api/admin/members", { cache: "no-store" });
      setMembers(result.members || []);
      setCohorts(result.cohorts || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "회원을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);
  const visible = useMemo(
    () =>
      members.filter((member) =>
        [member.full_name || "", member.email, member.phone || ""].some(
          (value) => value.toLowerCase().includes(query.toLowerCase()),
        ),
      ),
    [members, query],
  );
  const update = async (
    member: Member,
    changes: { status?: string; role?: string },
  ) => {
    setError("");
    try {
      await requestJson("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.id, ...changes }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "저장하지 못했습니다.");
    }
  };
  const grant = async () => {
    if (!selected || !cohortId) return;
    try {
      await requestJson("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, cohortId }),
      });
      setSelected(null);
      setCohortId("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "수강권을 발급하지 못했습니다.");
    }
  };
  if (loading)
    return (
      <section className="admin-panel admin-loading-state">
        <RefreshCw className="spin" />
        <strong>실제 회원 데이터를 불러오는 중입니다.</strong>
      </section>
    );
  return (
    <>
      <div className="summary-chips">
        <span>
          전체 회원 <strong>{members.length}</strong>
        </span>
        <span>
          활성 회원{" "}
          <strong>{members.filter((m) => m.status === "active").length}</strong>
        </span>
        <span>
          수강 중{" "}
          <strong>
            {
              members.filter((m) =>
                m.enrollments.some((e) => e.status === "active"),
              ).length
            }
          </strong>
        </span>
        <span>
          관리자·스태프{" "}
          <strong>{members.filter((m) => m.role !== "student").length}</strong>
        </span>
      </div>
      <section className="admin-panel table-panel">
        <div className="admin-toolbar">
          <div className="search-box">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름, 이메일, 휴대폰 검색"
            />
          </div>
          <button onClick={() => void load()}>
            <RefreshCw />
            새로고침
          </button>
        </div>
        <div className="data-table member-table">
          <div className="data-head">
            <span>회원</span>
            <span>역할</span>
            <span>수강 중</span>
            <span>누적 결제</span>
            <span>가입일</span>
            <span>상태</span>
            <span>운영</span>
          </div>
          {visible.map((member) => {
            const paid = member.orders.reduce((sum, order) => {
              const payment = order.payments?.[0];
              return sum + Math.max(0, (payment?.approved_amount || 0) - (payment?.cancelled_amount || 0));
            }, 0);
            return (
              <div className="data-row" key={member.id}>
                <span className="member-name">
                  <b className="mini-avatar">
                    {(member.full_name || member.email)[0]}
                  </b>
                  <span>
                    <strong>{member.full_name || "이름 미입력"}</strong>
                    <small>{member.email}</small>
                    <small>{member.phone || "휴대폰 미입력"}</small>
                  </span>
                </span>
                <select
                  value={member.role}
                  onChange={(event) =>
                    void update(member, { role: event.target.value })
                  }
                >
                  <option value="student">일반 회원</option>
                  <option value="staff">스태프</option>
                  <option value="admin">최고 관리자</option>
                </select>
                <strong>
                  {
                    member.enrollments.filter((e) => e.status === "active")
                      .length
                  }
                  개
                </strong>
                <span>{paid.toLocaleString()}원</span>
                <span>{date(member.created_at)}</span>
                <select
                  value={member.status}
                  onChange={(event) =>
                    void update(member, { status: event.target.value })
                  }
                >
                  <option value="active">활성</option>
                  <option value="suspended">이용 정지</option>
                  <option value="withdrawn">탈퇴</option>
                </select>
                <button
                  className="manage-button"
                  onClick={() => setSelected(member)}
                >
                  <UserPlus /> 수강권
                </button>
              </div>
            );
          })}
        </div>
      </section>
      {selected && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onMouseDown={() => setSelected(null)}
        >
          <section
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>수강권 발급</h2>
            <p>
              {selected.full_name || selected.email} 회원에게 주문 없는 관리자
              수강권을 발급합니다.
            </p>
            <label>
              기수
              <select
                value={cohortId}
                onChange={(event) => setCohortId(event.target.value)}
              >
                <option value="">기수 선택</option>
                {cohorts.map((cohort) => (
                  <option value={cohort.id} key={cohort.id}>
                    {one(cohort.courses)?.title} · {cohort.name}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button onClick={() => setSelected(null)}>취소</button>
              <button
                className="admin-primary"
                onClick={grant}
                disabled={!cohortId}
              >
                <Check /> 발급
              </button>
            </div>
          </section>
        </div>
      )}
      {error && (
        <p className="admin-save-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function AdminLiveOrdersManager() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(todayInput(-30));
  const [end, setEnd] = useState(todayInput());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refunding, setRefunding] = useState("");
  const [refundTarget, setRefundTarget] = useState<AdminOrder | null>(null);
  const [refundForm, setRefundForm] = useState({
    amount: "",
    reason: "",
    bank: "",
    accountNumber: "",
    holderName: "",
    requestId: "",
  });
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await requestJson<{ orders?: AdminOrder[] }>("/api/admin/orders", { cache: "no-store" });
      setOrders(result.orders || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "주문을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);
  const visible = useMemo(
    () =>
      orders.filter((order) => {
        const day = order.created_at.slice(0, 10);
        return (
          day >= start &&
          day <= end &&
          [
            order.order_number,
            order.customer_name,
            order.customer_email,
            order.customer_phone || "",
            order.order_items[0]?.item_name || "",
          ].some((value) => value.toLowerCase().includes(query.toLowerCase()))
        );
      }),
    [orders, start, end, query],
  );
  const paid = visible.reduce((sum, order) => {
    const payment = order.payments[0];
    return (
      sum +
      Math.max(
        0,
        (payment?.approved_amount || 0) - (payment?.cancelled_amount || 0),
      )
    );
  }, 0);
  const refunded = visible.reduce(
    (sum, order) => sum + (order.payments[0]?.cancelled_amount || 0),
    0,
  );
  const openRefund = (order: AdminOrder) => {
    const payment = order.payments[0];
    const remaining =
      (payment?.approved_amount || order.total_amount) -
      (payment?.cancelled_amount || 0);
    setRefundForm({
      amount: String(remaining),
      reason: "",
      bank: "",
      accountNumber: "",
      holderName: "",
      requestId: crypto.randomUUID(),
    });
    setRefundTarget(order);
    setError("");
  };
  const refund = async () => {
    if (!refundTarget) return;
    const payment = refundTarget.payments[0];
    const isVirtual = payment?.method === "가상계좌";
    setRefunding(refundTarget.id);
    try {
      await requestJson("/api/admin/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: refundTarget.order_number,
          amount: Number(refundForm.amount.replace(/[^0-9]/g, "")),
          reason: refundForm.reason,
          requestId: refundForm.requestId,
          ...(isVirtual
            ? {
                refundReceiveAccount: {
                  bank: refundForm.bank,
                  accountNumber: refundForm.accountNumber,
                  holderName: refundForm.holderName,
                },
              }
            : {}),
        }),
      });
      setRefundTarget(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "환불하지 못했습니다.");
    } finally {
      setRefunding("");
    }
  };
  const exportCsv = () => {
    const rows = [
      [
        "주문번호",
        "일자",
        "이름",
        "이메일",
        "전화번호",
        "상품",
        "금액",
        "상태",
      ],
      ...visible.map((o) => [
        o.order_number,
        o.created_at,
        o.customer_name,
        o.customer_email,
        o.customer_phone || "",
        o.order_items[0]?.item_name || "",
        String(o.total_amount),
        statusLabel[o.status] || o.status,
      ]),
    ];
    const blob = new Blob(
      [
        `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`,
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `orders-${start}-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  if (loading)
    return (
      <section className="admin-panel admin-loading-state">
        <RefreshCw className="spin" />
        <strong>실제 주문 데이터를 불러오는 중입니다.</strong>
      </section>
    );
  return (
    <>
      <section className="admin-panel order-search-panel">
        <div className="order-filter-row">
          <b>조회기간</b>
          <div className="date-range-inputs">
            <input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <span>—</span>
            <input
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
          <div className="detail-search-box">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="주문번호·이름·이메일·전화·상품 검색"
            />
          </div>
          <button onClick={() => void load()}>
            <RefreshCw />
            새로고침
          </button>
        </div>
      </section>
      <section className="order-metrics filtered-order-metrics">
        <article>
          <span>검색 결과</span>
          <strong>{visible.length}건</strong>
        </article>
        <article>
          <span>결제 완료 금액</span>
          <strong>{paid.toLocaleString()}원</strong>
        </article>
        <article>
          <span>전액 환불 금액</span>
          <strong>{refunded.toLocaleString()}원</strong>
        </article>
        <article>
          <span>입금·승인 대기</span>
          <strong>
            {visible.filter((o) => o.status === "pending").length}건
          </strong>
        </article>
      </section>
      <section className="admin-panel table-panel order-results-panel">
        <div className="order-result-head">
          <div>
            <strong>결제 내역</strong>
            <span>실제 DB 주문 {visible.length}건</span>
          </div>
          <button className="admin-outline" onClick={exportCsv}>
            <Download />
            CSV 다운로드
          </button>
        </div>
        <div className="data-table order-query-table">
          <div className="data-head">
            <span>주문번호·일자</span>
            <span>주문자</span>
            <span>클래스</span>
            <span>결제 금액</span>
            <span>결제 수단</span>
            <span>상태</span>
            <span>운영</span>
          </div>
          {visible.map((order) => {
            const payment = order.payments[0];
            return (
              <div className="data-row" key={order.id}>
                <span className="order-id-cell">
                  <strong>{order.order_number}</strong>
                  <small>{date(order.created_at)}</small>
                </span>
                <span className="order-customer-cell">
                  <strong>{order.customer_name}</strong>
                  <small>{order.customer_email}</small>
                  <small>{order.customer_phone || "전화 미입력"}</small>
                </span>
                <span>
                  {order.order_items[0]?.item_name || "상품 정보 없음"}
                </span>
                <strong>{order.total_amount.toLocaleString()}원</strong>
                <span>{payment?.method || "미승인"}</span>
                <span
                  className={`status-label ${order.status.includes("refund") ? "refund" : order.status === "paid" ? "success" : "planned"}`}
                >
                  {statusLabel[order.status] || order.status}
                </span>
                {["paid", "partially_refunded"].includes(order.status) ? (
                  <button
                    className="review-delete"
                    onClick={() => openRefund(order)}
                    disabled={refunding === order.id}
                  >
                    {refunding === order.id ? "처리 중" : "환불"}
                  </button>
                ) : <span aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </section>
      {refundTarget && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onMouseDown={() => setRefundTarget(null)}
        >
          <section
            className="admin-modal refund-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>결제 환불 처리</h2>
            <p>
              {refundTarget.order_number} · 결제사 취소가 성공하면 주문 상태와
              수강권이 자동 반영됩니다.
            </p>
            <label>
              환불 금액
              <input
                inputMode="numeric"
                value={refundForm.amount}
                onChange={(event) =>
                  setRefundForm({ ...refundForm, amount: event.target.value })
                }
              />
            </label>
            <label>
              환불 사유
              <textarea
                value={refundForm.reason}
                onChange={(event) =>
                  setRefundForm({ ...refundForm, reason: event.target.value })
                }
                placeholder="결제사와 고객 기록에 남을 사유"
              />
            </label>
            {refundTarget.payments[0]?.method === "가상계좌" && (
              <>
                <label>
                  은행 코드
                  <input
                    value={refundForm.bank}
                    onChange={(event) =>
                      setRefundForm({ ...refundForm, bank: event.target.value })
                    }
                    placeholder="예: 20"
                  />
                </label>
                <label>
                  환불 계좌번호
                  <input
                    value={refundForm.accountNumber}
                    onChange={(event) =>
                      setRefundForm({
                        ...refundForm,
                        accountNumber: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  예금주
                  <input
                    value={refundForm.holderName}
                    onChange={(event) =>
                      setRefundForm({
                        ...refundForm,
                        holderName: event.target.value,
                      })
                    }
                  />
                </label>
              </>
            )}
            <div>
              <button onClick={() => setRefundTarget(null)}>취소</button>
              <button
                className="admin-primary"
                onClick={() => void refund()}
                disabled={
                  !refundForm.reason.trim() ||
                  !Number(refundForm.amount.replace(/[^0-9]/g, "")) ||
                  refunding === refundTarget.id
                }
              >
                {refunding === refundTarget.id ? "처리 중..." : "환불 실행"}
              </button>
            </div>
          </section>
        </div>
      )}
      {error && (
        <p className="admin-save-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function AdminLiveReviewsManager() {
  const [reviewView, setReviewView] = useState<"video" | "product">("video");
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [videos, setVideos] = useState<AdminReviewVideo[]>([]);
  const [videoDraft, setVideoDraft] = useState({ ...emptyReviewVideo });
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [reviewResult, videoResult] = await Promise.all([
        requestJson<{ reviews?: AdminReview[] }>("/api/admin/reviews", { cache: "no-store" }),
        requestJson<{ videos?: AdminReviewVideo[] }>("/api/admin/review-videos", { cache: "no-store" }),
      ]);
      setReviews(reviewResult.reviews || []);
      setVideos(videoResult.videos || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "후기를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);
  const update = async (
    id: string,
    changes: { status?: string; featured?: boolean },
  ) => {
    try {
      await requestJson("/api/admin/reviews", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "후기를 저장하지 못했습니다.");
    }
  };
  const remove = async (review: AdminReview) => {
    if (!window.confirm(`${review.author_name}님의 후기를 삭제할까요?`)) return;
    try {
      await requestJson(`/api/admin/reviews?id=${encodeURIComponent(review.id)}`, { method: "DELETE" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "후기를 삭제하지 못했습니다.");
    }
  };
  const visible = reviews.filter((review) =>
    [review.author_name, review.body, one(review.courses)?.title || ""].some(
      (value) => value.toLowerCase().includes(query.toLowerCase()),
    ),
  );
  const editVideo = (video: AdminReviewVideo) => {
    setEditingVideoId(video.id);
    setVideoDraft({ title: video.title, reviewerName: video.reviewer_name, reviewerRole: video.reviewer_role || "", description: video.description || "", videoUrl: video.video_url, thumbnailUrl: video.thumbnail_url || "", isPublished: video.is_published, displayOrder: video.display_order });
  };
  const resetVideo = () => { setEditingVideoId(null); setVideoDraft({ ...emptyReviewVideo }); };
  const saveVideo = async () => {
    try {
      await requestJson("/api/admin/review-videos", { method: editingVideoId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingVideoId || undefined, ...videoDraft }) });
      resetVideo(); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "영상 후기를 저장하지 못했습니다."); }
  };
  const removeVideo = async (video: AdminReviewVideo) => {
    if (!window.confirm(`‘${video.title}’ 영상 후기를 삭제할까요?`)) return;
    try { await requestJson(`/api/admin/review-videos?id=${encodeURIComponent(video.id)}`, { method: "DELETE" }); if (editingVideoId === video.id) resetVideo(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "영상 후기를 삭제하지 못했습니다."); }
  };
  if (loading)
    return (
      <section className="admin-panel admin-loading-state">
        <RefreshCw className="spin" />
        <strong>실제 후기 데이터를 불러오는 중입니다.</strong>
      </section>
    );
  return (
    <>
      <nav className="review-management-tabs" aria-label="후기 관리 유형">
        <button className={reviewView === "video" ? "active" : ""} onClick={() => setReviewView("video")}><Video/><span><strong>랜딩페이지 영상 후기</strong><small>메인 리얼 후기 노출·순서 관리</small></span></button>
        <button className={reviewView === "product" ? "active" : ""} onClick={() => setReviewView("product")}><MessageSquare/><span><strong>상품별 후기 관리</strong><small>클래스 후기 승인·대표 노출 관리</small></span></button>
      </nav>
      <section className={`admin-panel review-video-manager review-tab-panel ${reviewView !== "video" ? "hidden" : ""}`}>
        <header><div><span><Video/></span><div><h2>영상 후기 관리</h2><p>공개한 영상은 메인 리얼 후기 섹션에 등록 순서대로 노출됩니다.</p></div></div><strong>{videos.filter((video)=>video.is_published).length}개 공개</strong></header>
        <div className="review-video-admin-grid"><div className="review-video-form"><h3>{editingVideoId ? "영상 후기 수정" : "새 영상 후기 등록"}</h3><div className="form-two"><label>영상 제목<input value={videoDraft.title} onChange={(event)=>setVideoDraft({...videoDraft,title:event.target.value})} placeholder="수강 후 달라진 구체적인 변화"/></label><label>후기자 이름<input value={videoDraft.reviewerName} onChange={(event)=>setVideoDraft({...videoDraft,reviewerName:event.target.value})} placeholder="김OO"/></label></div><div className="form-two"><label>후기자 설명<input value={videoDraft.reviewerRole} onChange={(event)=>setVideoDraft({...videoDraft,reviewerRole:event.target.value})} placeholder="자영업 마케팅 1기 수강생"/></label><label>노출 순서<input type="number" min="0" value={videoDraft.displayOrder} onChange={(event)=>setVideoDraft({...videoDraft,displayOrder:Number(event.target.value)})}/></label></div><label>영상 URL<input value={videoDraft.videoUrl} onChange={(event)=>setVideoDraft({...videoDraft,videoUrl:event.target.value})} placeholder="YouTube 또는 Vimeo URL"/></label><label>썸네일 URL <small>선택 · YouTube는 자동 생성</small><input value={videoDraft.thumbnailUrl} onChange={(event)=>setVideoDraft({...videoDraft,thumbnailUrl:event.target.value})} placeholder="https://..."/></label><label>영상 설명<textarea value={videoDraft.description} onChange={(event)=>setVideoDraft({...videoDraft,description:event.target.value})} placeholder="영상에서 확인할 수 있는 변화와 결과를 요약하세요."/></label><label className="review-video-publish"><input type="checkbox" checked={videoDraft.isPublished} onChange={(event)=>setVideoDraft({...videoDraft,isPublished:event.target.checked})}/><span>메인 리얼 후기 섹션에 공개</span></label><div className="review-video-form-actions">{editingVideoId&&<button className="admin-outline" onClick={resetVideo}>취소</button>}<button className="admin-primary" onClick={()=>void saveVideo()} disabled={!videoDraft.title.trim()||!videoDraft.reviewerName.trim()||!videoDraft.videoUrl.trim()}><Save/>{editingVideoId?"수정 저장":"영상 등록"}</button></div></div><div className="review-video-admin-list">{videos.length?videos.map((video)=><article key={video.id}><div className="review-video-admin-thumb" style={video.thumbnail_url?{backgroundImage:`url(${video.thumbnail_url})`}:undefined}><Video/></div><div><span>{video.is_published?"공개":"비공개"} · 순서 {video.display_order}</span><strong>{video.title}</strong><small>{video.reviewer_name} · {video.reviewer_role||"수강생"}</small></div><div><a className="admin-outline" href={video.video_url} target="_blank" rel="noreferrer"><Eye/>보기</a><button className="admin-outline" onClick={()=>editVideo(video)}>수정</button><button className="admin-outline danger" onClick={()=>void removeVideo(video)}><Trash2/></button></div></article>):<div className="review-video-empty"><Video/><strong>등록된 영상 후기가 없습니다.</strong><span>왼쪽 입력창에서 첫 영상을 등록하세요.</span></div>}</div></div>
      </section>
      <div className={`review-tab-panel ${reviewView !== "product" ? "hidden" : ""}`}>
      <div className="review-admin-summary">
        <article>
          <span>전체 후기</span>
          <strong>{reviews.length}</strong>
        </article>
        <article>
          <span>공개 후기</span>
          <strong>
            {reviews.filter((r) => r.status === "published").length}
          </strong>
        </article>
        <article>
          <span>대표 노출</span>
          <strong className="red">
            {reviews.filter((r) => r.is_featured).length}
          </strong>
        </article>
        <article>
          <span>승인 대기</span>
          <strong>
            {reviews.filter((r) => r.status === "pending").length}
          </strong>
        </article>
      </div>
      <section className="admin-panel managed-review-panel">
        <div className="review-list-toolbar">
          <div>
            <strong>수강 후기</strong>
            <span>승인 후 고객 화면에 공개됩니다.</span>
          </div>
          <div className="review-admin-search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="클래스·작성자·후기 검색"
            />
          </div>
        </div>
        <div className="managed-review-table">
          <div className="managed-review-head">
            <span>클래스</span>
            <span>작성자</span>
            <span>작성일</span>
            <span>평점</span>
            <span>후기</span>
            <span>관리</span>
          </div>
          {visible.map((review) => (
            <article
              key={review.id}
              className={review.is_featured ? "is-featured" : ""}
            >
              <span className="review-product-cell">
                <b>{one(review.courses)?.title || "클래스"}</b>
                <small>{one(review.cohorts)?.name}</small>
              </span>
              <span className="review-contact-cell">
                <strong>{review.author_name} · {review.author_nickname || "닉네임 미입력"}</strong>
                <small>{one(review.profiles)?.email}</small>
              </span>
              <span>{date(review.created_at)}</span>
              <strong>{Number(review.rating).toFixed(1)}점</strong>
              <p>{review.body}</p>
              <span className="review-row-actions">
                <button
                  className={review.status === "published" ? "featured" : ""}
                  onClick={() =>
                    void update(review.id, {
                      status:
                        review.status === "published" ? "hidden" : "published",
                    })
                  }
                >
                  {review.status === "published" ? "공개 중" : "공개 승인"}
                </button>
                <button
                  onClick={() =>
                    void update(review.id, {
                      featured: !review.is_featured,
                      ...(review.status !== "published"
                        ? { status: "published" }
                        : {}),
                    })
                  }
                >
                  <ShieldCheck />
                  {review.is_featured ? "대표 해제" : "대표 노출"}
                </button>
                <button
                  className="review-delete"
                  onClick={() => void remove(review)}
                >
                  <Trash2 />
                  삭제
                </button>
              </span>
            </article>
          ))}
        </div>
      </section>
      </div>
      {error && (
        <p className="admin-save-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
