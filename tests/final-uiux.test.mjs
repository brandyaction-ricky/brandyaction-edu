import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const cache = new Map();
let search = new URLSearchParams();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file) {
  const absolute = path.isAbsolute(file) ? file : path.join(root, file);
  if (cache.has(absolute)) return cache.get(absolute);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  cache.set(absolute, exports);
  new Function('exports', 'require', compiled)(exports, name => {
    if (name === 'next/link') return function LinkStub(props) { return React.createElement('a', props); };
    if (name === 'next/navigation') return { useSearchParams: () => search, usePathname: () => '/order-complete', useRouter: () => ({ push() {}, replace() {}, refresh() {} }) };
    if (name === '@/lib/supabase/client') return { createClient: () => { throw Error('Unexpected authentication mutation during render'); } };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(absolute), name);
      const target = ['', '.ts', '.tsx'].map(extension => base + extension).find(file => fs.existsSync(file) && fs.statSync(file).isFile());
      if (!target) throw Error('Cannot resolve ' + name);
      return load(target);
    }
    return require(name);
  });
  return exports;
}
const html = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const platform = load('lib/platform.ts');
const user = { id: 'user', full_name: '테스트 회원', email: 'member@example.test', role: 'member' };
const course = { id: 'course', slug: 'test-course', title: '등록된 테스트 클래스', summary: '실제 저장된 소개', category: 'paid_class', status: 'published', list_price: 100000, metadata: {} };
const cohort = { id: 'cohort', course_id: 'course', name: '테스트 기수', status: 'recruiting', price: 100000, recruitment_start_at: '2020-01-01', recruitment_end_at: '2099-01-01' };
const enrollment = { id: 'enrollment', user_id: 'user', course_id: 'course', cohort_id: 'cohort', status: 'active', access_starts_at: '2020-01-01' };
const lesson = { id: 'lesson', week_id: 'week', title: '첫 번째 학습', day_number: 1, is_published: true };
const mission = { id: 'mission', lesson_id: 'lesson', title: '실행 미션', instructions: '안전한 안내', is_required: true, is_published: true, submission_type: 'text' };
const submission = { id: 'submission', enrollment_id: 'enrollment', mission_id: 'mission', status: 'submitted', attempt_number: 1, submitted_at: '2026-09-01T00:00:00Z', response: { text: '<script>unsafe()</script>', url: 'javascript:alert(1)' } };
const data = { courses: [course], cohorts: [cohort], enrollments: [enrollment], profiles: [user], curriculum_weeks: [{ id: 'week', course_id: 'course', week_number: 1, title: '시작하기', is_published: true }], curriculum_lessons: [lesson], curriculum_missions: [mission], mission_submissions: [submission], lesson_contents: [{ lesson_id: 'lesson', body_text: '등록된 학습 본문', resource_path: 'private/test.pdf', resource_name: '학습 자료.pdf' }], articles: [{ id: 'article', slug: 'test-article', title: '테스트 아티클', content_type: 'text', status: 'published', body: [{ type: 'paragraph', text: '콘텐츠' }] }], review_videos: [{ id: 'story', title: '등록된 고객 이야기', reviewer_name: '고객' }], orders: [], admin_summary: [{ id: 'summary', members: 1, activeEnrollments: 1, pendingReviews: 1, openQuestions: 0 }] };
const send = async () => { throw Error('Unexpected write during render'); };

