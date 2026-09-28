import { QuestionAiBatch } from '../../../app/ui/final/question-ai-batch';
import { QuestionAnswerHistory, QuestionThreadDialog } from '../../../app/ui/final/question-thread';
import Link from 'next/link';
import { Brand } from '../../../app/ui/final/primitives';
import { UnreadMessageLink } from '../../../app/ui/final/unread-message-link';
import { PushSettings } from '../../../app/ui/final/push-settings';
import { MemberMessages } from '../../../app/ui/final/member-messages';
import { LessonImportFixture } from './lesson-import';
import { OngoingLessonReviews } from '../../../app/ui/final/ongoing-lesson-reviews';
import { LessonBlockReviews } from '../../../app/ui/final/lesson-block-reviews';
import { LessonProgressionFixture } from './lesson-progression';
import { LessonBlockAuthorFixture } from "./lesson-block-author";
import { LessonBlocksFixture } from "./lesson-blocks";
import { LessonFormattingFixture } from "./lesson-formatting";
import { CouponsFixture } from './coupons';
import { ClassroomQuestionsFixture } from './classroom-questions';
import { RecruitmentLinks } from '../../../app/ui/recruitment-links';
import { RecruitmentDelivery } from '../../../app/ui/recruitment-delivery';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LandingAdmin } from '../../../app/ui/landing/admin';
import { WebinarRegistration } from '../../../app/ui/webinar-registration';
import { WebinarManagement } from '../../../app/ui/webinar-management';
import { AdminWorkflows } from '../../../app/ui/admin-workflows';
import { ConversionFixture } from './conversion';
import { MissionIntegrityFixture } from './mission-integrity';
import { MemberOperationsFixture, RetainedMemberDialogFixture } from './member-operations';
import { SubmissionReviewFixture } from './submission-review';
import { ProductSaleFixture } from './product-sale';
import { ProductCountdownFixture } from './product-countdown';
import { HomeHero } from '../../../app/ui/final/home-hero';
import { AdminComponentsFixture } from './admin-components';
import { AdminPilotFixture } from './admin-pilot';
import { AdminWorkspace } from '../../../app/ui/admin-workspace';
import { ProductVisibilityFixture } from './product-visibility';
import { PurchaseOnboarding } from '../../../app/ui/purchase-onboarding';
import { PurchaseOnboardingAdmin } from '../../../app/ui/purchase-onboarding-admin';
import { OrderResult } from '../../../app/ui/order-result';
import { Editor, Platform } from '../../../app/ui/platform';
import { AdminCatalog } from '../../../app/ui/final/admin-catalog';
import { ArticleBannerEditor } from '../../../app/ui/final/article-banner-editor';
import { ArticleCategoryManager } from '../../../app/ui/final/article-category-manager';
import { sections, type Row } from '../../../lib/platform';
import '../../../app/ui/final/frontend.css';
import { AdminButton, AdminConfirmDialog, AdminDrawer, AdminEmptyState, AdminInlineError, AdminInput, AdminPage, AdminPageHeader, AdminShell, AdminSuccessState } from '../../../features/admin-ui';
import { ProductDetailHtml } from '../../../app/ui/final/product-detail-html';
import '../../../app/ui/final/tokens.css';
import '../../../app/ui/final/admin.css';
import '../../../features/admin-ui/styles/admin-system.css';
import '../../../app/ui/final/integration.css';

