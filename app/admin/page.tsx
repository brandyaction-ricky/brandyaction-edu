import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { AdminPageTitle, AdminShell } from "../components/admin-shell";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
function money(value: number) {
  return `₩ ${value.toLocaleString("ko-KR")}`;
}
function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "2-digit",
        day: "2-digit",
      })
        .format(new Date(value))
        .replace(/\.\s/g, ". ")
        .trim()
    : "미정";
}
function monthRange() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  return {
    start: `${parts}-01T00:00:00+09:00`,
    label: parts.replace("-", "."),
  };
}
const labels: Record<string, string> = {
  pending: "대기",
  paid: "결제 완료",
  payment_failed: "결제 실패",
  cancelled: "취소",
  partially_refunded: "부분 환불",
  refunded: "환불 완료",
};

export default async function AdminDashboard() {
  if (!hasSupabaseEnv()) redirect("/login?error=service_unavailable");
  const supabase = await createClient();
  const month = monthRange();
  const [ordersResult, membersResult, enrollmentsResult, cohortsResult] =
    await Promise.all([
      supabase
        .from("orders")
        .select(
          "id,order_number,status,total_amount,customer_name,created_at,order_items(item_name),payments(approved_amount,cancelled_amount)",
        )
        .gte("created_at", month.start)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", month.start),
      supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("cohorts")
        .select("id,name,status,capacity,operation_start_at,enrollments(id)")
        .in("status", ["recruiting", "upcoming", "in_progress"])
        .order("operation_start_at"),
    ]);
  const orders = ordersResult.data || [];
  const paidOrders = orders.filter((order) =>
    ["paid", "partially_refunded"].includes(order.status),
  );
  const revenue = paidOrders.reduce((sum, order) => {
    const payment = order.payments?.[0];
    return (
      sum +
      Math.max(
        0,
        (payment?.approved_amount || 0) - (payment?.cancelled_amount || 0),
      )
    );
  }, 0);
  const waiting = orders.filter((order) => order.status === "pending").length;
  const cohorts = cohortsResult.data || [];
  const chartEnd = Date.parse(orders[0]?.created_at || month.start);
  const bars = Array.from({ length: 12 }, (_, index) => {
    const day = new Date(chartEnd - (11 - index) * 86_400_000);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
    }).format(day);
    return {
      key,
      value: paidOrders
        .filter((order) => order.created_at.slice(0, 10) === key)
        .reduce((sum, order) => {
          const payment = order.payments?.[0];
          return (
            sum +
            Math.max(
              0,
              (payment?.approved_amount || 0) -
                (payment?.cancelled_amount || 0),
            )
          );
        }, 0),
    };
  });
  const max = Math.max(1, ...bars.map((bar) => bar.value));

  return (
    <AdminShell active="dashboard">
      <AdminPageTitle
        eyebrow="OVERVIEW"
        title="대시보드"
        description="실제 결제와 수강 현황을 빠르게 확인하세요."
        action={<div className="date-filter">{month.label} 월간</div>}
      />
      <section className="metric-grid">
        <article>
          <div>
            <span>이번 달 결제액</span>
            <CircleDollarSign />
          </div>
          <strong>{money(revenue)}</strong>
          <p>
            <TrendingUp /> 결제 완료 {paidOrders.length}건
          </p>
        </article>
        <article>
          <div>
            <span>이번 달 신규 회원</span>
            <UserPlus />
          </div>
          <strong>
            {membersResult.count || 0}
            <small>명</small>
          </strong>
          <p>실제 가입 계정 기준</p>
        </article>
        <article>
          <div>
            <span>활성 수강권</span>
            <Users />
          </div>
          <strong>
            {enrollmentsResult.count || 0}
            <small>건</small>
          </strong>
          <p>접근 가능한 수강권</p>
        </article>
        <article>
          <div>
            <span>운영 기수</span>
            <CalendarClock />
          </div>
          <strong>
            {cohorts.length}
            <small>개</small>
          </strong>
          <p>모집·예정·진행 중</p>
        </article>
      </section>
      <div className="admin-dashboard-layout">
        <section className="admin-panel sales-chart">
          <div className="admin-panel-head">
            <div>
              <h2>최근 12일 매출</h2>
              <p>결제 완료 주문 기준</p>
            </div>
          </div>
          <div className="chart-area">
            <div className="bars">
              {bars.map((bar, index) => (
                <div key={bar.key}>
                  <i
                    style={{
                      height: `${Math.max(bar.value ? 8 : 1, (bar.value / max) * 100)}%`,
                    }}
                    title={`${bar.key} ${bar.value.toLocaleString()}원`}
                  />
                  <span>{index % 2 === 0 ? bar.key.slice(5) : ""}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="admin-panel cohort-summary">
          <div className="admin-panel-head">
            <div>
              <h2>기수 모집 현황</h2>
              <p>실제 수강권 발급 기준</p>
            </div>
            <Link href="/admin/cohorts">
              전체보기 <ArrowRight />
            </Link>
          </div>
          {cohorts.length ? (
            cohorts.slice(0, 4).map((cohort) => {
              const count = cohort.enrollments?.length || 0;
              const rate = cohort.capacity
                ? Math.min(100, (count / cohort.capacity) * 100)
                : 0;
              return (
                <div className="cohort-mini" key={cohort.id}>
                  <div>
                    <span
                      className={
                        cohort.status === "recruiting" ? "red-dot" : "blue-dot"
                      }
                    />
                    <div>
                      <strong>{cohort.name}</strong>
                      <small>
                        {cohort.status === "recruiting"
                          ? "모집 중"
                          : cohort.status === "in_progress"
                            ? "진행 중"
                            : "예정"}{" "}
                        · {date(cohort.operation_start_at)} 개강
                      </small>
                    </div>
                    <em>
                      {count} / {cohort.capacity || "∞"}명
                    </em>
                  </div>
                  <div className="mini-progress">
                    <i style={{ width: `${rate}%` }} />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="learning-empty">운영 중인 기수가 없습니다.</div>
          )}
        </section>
      </div>
      <div className="admin-bottom-grid">
        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <h2>최근 주문</h2>
              <p>이번 달 실제 주문 {orders.length}건</p>
            </div>
            <Link href="/admin/orders">
              전체보기 <ArrowRight />
            </Link>
          </div>
          <div className="compact-table">
            <div className="table-head">
              <span>주문자</span>
              <span>상품</span>
              <span>금액</span>
              <span>상태</span>
            </div>
            {orders.slice(0, 5).map((order) => (
              <div className="table-row" key={order.id}>
                <span>
                  <b className="mini-avatar">{order.customer_name[0]}</b>
                  {order.customer_name}
                </span>
                <span>{order.order_items?.[0]?.item_name || "상품"}</span>
                <strong>{order.total_amount.toLocaleString()}원</strong>
                <span
                  className={`status-label ${order.status === "paid" ? "success" : order.status.includes("refund") ? "refund" : "planned"}`}
                >
                  {labels[order.status] || order.status}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-panel task-panel">
          <div className="admin-panel-head">
            <div>
              <h2>운영 체크</h2>
              <p>데이터 기반 확인 항목</p>
            </div>
          </div>
          <label>
            <input type="checkbox" checked={waiting === 0} readOnly />
            <span>
              <strong>입금·승인 대기 주문</strong>
              <small>{waiting}건 확인 필요</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={cohorts.every((cohort) => cohort.operation_start_at)}
              readOnly
            />
            <span>
              <strong>기수 운영일 설정</strong>
              <small>
                미설정 기수{" "}
                {cohorts.filter((cohort) => !cohort.operation_start_at).length}
                개
              </small>
            </span>
          </label>
          <label>
            <input type="checkbox" checked={!ordersResult.error} readOnly />
            <span>
              <strong>주문 DB 연결</strong>
              <small>{ordersResult.error ? "연결 오류" : "정상"}</small>
            </span>
          </label>
        </section>
      </div>
    </AdminShell>
  );
}