test('final design styles are isolated, reproducible and exclude prototype runtime', () => {
  assert.equal(read('app/ui/final/tokens.css'), read('design-reference/source/shared/tokens.css'));
  for (const [area, scope] of [['frontend', '.edu-front'], ['admin', '.edu-admin']]) {
    const source = [`${area}/src/interface.css`, 'shared/tokens.css', 'shared/components.css', `${area}/src/experience.css`].map(file => read('design-reference/source/' + file)).join('\n');
    const rules = postcss.parse(source);
    rules.walkRules(rule => {
      if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
      rule.selectors = rule.selectors.map(selector => [':root', 'body', 'html'].includes(selector) ? scope : /^(?:body|html)(?=[.\s:#[])/.test(selector) ? selector.replace(/^(body|html)/, scope) : `${scope} ${selector}`);
    });
    assert.equal(read(`app/ui/final/${area}.css`), `/* Generated from final UIUX source; run node scripts/build-uiux-css.mjs. */\n${rules.toString()}\n`);
  }
  const layout = read('app/layout.tsx');
  assert.ok(layout.includes('./ui/final/frontend.css') && layout.includes('./ui/final/admin.css'));
  assert.doesNotMatch(layout, /ui\/(design|platform)\.css/);
  for (const file of fs.readdirSync(path.join(root, 'app/ui/final')).filter(file => file.endsWith('.tsx'))) assert.doesNotMatch(read('app/ui/final/' + file), /dangerouslySetInnerHTML|design-reference\/source|data-demo=/);
});
test('five admin categories and scoped navigation render from the final shell', () => {
  const { AdminShell, finalAdminGroups, Overview } = load('app/ui/final/admin-shell.tsx');
  assert.equal(finalAdminGroups.length, 5);
  const props = { current: 'overview', available: platform.sections, user: { ...user, role: 'admin' }, data, mobile: false, setMobile() {}, logout: async () => {} };
  const markup = html(AdminShell, { ...props, children: React.createElement(Overview, { data, available: platform.sections }) });
  for (const [label] of finalAdminGroups) assert.ok(markup.includes(label));
  assert.match(markup, /class="nav-group"/); assert.match(markup, /lucide/); assert.match(markup, /category-strip/);
  const restricted = html(AdminShell, { ...props, available: platform.sections.filter(row => row.key === 'products') });
  assert.doesNotMatch(restricted, /href="\/admin\/(questions|customers|members|orders)"/);
});
test('three signup methods and product detail variants use the final publishing structures', () => {
  const { AuthView, ProductDetail, ArticlesView, StoriesView } = load('app/ui/final/public-views.tsx');
  for (const signup of [false, true]) {
    const markup = html(AuthView, { signup, pending: false, social: send, next: '/my' });
    assert.match(markup, /form-card/); assert.match(markup, /카카오로 계속하기/); assert.match(markup, /Google로 계속하기/); assert.doesNotMatch(markup, /type="password"/);
    assert.match(markup, new RegExp(signup ? '이메일로 회원가입' : '이메일로 로그인'));
  }
  assert.match(html(ProductDetail, { course, data }), /product-layout/);
  assert.match(html(ProductDetail, { course: { ...course, list_price: 0, category: 'free' }, data }), /free-body/);
  assert.match(html(ProductDetail, { course: { ...course, category: 'digital' }, data }), /product-layout/);
  assert.match(html(ArticlesView, { data, user, loading: false }), /테스트 아티클/);
  assert.match(html(StoriesView, { data, loading: false }), /등록된 고객 이야기/);
});
test('article hub includes the managed free-video banner and representative thumbnails', () => {
  const { ArticlesView } = load('app/ui/final/public-views.tsx');
  const banner = { id: 'edu_article_banner', value: { enabled: true, title: '회원 무료 영상', videos: [{ title: '첫 영상', url: 'https://youtu.be/dQw4w9WgXcQ', available: true }] } };
  const articleData = { ...data, article_banner: [banner], articles: [{ ...data.articles[0], cover_image_url: 'https://cdn.example/thumb.webp', cover_image_alt: '대표 이미지' }] };
  const markup = html(ArticlesView, { data: articleData, user, loading: false });
  assert.match(markup, /회원 무료 영상/);
  assert.match(markup, /article-thumbnail/);
  assert.match(markup, /thumb\.webp/);
  assert.doesNotMatch(markup, /class="tag">(?:인사이트|영상)</);
  const platformSource = read('app/ui/platform.tsx');
  assert.doesNotMatch(platformSource, /THE WAY WE LEARN|시청에서 멈추지 않는/);
  assert.match(platformSource, /제2026-충남천안-1825호/);
  assert.match(platformSource, /policies\/refund/);
});
test('article management renders the free-video banner editor', () => {
  const { ArticleBannerEditor } = load('app/ui/final/article-banner-editor.tsx');
  const markup = html(ArticleBannerEditor, { settings: [], send, pending: false });
  assert.match(markup, /상단 무료강의 영상 배너/);
  assert.equal((markup.match(/무료 영상 [123]/g) || []).length >= 3, true);
  assert.ok(platform.sections.find(row => row.key === 'articles').fields.some(field => field.key === 'cover_image_path'));
});
test('all member screens render real data, with no authentication or payment writes', () => {
  const { MemberViews } = load('app/ui/final/member-views.tsx');
  for (const section of ['dashboard', 'classes', 'missions', 'questions', 'orders', 'coupons', 'resources', 'profile', 'reviews']) {
    const markup = html(MemberViews, { section, data, user, pending: false, send, logout: send });
    assert.match(markup, /account-layout/, section);
    assert.doesNotMatch(markup, /href="(?:undefined|null|javascript:)/, section);
  }
});
test('classroom, mission, checkout and completion preserve authorized workflow entry points', () => {
  const { Classroom } = load('app/ui/final/classroom.tsx');
  assert.match(html(Classroom, { path: ['learn', 'enrollment', 'lesson'], data, pending: false, send, loading: false }), /learning-layout/);
  assert.match(html(Classroom, { path: ['learn', 'enrollment', 'lesson', 'mission'], data, pending: false, send, loading: false, missionId: 'mission' }), /mission-guide/);
  const { ResourceRow } = load('app/ui/final/primitives.tsx');
  const resource = html(ResourceRow, { content: data.lesson_contents[0] });
  assert.match(resource, /\/api\/platform\/resource\?lesson=lesson/); assert.doesNotMatch(resource, /private\/test/);
  search = new URLSearchParams('cohort=cohort');
  const { Checkout } = load('app/ui/final/checkout.tsx');
  assert.match(html(Checkout, { data, user, send, pending: false }), /checkout-layout/);
  search = new URLSearchParams('order=order');
  const { OrderResult } = load('app/ui/order-result.tsx');
  const result = html(OrderResult, { data: { ...data, orders: [{ id: 'order', status: 'paid', total_amount: 0 }] }, refresh: send });
  assert.match(result, /completion/); assert.match(result, /무료 클래스 신청이 완료/);
  search = new URLSearchParams();
});
test('catalogues and separate editors render without dropping existing fields', () => {
  const { AdminCatalog } = load('app/ui/final/admin-catalog.tsx');
  for (const key of ['products', 'cohorts', 'learning', 'missions', 'questions', 'customers', 'tags', 'coupons', 'product-reviews', 'banners', 'articles', 'testimonials']) {
    const section = platform.sections.find(row => row.key === key);
    assert.ok(html(AdminCatalog, { section, data, selection: [], setSelection() {}, edit() {}, archive() {}, pending: false, loading: false, pagination: null, setPage() {}, exportCsv() {} }).length > 100, key);
  }
  const { ProductEditor, LearningEditor } = load('app/ui/final/admin-editors.tsx');
  const markup = html(ProductEditor, { data, row: course, pending: false, send, back() {} });
  assert.match(markup, /editor-savebar/);
  for (const field of platform.sections.find(row => row.key === 'products').fields) assert.ok(markup.includes(`name="${field.key}"`), field.key);
  assert.match(html(LearningEditor, { data, row: lesson, pending: false, send, back() {} }), /editor-/);
});
test('submission review keeps queue and inspector, escaping text and unsafe links', () => {
  const { SubmissionReview } = load('app/ui/final/submission-review.tsx');
  const markup = html(SubmissionReview, { data, send, pending: false });
  for (const className of ['review-shell', 'queue', 'review-main', 'answers', 'inspector']) assert.ok(markup.includes(`class="${className}"`));
  assert.match(markup, /&lt;script&gt;/); assert.doesNotMatch(markup, /href="javascript:/);
  assert.match(markup, /승인 후 다음/); assert.match(markup, /최대 50건/);
});
test('participant matrix uses latest attempts, required missions and enrollment boundaries', () => {
  const { participantMatrix } = load('lib/participant-matrix.ts');
  const missions = [{ id: 'm1', lesson_id: 'l1' }, { id: 'm2', lesson_id: 'l1' }];
  const result = participantMatrix([{ id: 'e1' }, { id: 'e2' }], [{ id: 'l1' }, { id: 'l2' }], missions, [
    { id: 's1', enrollment_id: 'e1', mission_id: 'm1', attempt_number: 1, status: 'approved' },
    { id: 's2', enrollment_id: 'e1', mission_id: 'm1', attempt_number: 2, status: 'changes_requested' },
    { id: 's3', enrollment_id: 'e1', mission_id: 'm2', attempt_number: 1, status: 'approved' },
  ]);
  assert.equal(result.e1[0].status, 'changes_requested'); assert.equal(result.e1[0].submissionId, 's2'); assert.equal(result.e1[0].approved, 1);
  assert.equal(result.e2[0].status, 'empty'); assert.equal(result.e1[1].status, 'none');
});

test('campaign class keeps published content, escapes copy, and sends all CTA positions to one Kakao URL', () => {
  const { ProductDetail } = load('app/ui/final/public-views.tsx');
  const { defaultConfig } = load('lib/landing.ts');
  const course = { ...data.courses[0], list_price: 0 };
  const cfg = { ...defaultConfig(course.id), layout_ver: 1, revision: 1, kakao_url: 'https://open.kakao.com/o/testRoom', custom_sections: true, sections: [{ id: 'proof', title: '고객 이야기', body: '<script>unsafe()</script>', image: 'https://cdn.example/proof.webp' }], course_snapshot: { title: '발행한 제목', summary: '발행 당시 소개' } };
  const markup = html(ProductDetail, { course, data: { ...data, landing_configs: [cfg] } });
  for (const position of ['hero_cta', 'sticky_cta', 'final_cta']) assert.match(markup, new RegExp('data-landing-cta="' + position + '"'));
  assert.equal((markup.match(/href="https:\/\/open.kakao.com\/o\/testRoom"/g) || []).length, 3);
  assert.match(markup, /발행한 제목/); assert.doesNotMatch(markup, /등록된 테스트 클래스/);
  assert.match(markup, /data-section="proof"/); assert.match(markup, /loading="lazy"/);
  assert.match(markup, /&lt;script&gt;/); assert.doesNotMatch(markup, /<script>|checkout/);
  assert.doesNotMatch(html(ProductDetail, { course, data: { ...data, landing_configs: [{ ...cfg, enabled: false }] } }), /data-landing-cta/);
  const untracked = html(ProductDetail, { course, data: { ...data, enrollments: [], landing_configs: [{ ...cfg, enabled: false }] } });
  assert.equal((untracked.match(/href="https:\/\/open.kakao.com\/o\/testRoom"/g) || []).length, 3);
  assert.doesNotMatch(untracked, /href="\/(?:apply|signup|login)/);
  const missing = html(ProductDetail, { course, data: { ...data, enrollments: [], landing_configs: [{ ...cfg, kakao_url: '' }] } });
  assert.match(missing, /disabled="">참여 링크 준비 중/);
  assert.doesNotMatch(missing, /href="\/apply/);
  const paid = html(ProductDetail, { course: { ...course, list_price: 10000 }, data: { ...data, landing_configs: [cfg] } });
  assert.doesNotMatch(paid, /href="https:\/\/open.kakao.com\/o\/testRoom"/);
});

test('landing report separates repeated clicks, missing actuals, direct traffic and per-version reach', () => {
  const { LandingDashboard } = load('app/ui/landing/dashboard.tsx');
  const { defaultConfig } = load('lib/landing.ts');
  const dimension = { campaign: 'campaign', adset: 'set', creative: 'ad', traffic: 'direct', layout_ver: 1 };
  const report = { config: defaultConfig(course.id), groups: [{ ...dimension, sessions: 400, clicks: 100, converted: 80, alive: 2, bounced: 120, completed_no_click: 3, avg_depth: 1.5, top_exit: 'hero' }], sections: [{ ...dimension, section: 'hero', reached: 400, dwell_ms: 3000 }, { ...dimension, section: 'final', reached: 200, dwell_ms: 1000 }], snapshots: [{ layout_ver: 1, sections: ['hero', 'final'], created_at: '2026-09-14T00:00:00Z', note: '첫 발행' }], actuals: [{ day: '2026-09-14', joins: null, payments: null, live_peak: null, exits: null }], meta: [{ day: '2026-09-14', campaign: 'campaign', adset: 'set', creative: 'ad', impressions: 987654, link_clicks: 900, spend: 10000 }], daily: [], ctas: [], environment: [], options: [], last_event_at: null };
  const markup = html(LandingDashboard, { report, filtered: true, traffic: 'direct' });
  assert.match(markup, /20\.0%/); assert.match(markup, /50\.0%/);
  assert.match(markup, /클릭 100회/); assert.match(markup, /클릭 세션 80회/);
  assert.doesNotMatch(markup, /987,654|위너 후보<\/span>|링크클릭 대비 세션 갭이 기준/);
  assert.match(markup, /카카오 누적 입장<\/span><strong>—/);
});