function BoundaryFixture() {
  const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false), [extra, setExtra] = useState(false);
  return <section><AdminButton onClick={() => setOpen(true)}>경계 조건 Drawer</AdminButton>{open && <AdminDrawer title="경계 조건" onClose={() => setOpen(false)}>
    <div className="admin-dialog-body">
      <AdminButton onClick={() => setConfirm(true)}>중첩 확인</AdminButton>
      <AdminButton onClick={() => setExtra(value => !value)}>활성 요소 전환</AdminButton>
      <AdminInput label="마지막 입력"/>
      <button disabled={!extra}>동적 마지막 버튼</button>
      <button disabled>disabled 제외</button><fieldset disabled><input aria-label="비활성 fieldset 제외"/></fieldset>
      <div hidden><button>hidden 제외</button></div><button style={{display:'none'}}>display none 제외</button>
      <button style={{visibility:'hidden'}}>visibility hidden 제외</button><div inert><button>inert 제외</button></div>
      <button tabIndex={-1}>음수 tabindex 제외</button>
    </div>
    {confirm && <AdminConfirmDialog title="중첩 확인" message="상위 Drawer는 유지됩니다." onCancel={() => setConfirm(false)} onConfirm={() => {setConfirm(false);setOpen(false);}}/>}
  </AdminDrawer>}</section>;
}
function QuestionThreadFixture() {
 const [open,setOpen]=useState(true);const questionId='22222222-2222-4222-8222-222222222222';
 if(new URLSearchParams(location.search).has('student'))return <main className="edu-front"><div className="wrap" style={{padding:24}}><h1>내 질문</h1><QuestionAnswerHistory questionId={questionId} fallback="기존 답변"/></div></main>;
 return <main className="edu-admin"><button onClick={()=>setOpen(true)}>질문 열기</button>{open&&<QuestionThreadDialog questionId={questionId} close={()=>setOpen(false)}/>}</main>;
}
function ShellFixture() {
  const [mobile, setMobile] = useState(false);
  const available = [
    { key: 'products', title: '상품 관리' },
    { key: 'weeks', title: '주차 구성' },
    { key: 'contents', title: '영상·자료 등록' },
    { key: 'orders', title: '주문 결제' },
  ];
  return <div className="edu-admin"><AdminShell current="overview" available={available} user={{full_name:'운영자',role:'staff'}} pendingReviews={3} mobile={mobile} setMobile={setMobile} logout={async()=>{}}><AdminPage><AdminPageHeader eyebrow="OPERATIONS" title="오늘의 운영" description="현재 상태를 확인하고 다음 작업을 시작하세요." actions={<AdminButton tone="primary">핵심 작업 시작</AdminButton>}/><AdminSuccessState title="대기 업무를 모두 처리했습니다.">새 요청이 생기면 이 화면과 메뉴 배지에 표시됩니다.</AdminSuccessState><AdminEmptyState title="조회 결과가 없습니다.">검색어 또는 필터를 변경해 보세요.</AdminEmptyState><AdminInlineError onRetry={()=>{}}>화면 정보를 불러오지 못했습니다.</AdminInlineError></AdminPage></AdminShell></div>;
}
function WeekCatalogFixture() {
  const withOnboarding = new URLSearchParams(location.search).has('onboarding');
  const [editing, setEditing] = useState<Row | null>(null);
  const [weeks, setWeeks] = useState([
    ...(withOnboarding ? [{ id: 'week-a-0', course_id: 'course-a', week_number: 0, title: '온보딩', goal: '시작 안내', is_published: true }] : []),
    { id: 'week-a-1', course_id: 'course-a', week_number: 1, title: '첫 번째 주차', goal: '목표', is_published: true },
    { id: 'week-a-2', course_id: 'course-a', week_number: 2, title: '둘째 주차', goal: '목표', is_published: false },
    { id: 'week-b-1', course_id: 'course-b', week_number: 1, title: '다른 상품 주차', goal: '목표', is_published: true },
  ]);
  const send = async (body: Record<string, unknown>) => {
    if (body.action === 'reorder-weeks' && Array.isArray(body.ids)) {
      const hasZero = weeks.some(week => week.course_id === body.courseId && week.week_number === 0);
      const positions = new Map(body.ids.map((id, index) => [String(id), index + (hasZero ? 0 : 1)]));
      setWeeks(current => current.map(week => positions.has(week.id) ? { ...week, week_number: positions.get(week.id)! } : week));
    }
    return { ok: true };
  };
  const section = sections.find(item => item.key === 'weeks')!;
  const data = { courses: [{ id: 'course-a', title: '합성 상품 A' }, { id: 'course-b', title: '합성 상품 B' }], curriculum_weeks: weeks };
  return <div className="edu-admin"><AdminCatalog section={section} data={data} selection={[]} setSelection={() => {}} edit={(_section, row) => setEditing(row || null)} archive={() => {}} pending={false} loading={false} pagination={{ page: 1, pageSize: 1000, total: weeks.length }} setPage={() => {}} exportCsv={() => {}} send={send} />{editing && <Editor section={section} row={editing} data={data} pending={false} close={() => setEditing(null)} save={async values => { setWeeks(current => current.map(week => week.id === editing.id ? { ...week, ...values } : week)); setEditing(null); }} />}</div>;
}
function FullMigrationFixture({ screen }: { screen: 'crm' | 'settings' }) {
  const send = async () => ({ ok: true });
  return <div className="edu-admin" style={{ padding: 24 }}>
    {screen === 'crm' ? <AdminWorkflows section="templates" data={{
      crm_templates: [
        { id: 'template-active', name: '결제 안내', channel: 'sms', purpose: 'transactional', content: '결제 확인과 수강 안내 문구', is_active: true },
        { id: 'template-draft', name: '모집 안내 초안', channel: 'lms', purpose: 'marketing', content: '검토 중인 모집 안내', is_active: false },
      ],
      crm_delivery_state: [{ id: 'delivery', enabled: false, configured: false }],
    }} pending={false} send={send} /> : <AdminWorkflows section="seo" data={{ site_settings: [] }} pending={false} send={send} />}
  </div>;
}
function ArticleMigrationFixture() {
  const [saved, setSaved] = useState(0);
  const send = async () => { setSaved(value => value + 1); return { ok: true }; };
  return <div className="edu-admin" style={{ padding: 24 }}>
    <ArticleCategoryManager categories={[{ id: 'cat-active', name: '마케팅', slug: 'marketing', display_order: 1, is_active: true }, { id: 'cat-idle', name: '기획', slug: 'planning', display_order: 2, is_active: false }]} articles={[{ id: 'article-1', category_id: 'cat-active' }]} pending={false} send={send}/>
    <ArticleBannerEditor settings={[]} pending={false} send={send}/>
    <output aria-label="합성 저장 횟수">{saved}</output>
  </div>;
}

