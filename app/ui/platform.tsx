"use client";
import { defaultPolicies } from "@/lib/legal-policies";
import { createMutationGate } from "@/lib/mutation-gate";
import { sectionScopes } from "@/lib/operator-scopes";
import {
  labels,
  number as num,
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
import { ArrowRight, Menu, Plus, Search, X } from "lucide-react";
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
import { AdminCatalog } from "./final/admin-catalog";
import { ArticleBannerEditor } from "./final/article-banner-editor";
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
import {
  ArticleCard,
  Brand,
  CourseCard,
  Empty,
  Heading,
  Story,
  courseType,
} from "./final/primitives";
import {
  ArticlesView,
  AuthView,
  ProductDetail,
  StoriesView,
} from "./final/public-views";
import { OrderResult } from "./order-result";
import { SiteFooter } from "./final/site-footer";
type Data = Record<string, Row[]>;
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
  const [data, setData] = useState<Data>({});
  const [user, setUser] = useState(initialUser);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [adminPaging, setAdminPaging] = useState({ section: "", page: 1 });
  const [pagination, setPagination] = useState<{
    page: number;
    pageSize: number;
    total: number;
  } | null>(null);
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
  const [editor, setEditor] = useState<{
    section: Section;
    row?: Row;
  } | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
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
  const adminPage = adminPaging.section === adminSection ? adminPaging.page : 1;
  const setAdminPage = (update: number | ((page: number) => number)) =>
    setAdminPaging((current) => ({
      section: adminSection,
      page:
        typeof update === "function"
          ? update(current.section === adminSection ? current.page : 1)
          : update,
    }));
  const refresh = useCallback(async () => {
    readRequest.current?.abort();
    const controller = new AbortController();
    readRequest.current = controller;
    setLoading(true);
    setError("");
    setAccessDenied(false);
    try {
      const started = performance.now();
      const response = await fetch(
        "/api/platform" +
          (admin
            ? "?admin=1&section=" +
              encodeURIComponent(adminSection) +
              "&page=" +
              adminPage +
              (editorRecordId
                ? "&record=" + encodeURIComponent(editorRecordId)
                : "")
            : ""),
        { cache: "no-store", signal: controller.signal },
      );
      const result = await response.json();
      if (admin && process.env.NEXT_PUBLIC_APP_ENV !== "production") {
        console.debug("[edu navigation] " + JSON.stringify({ section: adminSection, durationMs: Math.round(performance.now() - started), serverTiming: response.headers.get("Server-Timing") }));
      }
      if (controller.signal.aborted || !alive.current) return;
      if (admin && [401, 403].includes(response.status)) {
        setUser(result.user || null);
        setData({});
        setAccessDenied(response.status === 403);
        return;
      }
      if (!response.ok) throw new Error(result.error);
      if (alive.current) {
        setData(result.data);
        setSupport(result.support || { email: "", url: "" });
        setUser(result.user);
        setPagination(result.pagination || null);
      }
    } catch (e) {
      if (alive.current && !controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (alive.current && !controller.signal.aborted) setLoading(false);
    }
  }, [admin, adminPage, adminSection, editorRecordId]);
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
        if (!response.ok) throw new Error(result.error);
        setNotice(result.message || success);
        await refresh();
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
        `${section.title} ${ids.length}개를 보관·숨김 처리할까요? 연결된 주문과 학습 기록, 파일은 삭제하지 않습니다. 기수 보관은 모집을 취소합니다.`,
      )
    )
      return;
    try {
      await send(
        { action: "archive", section: section.key, ids },
        "보관·숨김 처리했습니다.",
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
    recruitingCourses.find((c) => num(c, "list_price") === 0) ||
    courses.find((c) => num(c, "list_price") === 0);
  const freeOpen = !!free && recruitingCourses.some((c) => c.id === free.id);
  const selected = courses.find((c) => c.slug === path[1] || c.id === path[1]);
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
                <Link
                  className="avatar"
                  href="/my/profile"
                  aria-label="회원 정보"
                >
                  {(user.full_name || "나").slice(0, 1)}
                </Link>
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
          <Link href="/">홈으로</Link>
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
        <section className="brand-hero">
          <div className="wrap">
            <div className="hero-grid">
              <div className="hero-copy">
                <div className="eyebrow">BRANDYACTION EDU · LEARN TO ACT</div>
                <h1>
                  배운 것을,
                  <br />
                  <em>내 일의 성과로.</em>
                </h1>
                <p className="lead">
                  AI와 마케팅을 아는 것에서 끝내지 마세요.
                  <br />내 업무에 적용하고, 실행한 결과를 남기는 교육.
                </p>
                <div className="hero-actions">
                  <Link
                    href={free ? "/classes/" + free.slug : "/classes?type=free"}
                    className="btn primary large"
                  >
                    무료 클래스부터 시작하기 <ArrowRight />
                  </Link>
                  <Link className="hero-secondary" href="/classes">
                    전체 클래스 보기 <ArrowRight />
                  </Link>
                </div>
                <p className="hero-support">
                  실행 중심 클래스 · 내 업무에 적용하는 학습
                </p>
              </div>
              {free ? (
                <Link className="featured-offer" href={"/classes/" + free.slug}>
                  <div className="offer-top">
                    <span className="eyebrow">
                      {freeOpen
                        ? "NOW OPEN / FREE CLASS"
                        : "FREE CLASS / 다음 모집 준비 중"}
                    </span>
                    <span className="offer-status">무료 클래스</span>
                  </div>
                  <div className="offer-content">
                    <span className="offer-category">
                      01 / 내 업무를 바꾸는 첫 클래스
                    </span>
                    <h2>{t(free, "title")}</h2>
                    <p>{t(free, "summary")}</p>
                  </div>
                  <dl className="offer-spec">
                    <div>
                      <dt>일정</dt>
                      <dd>{t(free, "schedule_label") || "상세페이지 확인"}</dd>
                    </div>
                    <div>
                      <dt>진행</dt>
                      <dd>{t(free, "duration_label") || "온라인 클래스"}</dd>
                    </div>
                    <div>
                      <dt>참가비</dt>
                      <dd>무료</dd>
                    </div>
                  </dl>
                  <div className="offer-bottom">
                    <span>클래스 자세히 보기</span>
                    <ArrowRight />
                  </div>
                </Link>
              ) : (
                <Link className="featured-offer" href="/classes">
                  <div className="offer-content">
                    <span className="eyebrow">YOUR NEXT ACTION</span>
                    <h2>
                      내 일에 필요한
                      <br />
                      다음 배움을
                      <br />
                      찾아보세요.
                    </h2>
                  </div>
                  <div className="offer-bottom">
                    전체 클래스 보기 <ArrowRight />
                  </div>
                </Link>
              )}
            </div>
            <div className="hero-bottom">
              <span>지식을 넘어, 실행이 남는 학습.</span>
              <span>LEARN. APPLY. REPEAT.</span>
            </div>
          </div>
        </section>
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
              <div className="grid2">
                {rows("review_videos")
                  .slice(0, 2)
                  .map((s) => (
                    <Story key={s.id} story={s} />
                  ))}
              </div>
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
        <Empty
          title={
            loading
              ? "페이지를 불러오고 있습니다."
              : "페이지를 찾을 수 없습니다."
          }
        />
        <div className="center">
          <Link className="btn primary" href="/">
            홈으로
          </Link>
        </div>
      </div>
    );
  function checkout() {
    return <Checkout data={data} user={user} pending={pending} send={send} />;
  }
  function adminView() {
    if (accessDenied) return <div className="wrap"><Empty title="이 메뉴에 접근할 운영 권한이 없습니다." /><div className="center"><Link className="btn" href="/admin">운영 홈</Link><Link className="btn" href="/my">마이페이지</Link></div></div>;
    if (!["admin", "staff"].includes(user?.role || ""))
      return (
        <div className="wrap">
          <Empty title={loading ? "운영자 권한을 확인하고 있습니다." : error ? "로그인 정보를 확인하지 못했습니다." : "운영자 로그인이 필요합니다."} />
          {!loading && !error && <div className="center">
            <Link className="btn primary" href={"/login?next=" + encodeURIComponent("/" + routeKey)}>
              로그인하기
            </Link>
          </div>}
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
    const edit = (section: Section, row?: Row) => {
      if (section.key === "products" || section.key === "learning")
        router.push(
          "/admin/" +
            (section.key === "products"
              ? "product-editor"
              : "learning-editor") +
            (row ? "?id=" + row.id : ""),
        );
      else setEditor({ section, row });
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
        data={data}
        mobile={mobile}
        setMobile={setMobile}
        logout={logout}
      >
        {key === "overview" ? (
          <Overview data={data} available={available} />
        ) : !section ? (
          <Empty title="이 화면에 접근할 운영 권한이 필요합니다." />
        ) : key === "product-editor" || key === "learning-editor" ? (
          loading ? (
            <p role="status">편집 정보를 불러오고 있습니다.</p>
          ) : id && !edited ? (
            <Empty title="편집할 항목을 찾을 수 없습니다." />
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
            <AdminHeading
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
                  회원 명단 내보내기
                </button>
              )}
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
                        : "새로 등록"}
                  </button>
                )}
            </AdminHeading>
            {standaloneAdmin.includes(section.key) ? (
              <AdminWorkflows
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
              {section.key === "articles" && <ArticleBannerEditor settings={rows("site_settings")} send={send} pending={pending} />}
              <AdminCatalog
                key={section.key}
                section={section}
                data={data}
                selection={selection}
                setSelection={setSelection}
                edit={edit}
                archive={(s, ids) => void archive(s, ids)}
                pending={pending}
                loading={loading}
                pagination={pagination}
                setPage={setAdminPage}
                exportCsv={downloadCsv}
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
              />
              </>
            )}
          </>
        )}
      </AdminShell>
    );
  }
  return (
    <div className={admin ? "edu-admin" : "edu-front"}>
      {!admin && header}
      <main
        id="main"
        className={
          path[0] === "classes" && path.length > 1 ? "with-bottom-cta" : ""
        }
      >
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button className="btn small" onClick={() => void refresh()}>
              다시 시도
            </button>
          </div>
        )}
        {loading && (
          <div className="loading-bar" role="status" aria-label="불러오는 중" />
        )}
        {body}
      </main>
      {!admin && footer}
      {(account || learning) && (support.email || safeUrl(support.url)) && (
        <div className="wrap flex gap8 mb24">
          {support.email && (
            <a className="link" href={"mailto:" + support.email}>
              이메일 문의
            </a>
          )}
          {safeUrl(support.url) && (
            <a
              className="link"
              target="_blank"
              rel="noreferrer"
              href={safeUrl(support.url)}
            >
              고객센터
            </a>
          )}
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {editor && (
        <Editor
          key={editor.section.key + (editor.row ? recordId(editor.row) : "new")}
          section={editor.section}
          row={editor.row}
          data={data}
          pending={pending}
          close={() => setEditor(null)}
          archive={
            editor.row && archiveValues[editor.section.key]
              ? () => void archive(editor.section, [recordId(editor.row!)])
              : undefined
          }
          save={async (values) => {
            await send({
              action: "save",
              section: editor.section.key,
              id: editor.row ? recordId(editor.row) : undefined,
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
function Editor({
  section,
  row,
  data,
  pending,
  close,
  save,
  archive,
}: {
  section: Section;
  row?: Row;
  data: Data;
  pending: boolean;
  close: () => void;
  save: (values: Record<string, unknown>) => Promise<void>;
  archive?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const customerEnrollments =
    section.key === "customers" && row
      ? (data.enrollments || []).filter((item) => item.user_id === row.id)
      : [];
  const customerTags =
    section.key === "customers" && row
      ? (data.crm_member_tags || [])
          .filter((item) => item.member_id === row.id)
          .map((item) => (data.crm_tags || []).find((tag) => tag.id === item.tag_id))
          .filter(Boolean) as Row[]
      : [];
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    return () => d?.close();
  }, []);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const values: Record<string, unknown> = {};
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
      await save(values);
    } catch (e) {
      setError((e as Error).message);
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
    const props = { name: f.key, id: "edit-" + f.key, required: f.required };
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
      className={"editor-dialog" + (section.key === "customers" && row ? " drawer customer-drawer" : "")}
      aria-label={section.key === "customers" ? "회원 관리 상세" : section.title}
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
              {section.key === "customers" && row && (
                <div className="customer-detail">
                  <div className="drawer-profile">
                    <span className="avatar red">{(t(row, "full_name") || t(row, "email")).slice(0, 1)}</span>
                    <div>
                      <h2>{t(row, "full_name") || "이름 미등록"}</h2>
                      <p>{t(row, "email")}<br />{t(row, "phone") || "연락처 미등록"}</p>
                    </div>
                  </div>
                  <div className="customer-account-summary">
                    <div className="setting-line"><span>계정 상태</span><span className={`badge ${row.status === "suspended" ? "amber" : "green"}`}>{row.status === "suspended" ? "이용 제한" : "정상"}</span></div>
                    <div className="setting-line"><span>마케팅 수신 동의</span><b>{row.marketing_consent ? "동의" : "미동의"}</b></div>
                    <div className="setting-line"><span>가입일</span><b>{row.created_at ? new Date(String(row.created_at)).toLocaleDateString("ko-KR") : "—"}</b></div>
                  </div>
                  <h3 className="mt24">수강 권한</h3>
                  {customerEnrollments.length ? customerEnrollments.map((enrollment) => (
                    <div className="asset-row" key={enrollment.id}>
                      <span className="square">C</span>
                      <div>
                        <b>{t((data.courses || []).find((course) => course.id === enrollment.course_id), "title") || "연결 상품"}</b>
                        <p>{t((data.cohorts || []).find((cohort) => cohort.id === enrollment.cohort_id), "name") || "기수 미연결"}</p>
                      </div>
                      <span className={`badge ${enrollment.status === "active" ? "green" : ""}`}>{labels[t(enrollment, "status")] || t(enrollment, "status")}</span>
                    </div>
                  )) : <p className="meta mt8">등록된 수강 권한이 없습니다.</p>}
                  <h3 className="mt24">고객 태그</h3>
                  <div className="tag-list mt8">
                    {customerTags.length ? customerTags.map((tag) => <span className="badge" key={tag.id}>{t(tag, "name")}</span>) : <span className="meta">등록된 태그가 없습니다.</span>}
                  </div>
                  <div className="row mt16 wrap-flex">
                    <Link className="btn small" href="/admin/tags">고객 태그 관리</Link>
                    <Link className="btn small" href="/admin/members">미션 진행 보기</Link>
                  </div>
                  <div className="divider" />
                  <h3 className="mb16">회원 정보·계정 상태 수정</h3>
                </div>
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
              <div className="editor-fields">
                {section.fields.map((f) => (
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
              </div>
              {section.table === "lesson_contents" && (
                <p className="meta">
                  영상 URL 또는 자료 경로 중 하나를 등록합니다.
                </p>
              )}
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
        <footer className="dialog-foot">
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
          {!section.readOnly && (
            <button className="btn primary" disabled={pending}>
              {pending ? "저장 중..." : "저장하기"}
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
