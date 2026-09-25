"use client";
import { defaultPolicies } from "@/lib/legal-policies";
import { createMutationGate } from "@/lib/mutation-gate";
import { sectionScopes } from "@/lib/operator-scopes";
import {
  labels,
  object,
  safeNext,
  safeUrl,
  sections,
  text as t,
  type Field,
  type Row,
  type Section,
  type User,
} from "@/lib/platform";
import { homepageCourses, isRecruiting, localDateTime, recordId } from "@/lib/platform-rules";
import { archiveValues } from "@/lib/qa-rules";
import { createClient } from "@/lib/supabase/client";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { ArrowRight, BookOpen, CalendarDays, CreditCard, LayoutDashboard, LogOut, Menu, Pencil, Plus, Search, Ticket, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { AdminWorkflows, standaloneAdmin } from "./admin-workflows";
import { BlocksField, UploadField } from "./editor-fields";
import { AdminCatalog, type MissionScope } from "./final/admin-catalog";
import { MissionTargetFields, type MissionContext } from "./final/mission-target-fields";
import { useAdminDialog, useRouteDialog } from "@/features/admin-ui";
import { ArticleBannerEditor } from "./final/article-banner-editor";
import { ArticleCategoryManager } from "./final/article-category-manager";
import { ProductEditor } from "./final/admin-editors";
import { LearningEditor } from "./final/learning-editor";
import {
  AdminHeading,
  AdminShell,
  Overview,
  finalAdminTitles,
  sectionDescription,
} from "./final/admin-shell";
import { Checkout } from "./final/checkout";
import { Classroom } from "./final/classroom";
import { MemberViews } from "./final/member-views";
import { CustomerWorkspace } from "./final/customer-workspace";
import {
  ArticleCard,
  Brand,
  CourseCard,
  Empty,
  Heading,
  courseType,
} from "./final/primitives";
import { StoryCarousel } from "./final/story-carousel";
import {
  ArticlesView,
  AuthView,
  ProductDetail,
  StoriesView,
} from "./final/public-views";
import { OrderResult } from "./order-result";
import { SiteFooter } from "./final/site-footer";
import { HomeHero } from "./final/home-hero";
import { MarketingWorkspaceNav } from "./marketing-workspace-nav";
import { ConversionReview, prefetchConversionReview } from "./conversion-review";
import {
  AdminEmptyState,
  AdminInlineError,
  AdminLoadingState,
  AdminToast,
} from "@/features/admin-ui";
type Data = Record<string, Row[]>;
type AdminRead = {
  ok: boolean;
  status: number;
  result: Record<string, unknown>;
  serverTiming: string | null;
};
const adminNavigationReads = new Map<
  string,
  { expiresAt: number; promise: Promise<AdminRead> }
>();

function readAdminSection(
  userId: string,
  section: string,
  page: number,
  record = "",
  forceNetwork = false,
  scopeQuery = "",
) {
  const key = `${userId}:${section}:${page}:${record}:${scopeQuery}`;
  const cached = adminNavigationReads.get(key);
  if (!forceNetwork && cached && (!cached.expiresAt || cached.expiresAt > Date.now()))
    return cached.promise;
  if (cached) adminNavigationReads.delete(key);

  const query = new URLSearchParams({
    admin: "1",
    section,
    page: String(page),
  });
  if (record) query.set("record", record);
  new URLSearchParams(scopeQuery).forEach((value, key) => query.set(key, value));
  const entry = {
    expiresAt: 0,
    promise: fetch(`/api/platform?${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    }).then(
      async (response): Promise<AdminRead> => ({
        ok: response.ok,
        status: response.status,
        result: await response.json(),
        serverTiming: response.headers.get("Server-Timing"),
      }),
    ),
  };
  adminNavigationReads.set(key, entry);
  void entry.promise.then(
    (read) => {
      if (adminNavigationReads.get(key) !== entry) return;
      if (!read.ok || (read.result.user as User | null)?.id !== userId) {
        adminNavigationReads.delete(key);
        return;
      }
      entry.expiresAt = Date.now() + 5000;
    },
    () => {
      if (adminNavigationReads.get(key) === entry)
        adminNavigationReads.delete(key);
    },
  );
  while (adminNavigationReads.size > 20) {
    const oldestKey = adminNavigationReads.keys().next().value;
    if (oldestKey) adminNavigationReads.delete(oldestKey);
    else break;
  }
  return entry.promise;
}

// Preserve only the last server-verified operator identity during client-side
// admin navigation. Every read and write is still authorized by the server.
let cachedAdminUser: User | null = null;
const nav = [
  ["/classes?type=free", "무료 클래스"],
  ["/classes", "전체 클래스"],
  ["/stories", "고객 이야기"],
  ["/articles", "아티클"],
];
export function Platform({
  path,
  user: initialUser,
}: {
  path: string[];
  user: User | null;
}) {
  const router = useRouter();
  const admin = path[0] === "admin";
  const account = path[0] === "my";
  const learning = path[0] === "learn";
  const [support, setSupport] = useState({ email: "", url: "" });
  const [loadedData, setData] = useState<Data>({});
  const [user, setUser] = useState(() =>
    initialUser || (admin ? cachedAdminUser : null),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [adminPaging, setAdminPaging] = useState({ section: "", page: 1 });
  const [pagination, setPagination] = useState<{
    page: number;
    pageSize: number;
    total: number;
  } | null>(null);
  const [loadedSection, setLoadedSection] = useState("");
  const [loadedScope, setLoadedScope] = useState("");
  const searchParams = useSearchParams();
  const routeKey = path.join("/") + "?" + searchParams.toString();
  const [filters, setFilters] = useState({
    route: routeKey,
    value:
      path[0] === "classes" && searchParams.get("type") === "free"
        ? "무료 클래스"
        : "전체",
  });
  const filter =
    filters.route === routeKey
      ? filters.value
      : path[0] === "classes" && searchParams.get("type") === "free"
        ? "무료 클래스"
        : "전체";
  const setFilter = (value: string) => setFilters({ route: routeKey, value });
  const [editor, setEditor] = useRouteDialog<{
    route: string;
    section: Section;
    row?: Row;
    context?: MissionContext;
  }>(routeKey);
  const missionScopeSource = `${searchParams.get("course") || ""}:${searchParams.get("week") || ""}`;
  const initialMissionScope: MissionScope = { courseId: searchParams.get("course") || "", weekId: searchParams.get("week") || "", state: "active" };
  const [missionFilter, setMissionFilter] = useState({ source: missionScopeSource, scope: initialMissionScope });
  const missionScope = missionFilter.source === missionScopeSource ? missionFilter.scope : initialMissionScope;
  const setMissionScope = (scope: MissionScope) => setMissionFilter({ source: missionScopeSource, scope });
  const [selection, setSelection] = useState<string[]>([]);
  const [articleAdminTab, setArticleAdminTab] = useState<"content" | "banner">("content");
  const alive = useRef(true);
  const readRequest = useRef<AbortController | null>(null);
  const mutationGate = useRef(createMutationGate<Record<string, unknown>>());
  const adminSection =
    path[1] === "product-editor"
      ? "products"
      : path[1] === "learning-editor"
        ? "learning"
        : path[1] || "home";
  const editorRecordId = ["product-editor", "learning-editor"].includes(path[1])
    ? searchParams.get("id") || ""
    : "";
  const scopeQuery = adminSection === "missions" ? new URLSearchParams({ course: missionScope.courseId, week: missionScope.weekId, missionState: missionScope.state }).toString() : ["customers", "questions", "reviews"].includes(adminSection) ? new URLSearchParams({ member: searchParams.get("member") || "", submission: searchParams.get("submission") || "", question: searchParams.get("question") || "", questionState: searchParams.get("questionState") || "active" }).toString() : "";
  const pagingKey = adminSection + "?" + scopeQuery;
  const adminPage = adminPaging.section === pagingKey ? adminPaging.page : 1;
  const data = !admin || (loadedSection === adminSection && loadedScope === scopeQuery) ? loadedData : {};
  const setAdminPage = (update: number | ((page: number) => number)) =>
    setAdminPaging((current) => ({
      section: pagingKey,
      page:
        typeof update === "function"
          ? update(current.section === pagingKey ? current.page : 1)
          : update,
    }));
  const refresh = useCallback(async (forceNetwork = false) => {
    readRequest.current?.abort();
    const controller = new AbortController();
    readRequest.current = controller;
    setLoading(true);
    setError("");
    setAccessDenied(false);
    try {
      const started = performance.now();
      const response = admin
        ? await readAdminSection(
            cachedAdminUser?.id || "anonymous",
            adminSection,
            adminPage,
            editorRecordId,
            forceNetwork,
            scopeQuery,
          )
        : await (async () => {
            const response = await fetch("/api/platform", {
              cache: "no-store",
              signal: controller.signal,
            });
            return {
              ok: response.ok,
              status: response.status,
              result: await response.json(),
              serverTiming: response.headers.get("Server-Timing"),
            };
          })();
      const result = response.result as {
        user: User | null;
        data?: Data;
        support?: { email: string; url: string };
        pagination?: { page: number; pageSize: number; total: number } | null;
        error?: string;
      };
      if (admin && process.env.NEXT_PUBLIC_APP_ENV !== "production") {
        console.debug("[edu navigation] " + JSON.stringify({ section: adminSection, durationMs: Math.round(performance.now() - started), serverTiming: response.serverTiming }));
      }
      if (controller.signal.aborted || !alive.current) return;
      if (admin && [401, 403].includes(response.status)) {
        adminNavigationReads.clear();
        cachedAdminUser = result.user || null;
        setUser(cachedAdminUser);
        setData({});
        setAccessDenied(response.status === 403);
        return;
      }
      if (!response.ok) throw new Error(result.error);
      if (alive.current) {
        setData(result.data || {});
        setLoadedSection(adminSection);
        setLoadedScope(scopeQuery);
        setSupport(result.support || { email: "", url: "" });
        if (admin && cachedAdminUser?.id !== result.user?.id)
          adminNavigationReads.clear();
        if (admin) cachedAdminUser = result.user;
        setUser(result.user);
        setPagination(result.pagination || null);
      }
    } catch (e) {
      if (alive.current && !controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (alive.current && !controller.signal.aborted) setLoading(false);
    }
  }, [admin, adminPage, adminSection, editorRecordId, scopeQuery]);
  const prefetchAdminSection = useCallback(
    (section: string) => {
      if (!admin || !user?.id || section === adminSection) return;
      const page =
        adminPaging.section === section ? adminPaging.page : 1;
      void readAdminSection(user.id, section, page);
      if (section === "conversion") prefetchConversionReview(user.id);
    },
    [admin, adminPaging, adminSection, user],
  );
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(timer);
      alive.current = false;
      readRequest.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node))
        setProfileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);
  const send = (body: Record<string, unknown>, success = "저장했습니다.") =>
    mutationGate.current(body, async (payload) => {
      setPending(true);
      setNotice("");
      try {
        const response = await fetch(
          body.workflow ? "/api/platform/workflows" : "/api/platform",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const result = await response.json();
        if (!response.ok) throw Object.assign(new Error(result.error || '요청을 처리하지 못했습니다.'), { status: response.status, code: result.code });
        setNotice(result.message || success);
        adminNavigationReads.clear();
        await refresh(true);
        return result;
      } catch (e) {
        setNotice((e as Error).message);
        throw e;
      } finally {
        setPending(false);
      }
    });
  async function archive(section: Section, ids: string[]) {
    if (!ids.length || ids.length > 50) {
      setNotice("최대 50개까지 선택해 주세요.");
      return;
    }
    if (
      !window.confirm(
        section.key === "products" ? `선택한 상품 ${ids.length}개를 삭제할까요? 판매 목록에서 숨겨지며 주문·수강 기록과 파일은 유지됩니다. 삭제된 상품 보기에서 복원할 수 있습니다.` : `${section.title} ${ids.length}개를 보관·숨김 처리할까요? 연결된 주문과 학습 기록, 파일은 삭제하지 않습니다. 기수 보관은 모집을 취소합니다.`,
      )
    )
      return;
    try {
      await send(
        { action: "archive", section: section.key, ids },
        section.key === "products" ? "상품을 삭제했습니다. 주문·수강 기록은 유지됩니다." : "보관·숨김 처리했습니다.",
      );
      setSelection([]);
      setEditor(null);
    } catch {}
  }
  const rows = (key: string) => data[key] || [];
  const courses = rows("courses");
  const recruitingCourses = courses.filter((c) =>
    rows("cohorts").some((g) => g.course_id === c.id && isRecruiting(g)),
  );
  const availableCourses = homepageCourses(courses, rows("cohorts"));
  const free =
    recruitingCourses.find((c) => t(c, "category") === "free") ||
    courses.find((c) => t(c, "category") === "free");
  const freeOpen = !!free && recruitingCourses.some((c) => c.id === free.id);
  const selected = courses.find((c) => c.slug === path[1] || c.id === path[1]);
  const freeClassDetail =
    path[0] === "classes" &&
    path.length > 1 &&
    !!selected &&
    courseType(selected) === "무료 클래스";
  async function social(provider: "google" | "kakao") {
    setPending(true);
    setNotice("");
    try {
      const { publicUrl, publishableKey } = getSupabasePublicConfig();
      const r = await fetch(publicUrl + "/auth/v1/settings", {
        headers: { apikey: publishableKey },
      });
      if (!r.ok) throw new Error("로그인 설정을 확인하지 못했습니다.");
      const settings = await r.json();
      if (settings.external?.[provider] !== true)
        throw new Error(
          "로그인 서비스를 준비하고 있습니다. 잠시 후 다시 시도해 주세요.",
        );
      const next = safeNext(new URLSearchParams(location.search).get("next"));
      // Only Kakao opts into Sync. Google and the anonymous free-class CTA are unchanged.
      let syncOptions: { scopes?: string } = {};
      if (provider === "kakao") {
        try {
          const response = await fetch("/api/auth/kakao-sync", { cache: "no-store", signal: AbortSignal.timeout(2500) });
          if (response.ok) {
            const config = await response.json();
            if (config.options?.scopes === "plusfriends") syncOptions = { scopes: "plusfriends" };
          }
        } catch { /* Fall back to the existing Kakao login. */ }
      }
      const { error } = await createClient().auth.signInWithOAuth({
        provider,
        options: {
          ...syncOptions,
          redirectTo:
            location.origin + "/auth/callback?next=" + encodeURIComponent(next) + "&provider=" + provider,
        },
      });
      if (error) throw error;
    } catch {
      setNotice(
        "소셜 로그인에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      setPending(false);
    }
  }
  const logout = async () => {
    setPending(true);
    const { error } = await createClient().auth.signOut();
    if (error) {
      setNotice("로그아웃에 실패했습니다.");
      setPending(false);
      return;
    }
    cachedAdminUser = null;
    adminNavigationReads.clear();
    setUser(null);
    router.replace("/login");
    router.refresh();
    setPending(false);
  };
  const loginHref = "/login?next=" + encodeURIComponent("/" + path.join("/"));
  const header = (
    <>
      <a className="skip" href="#main">
        본문으로 이동
      </a>
      <header className="site-header">
        <div
          className={
            "wrap " + (account || learning ? "learning-chrome" : "header-inner")
          }
        >
          <Brand />
          {account || learning ? (
            <div className="learning-context">
              <b>나의 학습</b>
              <span>배움을 실행으로 이어가는 공간</span>
            </div>
          ) : (
            <nav className="main-nav" aria-label="주 메뉴">
              {nav.map(([href, label]) => (
                <Link
                  href={href}
                  key={href}
                  className={"/" + path[0] === href ? "active" : ""}
                >
                  {label}
                </Link>
              ))}
            </nav>
          )}
          <div className="header-user">
            {user ? (
              <>
                <Link className="link" href="/my">
                  마이페이지
                </Link>
                <div className="profile-menu-wrap" ref={profileMenuRef}>
                  <button
                    type="button"
                    className="avatar profile-menu-trigger"
                    aria-label="내 프로필 메뉴"
                    aria-haspopup="true"
                    aria-expanded={profileMenuOpen}
                    onClick={() => setProfileMenuOpen((open) => !open)}
                  >
                    {(user.full_name || "나").slice(0, 1)}
                  </button>
                  {profileMenuOpen && (
                    <nav className="profile-menu" aria-label="내 프로필 메뉴">
                      <div className="profile-menu-identity">
                        <span className="avatar" aria-hidden="true">{(user.full_name || "나").slice(0, 1)}</span>
                        <span><b>{user.full_name || "회원"}</b><small>{user.email}</small></span>
                      </div>
                      <Link href="/my" onClick={() => setProfileMenuOpen(false)}><LayoutDashboard aria-hidden="true" />마이페이지로 이동</Link>
                      <Link href="/my/profile" onClick={() => setProfileMenuOpen(false)}><UserRound aria-hidden="true" />내 정보 수정</Link>
                      <Link href="/my/coupons" onClick={() => setProfileMenuOpen(false)}><Ticket aria-hidden="true" />내 쿠폰함</Link>
                      <Link href="/my/orders" onClick={() => setProfileMenuOpen(false)}><CreditCard aria-hidden="true" />신청·결제 내역</Link>
                      <Link href="/my/classes" onClick={() => setProfileMenuOpen(false)}><CalendarDays aria-hidden="true" />내 클래스</Link>
                      <button type="button" onClick={() => { setProfileMenuOpen(false); void logout(); }}><LogOut aria-hidden="true" />로그아웃</button>
                    </nav>
                  )}
                </div>
              </>
            ) : (
              <Link className="btn" href="/login">
                로그인
              </Link>
            )}
            <button
              className="icon-btn mobile-only"
              aria-label="메뉴 열기"
              aria-expanded={mobile}
              onClick={() => setMobile(!mobile)}
            >
              <Menu />
            </button>
          </div>
        </div>
        {mobile && (
          <nav className="mobile-nav open">
            {nav.map(([href, label]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
            <Link href="/my">마이페이지</Link>
          </nav>
        )}
      </header>
    </>
  );
  const footer =
    account || learning ? (
      <footer className="learning-footer">
        <div className="wrap">
          <span>BRANDYACTION EDU · 나의 배움과 실행</span>
          <nav className="learning-footer-links" aria-label="마이페이지 푸터 안내">
            {support.email && <a href={"mailto:" + support.email}>이메일 문의</a>}
            {safeUrl(support.url) && (
              <a target="_blank" rel="noreferrer" href={safeUrl(support.url)}>
                고객센터
              </a>
            )}
            <Link href="/">홈으로</Link>
          </nav>
        </div>
      </footer>
    ) : (
      <SiteFooter supportEmail={support.email} supportUrl={safeUrl(support.url)} />
    );
  let body: ReactNode;
  if (path[0] === "login" || path[0] === "signup")
    body = (
      <AuthView
        signup={path[0] === "signup"}
        pending={pending}
        social={social}
        next={safeNext(searchParams.get("next"))}
        authError={searchParams.get("error")}
      />
    );
  else if ((account || learning) && !user)
    body = (
      <div className="wrap">
        <Empty title="로그인하고 학습을 이어가세요." />
        <div className="center">
          <Link className="btn primary" href={loginHref}>
            로그인·회원가입 <ArrowRight />
          </Link>
        </div>
      </div>
    );
  else if (admin) body = adminView();
  else if (path.length === 0)
    body = (
      <>
        <HomeHero
          banners={rows("site_banners")}
          freeCourse={free}
          freeOpen={freeOpen}
        />
        <div className="wrap">
          <section className="section recruiting-section">
            <div className="section-head">
              <div>
                <div className="eyebrow">01 / NEXT PROGRAM</div>
                <h2>지금 참여할 수 있는 클래스</h2>
                <p>시작의 크기는 달라도, 목표는 실제 업무의 변화입니다.</p>
              </div>
              <Link className="link" href="/classes">
                모든 클래스 <ArrowRight />
              </Link>
            </div>
            <div className="grid3 course-grid">
              {availableCourses.slice(0, 3).map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
            {!loading && !availableCourses.length && (
              <Empty title="새로운 클래스를 준비하고 있습니다." />
            )}
          </section>
          <section className="section">
            <div className="section-head">
              <div>
                <div className="eyebrow">03 / INSIGHT TO ACTION</div>
                <h2>일하는 방식을 바꾸는 인사이트</h2>
                <p>내 업무에 가져갈 수 있는 구체적인 관점과 방법.</p>
              </div>
              <Link className="link" href="/articles">
                아티클 전체 보기 <ArrowRight />
              </Link>
            </div>
            <div className="grid3 editorial-grid">
              {rows("articles")
                .slice(0, 3)
                .map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
            </div>
          </section>
          {rows("review_videos").length > 0 && (
            <section className="section results-section">
              <div className="section-head">
                <div>
                  <div className="eyebrow">04 / LEARNING IN PRACTICE</div>
                  <h2>실행한 과정이, 다음 사람의 시작으로.</h2>
                </div>
                <Link className="link" href="/stories">
                  고객 이야기 <ArrowRight />
                </Link>
              </div>
              <StoryCarousel stories={rows("review_videos")} />
            </section>
          )}
        </div>
        <section className="final-offer">
          <div className="wrap">
            <div>
              <div className="eyebrow">YOUR NEXT ACTION</div>
              <h2>첫 실행은, 무료 클래스에서.</h2>
              <p>내 업무 한 가지를 떠올리고 시작해 보세요.</p>
            </div>
            <Link className="btn primary large" href="/classes?type=free">
              무료 클래스 살펴보기 <ArrowRight />
            </Link>
          </div>
        </section>
      </>
    );
  else if (path[0] === "classes" && path.length === 1)
    body = (
      <div className="wrap">
        <Heading
          title="내 일의 다음 단계를 찾아보세요."
          description="무료 클래스부터 실전 과정, 바로 사용하는 자료까지."
        />
        <div className="filter-row">
          <div className="chips">
            {["전체", "무료 클래스", "유료 클래스", "디지털 상품"].map((f) => (
              <button
                key={f}
                className={"chip " + (filter === f ? "active" : "")}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <label className="search">
            <Search />
            <input
              type="search"
              placeholder="클래스 검색"
              aria-label="클래스 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="grid3 course-grid pb64">
          {courses
            .filter(
              (c) =>
                (filter === "전체" || courseType(c) === filter) &&
                t(c, "title").includes(query),
            )
            .map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
        </div>
        {!loading && !courses.length && (
          <Empty title="등록된 클래스가 없습니다." />
        )}
      </div>
    );
  else if (path[0] === "classes" && selected)
    body = <ProductDetail key={selected.id} course={selected} data={data} />;
  else if (path[0] === "articles")
    body = (
      <ArticlesView slug={path[1]} data={data} user={user} loading={loading} />
    );
  else if (path[0] === "stories")
    body = <StoriesView data={data} loading={loading} />;
  else if (account && user)
    body = (
      <MemberViews
        key={path[1] || "dashboard"}
        section={path[1]}
        data={data}
        user={user}
        pending={pending}
        send={send}
        logout={logout}
        order={searchParams.get("order")}
      />
    );
  else if (learning)
    body = (
      <Classroom
        path={path}
        data={data}
        pending={pending}
        send={send}
        loading={loading}
        missionId={searchParams.get("mission")}
      />
    );
  else if (path[0] === "checkout" || path[0] === "apply") body = checkout();
  else if (["order-complete", "applied", "payment"].includes(path[0]))
    body = <OrderResult data={data} refresh={refresh} />;
  else if (path[0] === "policies") body = <Policy kind={path[1]} />;
  else
    body = (
      <div className="wrap">
        {loading ? (
          <section className="page-loading" role="status" aria-live="polite" aria-busy="true">
            <span className="page-loading-spinner" aria-hidden="true" />
            <h1>곧 열립니다</h1>
            <p>페이지를 준비하고 있어요. 잠시만 기다려 주세요.</p>
          </section>
        ) : (
          <>
            <Empty title={error ? "페이지를 불러오지 못했습니다." : "페이지를 찾을 수 없습니다."} />
            {!error && <div className="center">
              <Link className="btn primary" href="/">
                홈으로
              </Link>
            </div>}
          </>
        )}
      </div>
    );
  function checkout() {
    return <Checkout data={data} user={user} pending={pending} send={send} />;
  }
  function adminView() {
    if (accessDenied) return <div className="wrap"><AdminEmptyState title="이 메뉴에 접근할 운영 권한이 없습니다." action={<div className="row wrap"><Link className="btn primary" href="/admin">운영 홈으로</Link><Link className="btn" href="/my">마이페이지</Link></div>}>현재 계정에 부여된 운영 범위에서 다른 메뉴를 선택해 주세요.</AdminEmptyState></div>;
    if (!["admin", "staff"].includes(user?.role || ""))
      return (
        <div className="wrap">
          {loading ? <AdminLoadingState title="운영자 권한을 확인하고 있습니다." description="활성 계정과 접근 범위를 확인한 뒤 화면을 엽니다."/> : error ? <AdminInlineError onRetry={() => void refresh()}>로그인 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.</AdminInlineError> : <AdminEmptyState title="운영자 로그인이 필요합니다." action={<Link className="btn primary" href={"/login?next=" + encodeURIComponent("/" + routeKey)}>로그인하기</Link>}>관리자 또는 운영 스태프 계정으로 로그인해 주세요.</AdminEmptyState>}
        </div>
      );
    const available = sections.filter(
      (s) =>
        user!.role === "admin" ||
        (s.key !== "staff" &&
          user!.permissions?.[sectionScopes[s.key]] === true),
    );
    const key = path[1] || "overview";
    const section = available.find(
      (s) =>
        s.key ===
        (key === "product-editor"
          ? "products"
          : key === "learning-editor"
            ? "learning"
            : key),
    );
    const edit = (section: Section, row?: Row, context?: MissionContext) => {
      if (section.key === "products" || section.key === "learning")
        router.push(
          "/admin/" +
            (section.key === "products"
              ? "product-editor"
              : "learning-editor") +
            (row ? "?id=" + row.id : ""),
        );
      else setEditor({ route: routeKey, section, row, context: context || (section.key === "missions" ? missionScope : undefined) });
    };
    const back = () =>
      router.push(
        "/admin/" + (key === "product-editor" ? "products" : "learning"),
      );
    const id = searchParams.get("id");
    const edited =
      section && id ? rows(section.table).find((r) => r.id === id) : undefined;
    return (
      <AdminShell
        current={key}
        available={available}
        user={user!}
        pendingReviews={Number((data.admin_summary || [])[0]?.pendingReviews || 0)}
        mobile={mobile}
        setMobile={setMobile}
        logout={logout}
        prefetchSection={prefetchAdminSection}
      >
        <MarketingWorkspaceNav current={key} available={available} search={searchParams.toString()} prefetchSection={prefetchAdminSection} />
        {loadedSection !== adminSection ? (
          error ? <AdminInlineError onRetry={() => void refresh(true)}>화면 정보를 불러오지 못했습니다. 연결 상태를 확인해 주세요.</AdminInlineError> : <AdminLoadingState title="메뉴 내용을 불러오는 중입니다." description="현재 운영 데이터를 안전하게 확인하고 있습니다."/>
        ) : key === "overview" ? (
          <Overview data={data} available={available} />
        ) : !section ? (
          <AdminEmptyState title="이 화면에 접근할 운영 권한이 필요합니다.">운영 홈에서 현재 계정에 표시되는 메뉴를 선택해 주세요.</AdminEmptyState>
        ) : key === "conversion" ? (
          <ConversionReview workspace initialPeriod={searchParams.get("recruitment") || undefined} userId={user!.id} />
        ) : key === "product-editor" || key === "learning-editor" ? (
          loading && id && !edited ? (
            <AdminLoadingState title="편집 정보를 불러오는 중입니다." description="저장된 항목과 공개 상태를 확인하고 있습니다."/>
          ) : id && !edited ? (
            <AdminEmptyState title="편집할 항목을 찾을 수 없습니다." action={<button className="btn" type="button" onClick={back}>목록으로 돌아가기</button>}>삭제되었거나 현재 계정의 운영 범위 밖에 있는 항목일 수 있습니다.</AdminEmptyState>
          ) : key === "product-editor" ? (
            <ProductEditor
              key={edited?.id || "new-product"}
              data={data}
              row={edited}
              pending={pending}
              send={send}
              back={back}
            />
          ) : (
            <LearningEditor
              key={edited?.id || "new-lesson"}
              data={data}
              row={edited}
              pending={pending}
              send={send}
              back={back}
            />
          )
        ) : (
          <>
            {section.key !== "landing" && <AdminHeading
              title={finalAdminTitles[section.key] || section.title}
              description={sectionDescription[section.key]}
              eyebrow={
                section.group === "클래스 관리"
                  ? "CLASS MANAGEMENT"
                  : section.group === "고객 관리"
                    ? "CUSTOMER MANAGEMENT"
                    : section.group === "콘텐츠 관리"
                      ? "CONTENT MANAGEMENT"
                      : undefined
              }
            >
              {section.key === "customers" && (
                <button
                  className="btn"
                  onClick={() => downloadCsv(rows("profiles"), "customers")}
                >
                  현재 페이지 명단 내보내기
                </button>
              )}
              {section.key === "articles" && <Link className="btn" href="/articles" target="_blank">고객 화면 미리보기</Link>}
              {!standaloneAdmin.includes(section.key) &&
                !section.readOnly &&
                ![
                  "profiles",
                  "reviews",
                  "mission_submissions",
                  "edu_questions",
                ].includes(section.table) && (
                  <button className="btn primary" onClick={() => edit(section)}>
                    <Plus />
                    {section.key === "products"
                      ? "상품 등록"
                      : section.key === "learning"
                        ? "학습 추가"
                        : section.key === "coupons"
                          ? "쿠폰 만들기"
                        : "새로 등록"}
                  </button>
                )}
            </AdminHeading>}
            {standaloneAdmin.includes(section.key) ? (
              <AdminWorkflows
                key={section.key + scopeQuery + (section.key === 'members' ? searchParams.toString() : '')}
                section={section.key}
                data={data}
                send={send}
                pending={pending}
                pagination={pagination}
                setPage={setAdminPage}
                loading={loading}
              />
            ) : (
              <>
              {section.key === "articles" && <nav className="article-admin-tabs" aria-label="아티클 관리 구분"><button type="button" className={`btn ${articleAdminTab === "content" ? "dark" : ""}`} aria-pressed={articleAdminTab === "content"} onClick={() => setArticleAdminTab("content")}><Pencil />아티클 콘텐츠</button><button type="button" className={`btn ${articleAdminTab === "banner" ? "dark" : ""}`} aria-pressed={articleAdminTab === "banner"} onClick={() => setArticleAdminTab("banner")}><BookOpen />무료강의 상단 설정</button></nav>}
              {section.key === "articles" && articleAdminTab === "banner" ? <ArticleBannerEditor key={JSON.stringify(object(rows("site_settings").find(row => row.key === "edu_article_banner"), "value"))} settings={rows("site_settings")} send={send} pending={pending} /> : <>{section.key === "articles" && <ArticleCategoryManager categories={rows("article_categories")} articles={rows("articles")} send={send} pending={pending} />}<AdminCatalog
                key={section.key + scopeQuery}
                section={section}
                data={data}
                selection={selection}
                setSelection={setSelection}
                edit={edit}
                missionScope={section.key === "missions" ? missionScope : undefined}
                onMissionScopeChange={next => { setMissionScope(next); setAdminPage(1); setSelection([]); }}
                archive={(s, ids) => void archive(s, ids)}
                pending={pending}
                loading={loading}
                pagination={pagination}
                setPage={setAdminPage}
                exportCsv={downloadCsv}
                send={send}
                tools={
                  ["cohorts", "missions", "customers"].includes(section.key) ? (
                    <AdminWorkflows
                      section={section.key}
                      data={data}
                      send={send}
                      pending={pending}
                      selection={selection}
                    />
                  ) : undefined
                }
              /></>}
              </>
            )}
          </>
        )}
      </AdminShell>
    );
  }
  return (
    <div
      className={
        admin
          ? "edu-admin"
          : "edu-front" + (freeClassDetail ? " free-class-detail-page" : "")
      }
    >
      {!admin && header}
      <main
        id="main"
        className={
          path[0] === "classes" && path.length > 1 ? "with-bottom-cta" : ""
        }
      >
        {!admin && error && (
          <div className="error-banner" role="alert">
            {error}
            <button className="btn small" onClick={() => void refresh()}>
              다시 시도
            </button>
          </div>
        )}
        {!admin && loading && (
          <div className="loading-bar" role="status" aria-label="불러오는 중" />
        )}
        {body}
      </main>
      {!admin && footer}
      {notice && (admin ? <AdminToast tone="success">{notice}</AdminToast> : <div className="toast" role="status">{notice}</div>)}
      {editor && editor.route === routeKey && (
        <Editor
          key={editor.section.key + (editor.row ? recordId(editor.row) : "new")}
          section={editor.section}
          row={editor.row}
          context={editor.context}
          data={data}
          pending={pending}
          close={() => setEditor(null)}
          archive={
            editor.row && archiveValues[editor.section.key]
              ? () => void archive(editor.section, [recordId(editor.row!)])
              : undefined
          }
          deleteMember={
            editor.row && editor.section.key === "customers"
              ? () => {
                  const member = editor.row!;
                  if (!window.confirm(`${t(member, "full_name") || t(member, "email")} 회원을 삭제할까요? 로그인과 서비스 이용은 차단되며 주문·결제·수강 이력은 보존됩니다.`)) return;
                  void send(
                    { action: "delete-member", id: recordId(member) },
                    "회원을 삭제했습니다. 주문·결제·수강 이력은 유지됩니다.",
                  ).then(() => setEditor(null)).catch(() => undefined);
                }
              : undefined
          }
          save={async (values, requestId) => {
            await send({
              action: "save",
              section: editor.section.key,
              id: editor.row ? recordId(editor.row) : undefined,
              requestId,
              values,
            });
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}
function downloadCsv(rows: Row[], name: string) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) =>
    '"' +
    String(v && typeof v === "object" ? JSON.stringify(v) : (v ?? ""))
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const csv =
    "\ufeff" +
    [
      keys.map(cell).join(","),
      ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
    ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function Editor({
  section,
  row,
  context,
  data,
  pending,
  close,
  save,
  archive,
  deleteMember,
}: {
  section: Section;
  row?: Row;
  context?: MissionContext;
  data: Data;
  pending: boolean;
  close: () => void;
  save: (values: Record<string, unknown>, requestId?: string) => Promise<void>;
  archive?: () => void;
  deleteMember?: () => void;
}) {
  const ref = useAdminDialog();
  const requestId = useRef(crypto.randomUUID());
  const [memberTab, setMemberTab] = useState("profile");
  const [error, setError] = useState("");
  useEffect(() => {
    if (error) ref.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
  }, [error, ref]);
  const [questionAnswer, setQuestionAnswer] = useState(() => t(row, "answer"));
  const [questionAiPending, setQuestionAiPending] = useState(false);
  const [questionAiMessage, setQuestionAiMessage] = useState("");
  const [tagKind, setTagKind] = useState(String(row?.tag_kind || "manual"));
  const [tagRule, setTagRule] = useState(String(row?.rule_key || "free_lesson_1"));
  const [couponDiscountType, setCouponDiscountType] = useState(String(row?.discount_type || "percentage"));
  const [couponDiscountValue, setCouponDiscountValue] = useState(Number(row?.discount_value || 10));
  const [couponProductScope, setCouponProductScope] = useState(String(row?.product_scope || "paid"));
  const [couponIssueTarget, setCouponIssueTarget] = useState(String(row?.issue_target || "all"));
  const couponCourseId = String((data.coupon_products || []).find(item => item.coupon_id === row?.id)?.course_id || "");
  const customerTags =
    section.key === "customers" && row
      ? (data.crm_member_tags || [])
          .filter((item) => item.member_id === row.id)
          .map((item) => (data.crm_tags || []).find((tag) => tag.id === item.tag_id))
          .filter(Boolean) as Row[]
      : [];
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const values: Record<string, unknown> = {};
      if (section.key === "tags") {
        const kind = String(form.get("tag_kind") || "manual");
        values.name = form.get("name") || null;
        values.color = row?.color || "#667ca0";
        values.description = row?.description || null;
        values.tag_kind = kind;
        values.rule_key = kind === "automatic" ? form.get("rule_key") || null : null;
        values.threshold_percent = kind === "automatic" && tagRule.startsWith("free_lesson_") ? Number(form.get("threshold_percent") || 80) : 100;
        values.apply_existing = form.get("apply_existing") === "on";
        values.is_active = form.get("is_active") === "on";
        await save(values, row ? undefined : requestId.current);
        return;
      }
      if (section.key === "coupons") {
        for (const key of ["name", "code", "discount_type", "discount_value", "max_discount_amount", "minimum_order_amount", "product_scope", "applicable_course_id", "issue_target", "target_tag_id", "starts_at", "ends_at", "usage_limit", "per_user_limit"]) {
          const value = form.get(key);
          values[key] = ["discount_value", "max_discount_amount", "minimum_order_amount", "usage_limit", "per_user_limit"].includes(key) ? (value === "" ? null : Number(value)) : ["starts_at", "ends_at"].includes(key) ? (value ? new Date(String(value)).toISOString() : null) : value || null;
        }
        values.is_active = form.get("is_active") === "on";
        values.exclude_free = form.get("exclude_free") === "on";
        await save(values, row ? undefined : requestId.current);
        return;
      }
      for (const field of section.fields) {
        const value = form.get(field.key);
        if (field.type === "checkbox") values[field.key] = value === "on";
        else if (field.type === "json" || field.type === "blocks")
          values[field.key] = value ? JSON.parse(String(value)) : {};
        else if (field.type === "number")
          values[field.key] =
            value === ""
              ? field.key === "list_price"
                ? 0
                : null
              : Number(value);
        else if (field.type === "datetime-local")
          values[field.key] = value
            ? new Date(String(value)).toISOString()
            : null;
        else values[field.key] = value || null;
      }
      if (section.key === "missions") {
        values.course_id = form.get("course_id");
        values.week_id = form.get("week_id");
        if (!values.course_id || !values.week_id || !values.lesson_id) throw new Error("상품·주차·학습을 순서대로 선택해 주세요.");
      }
      await save(values, row ? undefined : requestId.current);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const generateQuestionAnswer = async () => {
    if (!row?.id || questionAiPending || pending) return;
    setQuestionAiPending(true);
    setQuestionAiMessage("");
    try {
      const response = await fetch("/api/admin/questions/answer-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: row.id }),
      });
      const result = (await response.json()) as {
        draft?: string;
        error?: string;
      };
      if (!response.ok || !result.draft)
        throw new Error(result.error || "AI 답변 초안을 생성하지 못했습니다.");
      setQuestionAnswer(result.draft);
      setQuestionAiMessage("AI 초안을 작성했습니다. 내용을 확인하고 수정한 뒤 답변을 저장해 주세요.");
    } catch (cause) {
      setQuestionAiMessage(cause instanceof Error ? cause.message : "AI 답변 초안을 생성하지 못했습니다.");
    } finally {
      setQuestionAiPending(false);
    }
  };
  const control = (f: Field) => {
    const value =
      section.table === "courses" &&
      ["thumbnail_url", "detail_image_url"].includes(f.key)
        ? object(row, "metadata")[f.key] ||
          object(row, "metadata")[
            f.key === "thumbnail_url" ? "thumbnailUrl" : "detailImageUrl"
          ]
        : row?.[f.key];
    const props = { name: f.key, id: "edit-" + f.key, required: f.required, maxLength: f.maxLength };
    if (section.key === "questions" && f.key === "answer")
      return (
        <textarea
          {...props}
          rows={8}
          value={questionAnswer}
          onChange={(event) => setQuestionAnswer(event.target.value)}
          placeholder="회원에게 전달할 답변을 작성해 주세요."
          disabled={pending}
        />
      );
    if (f.type === "blocks") return <BlocksField name={f.key} value={value} />;
    if (["image", "resource"].includes(f.type || ""))
      return (
        <UploadField
          name={f.key}
          value={String(value || "")}
          image={f.type === "image"}
          disabled={pending}
          optimize={section.key === "banners"}
        />
      );
    if (f.type === "checkbox")
      return (
        <input {...props} type="checkbox" defaultChecked={Boolean(value)} />
      );
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
    if (f.type === "article-category")
      return (
        <select {...props} defaultValue={String(value || "")}>
          <option value="">미분류</option>
          {(data.article_categories || []).filter(category => category.is_active !== false || category.id === value).sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)).map(category => <option key={category.id} value={category.id}>{t(category, "name")}</option>)}
        </select>
      );
    if (f.options)
      return (
        <select {...props} defaultValue={String(value || f.options[0])}>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {labels[o] || o}
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
              ? JSON.stringify(
                  value ?? (f.key === "content_blocks" ? [] : {}),
                  null,
                  2,
                )
              : String(value || "")
          }
        />
      );
    const raw =
      f.type === "datetime-local" && value
        ? localDateTime(value)
        : String(value ?? "");
    return (
      <input
        {...props}
        type={f.type || "text"}
        defaultValue={raw}
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
  };
  return (
    <dialog
      className={"editor-dialog" + (section.key === "customers" && row ? " drawer customer-drawer" : section.key === "tags" ? " drawer tag-settings-drawer" : section.key === "coupons" ? " drawer coupon-settings-drawer" : "")}
      aria-label={section.key === "customers" ? "회원 관리 상세" : section.key === "tags" ? "고객 태그 설정" : section.key === "coupons" ? "쿠폰 등록·설정" : section.title}
      ref={ref}
      onCancel={(e) => {
        if (pending) e.preventDefault();
        else close();
      }}
    >
      <form onSubmit={submit}>
        <header className="dialog-head">
          <div>
            <span className="eyebrow">{section.group}</span>
            <h2>
              {section.key === "customers" && row
                ? "회원 관리 상세"
                : section.key === "tags"
                  ? "고객 태그 설정"
                : section.key === "coupons"
                  ? "쿠폰 등록·설정"
                : `${section.title} · ${row ? "상세" : "등록"}`}
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="닫기"
            disabled={pending}
            onClick={close}
          >
            <X />
          </button>
        </header>
        <div className="dialog-body">
          {section.readOnly ? (
            <dl className="detail-dl">
              {Object.entries(row || {}).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>
                    {typeof value === "object"
                      ? JSON.stringify(value, null, 2)
                      : String(value ?? "—")}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <>
              {section.key === "banners" && (
                <div className="notice mb24">
                  이 화면의 상단 문구·메인 제목·설명 문구·CTA가 프론트 메인 배너에 그대로 표시됩니다. 활성 배너가 2개 이상이면 슬라이드 순서대로 자동 전환됩니다.
                </div>
              )}
              {section.key === "customers" && row && (
                <CustomerWorkspace member={row} tab={memberTab} onTabChange={setMemberTab}>
                <div className="customer-detail">
                  <div className="customer-account-summary">
                    <div className="setting-line"><span>계정 상태</span><span className={`badge ${row.status === "suspended" ? "amber" : "green"}`}>{row.status === "suspended" ? "이용 제한" : "정상"}</span></div>
                    <div className="setting-line"><span>마케팅 수신 동의</span><b>{row.marketing_consent ? "동의" : "미동의"}</b></div>
                    <div className="setting-line"><span>가입일</span><b>{row.created_at ? new Date(String(row.created_at)).toLocaleDateString("ko-KR") : "—"}</b></div>
                  </div>
                  <h3 className="mt24">고객 태그</h3>
                  <div className="tag-list mt8">
                    {customerTags.length ? customerTags.map((tag) => <span className="badge" key={tag.id}>{t(tag, "name")}</span>) : <span className="meta">등록된 태그가 없습니다.</span>}
                  </div>
                  <div className="row mt16 wrap-flex">
                    <Link className="btn small" href="/admin/tags">고객 태그 관리</Link>
                    <button type="button" className="btn small" onClick={() => setMemberTab("enrollments")}>수강권·미션 진행 보기</button>
                  </div>
                  <div className="divider" />
                  <h3 className="mb16">회원 정보·계정 상태 수정</h3>
                  <div className="editor-fields">{section.fields.map(field => <div className="field" key={field.key}><label htmlFor={`edit-${field.key}`}>{field.label}</label>{control(field)}</div>)}</div>
                </div>
                </CustomerWorkspace>
              )}
              {row &&
                ["reviews", "mission_submissions", "edu_questions"].includes(
                  section.table,
                ) && (
                  <div className="notice mb24">
                    <b>
                      {t(row, "title") || t(row, "author_name") || "제출 내용"}
                    </b>
                    <p>
                      {t(row, "content") ||
                        t(row, "body") ||
                        String(object(row, "response").text || "")}
                    </p>
                  </div>
                )}
              {section.key === "tags" ? (
                <div className="tag-settings-form">
                  <div className="field"><label htmlFor="edit-name">태그명 *</label><input id="edit-name" name="name" required maxLength={100} defaultValue={t(row, "name")} /></div>
                  <div className="grid2">
                    <div className="field"><label htmlFor="edit-tag-kind">부여 방식</label><select id="edit-tag-kind" name="tag_kind" value={tagKind} onChange={event => setTagKind(event.target.value)}><option value="automatic">자동</option><option value="manual">수동</option></select></div>
                    <div className="field"><label htmlFor="edit-is-active">사용 상태</label><select id="edit-is-active" name="is_active" defaultValue={row?.is_active === false ? "" : "on"}><option value="on">사용 중</option><option value="">사용 중지</option></select></div>
                  </div>
                  <section className={`tag-rule-box ${tagKind === "manual" ? "tag-rules-disabled" : ""}`}>
                    <h3>자동 태그 조건</h3>
                    <div className="tag-rule-grid mt16"><div className="field"><label htmlFor="edit-rule-key">조건 행동</label><select id="edit-rule-key" name="rule_key" disabled={tagKind === "manual"} required={tagKind === "automatic"} value={tagRule} onChange={event => setTagRule(event.target.value)}><option value="free_lesson_1">무료강의 1강 시청</option><option value="free_lesson_2">무료강의 2강 시청</option><option value="free_lesson_3">무료강의 3강 시청</option><option value="paid_customer">결제 완료</option><option value="mission_completed">미션 수행</option><option value="signed_up">회원가입</option></select></div>{tagRule.startsWith("free_lesson_") && <div className="field"><label htmlFor="edit-threshold-percent">기준 시청률 · %</label><input id="edit-threshold-percent" name="threshold_percent" type="number" min={1} max={100} defaultValue={Number(row?.threshold_percent || 80)} disabled={tagKind === "manual"} /></div>}</div>
                    <p className="meta mt8">수동 태그는 행동 조건을 적용하지 않습니다.</p>
                  </section>
                  <section className="tag-apply-scope"><h3>변경 적용 범위</h3><label className="checkline"><input type="radio" name="apply_existing" value="" defaultChecked />앞으로 발생하는 행동부터 적용</label><label className="checkline"><input type="radio" name="apply_existing" value="on" />기존 회원 기록도 재평가</label></section>
                  <p className="notice amber">조건 미리보기에는 로그인 회원의 확인 가능한 행동만 사용합니다. 기존 기록 재평가는 대상 수에 따라 반영까지 시간이 걸릴 수 있습니다.</p>
                </div>
              ) : section.key === "coupons" ? (
                <div className="coupon-settings-form">
                  <div className="coupon-preview"><span>BRANDYACTION BENEFIT</span><strong>{couponDiscountType === "percentage" ? `${couponDiscountValue}% 할인` : `${couponDiscountValue.toLocaleString("ko-KR")}원 할인`}</strong><p>적용 가능 여부를 발급 전에 확인하세요.</p></div>
                  <div className="grid2">
                    <div className="field"><label htmlFor="coupon-name">쿠폰명 *</label><input id="coupon-name" name="name" required maxLength={100} defaultValue={t(row, "name")} placeholder="운영용 이름" /></div>
                    <div className="field"><label htmlFor="coupon-code">쿠폰 코드 *</label><input id="coupon-code" name="code" required pattern="[A-Za-z0-9_-]{3,30}" maxLength={30} defaultValue={t(row, "code")} placeholder="영문 대문자·숫자" /></div>
                    <div className="field"><label htmlFor="coupon-type">할인 방식</label><select id="coupon-type" name="discount_type" value={couponDiscountType} onChange={event => setCouponDiscountType(event.target.value)}><option value="percentage">정률</option><option value="fixed">정액</option></select></div>
                    <div className="field"><label htmlFor="coupon-value">할인 수치 *</label><input id="coupon-value" name="discount_value" type="number" min={1} max={couponDiscountType === "percentage" ? 100 : undefined} required value={couponDiscountValue} onChange={event => setCouponDiscountValue(Number(event.target.value))} /></div>
                    <div className="field"><label htmlFor="coupon-max">최대 할인액 · 원</label><input id="coupon-max" name="max_discount_amount" type="number" min={0} defaultValue={row?.max_discount_amount == null ? "" : Number(row.max_discount_amount)} disabled={couponDiscountType === "fixed"} /></div>
                    <div className="field"><label htmlFor="coupon-minimum">최소 주문 금액 · 원</label><input id="coupon-minimum" name="minimum_order_amount" type="number" min={0} defaultValue={Number(row?.minimum_order_amount || 0)} /></div>
                    <div className="field"><label htmlFor="coupon-target">발급 대상</label><select id="coupon-target" name="issue_target" value={couponIssueTarget} onChange={event => setCouponIssueTarget(event.target.value)}><option value="all">전체 회원</option><option value="tag">고객 태그 회원</option></select></div>
                    <div className="field"><label htmlFor="coupon-tag">대상 태그</label><select id="coupon-tag" name="target_tag_id" defaultValue={t(row, "target_tag_id")} disabled={couponIssueTarget !== "tag"} required={couponIssueTarget === "tag"}><option value="">태그 선택</option>{(data.crm_tags || []).map(tag => <option key={tag.id} value={tag.id}>{t(tag, "name")}</option>)}</select></div>
                    <div className="field"><label htmlFor="coupon-product-scope">적용 상품</label><select id="coupon-product-scope" name="product_scope" value={couponProductScope} onChange={event => setCouponProductScope(event.target.value)}><option value="all">전체 상품</option><option value="paid">유료 클래스</option><option value="specific">특정 상품</option></select></div>
                    <div className="field"><label htmlFor="coupon-course">특정 상품</label><select id="coupon-course" name="applicable_course_id" defaultValue={couponCourseId} disabled={couponProductScope !== "specific"} required={couponProductScope === "specific"}><option value="">상품 선택</option>{(data.courses || []).filter(course => !course.archived_at).map(course => <option key={course.id} value={course.id}>{t(course, "title")}</option>)}</select></div>
                    <div className="field"><label htmlFor="coupon-start">시작일 · KST</label><input id="coupon-start" name="starts_at" type="datetime-local" defaultValue={row?.starts_at ? localDateTime(row.starts_at) : ""} /></div>
                    <div className="field"><label htmlFor="coupon-end">종료일 · KST</label><input id="coupon-end" name="ends_at" type="datetime-local" defaultValue={row?.ends_at ? localDateTime(row.ends_at) : ""} /></div>
                  </div>
                  <section className="coupon-limit-group"><div><h3>발급 수량 설정</h3><p className="meta">전체 발급 한도와 회원별 사용 가능 횟수를 관리합니다.</p></div><div className="grid2"><div className="field"><label htmlFor="coupon-limit">총 발급 수량</label><input id="coupon-limit" name="usage_limit" type="number" min={1} defaultValue={row?.usage_limit == null ? "" : Number(row.usage_limit)} placeholder="제한 없음" /></div><div className="field"><label htmlFor="coupon-user-limit">회원당 발급 횟수</label><input id="coupon-user-limit" name="per_user_limit" type="number" min={1} defaultValue={Number(row?.per_user_limit || 1)} /></div></div></section>
                  <label className="checkline"><input name="is_active" type="checkbox" defaultChecked={row?.is_active !== false} />쿠폰 사용 활성화</label>
                  <label className="checkline"><input name="exclude_free" type="checkbox" defaultChecked={row?.exclude_free !== false} />무료 상품 적용 제외</label>
                  <p className="notice">발급 후에도 이미 완료된 주문의 할인 금액은 변경하지 않습니다. 변경된 조건은 이후 쿠폰 적용 요청부터 검증됩니다.</p>
                </div>
              ) : section.key === "questions" ? (
                <div className="question-answer-editor">
                  <div className="question-answer-heading">
                    <div><h3>답변 작성</h3><p>AI 초안은 자동 등록되지 않습니다. 사실을 확인하고 내용을 검수해 주세요.</p></div>
                    <button className="btn question-ai-button" type="button" disabled={pending || questionAiPending || !row?.id} onClick={() => void generateQuestionAnswer()}>
                      {questionAiPending ? "AI 답변 생성 중…" : "✦ AI 답변 생성"}
                    </button>
                  </div>
                  <div className="field"><label htmlFor="edit-answer">답변 *</label>{control(section.fields.find((field) => field.key === "answer")!)}</div>
                  {questionAiMessage && <p className="question-ai-message" role="status" aria-live="polite">{questionAiMessage}</p>}
                  <div className="question-answer-options">
                    {section.fields.filter((field) => field.key !== "answer").map((field) => (
                      <div className="field" key={field.key}><label htmlFor={`edit-${field.key}`}>{field.label}</label>{control(field)}</div>
                    ))}
                  </div>
                </div>
              ) : section.key === "customers" && row ? null : <div className="editor-fields">
                {section.key === "missions" && <MissionTargetFields data={data} row={row} context={context} />}
                {section.fields.filter(f => section.key !== "missions" || f.key !== "lesson_id").map((f) => (
                  <div
                    className={
                      "field " +
                      ([
                        "textarea",
                        "json",
                        "blocks",
                        "image",
                        "resource",
                      ].includes(f.type || "")
                        ? "span2"
                        : "")
                    }
                    key={f.key}
                  >
                    <label htmlFor={"edit-" + f.key}>
                      {f.label}
                      {f.required ? " *" : ""}
                    </label>
                    {control(f)}
                  </div>
                ))}
              </div>}
              {section.table === "lesson_contents" && (
                <p className="meta">
                  영상 URL 또는 자료 경로 중 하나를 등록합니다.
                </p>
              )}
              {error && (
                <p className="notice" role="alert" tabIndex={-1}>
                  {error}
                </p>
              )}
            </>
          )}
        </div>
        <footer className="dialog-foot">
          {deleteMember && memberTab === "profile" && (
            <button
              type="button"
              className="btn danger"
              disabled={pending}
              onClick={deleteMember}
            >
              회원 삭제
            </button>
          )}
          {archive && (
            <button
              type="button"
              className="btn"
              disabled={pending}
              onClick={archive}
            >
              보관·숨김
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={close}
          >
            닫기
          </button>
          {!section.readOnly && !(section.key === "customers" && row && memberTab !== "profile") && (
            <button className="btn primary" disabled={pending}>
              {pending ? "저장 중..." : section.key === "questions" ? row?.answer ? "답변 수정" : "답변 등록" : ["tags", "coupons"].includes(section.key) ? "입력 내용 확인" : "저장하기"}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
function Policy({ kind }: { kind: string }) {
  const key =
    kind === "refund" ? "refund" : kind === "privacy" ? "privacy" : "terms";
  const copy = defaultPolicies[key];
  return (
    <div className="wrap">
      <article className="article-detail">
        <h1>
          {key === "refund"
            ? "이용·환불 안내"
            : key === "privacy"
              ? "개인정보 처리방침"
              : "이용약관"}
        </h1>
        <div className="reading-copy mt32">{copy}</div>
      </article>
    </div>
  );
}