function ProductHtmlCtaFixture() {
  const documentSource = '<!doctype html><html><body><a href="#faq">자주 묻는 질문</a><a href="#">무료강의 대기방 입장 →</a><p id="faq">FAQ</p></body></html>';
  return <ProductDetailHtml html="" documentSource={documentSource} ctaUrl="/join/synthetic/organic" />;
}
function OrderCompleteFixture() {
  const params = new URLSearchParams(location.search);
  const [status, setStatus] = useState(params.get('fixtureStatus') || 'paid');
  return <div className="edu-front"><OrderResult data={{ orders: [{ id: '11111111-1111-4111-8111-111111111111', order_number: 'BAE-QA-1', status, total_amount: params.get('free') === '1' ? 0 : 1650000 }] }} refresh={async () => { setStatus(params.get('fixtureRefreshStatus') || 'paid'); }} /></div>;
}
function HomeHeroTouchFixture() {
  const banners = [
    { id: 'touch-one', title: '첫 번째 배너', link_url: '/classes' },
    { id: 'touch-two', title: '두 번째 배너', link_url: '/classes' },
    { id: 'touch-three', title: '세 번째 배너', link_url: '/classes' },
    { id: 'touch-four', title: '네 번째 배너', link_url: '/classes' },
    { id: 'touch-five', title: '다섯 번째 배너', link_url: '/classes' },
  ];
  return <div className="edu-front"><HomeHero banners={new URLSearchParams(location.search).has('many') ? banners : banners.slice(0, 2)} freeOpen={false} /></div>;
}
const path = window.location.pathname;
// Destination pages are outside this fixture's scope. Keep them inert so their
// fallback admin screen cannot rewrite the URL before navigation is asserted.
const fixture = ['/checkout', '/apply', '/safe-custom', '/learn/enrolled-fixture'].includes(path) ? <main data-testid="navigation-destination" /> : path === '/admin-pilot-orders-test' ? <AdminPilotFixture screen="orders"/> : path === '/admin-pilot-products-test' ? <AdminPilotFixture screen="products"/> : path === '/admin-pilot-editor-test' ? <AdminPilotFixture screen="editor"/> : path === '/admin-component-system-test' ? <AdminComponentsFixture/> : path === '/admin-full-crm-test' ? <FullMigrationFixture screen="crm" /> : path === '/admin-full-settings-test' ? <FullMigrationFixture screen="settings" /> : path === '/admin-full-articles-test' ? <ArticleMigrationFixture/> : path === '/review-audit-test' ? <SubmissionReviewFixture/> : path === '/retained-member-dialog-test' ? <RetainedMemberDialogFixture/> : ['/member-operations-test', '/admin/customers', '/admin/questions', '/admin/reviews', '/admin/members'].includes(path) ? <MemberOperationsFixture/> : path === '/admin-week-order-test' ? <WeekCatalogFixture/> : path.startsWith('/mission-integrity-test') ? <MissionIntegrityFixture/> : path.startsWith('/admin-shell-test')
  ? <ShellFixture/>
  : path.startsWith('/product-html-cta-test')
    ? <ProductHtmlCtaFixture/>
    : <div className="edu-admin" style={{padding:24,minHeight:'180vh'}}>{path.startsWith('/copy-links-test') ? <><RecruitmentLinks period="sample" version={2}/><WebinarManagement period="sample" courses={[{id:'22222222-2222-4222-8222-222222222222',title:'합성 무료 교육'}]} cohorts={[]}/></> : path.startsWith('/delivery-test') ? <RecruitmentDelivery code="33333333-3333-4333-8333-333333333333"/> : path.startsWith('/templates-admin-test') ? <AdminWorkflows section="templates" data={{crm_templates:[],crm_delivery_state:[{id:'delivery',enabled:false,configured:false}]}} pending={false} send={async body=>{const r=await fetch('/api/platform/workflows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('저장 실패');return r.json();}}/> : path.startsWith('/webinar-test') ? <WebinarRegistration code="11111111-1111-4111-8111-111111111111" channel="organic"/> : path.startsWith('/webinar-admin-test') ? <WebinarManagement workspace={new URLSearchParams(location.search).has("workspace")} period="sample" courses={[{id:'22222222-2222-4222-8222-222222222222',title:'합성 무료 교육'}]} cohorts={[]}/> : path.startsWith('/admin/conversion') ? <ConversionFixture/> : <><BoundaryFixture/><LandingAdmin/></>}</div>;
const publicScreen = new URLSearchParams(location.search).get('publicScreen');
createRoot(document.getElementById('root')!).render(<StrictMode>{path === '/question-ai-batch-test' ? <main className="edu-admin" style={{padding:16}}><QuestionAiBatch changed={() => { document.documentElement.dataset.questionRefreshes = String(Number(document.documentElement.dataset.questionRefreshes || 0) + 1); }}/><a href="/other">다른 메뉴</a></main> : path === '/question-thread-test' ? <QuestionThreadFixture/> : path === '/notification-inbox-test' ? <div className="edu-front"><header className="site-header"><div className="wrap learning-chrome"><Brand/><div className="learning-context"><b>나의 학습</b><span>배움을 실행으로 이어가는 공간</span></div><div className="header-user"><UnreadMessageLink userId="11111111-1111-4111-8111-111111111111"/><Link className="link" href="/my">마이페이지</Link><button className="avatar" aria-label="내 프로필 메뉴">나</button><button className="icon-btn mobile-only" aria-label="메뉴 열기">☰</button></div></div></header><main className="wrap" style={{paddingTop:20}}><MemberMessages/></main></div> : path === '/push-settings-test' ? <main className="edu-front"><div className="wrap" style={{padding:20}}><PushSettings userId="11111111-1111-4111-8111-111111111111"/></div></main> : path === '/messages-test' ? <main className="edu-front"><div className="wrap" style={{padding:20}}><MemberMessages ongoingLesson={new URLSearchParams(location.search).get('ongoing') || ''}/></div></main> : path === '/ongoing-review-test' ? <main className="edu-admin" style={{padding:20}}><OngoingLessonReviews/></main> : path === '/lesson-import-test' ? <LessonImportFixture/> : (path === '/lesson-progression-test' || path.startsWith('/learn/aaaaaaac-')) ? <LessonProgressionFixture/> : path === '/lesson-block-review-test' ? <main className="edu-admin" style={{padding:20}}><LessonBlockReviews/></main> : path === '/lesson-block-author-test' ? <LessonBlockAuthorFixture/> : path === '/lesson-blocks-test' ? <LessonBlocksFixture/> : path === '/lesson-formatting-test' ? <LessonFormattingFixture/> : ['/coupons-test', '/coupon-checkout-test'].includes(path) ? <CouponsFixture/> : path === '/order-complete-test' ? <OrderCompleteFixture/> : path === '/home-hero-touch-test' ? <HomeHeroTouchFixture/> : path === '/purchase-onboarding' ? <PurchaseOnboarding order={new URLSearchParams(location.search).get('order') || ''} guideRequested={new URLSearchParams(location.search).get('step') === 'guide'} /> : path === '/admin/purchase-onboarding-test' ? <PurchaseOnboardingAdmin/> : path === '/classroom-questions-test' ? <ClassroomQuestionsFixture/> : path === '/product-countdown-test' ? <ProductCountdownFixture /> : publicScreen ? <Platform path={publicScreen === 'home' ? [] : publicScreen.split('/')} user={null} /> : new URLSearchParams(location.search).has('navigationFixture') ? <AdminWorkspace>{null}</AdminWorkspace> : path === '/product-visibility-test' ? <ProductVisibilityFixture /> : path === '/visibility-home-test' || path.startsWith('/classes') ? <Platform path={path === '/visibility-home-test' ? [] : path.split('/').filter(Boolean)} user={null} /> : path === '/product-sale-test' ? <ProductSaleFixture /> : fixture}</StrictMode>);
