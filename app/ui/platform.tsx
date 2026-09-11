'use client';
import Link from 'next/link';
import { cohortStatus, cohortPeriod, archiveValues } from '@/lib/qa-rules';
import { createMutationGate } from '@/lib/mutation-gate';
import { AdminWorkflows, standaloneAdmin } from './admin-workflows';
import { MissionForm, LiveSchedule, AchievementCards } from './learning-workflows';
import { OrderResult } from './order-result';
import { UploadField, BlocksField } from './editor-fields';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, ArrowLeft, BarChart3, BookOpen, CalendarDays, Check, CheckSquare2, ChevronDown, CircleHelp, CreditCard, Download, FilePenLine, FileText, LayoutDashboard, LayoutGrid, LineChart, ListChecks, LogOut, Menu, MessageCircle, Megaphone, NotebookTabs, Play, Plus, Search, Settings, Settings2, ShieldCheck, Star, Tags, Ticket, UserRound, UsersRound, Video as VideoIcon, Workflow, X, type LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getSupabasePublicConfig } from '@/lib/supabase/config';
import { hasLearningAccess, isRecruiting, recordId, localDateTime } from '@/lib/platform-rules';
import { sections, labels, text as t, number as num, object, money, date, safeUrl, safeNext, type Row, type User, type Section, type Field } from '@/lib/platform';
import { sectionScopes } from '@/lib/operator-scopes';
type Data = Record<string, Row[]>;
const nav = [
    ['/classes?type=free', '무료 클래스'],
    ['/classes', '전체 클래스'],
    ['/stories', '고객 이야기'],
    ['/articles', '아티클'],
];
const accountNav = [
    ['/my', '마이페이지', LayoutDashboard],
    ['/my/classes', '내 클래스', BookOpen],
    ['/my/missions', '내 미션', Check],
    ['/my/questions', '내 질문', MessageCircle],
    ['/my/resources', '내 자료실', Download],
    ['/my/reviews', '내 상품 후기', Star],
    ['/my/orders', '신청·주문 내역', FileText],
    ['/my/coupons', '내 쿠폰', Ticket],
    ['/my/profile', '회원 정보', UserRound],
] as const;
const adminSectionIcons: Record<string, LucideIcon> = {
    products: BookOpen,
    cohorts: CalendarDays,
    learning: NotebookTabs,
    weeks: LayoutGrid,
    contents: VideoIcon,
    missions: ListChecks,
    members: UsersRound,
    reviews: CheckSquare2,
    questions: CircleHelp,
    customers: UsersRound,
    tags: Tags,
    coupons: Ticket,
    'product-reviews': MessageCircle,
    staff: ShieldCheck,
    banners: LayoutGrid,
    articles: FilePenLine,
    testimonials: MessageCircle,
    orders: CreditCard,
    templates: MessageCircle,
    campaigns: Megaphone,
    automations: Workflow,
    analytics: LineChart,
    metrics: BarChart3,
    seo: Settings2,
    settings: Settings,
};
function Badge({ children, color = '' }: { children: ReactNode; color?: string }) {
    return <span className={'badge ' + color}>{children}</span>;
}
function Empty({ title = '등록된 내용이 없습니다.', children }: { title?: string; children?: ReactNode }) {
    return (
        <div className="empty">
            <BookOpen />
            <h3>{title}</h3>
            {children && <p>{children}</p>}
        </div>
    );
}
function Heading({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
    return (
        <div className="page-head">
            <div className="between">
                <div>
                    <h1>{title}</h1>
                    {description && <p>{description}</p>}
                </div>
                {children}
            </div>
        </div>
    );
}
function Brand() {
    return (
        <Link href="/" className="brand">
            <span className="brand-mark">b</span>brandyaction <small>EDU</small>
        </Link>
    );
}
function courseType(c: Row) {
    const metadata = object(c, 'metadata');
    return c.category === 'digital' || metadata.productType === 'digital' ? '디지털 상품' : num(c, 'list_price') === 0 ? '무료 클래스' : '유료 클래스';
}
function Cover({ course }: { course: Row }) {
    const type = courseType(course);
    const meta = object(course, 'metadata');
    const image = safeUrl(meta.thumbnailUrl || meta.thumbnail_url);
    return (
        <div className={'cover ' + (type === '무료 클래스' ? 'red' : type === '디지털 상품' ? 'sand' : 'dark')}>
            {image && <img src={image} alt="" className="course-cover-image" />}
            <span className="cover-label">{type === '무료 클래스' ? 'FREE LIVE CLASS' : type === '디지털 상품' ? 'WORK TOOLKIT / DIGITAL' : 'AI MARKETING / CLASS'}</span>
            <strong>{t(course, 'title')}</strong>
            <div className="cover-bottom">
                <span>BRANDYACTION EDU</span>
                <ArrowRight />
            </div>
            <span className="cover-line" aria-hidden="true" />
        </div>
    );
}
function CourseCard({ course }: { course: Row }) {
    return (
        <Link className="course-card" href={'/classes/' + t(course, 'slug')}>
            <Cover course={course} />
            <div className="card-body">
                <div className="flex gap8">
                    <Badge color={num(course, 'list_price') === 0 ? 'red' : ''}>{courseType(course)}</Badge>
                    {t(course, 'duration_label') && <Badge>{t(course, 'duration_label')}</Badge>}
                </div>
                <h3>{t(course, 'title')}</h3>
                <p>{t(course, 'schedule_label') || t(course, 'summary')}</p>
                <div className="card-price">
                    {num(course, 'list_price') === 0 ? '무료' : money(num(course, 'list_price'))}
                    <ArrowRight className="arrow" />
                </div>
            </div>
        </Link>
    );
}
function ArticleCard({ article }: { article: Row }) {
    return (
        <Link className="article-card" href={'/articles/' + t(article, 'slug')}>
            <span className="tag">{article.content_type === 'video' ? '영상' : '인사이트'}</span>
            <h3>{t(article, 'title')}</h3>
            <p className="muted">{t(article, 'summary')}</p>
            <span className="meta">
                {date(article.published_at)} <ArrowRight />
            </span>
        </Link>
    );
}
function Story({ story }: { story: Row }) {
    return (
        <article className="story-card">
            <Badge>고객 이야기</Badge>
            <blockquote>“{t(story, 'title')}”</blockquote>
            <p>{t(story, 'description')}</p>
            <div className="who mt24">
                <span className="avatar">{t(story, 'reviewer_name').slice(0, 1)}</span>
                <span>
                    <b>{t(story, 'reviewer_name')}</b> · {t(story, 'reviewer_role')}
                </span>
            </div>
            {safeUrl(story.video_url) && (
                <a className="link mt16" href={safeUrl(story.video_url)} target="_blank" rel="noreferrer">
                    이야기 영상 보기 <ArrowRight />
                </a>
            )}
        </article>
    );
}
function Video({ url }: { url: string }) {
    let embed = '';
    try {
        const u = new URL(url);
        const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.hostname === 'youtube.com' || u.hostname.endsWith('.youtube.com') ? u.searchParams.get('v') || u.pathname.split('/').pop() : null;
        if (id && /^[\w-]{11}$/.test(id)) embed = 'https://www.youtube-nocookie.com/embed/' + id;
        else if (u.hostname === 'vimeo.com' && /^\/\d+$/.test(u.pathname)) embed = 'https://player.vimeo.com/video' + u.pathname;
    } catch {}
    return embed ? (
        <iframe className="real-video" src={embed} title="강의 영상" allow="fullscreen; picture-in-picture" allowFullScreen />
    ) : /\.(mp4|webm)(\?|$)/i.test(url) ? (
        <video className="real-video" src={safeUrl(url)} controls />
    ) : (
        <a className="btn" href={safeUrl(url)} target="_blank" rel="noreferrer">
            <Play />
            영상 열기
        </a>
    );
}
function Blocks({ value }: { value: unknown }) {
    const blocks = Array.isArray(value) ? value : [];
    return (
        <div className="article-body">
            {blocks.map((raw, i) => {
                const b = raw as Record<string, unknown>;
                const content = String(b.text || b.content || b.body || '');
                return b.type === 'heading' ? <h2 key={i}>{content}</h2> : b.type === 'image' && safeUrl(b.url || b.src) ? <img key={i} src={safeUrl(b.url || b.src)} alt={String(b.alt || '')} /> : b.type === 'video' ? <Video key={i} url={String(b.url || '')} /> : <p key={i}>{content}</p>;
            })}
        </div>
    );
}
export function Platform({ path, user: initialUser }: { path: string[]; user: User | null }) {
    const router = useRouter();
    const admin = path[0] === 'admin';
    const account = path[0] === 'my';
    const learning = path[0] === 'learn';
    const [support, setSupport] = useState({ email: '', url: '' });
    const [data, setData] = useState<Data>({});
    const [user, setUser] = useState(initialUser);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [pending, setPending] = useState(false);
    const [mobile, setMobile] = useState(false);
    const [query, setQuery] = useState('');
    const [adminPaging, setAdminPaging] = useState({ section: '', page: 1 });
    const [pagination, setPagination] = useState<{
        page: number;
        pageSize: number;
        total: number;
    } | null>(null);
    const searchParams = useSearchParams();
    const routeKey = path.join('/') + '?' + searchParams.toString();
    const [filters, setFilters] = useState({
        route: routeKey,
        value: path[0] === 'classes' && searchParams.get('type') === 'free' ? '무료 클래스' : '전체',
    });
    const filter = filters.route === routeKey ? filters.value : path[0] === 'classes' && searchParams.get('type') === 'free' ? '무료 클래스' : '전체';
    const setFilter = (value: string) => setFilters({ route: routeKey, value });
    const [editor, setEditor] = useState<{
        section: Section;
        row?: Row;
    } | null>(null);
    const [selection, setSelection] = useState<string[]>([]);
    const [showArchived, setShowArchived] = useState(false);
    const alive = useRef(true);
    const mutationGate = useRef(createMutationGate<Record<string, unknown>>());
    const adminSection = path[1] === 'product-editor' ? 'products' : path[1] === 'learning-editor' ? 'learning' : path[1] || 'home';
    const adminPage = adminPaging.section === adminSection ? adminPaging.page : 1;
    const setAdminPage = (update: number | ((page: number) => number)) =>
        setAdminPaging((current) => ({
            section: adminSection,
            page: typeof update === 'function' ? update(current.section === adminSection ? current.page : 1) : update,
        }));
    const refresh = useCallback(async () => {
        setError('');
        if (admin && !['admin', 'staff'].includes(initialUser?.role || '')) {
            setLoading(false);
            return;
        }
        try {
            const response = await fetch('/api/platform' + (admin ? '?admin=1&section=' + encodeURIComponent(adminSection) + '&page=' + adminPage : ''), { cache: 'no-store' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            if (alive.current) {
                setData(result.data);
                setSupport(result.support || { email: '', url: '' });
                setUser(result.user);
                setPagination(result.pagination || null);
            }
        } catch (e) {
            if (alive.current) setError((e as Error).message);
        } finally {
            if (alive.current) setLoading(false);
        }
    }, [admin, adminPage, adminSection, initialUser?.role]);
    useEffect(() => {
        alive.current = true;
        const timer = setTimeout(() => void refresh(), 0);
        return () => {
            clearTimeout(timer);
            alive.current = false;
        };
    }, [refresh]);
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(''), 5000);
        return () => clearTimeout(timer);
    }, [notice]);
    const send = (body: Record<string, unknown>, success = '저장했습니다.') =>
        mutationGate.current(body, async (payload) => {
            setPending(true);
            setNotice('');
            try {
                const response = await fetch(body.workflow ? '/api/platform/workflows' : '/api/platform', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
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
            setNotice('최대 50개까지 선택해 주세요.');
            return;
        }
        if (!window.confirm(`${section.title} ${ids.length}개를 보관·숨김 처리할까요? 연결된 주문과 학습 기록, 파일은 삭제하지 않습니다. 기수 보관은 모집을 취소합니다.`)) return;
        try {
            await send({ action: 'archive', section: section.key, ids }, '보관·숨김 처리했습니다.');
            setSelection([]);
            setEditor(null);
        } catch {}
    }
    const rows = (key: string) => data[key] || [];
    const courses = rows('courses');
    const recruitingCourses = courses.filter((c) => rows('cohorts').some((g) => g.course_id === c.id && isRecruiting(g)));
    const free = recruitingCourses.find((c) => num(c, 'list_price') === 0) || courses.find((c) => num(c, 'list_price') === 0);
    const freeOpen = !!free && recruitingCourses.some((c) => c.id === free.id);
    const selected = courses.find((c) => c.slug === path[1] || c.id === path[1]);
    async function social(provider: 'google' | 'kakao') {
        setPending(true);
        setNotice('');
        try {
            const { publicUrl, publishableKey } = getSupabasePublicConfig();
            const r = await fetch(publicUrl + '/auth/v1/settings', {
                headers: { apikey: publishableKey },
            });
            if (!r.ok) throw new Error('로그인 설정을 확인하지 못했습니다.');
            const settings = await r.json();
            if (settings.external?.[provider] !== true) throw new Error('로그인 서비스를 준비하고 있습니다. 잠시 후 다시 시도해 주세요.');
            const next = safeNext(new URLSearchParams(location.search).get('next'));
            const { error } = await createClient().auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: location.origin + '/auth/callback?next=' + encodeURIComponent(next),
                },
            });
            if (error) throw error;
        } catch {
            setNotice('소셜 로그인에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            setPending(false);
        }
    }
    const logout = async () => {
        setPending(true);
        const { error } = await createClient().auth.signOut();
        if (error) {
            setNotice('로그아웃에 실패했습니다.');
            setPending(false);
            return;
        }
        setUser(null);
        router.replace('/login');
        router.refresh();
        setPending(false);
    };
    const loginHref = '/login?next=' + encodeURIComponent('/' + path.join('/'));
    const header = (
        <>
            <a className="skip" href="#main">
                본문으로 이동
            </a>
            <header className="site-header">
                <div className={'wrap ' + (account || learning ? 'learning-chrome' : 'header-inner')}>
                    <Brand />
                    {account || learning ? (
                        <div className="learning-context">
                            <b>나의 학습</b>
                            <span>배움을 실행으로 이어가는 공간</span>
                        </div>
                    ) : (
                        <nav className="main-nav" aria-label="주 메뉴">
                            {nav.map(([href, label]) => (
                                <Link href={href} key={href} className={'/' + path[0] === href ? 'active' : ''}>
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
                                <Link className="avatar" href="/my/profile" aria-label="회원 정보">
                                    {(user.full_name || '나').slice(0, 1)}
                                </Link>
                            </>
                        ) : (
                            <Link className="btn" href="/login">
                                로그인
                            </Link>
                        )}
                        <button className="icon-btn mobile-only" aria-label="메뉴 열기" aria-expanded={mobile} onClick={() => setMobile(!mobile)}>
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
            <footer className="footer">
                <div className="wrap">
                    <div className="between">
                        <Brand />
                        <div className="footer-links">
                            <Link href="/policies/terms">이용약관</Link>
                            <Link href="/policies/privacy">개인정보 처리방침</Link>
                            <Link href="/my/questions">고객 문의</Link>
                        </div>
                    </div>
                    <p>배움을 실행으로, 실행을 내 일의 변화로 연결합니다.</p>
                    <div className="footer-bottom">© BRANDYACTION EDU. ALL RIGHTS RESERVED.</div>
                </div>
            </footer>
        );
    let body: ReactNode;
    if (path[0] === 'login' || path[0] === 'signup')
        body = (
            <div className="wrap">
                <div className="auth-wrap">
                    <section className="auth-intro">
                        <span className="eyebrow">LEARN. APPLY. REPEAT.</span>
                        <h1>
                            배움을 실행으로,
                            <br />내 일의 변화로.
                        </h1>
                        <p>
                            나에게 필요한 클래스를 찾고
                            <br />
                            작은 실행을 시작해 보세요.
                        </p>
                    </section>
                    <section className="auth-box">
                        <h2>{path[0] === 'signup' ? '회원가입' : '다시 만나 반갑습니다.'}</h2>
                        <p className="muted">사용하는 계정으로 간편하게 시작하세요.</p>
                        <div className="social-stack">
                            <button className="btn kakao" disabled={pending} onClick={() => void social('kakao')}>
                                <MessageCircle />
                                카카오로 시작하기
                            </button>
                            <button className="btn google" disabled={pending} onClick={() => void social('google')}>
                                <span className="google-g">G</span>Google로 시작하기
                            </button>
                        </div>
                        <p className="meta">처음 방문하셨다면 소셜 계정으로 가입이 진행됩니다.</p>
                        <div className="auth-links">
                            <Link href="/policies/terms">이용약관</Link>
                            <Link href="/policies/privacy">개인정보 처리방침</Link>
                        </div>
                    </section>
                </div>
            </div>
        );
    else if ((account || learning) && !user)
        body = (
            <div className="wrap">
                <Empty title="로그인하고 학습을 이어가세요." />
                <div className="center">
                    <Link className="btn primary" href={loginHref}>
                        구글·카카오로 시작하기 <ArrowRight />
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
                                    <Link href={free ? '/classes/' + free.slug : '/classes?type=free'} className="btn primary large">
                                        무료 클래스부터 시작하기 <ArrowRight />
                                    </Link>
                                    <Link className="hero-secondary" href="/classes">
                                        전체 클래스 보기 <ArrowRight />
                                    </Link>
                                </div>
                                <p className="hero-support">실행 중심 클래스 · 내 업무에 적용하는 학습</p>
                            </div>
                            {free ? (
                                <Link className="featured-offer" href={'/classes/' + free.slug}>
                                    <div className="offer-top">
                                        <span className="eyebrow">{freeOpen ? 'NOW OPEN / FREE CLASS' : 'FREE CLASS / 다음 모집 준비 중'}</span>
                                        <span className="offer-status">무료 클래스</span>
                                    </div>
                                    <div className="offer-content">
                                        <span className="offer-category">01 / 내 업무를 바꾸는 첫 클래스</span>
                                        <h2>{t(free, 'title')}</h2>
                                        <p>{t(free, 'summary')}</p>
                                    </div>
                                    <dl className="offer-spec">
                                        <div>
                                            <dt>일정</dt>
                                            <dd>{t(free, 'schedule_label') || '상세페이지 확인'}</dd>
                                        </div>
                                        <div>
                                            <dt>진행</dt>
                                            <dd>{t(free, 'duration_label') || '온라인 클래스'}</dd>
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
                            {recruitingCourses.slice(0, 3).map((c) => (
                                <CourseCard key={c.id} course={c} />
                            ))}
                        </div>
                        {!loading && !recruitingCourses.length && <Empty title="새로운 클래스를 준비하고 있습니다." />}
                    </section>
                    <section className="execution-section">
                        <div className="execution-intro">
                            <div className="eyebrow">02 / THE WAY WE LEARN</div>
                            <h2>
                                시청에서 멈추지 않는
                                <br />
                                학습의 구조.
                            </h2>
                            <p>
                                강의마다 다음 행동이 있습니다.
                                <br />
                                작게 적용하고, 기록하고, 다시 개선합니다.
                            </p>
                            <Link className="link" href="/my/classes">
                                나의 학습 확인하기 <ArrowRight />
                            </Link>
                        </div>
                        <ol className="execution-steps">
                            {[
                                ['내 문제로 배웁니다', '지금 내 업무에서 해결할 문제를 정하고 필요한 개념을 배웁니다.'],
                                ['미션으로 실행합니다', '배운 내용을 적용한 과정과 결과물을 남깁니다.'],
                                ['피드백으로 다음을 만듭니다', '잘된 점과 보완할 점을 확인하고, 다음 실행으로 이어갑니다.'],
                            ].map(([title, desc], i) => (
                                <li key={title}>
                                    <span>0{i + 1}</span>
                                    <div>
                                        <h3>{title}</h3>
                                        <p>{desc}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
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
                            {rows('articles')
                                .slice(0, 3)
                                .map((a) => (
                                    <ArticleCard key={a.id} article={a} />
                                ))}
                        </div>
                    </section>
                    {rows('review_videos').length > 0 && (
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
                                {rows('review_videos')
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
    else if (path[0] === 'classes' && path.length === 1)
        body = (
            <div className="wrap">
                <Heading title="내 일의 다음 단계를 찾아보세요." description="무료 클래스부터 실전 과정, 바로 사용하는 자료까지." />
                <div className="filter-row">
                    <div className="chips">
                        {['전체', '무료 클래스', '유료 클래스', '디지털 상품'].map((f) => (
                            <button key={f} className={'chip ' + (filter === f ? 'active' : '')} onClick={() => setFilter(f)}>
                                {f}
                            </button>
                        ))}
                    </div>
                    <label className="search">
                        <Search />
                        <input type="search" placeholder="클래스 검색" aria-label="클래스 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </label>
                </div>
                <div className="grid3 course-grid pb64">
                    {courses
                        .filter((c) => (filter === '전체' || courseType(c) === filter) && t(c, 'title').includes(query))
                        .map((c) => (
                            <CourseCard key={c.id} course={c} />
                        ))}
                </div>
                {!loading && !courses.length && <Empty title="등록된 클래스가 없습니다." />}
            </div>
        );
    else if (path[0] === 'classes' && selected) body = detail(selected);
    else if (path[0] === 'articles')
        body =
            path.length > 1 ? (
                articleDetail()
            ) : (
                <div className="wrap">
                    <Heading title="일하는 방식을 바꾸는 인사이트" description="읽고, 배우고, 내 일에 적용해 보세요." />
                    {free && (
                        <Link className="article-free-offer" href={'/classes/' + free.slug}>
                            <div>
                                <Badge color="red">무료 클래스</Badge>
                                <h2>{t(free, 'title')}</h2>
                                <p>{t(free, 'summary')}</p>
                            </div>
                            <span className="btn primary">
                                무료로 배우기 <ArrowRight />
                            </span>
                        </Link>
                    )}
                    <div className="filter-row">
                        <span>{rows('articles').length}개의 아티클</span>
                        <label className="search">
                            <Search />
                            <input placeholder="아티클 검색" aria-label="아티클 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
                        </label>
                    </div>
                    <div className="grid3 pb64">
                        {rows('articles')
                            .filter((a) => t(a, 'title').includes(query))
                            .map((a) => (
                                <ArticleCard key={a.id} article={a} />
                            ))}
                    </div>
                    {!rows('articles').length && !loading && <Empty />}
                </div>
            );
    else if (path[0] === 'stories')
        body = (
            <div className="wrap">
                <Heading title="배움이 내 일에 닿은 순간" description="해결하고 싶은 문제에서 시작해, 실행한 과정과 변화를 나눕니다." />
                <div className="grid3 pb64">
                    {rows('review_videos').map((s) => (
                        <Story key={s.id} story={s} />
                    ))}
                </div>
                {!rows('review_videos').length && !loading && <Empty title="공개된 고객 이야기가 없습니다." />}
            </div>
        );
    else if (account) body = accountView();
    else if (learning) body = learningView();
    else if (path[0] === 'checkout' || path[0] === 'apply') body = checkout();
    else if (['order-complete', 'applied', 'payment'].includes(path[0])) body = <OrderResult data={data} refresh={refresh} />;
    else if (path[0] === 'policies') body = <Policy kind={path[1]} />;
    else
        body = (
            <div className="wrap">
                <Empty title={loading ? '페이지를 불러오고 있습니다.' : '페이지를 찾을 수 없습니다.'} />
                <div className="center">
                    <Link className="btn primary" href="/">
                        홈으로
                    </Link>
                </div>
            </div>
        );
    function detail(c: Row) {
        const cohorts = rows('cohorts').filter((g) => g.course_id === c.id);
        const available = cohorts.find((g) => isRecruiting(g));
        const weeks = rows('curriculum_weeks').filter((w) => w.course_id === c.id);
        const isFree = num(c, 'list_price') === 0;
        const enrolled = rows('enrollments').find((e) => e.course_id === c.id && hasLearningAccess(e));
        const href = enrolled ? '/learn/' + enrolled.id : available ? '/' + (isFree ? 'apply' : 'checkout') + '?cohort=' + available.id : '/classes';
        const meta = object(c, 'metadata');
        const detailImage = safeUrl(meta.detailImageUrl || meta.detail_image_url);
        return (
            <>
                <div className="wrap">
                    <div className="breadcrumbs">
                        <Link href="/classes">전체 클래스</Link>
                        <span> / {courseType(c)}</span>
                    </div>
                    {isFree ? (
                        <div className="free-detail-rebuild">
                            <div className="free-detail-title">
                                <Badge color="red">무료 클래스</Badge>
                                <h1>{t(c, 'title')}</h1>
                                <p>{t(c, 'summary')}</p>
                            </div>
                            {detailImage ? (
                                <img src={detailImage} alt={t(c, 'title') + ' 상세 안내'} />
                            ) : (
                                <div className="free-detail-copy">
                                    <Cover course={c} />
                                    <div className="reading-copy">
                                        {t(c, 'description')
                                            .split('\n')
                                            .filter(Boolean)
                                            .map((line, i) => (
                                                <p key={i}>{line}</p>
                                            ))}
                                    </div>
                                </div>
                            )}
                            <section className="panel pad">
                                <h2>클래스 안내</h2>
                                <p>{t(c, 'schedule_label')}</p>
                                <p>{t(c, 'duration_label')}</p>
                                {available && (
                                    <p>
                                        모집 기간 · {date(available.recruitment_start_at)} ~ {date(available.recruitment_end_at)}
                                    </p>
                                )}
                            </section>
                        </div>
                    ) : (
                        <div className="product-layout">
                            <div>
                                <div className="product-intro">
                                    <Badge color="red">{courseType(c)}</Badge>
                                    <h1>{t(c, 'title')}</h1>
                                    <p className="lead">{t(c, 'summary')}</p>
                                </div>
                                <Cover course={c} />
                                <section className="section">
                                    <h2>이 클래스에서 배우는 것</h2>
                                    <div className="reading-copy">
                                        {t(c, 'description')
                                            .split('\n')
                                            .filter(Boolean)
                                            .map((line, i) => (
                                                <p key={i}>{line}</p>
                                            ))}
                                    </div>
                                </section>
                                <section className="section">
                                    <h2>커리큘럼</h2>
                                    {weeks.map((w) => (
                                        <details className="curriculum-item" key={w.id}>
                                            <summary>
                                                {num(w, 'week_number')}주차 · {t(w, 'title')}
                                                <ChevronDown />
                                            </summary>
                                            <p>{t(w, 'goal')}</p>
                                            {rows('curriculum_lessons')
                                                .filter((l) => l.week_id === w.id)
                                                .map((l) => (
                                                    <div className="lesson-row" key={l.id}>
                                                        <BookOpen />
                                                        {t(l, 'title')}
                                                        <small>{t(l, 'duration_label')}</small>
                                                    </div>
                                                ))}
                                        </details>
                                    ))}
                                    {!weeks.length && <p className="muted mt16">커리큘럼 공개를 준비하고 있습니다.</p>}
                                </section>
                                <section className="section">
                                    <h2>함께할 강사</h2>
                                    <div className="instructor-row">
                                        <span className="avatar">
                                            <UserRound />
                                        </span>
                                        <h3>{t(c, 'instructor_name') || '브랜디액션'}</h3>
                                    </div>
                                </section>
                                <section className="section">
                                    <h2>수강생 후기</h2>
                                    {rows('reviews')
                                        .filter((r) => r.course_id === c.id)
                                        .map((r) => (
                                            <article className="review-entry" key={r.id}>
                                                <p className="stars">{'★'.repeat(num(r, 'rating'))}</p>
                                                <p>{t(r, 'body')}</p>
                                                <small>{t(r, 'author_name')}</small>
                                            </article>
                                        ))}
                                </section>
                            </div>
                            <aside className="buy-card">
                                <Badge>수강 신청</Badge>
                                <h2>{t(c, 'title')}</h2>
                                <strong className="big-price">{money(available ? num(available, 'price') : num(c, 'list_price'))}</strong>
                                <dl>
                                    <dt>기수</dt>
                                    <dd>{available ? t(available, 'name') : '현재 모집 없음'}</dd>
                                    <dt>학습 기간</dt>
                                    <dd>{t(c, 'duration_label') || cohortPeriod(available || cohorts[0])}</dd>
                                    <dt>모집 마감</dt>
                                    <dd>{date(available?.recruitment_end_at)}</dd>
                                </dl>
                                <Link className={'btn primary full ' + (!available && !enrolled ? 'disabled' : '')} href={href}>
                                    {enrolled ? '학습 이어가기' : available ? '수강 신청하기' : '다음 모집 준비 중'}
                                    <ArrowRight />
                                </Link>
                                <Link href="/policies/refund" className="meta">
                                    이용·환불 안내
                                </Link>
                            </aside>
                        </div>
                    )}
                </div>
                <aside className={'bottom-cta ' + (!isFree ? 'product-mobile-cta' : '')}>
                    <div className="wrap">
                        <div className="cta-price">{isFree ? '무료' : money(num(c, 'list_price'))}</div>
                        <Link href={href} className={'btn primary large ' + (!available && !enrolled ? 'disabled' : '')}>
                            {enrolled ? '내 클래스 보기' : available ? '수강 신청하기' : '다음 모집 준비 중'}
                            <ArrowRight />
                        </Link>
                    </div>
                </aside>
            </>
        );
    }
    function articleDetail() {
        const a = rows('articles').find((a) => a.slug === path[1]);
        return (
            <div className="wrap">
                {a ? (
                    <article className="article-detail">
                        <div className="breadcrumbs">
                            <Link href="/articles">아티클</Link>
                        </div>
                        <Badge>인사이트</Badge>
                        <h1>{t(a, 'title')}</h1>
                        <div className="meta">브랜디액션 에디터 · {date(a.published_at)}</div>
                        <p className="lead mt24">{t(a, 'summary')}</p>
                        {safeUrl(a.video_url) && <Video url={String(a.video_url)} />}
                        <Blocks value={a.content_blocks} />
                        <Link href="/articles" className="btn">
                            <ArrowLeft />
                            아티클 목록
                        </Link>
                    </article>
                ) : (
                    <Empty title={loading ? '불러오는 중입니다.' : '아티클을 찾을 수 없습니다.'} />
                )}
            </div>
        );
    }
    function accountView() {
        const section = path[1] || 'dashboard';
        const enrollments = rows('enrollments');
        const active = enrollments.filter((e) => hasLearningAccess(e));
        const missions = rows('mission_submissions');
        let content: ReactNode;
        const classList = (
            <div className="stack">
                {enrollments.map((e) => {
                    const c = courses.find((c) => c.id === e.course_id);
                    return (
                        <div className="enrolled-card" key={e.id}>
                            <div>
                                <Badge color="red">{labels[t(e, 'status')] || t(e, 'status')}</Badge>
                                <h3>{t(c, 'title') || '클래스'}</h3>
                                <p>{t(c, 'schedule_label')}</p>
                                <div className="progress">
                                    <span
                                        style={{
                                            width: Math.min(100, (rows('lesson_progress').filter((p) => p.enrollment_id === e.id && p.completed_at).length / Math.max(1, rows('curriculum_lessons').filter((l) => rows('curriculum_weeks').some((w) => w.id === l.week_id && w.course_id === c?.id)).length)) * 100) + '%',
                                        }}
                                    />
                                </div>
                            </div>
                            <Link href={'/learn/' + e.id} className={'btn primary ' + (!hasLearningAccess(e) ? 'disabled' : '')}>
                                {hasLearningAccess(e) ? '학습 이어가기' : '수강 기간 종료'} <ArrowRight />
                            </Link>
                        </div>
                    );
                })}
                {!enrollments.length && (
                    <Empty title="신청한 클래스가 없습니다.">
                        <Link className="link" href="/classes">
                            클래스 찾아보기
                        </Link>
                    </Empty>
                )}
            </div>
        );
        if (section === 'dashboard')
            content = (
                <>
                    <Heading title={`${user?.full_name || '회원'}님, 오늘의 실행을 이어가세요.`} description="배운 내용을 내 일에 연결하는 작은 한 걸음." />
                    <section className="continue-panel">
                        <div>
                            <span className="eyebrow">CONTINUE LEARNING</span>
                            <h2>{active.length ? '다음 학습이 기다리고 있어요.' : '첫 배움을 시작해 보세요.'}</h2>
                            <p>{active.length ? '내가 수강 중인 클래스에서 바로 이어갑니다.' : '내 업무에 필요한 클래스부터 살펴보세요.'}</p>
                        </div>
                        <Link className="btn primary" href={active.length ? '/learn/' + active[0].id : '/classes'}>
                            {active.length ? '학습 이어가기' : '클래스 찾아보기'}
                            <ArrowRight />
                        </Link>
                    </section>
                    <div className="stats-row">
                        <Stat label="수강 중" value={active.length} />
                        <Stat label="완료한 학습" value={rows('lesson_progress').filter((p) => p.completed_at).length} />
                        <Stat label="승인된 미션" value={missions.filter((m) => m.status === 'approved').length} />
                    </div>
                    <div className="section-head mt32">
                        <h2>내 클래스</h2>
                        <Link className="link" href="/my/classes">
                            전체 보기 <ArrowRight />
                        </Link>
                    </div>
                    {classList}
                </>
            );
        else if (section === 'classes')
            content = (
                <>
                    <Heading title="내 클래스" description="나의 배움과 다음 일정을 확인하세요." />
                    {classList}
                    {active.map((e) => (
                        <LiveSchedule key={e.id} data={data} cohortId={t(e, 'cohort_id')} />
                    ))}
                </>
            );
        else if (section === 'profile')
            content = (
                <>
                    <Heading title="회원 정보" description="클래스 안내에 사용할 연락처를 최신 정보로 유지하세요." />
                    <form
                        className="panel pad"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void send({
                                action: 'profile',
                                name: f.get('name'),
                                phone: f.get('phone'),
                            }).catch(() => {});
                        }}
                    >
                        <label className="field">
                            이름
                            <input name="name" defaultValue={user?.full_name || ''} required />
                        </label>
                        <label className="field">
                            이메일
                            <input readOnly value={user?.email || ''} />
                        </label>
                        <label className="field">
                            연락처
                            <input name="phone" type="tel" pattern="0[0-9 ()-]{8,15}" title="예: 010-1234-5678" defaultValue={user?.phone || ''} />
                        </label>
                        <button className="btn primary" disabled={pending}>
                            변경사항 저장
                        </button>
                        <button type="button" className="btn ghost" onClick={() => void logout()} disabled={pending}>
                            <LogOut />
                            로그아웃
                        </button>
                    </form>
                </>
            );
        else if (section === 'questions')
            content = (
                <>
                    <Heading title="내 질문" description="학습 중 막히는 부분을 남겨주세요." />
                    <form
                        className="panel pad"
                        onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.currentTarget;
                            const f = new FormData(form);
                            void send(
                                {
                                    action: 'question',
                                    title: f.get('title'),
                                    content: f.get('content'),
                                },
                                '질문을 접수했습니다.',
                            )
                                .then(() => form.reset())
                                .catch(() => {});
                        }}
                    >
                        <label className="field">
                            질문 제목
                            <input name="title" required maxLength={200} defaultValue={searchParams.get('order') ? '주문 ' + searchParams.get('order') + ' 문의' : ''} />
                        </label>
                        <label className="field">
                            질문 내용
                            <textarea name="content" required rows={4} />
                        </label>
                        <button className="btn primary" disabled={pending}>
                            질문 등록
                        </button>
                    </form>
                    <div className="stack mt24">
                        {rows('edu_questions').map((q) => (
                            <details className="panel pad" key={q.id}>
                                <summary>
                                    <Badge>{q.status === 'answered' ? '답변 완료' : '답변 대기'}</Badge> {t(q, 'title')}
                                </summary>
                                <p className="mt16">{t(q, 'content')}</p>
                                {Boolean(q.answer) && (
                                    <div className="notice mt16">
                                        <b>운영자 답변</b>
                                        <p>{t(q, 'answer')}</p>
                                    </div>
                                )}
                            </details>
                        ))}
                    </div>
                </>
            );
        else if (section === 'orders')
            content = (
                <>
                    <Heading title="신청·주문 내역" description="무료 신청과 결제 내역을 함께 확인합니다." />
                    <div className="stack">
                        {rows('orders').map((o) => (
                            <div className="panel pad" key={o.id}>
                                <div className="between">
                                    <b>{t(o, 'order_number')}</b>
                                    <Badge>{labels[t(o, 'status')] || t(o, 'status')}</Badge>
                                </div>
                                <p className="mt16">
                                    {rows('order_items')
                                        .filter((item) => item.order_id === o.id)
                                        .map((item) => t(item, 'item_name'))
                                        .join(' · ')}
                                </p>
                                <p className="mt16">
                                    {date(o.created_at)} · {money(num(o, 'total_amount'))}
                                </p>
                                {rows('payments')
                                    .filter((p) => p.order_id === o.id && safeUrl(p.receipt_url))
                                    .map((p) => (
                                        <a className="btn small" key={p.id} target="_blank" rel="noreferrer" href={safeUrl(p.receipt_url)}>
                                            영수증 보기
                                        </a>
                                    ))}
                                {t(o, 'status') === 'paid' && (
                                    <Link href={'/my/questions?order=' + encodeURIComponent(t(o, 'order_number'))} className="link">
                                        결제·환불 문의
                                    </Link>
                                )}
                            </div>
                        ))}
                        {!rows('orders').length && <Empty title="신청·주문 내역이 없습니다." />}
                    </div>
                </>
            );
        else if (section === 'coupons')
            content = (
                <>
                    <Heading title="내 쿠폰" description="결제 시 쿠폰 코드를 입력해 할인 혜택을 확인하세요." />
                    {rows('customer_coupons').length ? (
                        rows('customer_coupons').map((c) => (
                            <div className="panel pad" key={c.id}>
                                <Ticket />
                                <b>{String(object(c, 'coupon').name || '쿠폰')}</b>
                                <p>코드 · {String(object(c, 'coupon').code || '확인 중')}</p>
                                <p>
                                    {labels[t(c, 'status')] || t(c, 'status')} · 만료 {date(c.expires_at || object(c, 'coupon').ends_at)}
                                </p>
                            </div>
                        ))
                    ) : (
                        <Empty title="발급된 쿠폰이 없습니다." />
                    )}
                </>
            );
        else if (section === 'resources')
            content = (
                <>
                    <Heading title="내 자료실" description="수강 권한이 있는 클래스의 학습 자료입니다." />
                    {rows('lesson_contents')
                        .filter((c) => c.resource_storage_path)
                        .map((c) => (
                            <div className="resource-row" key={t(c, 'lesson_id')}>
                                <FileText />
                                <div className="resource-text">
                                    <b>{t(c, 'resource_name') || '학습 자료'}</b>
                                </div>
                                <a className="btn small" href={'/api/platform/resource?lesson=' + c.lesson_id}>
                                    <Download />
                                    다운로드
                                </a>
                            </div>
                        ))}
                    {!rows('lesson_contents').some((c) => c.resource_storage_path) && <Empty title="이용 가능한 자료가 없습니다." />}
                </>
            );
        else if (section === 'missions')
            content = (
                <>
                    <Heading title="내 미션" description="제출한 실행 기록과 피드백을 확인하세요." />
                    <AchievementCards data={data} enrollments={active} />
                    {missions.map((m) => (
                        <div className="panel pad mb16" key={m.id}>
                            <div className="between">
                                <h3>
                                    {t(
                                        rows('curriculum_missions').find((x) => x.id === m.mission_id),
                                        'title',
                                    ) || '미션'}
                                </h3>
                                <Badge>{labels[t(m, 'status')] || t(m, 'status')}</Badge>
                            </div>
                            <p className="mt16">{String(object(m, 'response').text || '')}</p>
                            {Boolean(m.reviewer_feedback) && <div className="notice mt16">{t(m, 'reviewer_feedback')}</div>}
                        </div>
                    ))}
                    {!missions.length && <Empty title="제출한 미션이 없습니다.">학습실에서 미션을 작성해 보세요.</Empty>}
                </>
            );
        else if (section === 'reviews')
            content = (
                <>
                    <Heading title="내 상품 후기" description="어떻게 적용했는지, 어떤 변화가 있었는지 나누어주세요." />
                    {active.length ? (
                        <form
                            className="panel pad"
                            onSubmit={(e) => {
                                e.preventDefault();
                                const f = new FormData(e.currentTarget);
                                void send(
                                    {
                                        action: 'review',
                                        enrollmentId: f.get('enrollment'),
                                        rating: Number(f.get('rating')),
                                        content: f.get('content'),
                                    },
                                    '후기를 등록했습니다. 운영자 검토 후 공개됩니다.',
                                ).catch(() => {});
                            }}
                        >
                            <label className="field">
                                클래스
                                <select name="enrollment">
                                    {active.map((e) => (
                                        <option key={e.id} value={e.id}>
                                            {t(
                                                courses.find((c) => c.id === e.course_id),
                                                'title',
                                            )}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="field">
                                만족도
                                <select name="rating">
                                    {[5, 4, 3, 2, 1].map((n) => (
                                        <option key={n}>{n}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="field">
                                후기
                                <textarea name="content" required rows={5} />
                            </label>
                            <button className="btn primary" disabled={pending}>
                                후기 등록
                            </button>
                        </form>
                    ) : (
                        <Empty title="수강 신청 후 후기를 작성할 수 있습니다." />
                    )}
                    {rows('my_reviews').map((r) => (
                        <div className="panel pad mt16" key={r.id}>
                            <Badge>{labels[t(r, 'status')] || t(r, 'status')}</Badge>
                            <p>{t(r, 'body')}</p>
                        </div>
                    ))}
                </>
            );
        else content = <Empty title="페이지를 찾을 수 없습니다." />;
        return (
            <div className="account-bg">
                <div className="wrap account-layout">
                    <aside className="account-aside">
                        <div className="account-profile">
                            <span className="avatar">{(user?.full_name || '나').slice(0, 1)}</span>
                            <div>
                                <b>{user?.full_name || '회원'}</b>
                                <p>실행을 쌓아가는 중</p>
                            </div>
                        </div>
                        <nav className="account-nav">
                            {accountNav.map(([href, label, Icon]) => (
                                <Link key={href} href={href} className={'/' + path.join('/') === href ? 'active' : ''}>
                                    <Icon />
                                    {label}
                                </Link>
                            ))}
                            {['admin', 'staff'].includes(user?.role || '') && (
                                <Link href="/admin">
                                    <Settings />
                                    운영 관리자
                                </Link>
                            )}
                        </nav>
                    </aside>
                    <div className="account-main">{content}</div>
                </div>
            </div>
        );
    }
    function learningView() {
        const enrollment = rows('enrollments').find((e) => e.id === path[1] && hasLearningAccess(e));
        if (!enrollment)
            return (
                <div className="wrap">
                    <Empty title={loading ? '학습을 불러오고 있습니다.' : '수강 권한을 확인할 수 없습니다.'} />
                    <Link className="btn" href="/my/classes">
                        내 클래스 보기
                    </Link>
                </div>
            );
        const course = courses.find((c) => c.id === enrollment.course_id);
        const weeks = rows('curriculum_weeks').filter((w) => w.course_id === course?.id);
        const lessons = rows('curriculum_lessons')
            .filter((l) => weeks.some((w) => w.id === l.week_id))
            .sort((a, b) => num(a, 'day_number') - num(b, 'day_number'));
        const lesson = lessons.find((l) => l.id === path[2]) || lessons[0];
        const content = rows('lesson_contents').find((c) => c.lesson_id === lesson?.id);
        const missions = rows('curriculum_missions').filter((m) => m.lesson_id === lesson?.id);
        const done = rows('lesson_progress').some((p) => p.enrollment_id === enrollment.id && p.lesson_id === lesson?.id && p.completed_at);
        return (
            <div className="learning-layout-rebuild">
                <aside className="learning-nav-rebuild">
                    <Link className="link" href="/my/classes">
                        <ArrowLeft />내 클래스
                    </Link>
                    <h2>{t(course, 'title')}</h2>
                    {weeks.map((w) => (
                        <div key={w.id} className="lesson-group">
                            <b>
                                {num(w, 'week_number')}주차 · {t(w, 'title')}
                            </b>
                            {lessons
                                .filter((l) => l.week_id === w.id)
                                .map((l) => (
                                    <Link key={l.id} className={'lesson-link ' + (l.id === lesson?.id ? 'active' : '')} href={'/learn/' + enrollment.id + '/' + l.id}>
                                        {rows('lesson_progress').some((p) => p.enrollment_id === enrollment.id && p.lesson_id === l.id && p.completed_at) ? <Check /> : <Play />}
                                        <span>{t(l, 'title')}</span>
                                    </Link>
                                ))}
                        </div>
                    ))}
                </aside>
                <div className="learning-main-rebuild">
                    <LiveSchedule data={data} cohortId={t(enrollment, 'cohort_id')} />
                    {lesson ? (
                        <>
                            <div className="between">
                                <Badge>DAY {num(lesson, 'day_number')}</Badge>
                                <span className="meta">{t(lesson, 'duration_label')}</span>
                            </div>
                            <h1>{t(lesson, 'title')}</h1>
                            {safeUrl(content?.external_url) && (
                                <a className="btn primary mb24" target="_blank" rel="noreferrer" href={safeUrl(content?.external_url)}>
                                    외부 학습 열기 <ArrowRight />
                                </a>
                            )}
                            {content?.vod_url ? (
                                <Video url={String(content.vod_url)} />
                            ) : (
                                <div className="lesson-text">
                                    <BookOpen />
                                    <p className="reading-copy">{t(content, 'body_text') || t(lesson, 'description') || '학습 콘텐츠를 준비하고 있습니다.'}</p>
                                </div>
                            )}
                            {content?.resource_storage_path && (
                                <a className="resource-row" href={'/api/platform/resource?lesson=' + lesson.id}>
                                    <FileText />
                                    <b>{t(content, 'resource_name') || '학습 자료'}</b>
                                    <Download />
                                </a>
                            )}
                            <div className="reading-copy mt24">
                                <p>{t(lesson, 'description')}</p>
                            </div>
                            <div className="between mt32">
                                <Link className="btn" href="/my/questions">
                                    <MessageCircle />
                                    질문하기
                                </Link>
                                <button
                                    className="btn primary"
                                    disabled={pending || done}
                                    onClick={() =>
                                        void send(
                                            {
                                                action: 'progress',
                                                enrollmentId: enrollment.id,
                                                lessonId: lesson.id,
                                            },
                                            '학습 완료를 기록했습니다.',
                                        ).catch(() => {})
                                    }
                                >
                                    {done ? (
                                        <>
                                            <Check />
                                            학습 완료
                                        </>
                                    ) : (
                                        '학습 완료하기'
                                    )}
                                </button>
                            </div>
                            {missions.map((m) => {
                                const submission = rows('mission_submissions')
                                    .filter((s) => s.mission_id === m.id && s.enrollment_id === enrollment.id)
                                    .sort((a, b) => num(b, 'attempt_number') - num(a, 'attempt_number'))[0];
                                const draft = rows('edu_mission_drafts').find((d) => d.mission_id === m.id && d.enrollment_id === enrollment.id);
                                return <MissionForm key={m.id} mission={m} enrollment={enrollment} submission={submission} draft={draft} pending={pending} send={send} />;
                            })}
                        </>
                    ) : (
                        <Empty title="공개된 학습이 없습니다." />
                    )}
                </div>
            </div>
        );
    }
    function checkout() {
        return <Checkout data={data} user={user} pending={pending} send={send} />;
    }
    function adminView() {
        if (!['admin', 'staff'].includes(user?.role || ''))
            return (
                <div className="wrap">
                    <Empty title="운영자 로그인이 필요합니다." />
                    <div className="center">
                        <Link href="/login?next=/admin" className="btn primary">
                            로그인하기
                        </Link>
                    </div>
                </div>
            );
        const availableSections = sections.filter((section) => (user!.role === 'admin' ? true : section.key !== 'staff' && user!.permissions?.[sectionScopes[section.key]] === true));
        const key = path[1] || 'overview';
        const sec = availableSections.find((s) => s.key === key) || availableSections.find((s) => s.key === (key === 'product-editor' ? 'products' : key === 'learning-editor' ? 'learning' : ''));
        const groups = [...new Set(availableSections.map((s) => s.group))];
        const filtered = sec ? rows(sec.table).filter((row) => (showArchived || !row.archived_at) && JSON.stringify(row).toLowerCase().includes(query.toLowerCase()) && (filter === '전체' || (sec.key === 'cohorts' ? cohortStatus(row) : row.status) === filter)) : [];
        const summary = rows('admin_summary')[0];
        const pendingReviews = num(summary, 'pendingReviews');
        return (
            <div className="admin-shell-v2">
                <aside className={'admin-sidebar-v2 ' + (mobile ? 'open' : '')}>
                    <Link href="/admin" className="admin-brand">
                        <span className="admin-brand-mark">b</span>
                        <span>
                            <b>brandyaction</b>
                            <small>EDU / ADMIN</small>
                        </span>
                    </Link>
                    <div className="admin-workspace-card">
                        <span>B</span>
                        <b>클래스 운영 워크스페이스</b>
                    </div>
                    <nav className="admin-navigation" aria-label="관리자 메뉴">
                        <Link className={'admin-home-link ' + (key === 'overview' ? 'active' : '')} href="/admin" onClick={() => setMobile(false)}>
                            <LayoutDashboard aria-hidden="true" />
                            <span>운영 홈</span>
                        </Link>
                        {groups.map((g) => (
                            <details className="admin-nav-group" key={g} open>
                                <summary>
                                    <span>{g}</span>
                                    <ChevronDown aria-hidden="true" />
                                </summary>
                                <div>
                                    {availableSections
                                        .filter((s) => s.group === g)
                                        .map((s) => {
                                            const Icon = adminSectionIcons[s.key] || LayoutGrid;
                                            return (
                                                <Link key={s.key} href={'/admin/' + s.key} className={sec?.key === s.key ? 'active' : ''} onClick={() => setMobile(false)}>
                                                    <Icon aria-hidden="true" />
                                                    <span>{s.title}</span>
                                                    {s.key === 'reviews' && pendingReviews > 0 && (
                                                        <em className="admin-nav-count" aria-label={`검토 대기 ${pendingReviews}건`}>
                                                            {pendingReviews}
                                                        </em>
                                                    )}
                                                </Link>
                                            );
                                        })}
                                </div>
                            </details>
                        ))}
                    </nav>
                    <Link className="admin-customer-link" href="/">
                        <span>고객 화면 보기</span>
                        <ArrowRight />
                    </Link>
                </aside>
                <div className="admin-workspace-v2">
                    <header className="admin-header-v2">
                        <button className="icon-btn mobile-only" aria-label="관리자 메뉴 열기" onClick={() => setMobile(!mobile)}>
                            <Menu />
                        </button>
                        <span>
                            Brandy Edu <span className="muted">/ {sec?.group || '운영 홈'}</span>
                        </span>
                        <div className="flex gap8">
                            <span>{user!.full_name || (user!.role === 'staff' ? '스태프' : '관리자')}</span>
                            <button className="icon-btn" title="로그아웃" onClick={() => void logout()}>
                                <LogOut />
                            </button>
                        </div>
                    </header>
                    <div className="admin-content-v2">
                        <Heading title={sec?.title || '운영 홈'} description={sec ? '대상을 선택해 확인하고 변경사항을 저장하세요.' : '지금 확인할 교육 운영 현황입니다.'}>
                            {sec && !standaloneAdmin.includes(sec.key) && !sec.readOnly && !['profiles', 'reviews', 'mission_submissions', 'edu_questions'].includes(sec.table) && (
                                <button className="btn primary" onClick={() => setEditor({ section: sec })}>
                                    <Plus />
                                    새로 등록
                                </button>
                            )}
                        </Heading>
                        {!sec ? (
                            <>
                                <div className="stats-row">
                                    {(user!.role === 'admin' || user!.permissions?.members) && <Stat label="전체 회원" value={num(summary, 'members')} />}
                                    {(user!.role === 'admin' || user!.permissions?.products || user!.permissions?.members) && <Stat label="수강 중" value={num(summary, 'activeEnrollments')} />}
                                    {(user!.role === 'admin' || user!.permissions?.members) && <Stat label="검토 대기 미션" value={pendingReviews} />}
                                    {(user!.role === 'admin' || user!.permissions?.orders) && <Stat label="순결제액 (승인−환불)" value={money(num(summary, 'netRevenue'))} />}
                                </div>
                                <div className="grid2 mt32">
                                    {availableSections.some((section) => ['reviews', 'questions'].includes(section.key)) && <div className="panel pad">
                                        <h2>지금 확인할 일</h2>
                                        {availableSections.some((section) => section.key === 'reviews') && <Link className="operation-row" href="/admin/reviews">
                                            <span>제출물 검토</span>
                                            <b>{pendingReviews}건</b>
                                            <ArrowRight />
                                        </Link>}
                                        {availableSections.some((section) => section.key === 'questions') && <Link className="operation-row" href="/admin/questions">
                                            <span>답변 대기 질문</span>
                                            <b>{num(summary, 'openQuestions')}건</b>
                                            <ArrowRight />
                                        </Link>}
                                    </div>}
                                    {availableSections.some((section) => ['products', 'cohorts', 'learning'].includes(section.key)) && <div className="panel pad">
                                        <h2>클래스 운영</h2>
                                        <Link className="operation-row" href="/admin/products">
                                            <span>상품 관리</span>
                                            <ArrowRight />
                                        </Link>
                                        <Link className="operation-row" href="/admin/cohorts">
                                            <span>기수·회차 관리</span>
                                            <ArrowRight />
                                        </Link>
                                        <Link className="operation-row" href="/admin/learning">
                                            <span>학습 콘텐츠 관리</span>
                                            <ArrowRight />
                                        </Link>
                                    </div>}
                                </div>
                            </>
                        ) : standaloneAdmin.includes(sec.key) ? (
                            <AdminWorkflows section={sec.key} data={data} send={send} pending={pending} pagination={pagination} setPage={setAdminPage} loading={loading} />
                        ) : (
                            <>
                                <AdminWorkflows section={sec.key} data={data} send={send} pending={pending} selection={selection} />
                                <div className="admin-toolbar-v2">
                                    <label className="search">
                                        <Search />
                                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={sec.title + (pagination ? ' 현재 페이지 검색' : ' 검색')} aria-label="목록 검색" />
                                    </label>
                                    <select aria-label="상태 필터" value={filter} onChange={(e) => setFilter(e.target.value)}>
                                        <option>전체</option>
                                        {[
                                            ...new Set(
                                                rows(sec.table)
                                                    .map((r) => (sec.key === 'cohorts' ? cohortStatus(r) : t(r, 'status')))
                                                    .filter(Boolean),
                                            ),
                                        ].map((s) => (
                                            <option key={s} value={s}>
                                                {labels[s] || s}
                                            </option>
                                        ))}
                                    </select>
                                    <label className="checkline">
                                        <input
                                            type="checkbox"
                                            checked={showArchived}
                                            onChange={(e) => {
                                                setShowArchived(e.target.checked);
                                                setSelection([]);
                                            }}
                                        />
                                        보관 항목 포함
                                    </label>
                                    <span className="meta">총 {pagination?.total ?? filtered.length}개</span>
                                    {archiveValues[sec.key] && (
                                        <button className="btn" disabled={pending || !selection.length || selection.length > 50} onClick={() => void archive(sec, selection)}>
                                            선택 {selection.length}개 보관·숨김
                                        </button>
                                    )}
                                    <button className="btn" onClick={() => downloadCsv(filtered, sec.key)}>
                                        {pagination ? '현재 페이지 CSV' : 'CSV 내보내기'}
                                    </button>
                                </div>
                                {sec.key === 'analytics' && (
                                    <div className="stats-row mb24">
                                        <Stat label="수집 이벤트" value={filtered.length} />
                                        <Stat label="조회 대상" value="최대 1,000건" />
                                        <Stat label="결제 완료" value={rows('orders').filter((o) => o.status === 'paid').length} />
                                    </div>
                                )}
                                <div className="table-panel">
                                    <table className="admin-table-v2">
                                        <thead>
                                            <tr>
                                                <th>
                                                    <input type="checkbox" aria-label="전체 선택" checked={filtered.length > 0 && selection.length === filtered.length} onChange={(e) => setSelection(e.target.checked ? filtered.map(recordId) : [])} />
                                                </th>
                                                <th>이름 / 제목</th>
                                                <th>{sec.key === 'customers' ? '연락처' : '상세 정보'}</th>
                                                <th>상태</th>
                                                <th>등록일</th>
                                                <th>관리</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filtered.map((r, i) => {
                                                const id = r.id || t(r, 'key') || t(r, 'lesson_id');
                                                const title = t(r, 'title') || t(r, 'name') || t(r, 'full_name') || t(r, 'order_number') || t(r, 'key') || t(r, 'author_name') || '기록 ' + (i + 1);
                                                return (
                                                    <tr key={id}>
                                                        <td data-label="선택">
                                                            <input type="checkbox" aria-label={title + ' 선택'} checked={selection.includes(id)} onChange={(e) => setSelection(e.target.checked ? [...selection, id] : selection.filter((x) => x !== id))} />
                                                        </td>
                                                        <td data-label="이름 / 제목">
                                                            <b>{title}</b>
                                                            {Boolean(r.email) && <small>{t(r, 'email')}</small>}
                                                            {sec.key === 'customers' && (
                                                                <div className="flex gap8 wrap-flex mt8">
                                                                    {rows('crm_member_tags')
                                                                        .filter((m) => m.member_id === r.id)
                                                                        .map((m) => (
                                                                            <span className="badge" key={t(m, 'tag_id')}>
                                                                                {t(
                                                                                    rows('crm_tags').find((tag) => tag.id === m.tag_id),
                                                                                    'name',
                                                                                )}
                                                                            </span>
                                                                        ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td data-label="상세 정보">{sec.key === 'customers' ? t(r, 'phone') || '연락처 미등록' : sec.table === 'orders' ? money(num(r, 'total_amount')) : t(r, 'summary') || t(r, 'content') || t(r, 'reviewer_feedback') || t(r, 'body') || t(r, 'event_type') || t(r, 'description') || t(r, 'instructions') || t(r, 'course_code') || date(r.recruitment_end_at)}</td>
                                                        <td data-label="상태">
                                                            <Badge color={r.status === 'published' || r.status === 'approved' ? 'green' : ''}>{sec.key === 'cohorts' ? labels[cohortStatus(r)] : r.is_archived ? '보관' : labels[t(r, 'status')] || t(r, 'status') || (r.is_active || r.is_published ? '공개' : '비공개')}</Badge>
                                                        </td>
                                                        <td data-label="등록일">{date(r.created_at || r.updated_at)}</td>
                                                        <td data-label="관리">
                                                            {!sec.readOnly ? (
                                                                <button
                                                                    className="btn small"
                                                                    onClick={() =>
                                                                        setEditor({
                                                                            section: sec,
                                                                            row: { ...r, id },
                                                                        })
                                                                    }
                                                                >
                                                                    상세·수정
                                                                </button>
                                                            ) : sec.key === 'members' ? (
                                                                <Link className="btn small" href="/admin/reviews">
                                                                    검토하기
                                                                </Link>
                                                            ) : (
                                                                <button
                                                                    className="btn small"
                                                                    onClick={() =>
                                                                        setEditor({
                                                                            section: sec,
                                                                            row: { ...r, id },
                                                                        })
                                                                    }
                                                                >
                                                                    상세
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {!filtered.length && !loading && <Empty title="조회된 항목이 없습니다." />}
                                </div>
                                {pagination && pagination.total > pagination.pageSize && (
                                    <div className="workflow-pagination">
                                        <button className="btn" disabled={loading || pagination.page <= 1} onClick={() => setAdminPage((page) => Math.max(1, page - 1))}>
                                            이전
                                        </button>
                                        <span>
                                            {pagination.page} / {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))} 페이지 · 현재 화면 {filtered.length}개
                                        </span>
                                        <button className="btn" disabled={loading || pagination.page * pagination.pageSize >= pagination.total} onClick={() => setAdminPage((page) => page + 1)}>
                                            다음
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }
    return (
        <>
            {!admin && header}
            <main id="main" className={path[0] === 'classes' && path.length > 1 ? 'with-bottom-cta' : ''}>
                {error && (
                    <div className="error-banner" role="alert">
                        {error}
                        <button className="btn small" onClick={() => void refresh()}>
                            다시 시도
                        </button>
                    </div>
                )}
                {loading && <div className="loading-bar" role="status" aria-label="불러오는 중" />}
                {body}
            </main>
            {!admin && footer}
            {!admin && (support.email || safeUrl(support.url)) && (
                <div className="wrap flex gap8 mb24">
                    {support.email && (
                        <a className="link" href={'mailto:' + support.email}>
                            이메일 문의
                        </a>
                    )}
                    {safeUrl(support.url) && (
                        <a className="link" target="_blank" rel="noreferrer" href={safeUrl(support.url)}>
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
                    key={editor.section.key + (editor.row ? recordId(editor.row) : 'new')}
                    section={editor.section}
                    row={editor.row}
                    data={data}
                    pending={pending}
                    close={() => setEditor(null)}
                    archive={editor.row && archiveValues[editor.section.key] ? () => void archive(editor.section, [recordId(editor.row!)]) : undefined}
                    save={async (values) => {
                        await send({
                            action: 'save',
                            section: editor.section.key,
                            id: editor.row ? recordId(editor.row) : undefined,
                            values,
                        });
                        setEditor(null);
                    }}
                />
            )}
        </>
    );
}
function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="stat-card">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}
function downloadCsv(rows: Row[], name: string) {
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const cell = (v: unknown) =>
        '"' +
        String(v && typeof v === 'object' ? JSON.stringify(v) : (v ?? ''))
            .replace(/^[=+@-]/, "'$&")
            .replaceAll('"', '""') +
        '"';
    const csv = '\ufeff' + [keys.map(cell).join(','), ...rows.map((r) => keys.map((k) => cell(r[k])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function Editor({ section, row, data, pending, close, save, archive }: { section: Section; row?: Row; data: Data; pending: boolean; close: () => void; save: (values: Record<string, unknown>) => Promise<void>; archive?: () => void }) {
    const ref = useRef<HTMLDialogElement>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        ref.current?.showModal();
        const d = ref.current;
        return () => d?.close();
    }, []);
    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        const form = new FormData(e.currentTarget);
        try {
            const values: Record<string, unknown> = {};
            for (const field of section.fields) {
                const value = form.get(field.key);
                if (field.type === 'checkbox') values[field.key] = value === 'on';
                else if (field.type === 'json' || field.type === 'blocks') values[field.key] = value ? JSON.parse(String(value)) : {};
                else if (field.type === 'number') values[field.key] = value === '' ? (field.key === 'list_price' ? 0 : null) : Number(value);
                else if (field.type === 'datetime-local') values[field.key] = value ? new Date(String(value)).toISOString() : null;
                else values[field.key] = value || null;
            }
            await save(values);
        } catch (e) {
            setError((e as Error).message);
        }
    };
    const control = (f: Field) => {
        const value = section.table === 'courses' && ['thumbnail_url', 'detail_image_url'].includes(f.key) ? object(row, 'metadata')[f.key] || object(row, 'metadata')[f.key === 'thumbnail_url' ? 'thumbnailUrl' : 'detailImageUrl'] : row?.[f.key];
        const props = { name: f.key, id: 'edit-' + f.key, required: f.required };
        if (f.type === 'blocks') return <BlocksField name={f.key} value={value} />;
        if (['image', 'resource'].includes(f.type || '')) return <UploadField name={f.key} value={String(value || '')} image={f.type === 'image'} disabled={pending} />;
        if (f.type === 'checkbox') return <input {...props} type="checkbox" defaultChecked={Boolean(value)} />;
        if (['course', 'week', 'lesson'].includes(f.type || '')) {
            const table = f.type === 'course' ? 'courses' : f.type === 'week' ? 'curriculum_weeks' : 'curriculum_lessons';
            return (
                <select {...props} defaultValue={String(value || '')}>
                    <option value="">선택하세요</option>
                    {(data[table] || []).map((r) => (
                        <option key={r.id} value={r.id}>
                            {t(r, 'title')}
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
        if (f.type === 'json' || f.type === 'textarea') return <textarea {...props} rows={f.type === 'json' ? 8 : 5} defaultValue={f.type === 'json' ? JSON.stringify(value ?? (f.key === 'content_blocks' ? [] : {}), null, 2) : String(value || '')} />;
        const raw = f.type === 'datetime-local' && value ? localDateTime(value) : String(value ?? '');
        return <input {...props} type={f.type || 'text'} defaultValue={raw} min={f.type === 'number' ? (['capacity', 'week_number', 'day_number', 'usage_limit'].includes(f.key) ? 1 : 0) : undefined} />;
    };
    return (
        <dialog
            className="editor-dialog"
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
                            {section.title} · {row ? '상세' : '등록'}
                        </h2>
                    </div>
                    <button type="button" className="icon-btn" aria-label="닫기" disabled={pending} onClick={close}>
                        <X />
                    </button>
                </header>
                <div className="dialog-body">
                    {section.readOnly ? (
                        <dl className="detail-dl">
                            {Object.entries(row || {}).map(([key, value]) => (
                                <div key={key}>
                                    <dt>{key}</dt>
                                    <dd>{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '—')}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <>
                            {row && ['reviews', 'mission_submissions', 'edu_questions'].includes(section.table) && (
                                <div className="notice mb24">
                                    <b>{t(row, 'title') || t(row, 'author_name') || '제출 내용'}</b>
                                    <p>{t(row, 'content') || t(row, 'body') || String(object(row, 'response').text || '')}</p>
                                </div>
                            )}
                            <div className="editor-fields">
                                {section.fields.map((f) => (
                                    <label className={'field ' + (['textarea', 'json', 'blocks', 'image', 'resource'].includes(f.type || '') ? 'span2' : '')} key={f.key}>
                                        <span>
                                            {f.label}
                                            {f.required ? ' *' : ''}
                                        </span>
                                        {control(f)}
                                    </label>
                                ))}
                            </div>
                            {section.table === 'lesson_contents' && <p className="meta">영상 URL 또는 자료 경로 중 하나를 등록합니다.</p>}
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
                        <button type="button" className="btn" disabled={pending} onClick={archive}>
                            보관·숨김
                        </button>
                    )}
                    <button type="button" className="btn" disabled={pending} onClick={close}>
                        닫기
                    </button>
                    {!section.readOnly && (
                        <button className="btn primary" disabled={pending}>
                            {pending ? '저장 중...' : '저장하기'}
                        </button>
                    )}
                </footer>
            </form>
        </dialog>
    );
}
function Checkout({ data, user, pending, send }: { data: Data; user: User | null; pending: boolean; send: (body: Record<string, unknown>, success?: string) => Promise<Record<string, unknown>> }) {
    const cohortId = useSearchParams().get('cohort') || '';
    const checkoutRouter = useRouter();
    const [processing, setProcessing] = useState(false);
    const checkoutLock = useRef(false);
    const [error, setError] = useState('');
    const cohort = (data.cohorts || []).find((c) => c.id === cohortId);
    const course = (data.courses || []).find((c) => c.id === cohort?.course_id);
    const isFree = !!cohort && num(cohort, 'price') === 0;
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (checkoutLock.current) return;
        checkoutLock.current = true;
        setProcessing(true);
        setError('');
        const f = new FormData(e.currentTarget);
        try {
            const result = await send(
                {
                    action: 'order',
                    cohortId,
                    name: f.get('name'),
                    phone: f.get('phone'),
                    coupon: f.get('coupon'),
                    agreed: f.get('agreement') === 'on',
                },
                '신청 정보를 확인했습니다.',
            );
            if (result.free) {
                checkoutRouter.push('/applied?order=' + result.orderId);
                return;
            }
            const key = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
            if (!key) throw new Error('결제 서비스를 준비하고 있습니다.');
            const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
            const toss = await loadTossPayments(key);
            await toss.payment({ customerKey: user!.id }).requestPayment({
                method: 'CARD',
                amount: { currency: 'KRW', value: Number(result.totalAmount) },
                orderId: String(result.orderNumber),
                orderName: String(result.orderName || t(course, 'title')),
                customerName: String(f.get('name')),
                customerEmail: user!.email,
                successUrl: location.origin + '/payment/success',
                failUrl: location.origin + '/payment/fail',
            });
        } catch (e) {
            setError((e as Error).message);
        } finally {
            checkoutLock.current = false;
            setProcessing(false);
        }
    }
    return (
        <div className="wrap checkout-wrap">
            <Heading title={!cohort ? '클래스 신청' : isFree ? '무료 클래스 신청' : '주문·결제'} description="신청 정보를 확인하고 다음 단계로 진행하세요." />
            {!user ? (
                <Empty title="로그인 후 신청할 수 있습니다.">
                    <Link className="btn primary" href={'/login?next=' + encodeURIComponent('/checkout?cohort=' + cohortId)}>
                        로그인하기
                    </Link>
                </Empty>
            ) : !cohort ? (
                <Empty title="모집 정보를 확인하고 있습니다." />
            ) : (
                <form className="checkout-layout-rebuild" onSubmit={submit}>
                    <div className="stack">
                        <section className="panel pad">
                            <h2>신청 상품</h2>
                            <div className="summary-product mt24">
                                <div className="summary-thumb">{isFree ? 'FREE' : 'CLASS'}</div>
                                <div>
                                    <h3>{t(course, 'title')}</h3>
                                    <p>{[t(cohort, 'name'), t(course, 'duration_label') || cohortPeriod(cohort)].filter(Boolean).join(' · ')}</p>
                                </div>
                            </div>
                        </section>
                        <section className="panel pad">
                            <h2>신청자 정보</h2>
                            <label className="field mt24">
                                이름
                                <input name="name" defaultValue={user.full_name || ''} required />
                            </label>
                            <label className="field">
                                이메일
                                <input value={user.email} readOnly />
                            </label>
                            <label className="field">
                                연락처
                                <input name="phone" type="tel" pattern="0[0-9 ()-]{8,15}" title="예: 010-1234-5678" defaultValue={user.phone || ''} placeholder="01012345678" required />
                            </label>
                        </section>
                        {!isFree && (
                            <section className="panel pad">
                                <h2>쿠폰</h2>
                                <label className="field mt24">
                                    쿠폰 코드
                                    <input name="coupon" placeholder="보유한 쿠폰 코드를 입력하세요." />
                                </label>
                                <p className="meta">유효한 쿠폰은 결제창의 최종 금액에 반영됩니다.</p>
                            </section>
                        )}
                    </div>
                    <aside className="panel pad checkout-total">
                        <h2>신청 금액</h2>
                        <div className="between mt24">
                            <span>상품 금액</span>
                            <strong>{isFree ? '무료' : money(num(cohort, 'price'))}</strong>
                        </div>
                        <div className="divider" />
                        <label className="agreement-line">
                            <input type="checkbox" name="agreement" required />
                            <span>
                                <Link href="/policies/terms" target="_blank">
                                    이용약관
                                </Link>
                                ·
                                <Link href="/policies/privacy" target="_blank">
                                    개인정보 처리방침
                                </Link>
                                ·
                                <Link href="/policies/refund" target="_blank">
                                    이용 및 환불 안내
                                </Link>
                                를 확인하고 동의합니다.
                            </span>
                        </label>
                        {error && (
                            <p role="alert" className="notice mt16">
                                {error}
                            </p>
                        )}
                        <button className="btn primary full mt24" disabled={pending || processing}>
                            {pending || processing ? '처리 중...' : isFree ? '무료 신청 완료하기' : '결제하기'}
                            <ArrowRight />
                        </button>
                    </aside>
                </form>
            )}
        </div>
    );
}
import { defaultPolicies } from '@/lib/legal-policies';
function Policy({ kind }: { kind: string }) {
    const key = kind === 'refund' ? 'refund' : kind === 'privacy' ? 'privacy' : 'terms';
    const copy = defaultPolicies[key];
    return (
        <div className="wrap">
            <article className="article-detail">
                <h1>{key === 'refund' ? '이용·환불 안내' : key === 'privacy' ? '개인정보 처리방침' : '이용약관'}</h1>
                <div className="reading-copy mt32">{copy}</div>
            </article>
        </div>
    );
}
