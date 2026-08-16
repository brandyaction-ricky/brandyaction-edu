import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, AlertTriangle, ArrowRight, BarChart3, CalendarClock, CheckCircle2, CircleDollarSign, CreditCard, Download, Megaphone, MessageSquareText, PlayCircle, Radio, TrendingUp, UserPlus, Users } from "lucide-react";
import { AdminPageTitle, AdminShell } from "../components/admin-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
type Relation<T> = T | T[] | null;
const one = <T,>(value: Relation<T>) => Array.isArray(value) ? value[0] || null : value;
const money = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const pct = (value: number, total: number) => total ? `${(value / total * 100).toFixed(1)}%` : "0.0%";
const date = (value: string | null) => value ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).format(new Date(value)).replace(/\.\s/g, ". ").trim() : "미정";
const orderLabel: Record<string, string> = { pending: "대기", paid: "결제 완료", payment_failed: "결제 실패", cancelled: "취소", partially_refunded: "부분 환불", refunded: "환불 완료" };
const periodOptions = [{ value: 7, label: "최근 7일" }, { value: 30, label: "최근 30일" }, { value: 90, label: "최근 90일" }, { value: 365, label: "최근 1년" }];

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const operator = await getAdminUser();
  if (!operator) redirect("/login?error=admin_required");
  const params = await searchParams;
  const requested = Number(params.period || 30);
  const period = periodOptions.some((option) => option.value === requested) ? requested : 30;
  // This is a force-dynamic server component; the request timestamp intentionally
  // changes between requests and is not client-rendered state.
  // eslint-disable-next-line react-hooks/purity
  const requestTimestamp = Date.now();
  const start = new Date(requestTimestamp - period * 86_400_000).toISOString();
  const admin = createAdminClient();
  const [ordersResult, membersResult, enrollmentsResult, cohortsResult, reviewsResult, articlesResult, campaignsResult, messageLogsResult, progressResult, usageResult] = await Promise.all([
    admin.from("orders").select("id,user_id,order_number,status,total_amount,customer_name,created_at,order_items(item_name,course_id,cohort_id,courses(title),cohorts(name)),payments(approved_amount,cancelled_amount,method)").gte("created_at", start).order("created_at", { ascending: false }),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", start),
    admin.from("enrollments").select("id,user_id,course_id,cohort_id").eq("status", "active"),
    admin.from("cohorts").select("id,name,status,capacity,operation_start_at,courses(title),enrollments(id,status),cohort_sessions(id,title,scheduled_at,cohort_session_contents(live_url,replay_url))").in("status", ["recruiting", "upcoming", "in_progress"]).order("operation_start_at"),
    admin.from("reviews").select("id,status,rating,author_name,created_at,courses(title)").gte("created_at", start).order("created_at", { ascending: false }),
    admin.from("articles").select("id,title,status,created_at").gte("created_at", start).order("created_at", { ascending: false }),
    admin.from("crm_campaigns").select("id,name,status,sent_at,recipient_count,success_count,failure_count,created_at").gte("created_at", start).order("created_at", { ascending: false }),
    admin.from("crm_message_logs").select("id,campaign_id,member_id,status,sent_at").gte("created_at", start),
    admin.from("lesson_progress").select("id,enrollment_id,progress_percent,updated_at,enrollments(user_id)").gte("updated_at", start),
    admin.from("learning_usage_events").select("id,enrollment_id,item_type,use_count,last_used_at,enrollments(user_id)").gte("last_used_at", start),
  ]);
  const orders = ordersResult.data || [];
  const paidOrders = orders.filter((order) => ["paid", "partially_refunded"].includes(order.status));
  const revenue = paidOrders.reduce((sum, order) => { const payment = order.payments?.[0]; return sum + Math.max(0, (payment?.approved_amount || 0) - (payment?.cancelled_amount || 0)); }, 0);
  const cancelled = orders.reduce((sum, order) => sum + (order.payments?.[0]?.cancelled_amount || 0), 0);
  const payingCustomers = new Set(paidOrders.map((order) => order.user_id).filter(Boolean)).size;
  const reviews = reviewsResult.data || [];
  const pendingReviews = reviews.filter((review) => review.status === "pending");
  const lowReviews = reviews.filter((review) => Number(review.rating) <= 2);
  const pendingOrders = orders.filter((order) => order.status === "pending");
  const refundOrders = orders.filter((order) => order.status === "refunded" || order.status === "partially_refunded");
  const cohorts = cohortsResult.data || [];
  const sessionIssues = cohorts.flatMap((cohort) => (cohort.cohort_sessions || []).filter((session) => {
    const content = one(session.cohort_session_contents);
    return !session.scheduled_at || (cohort.status === "in_progress" && !content?.live_url && !content?.replay_url);
  }).map((session) => ({ cohort, session })));
  const signals = [
    ...(refundOrders.length >= Math.max(2, Math.ceil(paidOrders.length * 0.12)) ? [{ title: "환불 비중 확인", body: `${period}일 동안 환불·부분환불 ${refundOrders.length}건입니다.` }] : []),
    ...(lowReviews.length ? [{ title: "저평점 후기 발생", body: `2점 이하 후기 ${lowReviews.length}건이 등록되어 확인이 필요합니다.` }] : []),
    ...(sessionIssues.length ? [{ title: "회차 운영 정보 누락", body: `일정 또는 입장·다시보기 링크가 비어 있는 회차 ${sessionIssues.length}개입니다.` }] : []),
  ];
  const bucketCount = period === 7 ? 7 : 6;
  const bars = Array.from({ length: bucketCount }, (_, index) => {
    const bucketEnd = requestTimestamp - (bucketCount - 1 - index) * (period / bucketCount) * 86_400_000;
    const bucketStart = bucketEnd - (period / bucketCount) * 86_400_000;
    const value = paidOrders.filter((order) => { const time = Date.parse(order.created_at); return time >= bucketStart && time < bucketEnd; }).reduce((sum, order) => { const payment = order.payments?.[0]; return sum + Math.max(0, (payment?.approved_amount || 0) - (payment?.cancelled_amount || 0)); }, 0);
    return { label: new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).format(new Date(bucketEnd)).replace(/\.\s?/g, ".").replace(/\.$/, ""), value };
  });
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const productSales = new Map<string, { name: string; count: number; amount: number; refund: number; customers: Set<string> }>();
  orders.forEach((order) => { const item = order.order_items?.[0]; const name = one(item?.courses || null)?.title || item?.item_name || "상품"; const key = String(item?.course_id || name); const current = productSales.get(key) || { name, count: 0, amount: 0, refund: 0, customers: new Set<string>() }; const payment = order.payments?.[0]; const paid = ["paid", "partially_refunded"].includes(order.status); if (paid) { current.count += 1; if (order.user_id) current.customers.add(order.user_id); current.amount += Math.max(0, (payment?.approved_amount || 0) - (payment?.cancelled_amount || 0)); } current.refund += payment?.cancelled_amount || 0; productSales.set(key, current); });
  const ranking = [...productSales.values()].sort((a, b) => b.amount - a.amount);
  const sentCampaigns = (campaignsResult.data || []).filter((campaign) => campaign.status === "completed");
  const sentMessages = sentCampaigns.reduce((sum, campaign) => sum + campaign.success_count, 0);
  const publishedArticles = (articlesResult.data || []).filter((article) => article.status === "published").length;
  const messageLogs = messageLogsResult.data || [];
  const campaignConversions = sentCampaigns.map((campaign) => {
    const recipients = messageLogs.filter((log) => log.campaign_id === campaign.id && log.status === "success" && log.member_id && log.sent_at);
    const attributedOrders = paidOrders.filter((order) => recipients.some((log) => order.user_id === log.member_id && Date.parse(order.created_at) >= Date.parse(log.sent_at!) && Date.parse(order.created_at) <= Date.parse(log.sent_at!) + 7 * 86_400_000));
    const amount = attributedOrders.reduce((sum, order) => { const payment = order.payments?.[0]; return sum + Math.max(0, (payment?.approved_amount || 0) - (payment?.cancelled_amount || 0)); }, 0);
    return { ...campaign, orders: attributedOrders.length, amount, rate: campaign.success_count ? attributedOrders.length / campaign.success_count * 100 : 0 };
  });
  const attributedOrders = campaignConversions.reduce((sum, campaign) => sum + campaign.orders, 0);
  const attributedRevenue = campaignConversions.reduce((sum, campaign) => sum + campaign.amount, 0);
  const progressRows = progressResult.data || [];
  const usageRows = usageResult.data || [];
  const learnerIds = new Set([...progressRows.map((row) => one(row.enrollments)?.user_id), ...usageRows.map((row) => one(row.enrollments)?.user_id)].filter(Boolean));
  const avgProgress = progressRows.length ? Math.round(progressRows.reduce((sum, row) => sum + row.progress_percent, 0) / progressRows.length) : 0;
  const completionRate = progressRows.length ? Math.round(progressRows.filter((row) => row.progress_percent === 100).length / progressRows.length * 100) : 0;
  const usageCount = (type: string) => usageRows.filter((row) => row.item_type === type).reduce((sum, row) => sum + row.use_count, 0);
  const activeEnrollmentUsers = new Set((enrollmentsResult.data || []).map((row) => row.user_id));
  const inactiveLearners = [...activeEnrollmentUsers].filter((id) => !learnerIds.has(id)).length;

  return <AdminShell active="dashboard">
    <AdminPageTitle eyebrow="OVERVIEW" title="모집·매출·전환·학습 한눈에 보기" description="현재 모집중인 기수부터 결제 고객, CRM 후행 전환, 실제 수강생 활동까지 연결해 확인합니다." action={<form className="dashboard-period"><label>분석 기간<select name="period" defaultValue={String(period)}>{periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button>적용</button></form>}/>

    <section className="dashboard-section-title monitor"><div><i/><span><strong>모집·매출 스냅샷</strong><small>현재 모집중 기수와 선택 기간 결제 성과</small></span></div><em>RECRUITING</em></section>
    <section className="dashboard-decision-kpis"><article><Users/><span>결제 고객<strong>{payingCustomers}명</strong><small>선택 기간 순고객</small></span></article><article><CircleDollarSign/><span>순매출<strong>{money(revenue)}</strong><small>취소·환불 차감</small></span></article><article><BarChart3/><span>객단가<strong>{money(paidOrders.length ? Math.round(revenue / paidOrders.length) : 0)}</strong><small>결제 완료 주문 기준</small></span></article><article><CalendarClock/><span>모집중 기수<strong>{cohorts.filter((cohort) => cohort.status === "recruiting").length}개</strong><small>지금 신청 가능</small></span></article></section>
    <section className="dashboard-recruiting-grid">{cohorts.filter((cohort) => cohort.status === "recruiting").map((cohort) => { const count = (cohort.enrollments || []).filter((enrollment) => enrollment.status === "active").length; const rate = cohort.capacity ? Math.min(100, count / cohort.capacity * 100) : 0; const cohortOrders = paidOrders.filter((order) => order.order_items?.[0]?.cohort_id === cohort.id); const cohortRevenue = cohortOrders.reduce((sum, order) => sum + Math.max(0, (order.payments?.[0]?.approved_amount || 0) - (order.payments?.[0]?.cancelled_amount || 0)), 0); return <Link href="/admin/cohorts" className="admin-panel" key={cohort.id}><span>모집 중</span><h3>{cohort.name}</h3><p>{one(cohort.courses)?.title}</p><div><strong>{count} / {cohort.capacity || "∞"}명</strong><em>{money(cohortRevenue)}</em></div><i><b style={{ width: `${rate}%` }}/></i><small>{date(cohort.operation_start_at)} 개강 · 충원율 {Math.round(rate)}%</small></Link>; })}{cohorts.filter((cohort) => cohort.status === "recruiting").length === 0 && <div className="admin-panel dashboard-recruiting-empty"><CalendarClock/><span><strong>현재 모집중인 기수가 없습니다.</strong><small>신규 모집을 시작하면 정원·결제 고객·매출이 이곳에 표시됩니다.</small></span><Link href="/admin/cohorts">기수 관리 <ArrowRight/></Link></div>}</section>

    <section className="dashboard-section-title monitor"><div><i/><span><strong>CRM → 구매 전환</strong><small>발송 회원의 7일 이내 결제를 캠페인 후행 성과로 추정</small></span></div><em>ATTRIBUTION</em></section>
    <section className="dashboard-conversion-layout"><div className="dashboard-decision-kpis compact"><article><Megaphone/><span>발송 성공<strong>{sentMessages}건</strong><small>{sentCampaigns.length}개 캠페인</small></span></article><article><TrendingUp/><span>추정 전환<strong>{attributedOrders}건</strong><small>7일 후행 결제</small></span></article><article><CircleDollarSign/><span>추정 전환 매출<strong>{money(attributedRevenue)}</strong><small>중복 캠페인 포함 가능</small></span></article></div><section className="admin-panel dashboard-campaign-table"><header><span>캠페인</span><span>발송</span><span>전환</span><span>전환율</span><span>매출</span></header>{campaignConversions.map((campaign) => <article key={campaign.id}><strong>{campaign.name}</strong><span>{campaign.success_count}건</span><span>{campaign.orders}건</span><span>{campaign.rate.toFixed(1)}%</span><b>{money(campaign.amount)}</b></article>)}{campaignConversions.length === 0 && <p>선택 기간 완료된 캠페인이 없습니다.</p>}</section><p className="dashboard-attribution-note">※ 클릭 식별자가 아직 없으므로 동일 회원에게 메시지를 보낸 뒤 7일 이내 발생한 결제를 추정 집계합니다.</p></section>

    <section className="dashboard-section-title monitor"><div><i/><span><strong>수강생 활동</strong><small>진도와 자료·라이브·다시보기 실제 이용</small></span></div><em>LEARNING</em></section>
    <section className="dashboard-learning-grid"><article><Activity/><span>활동 수강생<strong>{learnerIds.size}명</strong><small>선택 기간 학습 기록</small></span></article><article><TrendingUp/><span>평균 진도<strong>{avgProgress}%</strong><small>업데이트된 콘텐츠 기준</small></span></article><article><CheckCircle2/><span>콘텐츠 완주<strong>{completionRate}%</strong><small>진도 100% 비율</small></span></article><article><Radio/><span>라이브 입장<strong>{usageCount("live_join")}회</strong><small>기록된 이용 횟수</small></span></article><article><PlayCircle/><span>다시보기<strong>{usageCount("replay_view")}회</strong><small>기록된 이용 횟수</small></span></article><article><Download/><span>자료 다운로드<strong>{usageCount("material_download")}회</strong><small>기록된 이용 횟수</small></span></article><article className={inactiveLearners ? "warning" : ""}><AlertTriangle/><span>기간 내 미활동<strong>{inactiveLearners}명</strong><small>활성 수강권 중 기록 없음</small></span></article></section>

    <section className="dashboard-section-title action"><div><i/><span><strong>처리할 업무</strong><small>지금 운영자가 확인해야 할 항목</small></span></div><em>ACTION</em></section>
    <section className="dashboard-action-kpis">
      <Link href="/admin/orders"><CreditCard/><span>결제한 고객<strong>{payingCustomers}명</strong><small>선택 기간 결제 완료</small></span><ArrowRight/></Link>
      <Link href="/admin/orders"><CircleDollarSign/><span>입금·승인 대기<strong>{pendingOrders.length}건</strong><small>결제 상태 확인</small></span><ArrowRight/></Link>
      <Link href="/admin/reviews"><MessageSquareText/><span>승인 대기 후기<strong>{pendingReviews.length}건</strong><small>공개 여부 검토</small></span><ArrowRight/></Link>
      <Link href="/admin/cohorts"><CalendarClock/><span>회차 정보 누락<strong>{sessionIssues.length}개</strong><small>일정·링크 입력</small></span><ArrowRight/></Link>
    </section>
    {(pendingOrders.length > 0 || pendingReviews.length > 0 || sessionIssues.length > 0) && <section className="admin-panel dashboard-urgent"><header><div><AlertTriangle/><span><strong>우선 처리 큐</strong><small>고객 경험에 바로 영향을 주는 순서입니다.</small></span></div></header><div>
      {pendingOrders.slice(0, 3).map((order) => <Link key={order.id} href="/admin/orders"><span>결제 확인</span><strong>{order.customer_name}</strong><small>{order.order_number} · {date(order.created_at)}</small><ArrowRight/></Link>)}
      {pendingReviews.slice(0, 3).map((review) => <Link key={review.id} href="/admin/reviews"><span>후기 승인</span><strong>{review.author_name}</strong><small>{one(review.courses)?.title || "클래스"} · {Number(review.rating).toFixed(1)}점</small><ArrowRight/></Link>)}
      {sessionIssues.slice(0, 3).map(({ cohort, session }) => <Link key={session.id} href="/admin/cohorts"><span>회차 준비</span><strong>{cohort.name}</strong><small>{session.title}</small><ArrowRight/></Link>)}
    </div></section>}

    <section className="dashboard-section-title action"><div><i/><span><strong>이상 신호</strong><small>환불·저평점·운영 누락 자동 감지</small></span></div><em>ALERT</em></section>
    <section className={`dashboard-signals ${signals.length ? "has-alert" : ""}`}>{signals.length ? signals.map((signal) => <article key={signal.title}><AlertTriangle/><div><strong>{signal.title}</strong><p>{signal.body}</p></div></article>) : <article className="normal"><CheckCircle2/><div><strong>현재 감지된 이상 신호가 없습니다.</strong><p>선택한 기간의 결제·환불·후기·기수 운영 데이터를 확인했습니다.</p></div></article>}</section>

    <section className="dashboard-section-title monitor"><div><i/><span><strong>통계</strong><small>선택 기간의 매출과 고객 흐름</small></span></div><em>MONITORING</em></section>
    <section className="dashboard-stat-kpis"><article><span>실결제액</span><strong>{money(revenue)}</strong><small>취소·환불 차감</small></article><article><span>취소·환불</span><strong>{money(cancelled)}</strong><small>{refundOrders.length}건</small></article><article><span>신규 회원</span><strong>{membersResult.count || 0}명</strong><small>선택 기간 가입</small></article><article><span>활성 수강권</span><strong>{enrollmentsResult.data?.length || 0}건</strong><small>현재 접근 가능</small></article></section>
    <div className="dashboard-stats-grid"><section className="admin-panel dashboard-revenue-chart"><header><div><h2>기간별 거래액</h2><p>토스 승인액에서 취소액을 차감한 실결제 기준</p></div><strong>{money(revenue)}</strong></header><div className="dashboard-bars">{bars.map((bar) => <div key={bar.label}><span>{bar.value ? <><b>{bar.value.toLocaleString("ko-KR")}</b><em>원</em></> : ""}</span><i style={{ height: `${Math.max(bar.value ? 6 : 1, bar.value / max * 100)}%` }}/><small>{bar.label}</small></div>)}</div></section><section className="admin-panel dashboard-product-rank"><header><div><h2>클래스별 실매출</h2><p>결제·고객·환불을 클래스 단위로 비교</p></div><span>{paidOrders.length}건</span></header>{ranking.length ? ranking.slice(0, 6).map((item, index) => <article key={item.name}><b>{index + 1}</b><div><strong>{item.name}</strong><small>결제 {item.count}건 · 고객 {item.customers.size}명{item.refund ? ` · 환불 ${money(item.refund)}` : ""}</small><i><b style={{width:`${revenue ? Math.min(100,item.amount/revenue*100) : 0}%`}}/></i></div><span><strong>{money(item.amount)}</strong><small>매출 비중 {pct(item.amount,revenue)}</small></span></article>) : <div className="dashboard-empty">결제 완료 데이터가 없습니다.</div>}</section></div>

    <section className="dashboard-section-title monitor"><div><i/><span><strong>그로스 현황</strong><small>콘텐츠·후기·CRM 실행 결과</small></span></div><em>GROWTH</em></section>
    <section className="dashboard-growth-grid"><Link href="/admin/articles"><FileMetric icon={<TrendingUp/>} label="게시 아티클" value={`${publishedArticles}개`} note={`선택 기간 작성 ${(articlesResult.data || []).length}개`}/></Link><Link href="/admin/reviews"><FileMetric icon={<MessageSquareText/>} label="신규 후기" value={`${reviews.length}건`} note={`공개 ${reviews.filter((review) => review.status === "published").length}건`}/></Link><Link href="/admin/crm"><FileMetric icon={<Megaphone/>} label="CRM 발송 성공" value={`${sentMessages}건`} note={`완료 캠페인 ${sentCampaigns.length}개`}/></Link><Link href="/admin/members"><FileMetric icon={<UserPlus/>} label="신규 회원" value={`${membersResult.count || 0}명`} note={`결제 고객 ${payingCustomers}명`}/></Link></section>

    <div className="admin-bottom-grid dashboard-bottom"><section className="admin-panel"><div className="admin-panel-head"><div><h2>최근 주문</h2><p>선택 기간 실제 프론트 주문</p></div><Link href="/admin/orders">전체보기 <ArrowRight/></Link></div><div className="compact-table"><div className="table-head"><span>주문자</span><span>상품·기수</span><span>금액</span><span>상태</span></div>{orders.slice(0, 5).map((order) => <div className="table-row" key={order.id}><span><b className="mini-avatar">{order.customer_name[0]}</b>{order.customer_name}</span><span>{order.order_items?.[0]?.item_name || "상품"}</span><strong>{money(order.total_amount)}</strong><span className={`status-label ${order.status === "paid" ? "success" : order.status.includes("refund") ? "refund" : "planned"}`}>{orderLabel[order.status] || order.status}</span></div>)}</div></section><section className="admin-panel cohort-summary"><div className="admin-panel-head"><div><h2>기수 모집 현황</h2><p>활성 수강권 기준</p></div><Link href="/admin/cohorts">전체보기 <ArrowRight/></Link></div>{cohorts.slice(0, 4).map((cohort) => { const count = (cohort.enrollments || []).filter((enrollment) => enrollment.status === "active").length; const rate = cohort.capacity ? Math.min(100, count / cohort.capacity * 100) : 0; return <div className="cohort-mini" key={cohort.id}><div><span className={cohort.status === "recruiting" ? "red-dot" : "blue-dot"}/><div><strong>{cohort.name}</strong><small>{one(cohort.courses)?.title} · {date(cohort.operation_start_at)} 시작</small></div><em>{count} / {cohort.capacity || "∞"}명</em></div><div className="mini-progress"><i style={{ width: `${rate}%` }}/></div></div>; })}</section></div>
  </AdminShell>;
}

function FileMetric({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note: string }) {
  return <article>{icon}<span>{label}</span><strong>{value}</strong><small>{note}</small><ArrowRight/></article>;
}
