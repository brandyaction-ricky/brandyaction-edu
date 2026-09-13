"use client";
import {
  number as num,
  text as t,
  type Section,
  type User,
} from "@/lib/platform";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckSquare2,
  FilePenLine,
  LayoutGrid,
  LineChart,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  ShieldCheck,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Data } from "../learning-workflows";

export const finalAdminGroups = [
  [
    "클래스 관리",
    [
      "products",
      "cohorts",
      "learning",
      "missions",
      "members",
      "reviews",
      "questions",
    ],
  ],
  ["고객 관리", ["customers", "tags", "coupons", "product-reviews"]],
  ["콘텐츠 관리", ["banners", "articles", "testimonials"]],
  ["매출 관리", ["orders"]],
  ["마케팅 관리", ["landing", "analytics", "metrics", "seo", "settings"]],
] as const;
const icons: Record<string, LucideIcon> = {
  products: BookOpen,
  cohorts: CalendarDays,
  learning: BookOpen,
  missions: BookOpen,
  members: UsersRound,
  reviews: CheckSquare2,
  questions: MessageCircle,
  customers: UsersRound,
  tags: UsersRound,
  coupons: LayoutGrid,
  "product-reviews": MessageCircle,
  banners: LayoutGrid,
  articles: FilePenLine,
  testimonials: MessageCircle,
  orders: LayoutGrid,
  landing: LineChart,
  analytics: LineChart,
  metrics: FilePenLine,
  seo: Settings,
  settings: Settings,
  staff: ShieldCheck,
};
export const finalAdminTitles: Record<string, string> = {
  learning: "학습 콘텐츠 관리",
  members: "회원 미션관리",
  tags: "고객 태그 관리",
  "product-reviews": "상품 후기 관리",
  banners: "메인 배너 관리",
  articles: "아티클 관리",
  testimonials: "고객 후기 관리",
};
export const sectionDescription: Record<string, string> = {
  products: "상품 정보·상세페이지·제공 자료·판매 조건을 한곳에서 관리합니다.",
  learning: "일차별 학습 본문과 확인 퀴즈를 관리합니다.",
  cohorts: "상품의 판매 정보와 실제 교육 일정·정원을 구분해 운영합니다.",
  missions: "주차별 미션을 구성하고, 학습 자료와 제출 방식을 연결합니다.",
  members: "회원의 진행 상태와 승인 현황을 확인하세요.",
  reviews: "목록을 이동하며 제출 내용을 확인하고 피드백을 남기세요.",
  questions: "학습 중 막힌 지점을 확인하고 답변으로 연결합니다.",
  customers: "회원의 수강·구매 이력과 태그를 함께 관리합니다.",
  tags: "고객의 수강·구매 행동과 운영 기준으로 태그를 관리합니다.",
  coupons: "할인 금액·기간·수량과 적용 조건을 관리합니다.",
  "product-reviews": "수강 후기를 검토하고 공개 여부와 대표 노출을 관리합니다.",
  banners: "메인 이미지와 연결 링크·노출 기간을 관리합니다.",
  articles: "글·영상 콘텐츠의 편집과 공개 상태를 관리합니다.",
  testimonials: "홈페이지에 노출할 고객 사례와 영상을 관리합니다.",
  orders: "주문·결제·환불 상태와 수강 권한을 함께 확인합니다.",
  landing: "무료클래스의 실제 방문·CTA 전환·체류 성과를 확인합니다.",
  analytics: "유입부터 신청까지, 모집 과정의 수집된 성과를 확인합니다.",
  metrics: "자동 추적이 끊기는 구간을 날짜별로 보완합니다.",
  seo: "검색 노출 정보와 측정·인증 코드를 안전하게 관리합니다.",
  settings: "교육 운영 규칙과 광고 측정 설정을 구분해 관리합니다.",
};
export function AdminHeading({
  title,
  description,
  eyebrow,
  children,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function Metric({
  label,
  value,
  note,
  highlight = false,
  href,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  highlight?: boolean;
  href?: string;
}) {
  const content = (
    <>
      <div className="metric-label">{label}</div>
      <div className="metric-value num">{value}</div>
      {note && <div className="metric-note">{note}</div>}
    </>
  );
  return href ? (
    <Link className={"metric " + (highlight ? "highlight" : "")} href={href}>
      {content}
    </Link>
  ) : (
    <div className={"metric " + (highlight ? "highlight" : "")}>{content}</div>
  );
}
export function AdminShell({
  current,
  available,
  user,
  data,
  mobile,
  setMobile,
  logout,
  children,
}: {
  current: string;
  available: Section[];
  user: User;
  data: Data;
  mobile: boolean;
  setMobile: (value: boolean) => void;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const selected =
      current === "product-editor"
        ? "products"
        : current === "learning-editor"
          ? "learning"
          : current,
    byKey = new Map(available.map((s) => [s.key, s])),
    pending = num((data.admin_summary || [])[0], "pendingReviews");
  const navLink = (key: string) => {
    const s = byKey.get(key);
    if (!s && key !== "overview") return null;
    const Icon = icons[key] || LayoutGrid;
    return (
      <Link
        key={key}
        href={key === "overview" ? "/admin" : "/admin/" + key}
        className={"nav-link " + (selected === key ? "active" : "")}
        aria-current={selected === key ? "page" : undefined}
        onClick={() => setMobile(false)}
      >
        <Icon />
        {s ? finalAdminTitles[key] || s.title : "운영 홈"}
        {key === "reviews" && pending > 0 && (
          <span className="nav-count">{pending}</span>
        )}
      </Link>
    );
  };
  const extra = ["staff", "templates", "campaigns", "automations"].filter(
    (key) => byKey.has(key),
  );
  return (
    <>
      <a className="skip" href="#admin-content">
        본문으로 이동
      </a>
      <aside className={"sidebar " + (mobile ? "open" : "")} id="admin-sidebar">
        <button
          type="button"
          className="btn ghost sidebar-close"
          onClick={() => setMobile(false)}
          aria-label="관리자 메뉴 닫기"
        >
          메뉴 닫기
          <X />
        </button>
        <Link className="brand" href="/admin">
          <img className="brand-logo" src="/brandy-action-logo.png" alt="brandyaction" />
          <span>
            <small>EDU / ADMIN</small>
          </span>
        </Link>
        <div className="workspace-label">
          <span className="square">B</span>클래스 운영 워크스페이스
        </div>
        <nav aria-label="관리자 카테고리">
          {navLink("overview")}
          {finalAdminGroups
            .filter(([, keys]) => keys.some((key) => byKey.has(key)))
            .map(([title, keys]) => (
              <details
                className="nav-group"
                key={title + selected}
                open={
                  selected === "overview" ||
                  keys.some((key) => key === selected)
                }
              >
                <summary>{title}</summary>
                {keys.map(navLink)}
              </details>
            ))}
          {extra.length > 0 && (
            <details className="nav-group" open={extra.includes(selected)}>
              <summary>추가 운영 도구</summary>
              {extra.map(navLink)}
            </details>
          )}
        </nav>
        <div className="side-footer">
          <Link className="btn ghost full" href="/">
            고객 화면 보기
            <ArrowRight />
          </Link>
        </div>
        <div className="profile">
          <span className="avatar">
            {(user.full_name || "운영").slice(0, 1)}
          </span>
          <div>
            <b>{user.full_name || "운영자"}</b>
            <div className="meta">
              {user.role === "admin" ? "관리자" : "스태프"}
            </div>
          </div>
        </div>
      </aside>
      <div className="app">
        <header className="topbar">
          <div className="crumb">
            <button
              className="btn iconbtn ghost mobile-menu"
              aria-controls="admin-sidebar"
              aria-expanded={mobile}
              aria-label="관리자 메뉴 열기"
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </button>
            <span className="crumb-root">관리자</span>
            <span className="crumb-root">/</span>
            <span>
              {current === "product-editor" ? "상품 등록·수정" : current === "learning-editor" ? "학습 콘텐츠 편집" : finalAdminTitles[selected] ||
                byKey.get(selected)?.title ||
                "운영 홈"}
            </span>
          </div>
          <div className="topright">
            {byKey.has("questions") && (
              <Link
                className="btn iconbtn ghost"
                href="/admin/questions"
                aria-label="질문함"
              >
                <MessageCircle />
              </Link>
            )}
            <button
              className="btn iconbtn ghost"
              onClick={() => void logout()}
              aria-label="로그아웃"
            >
              <LogOut />
            </button>
            <span className="avatar">
              {(user.full_name || "운영").slice(0, 1)}
            </span>
          </div>
        </header>
        <div className="content" id="admin-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </>
  );
}
export function Overview({
  data,
  available,
}: {
  data: Data;
  available: Section[];
}) {
  const summary = (data.admin_summary || [])[0],
    can = (key: string) => available.some((s) => s.key === key),
    pending = num(summary, "pendingReviews"),
    questions = num(summary, "openQuestions");
  return (
    <>
      <AdminHeading
        title="오늘의 운영"
        description="먼저 처리할 검토와 참여 상태를 한눈에 확인하세요."
        eyebrow="OPERATIONS"
      >
        {can("reviews") && (
          <Link className="btn primary" href="/admin/reviews">
            검토 시작하기
            <ArrowRight />
          </Link>
        )}
      </AdminHeading>
      <div className="category-strip">
        {finalAdminGroups.map(([title, keys]) => {
          const first = keys.find(can),
            Icon = icons[first || ""] || LayoutGrid;
          return first ? (
            <Link href={"/admin/" + first} key={title}>
              <Icon />
              <h3>{title}</h3>
              <p>{keys.filter(can).length}개 메뉴</p>
            </Link>
          ) : null;
        })}
      </div>
      <div className="metrics">
        {can("reviews") && (
          <Metric
            label="검토 대기"
            value={
              <>
                {pending}
                <small>건</small>
              </>
            }
            note="오래 기다린 제출물부터 확인"
            highlight
            href="/admin/reviews"
          />
        )}
        {can("questions") && (
          <Metric
            label="미답변 질문"
            value={
              <>
                {questions}
                <small>건</small>
              </>
            }
            note="답변이 필요한 학습 질문"
            href="/admin/questions"
          />
        )}
        {can("customers") && (
          <Metric
            label="전체 회원"
            value={
              <>
                {num(summary, "members")}
                <small>명</small>
              </>
            }
            note="가입 회원 현황"
            href="/admin/customers"
          />
        )}
        {(can("products") || can("customers")) && (
          <Metric
            label="수강 중"
            value={
              <>
                {num(summary, "activeEnrollments")}
                <small>명</small>
              </>
            }
            note="활성 수강권 기준"
            href={can("members") ? "/admin/members" : undefined}
          />
        )}
      </div>
      <div className="two-col">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>지금 처리할 일</h2>
            </div>
            {can("reviews") && (
              <div className="task">
                <span className="task-icon">
                  <CheckSquare2 />
                </span>
                <div>
                  <h3>미션 검토 대기 {pending}건</h3>
                  <p>제출 내용과 피드백을 연결합니다.</p>
                </div>
                <Link className="btn small" href="/admin/reviews">
                  연속 검토
                </Link>
              </div>
            )}
            {can("questions") && (
              <div className="task">
                <span className="task-icon">
                  <MessageCircle />
                </span>
                <div>
                  <h3>학습 질문 {questions}건</h3>
                  <p>학습자의 질문을 확인하세요.</p>
                </div>
                <Link className="btn small" href="/admin/questions">
                  답변하기
                </Link>
              </div>
            )}
            {can("customers") && (
              <div className="task">
                <span className="task-icon">
                  <UsersRound />
                </span>
                <div>
                  <h3>회원 참여 현황</h3>
                  <p>진행 상태 확인 후 필요한 안내를 전달합니다.</p>
                </div>
                <Link className="btn small" href="/admin/members">
                  회원 확인
                </Link>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>클래스 운영</h2>
            </div>
            <div className="panel-body">
              {["products", "cohorts", "learning"].filter(can).map((key) => (
                <Link className="setting-line" href={"/admin/" + key} key={key}>
                  <span>
                    {finalAdminTitles[key] ||
                      available.find((s) => s.key === key)?.title}
                  </span>
                  <ArrowRight />
                </Link>
              ))}
            </div>
          </section>
        </div>
        <div className="stack">
          {can("analytics") && (
            <section className="panel">
              <div className="panel-head">
                <h2>모집 성과 바로가기</h2>
              </div>
              <div className="panel-body">
                <h3>모집 과정의 흐름을 확인하세요.</h3>
                <p className="meta mt16">
                  방문부터 신청·결제까지 실제 수집된 기록을 기준으로 표시합니다.
                </p>
                <Link className="btn full mt24" href="/admin/analytics">
                  랜딩 성과 보기
                  <ArrowRight />
                </Link>
              </div>
            </section>
          )}
          {can("orders") && (
            <section className="panel">
              <div className="panel-head">
                <h2>주문과 결제</h2>
              </div>
              <div className="panel-body">
                <div className="metric-label">순결제액 (승인−환불)</div>
                <div className="metric-value num">
                  {num(summary, "netRevenue").toLocaleString("ko-KR")}원
                </div>
                <Link className="btn full mt24" href="/admin/orders">
                  주문 결제 확인
                  <ArrowRight />
                </Link>
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-head">
              <h2>최근 검토 기록</h2>
            </div>
            <div className="panel-body">
              {(data.mission_submissions || [])
                .filter((s) => s.status === "approved")
                .slice(0, 3)
                .map((s) => (
                  <div className="activity-item" key={s.id}>
                    <span className="dot" />
                    <div>
                      <b>미션 승인</b>
                      <div className="meta">
                        {t(s, "reviewed_at")?.slice(0, 10) || "완료"} ·{" "}
                        {t(s, "reviewer_feedback") || "검토 완료"}
                      </div>
                    </div>
                  </div>
                ))}
              {!(data.mission_submissions || []).some(
                (s) => s.status === "approved",
              ) && <p className="meta">표시할 검토 기록이 없습니다.</p>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
