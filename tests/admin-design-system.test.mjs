import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    if (name.endsWith('.css')) return {};
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? name.slice(2) : path.join(path.dirname(file), name);
      return load(['.ts', '.tsx'].map(ext => base + ext).find(value => fs.existsSync(value)));
    }
    return require(name);
  });
  return exports;
}

test('admin tokens are scoped and do not modify public sizing tokens', () => {
  const admin = fs.readFileSync('features/admin-ui/styles/admin-system.css', 'utf8');
  const publicTokens = fs.readFileSync('app/ui/final/tokens.css', 'utf8');
  for (const token of ['--admin-sidebar-width:224px', '--admin-topbar-height:64px', '--admin-content-wide:1440px', '--admin-content-standard:1280px', '--admin-content-narrow:960px', '--admin-control-height:40px', '--admin-control-height-sm:36px', '--admin-table-row-height:44px', '--admin-table-head-height:44px', '--admin-radius-control:6px', '--admin-radius-surface:8px']) assert.ok(admin.includes(token), token);
  assert.match(admin, /^\/\*[^\n]*\*\/\s*\.edu-admin\{/);
  assert.doesNotMatch(admin, /:root/);
  assert.match(publicTokens, /--control-height:\s*48px/);
  assert.match(publicTokens, /--table-row-height:\s*64px/);
});

test('all admin routes share the adm token and class contract without changing public pages', () => {
  const admin = fs.readFileSync('features/admin-ui/styles/admin-system.css', 'utf8');
  const platform = fs.readFileSync('app/ui/platform.tsx', 'utf8');
  const components = fs.readFileSync('features/admin-ui/components/admin-system.tsx', 'utf8');
  const shell = fs.readFileSync('app/ui/final/admin-shell.tsx', 'utf8');
  for (const token of ['--adm-bg:#F5F6F8', '--adm-surface:#FFFFFF', '--adm-border:#E3E5E9', '--adm-text:#15171A', '--adm-primary:#C9232D', '--adm-control:36px', '--adm-control-sm:30px', '--adm-sidebar-width:210px', '--adm-tree-width:320px', '--adm-page-max:1440px']) assert.ok(admin.includes(token), token);
  for (const selector of ['.adm-shell', '.adm-sidebar', '.adm-main', '.adm-topbar', '.adm-page', '.adm-page-head', '.adm-btn', '.adm-field', '.adm-table-wrap', '.adm-table', '.adm-filterbar', '.adm-tabs', '.adm-modal', '.adm-stats']) assert.ok(admin.includes(selector), selector);
  assert.match(platform, /"edu-admin adm adm-shell"/);
  for (const className of ['adm-sidebar', 'adm-main', 'adm-topbar', 'adm-page']) assert.ok(shell.includes(className), className);
  for (const className of ['adm-page-head', 'adm-btn', 'adm-input', 'adm-select', 'adm-textarea', 'adm-check', 'adm-choice', 'adm-table-wrap', 'adm-table', 'adm-filterbar', 'adm-pagination', 'adm-badge', 'adm-empty', 'adm-notice', 'adm-modal']) assert.ok(components.includes(className), className);
  assert.doesNotMatch(admin, /:root/);
  assert.doesNotMatch(admin, /!important/);
});

test('legacy admin tables and curriculum editor are normalized by the adm contract', () => {
  const admin = fs.readFileSync('features/admin-ui/styles/admin-system.css', 'utf8');
  const curriculum = fs.readFileSync('app/ui/final/curriculum-editor.css', 'utf8');
  for (const className of ['.table-scroll', '.table-wrap', '.participant-table', '.diagnosis-management-table']) assert.ok(admin.includes(className), className);
  assert.match(admin, /\.adm\.edu-admin :is\(\.admin-data-table,[^}]*\.participant-table,[^}]*\.diagnosis-management-table table\) thead th\{height:40px/);
  assert.match(admin, /tbody :is\(th,td\)\{height:44px;min-height:44px/);
  assert.match(curriculum, /grid-template-columns:var\(--adm-tree-width\) minmax\(0,1fr\)/);
  assert.match(curriculum, /\.adm\.edu-admin \.curriculum-editor-page/);
  assert.doesNotMatch(curriculum, /!important/);
});

test('common system exports the Phase 0 component inventory', () => {
  const system = load('features/admin-ui.ts');
  for (const name of ['AdminPage','AdminPageHeader','AdminContent','AdminSection','AdminDivider','AdminStack','AdminGrid','AdminButton','AdminIconButton','AdminInput','AdminSelect','AdminTextarea','AdminCheckbox','AdminDatePicker','AdminSearchField','AdminFilterTrigger','AdminMetricGrid','AdminMetric','AdminDataTable','AdminTableToolbar','AdminPagination','AdminStatusBadge','AdminEmptyState','AdminSuccessState','AdminSkeleton','AdminLoadingState','AdminInlineError','AdminDrawer','AdminModal','AdminConfirmDialog','AdminPopover','AdminToast']) assert.ok(system[name], name);
});

test('shared status badges translate internal values and tables expose usable semantics', () => {
  const { AdminStatusBadge, AdminDataTable } = load('features/admin-ui.ts');
  const badge = renderToStaticMarkup(React.createElement(AdminStatusBadge, { status: 'not_configured' }));
  assert.match(badge, /설정 필요/); assert.match(badge, /aria-label="상태: 설정 필요"/); assert.doesNotMatch(badge, /not_configured/);
  const table = renderToStaticMarkup(React.createElement(AdminDataTable, { label: '테스트 표' }, React.createElement('tbody', null, React.createElement('tr', null, React.createElement('td', null, '값')))));
  assert.match(table, /role="region"/); assert.match(table, /aria-label="테스트 표"/); assert.match(table, /aria-describedby/); assert.match(table, /<caption[^>]*>테스트 표<\/caption>/); assert.match(table, /tabindex="0"/);
});

test('admin status tones remain visible after the adm badge base style', () => {
  const admin = fs.readFileSync('features/admin-ui/styles/admin-system.css', 'utf8');
  const baseIndex = admin.indexOf('.adm-badge,.adm :is(.badge,.admin-status-badge)');
  const dangerIndex = admin.indexOf('.adm.edu-admin :is(.admin-status-badge--error,.admin-status-badge--danger)');
  assert.ok(baseIndex > 0 && dangerIndex > baseIndex);
  assert.match(admin.slice(dangerIndex), /background:var\(--admin-color-error-soft\);color:var\(--admin-color-error\)/);
  assert.match(admin, /\.edu-admin \.admin-wide-table \.admin-table-hint\{display:block\}/);
});

test('shared pagination exposes edge actions and all operational status labels stay human-readable', () => {
  const { AdminPagination, adminStatus } = load('features/admin-ui.ts');
  const pagination = renderToStaticMarkup(React.createElement(AdminPagination, { page: 2, pages: 8, onChange() {} }));
  for (const label of ['첫 페이지', '이전', '다음', '마지막 페이지']) assert.ok(pagination.includes(label), label);
  for (const [status, label] of [['paid', '결제 완료'], ['payment_failed', '결제 실패'], ['submitted', '검토 대기'], ['changes_requested', '보완 요청']]) assert.equal(adminStatus(status).label, label);
});

test('admin feature owns navigation visibility without becoming an authorization source', () => {
  const system = load('features/admin-ui.ts');
  const visibility = system.createAdminMenuVisibility([{ key: 'products', title: '상품 관리' }]);
  assert.equal(visibility.has('overview'), true);
  assert.equal(visibility.has('products'), true);
  assert.equal(visibility.has('orders'), false);
  assert.deepEqual(visibility.groups(system.adminNavigationGroups).map(([label]) => label), ['클래스 관리']);
  assert.match(fs.readFileSync('features/admin-ui/permissions/menu-visibility.ts', 'utf8'), /server remains authoritative/i);
});

test('responsive shell includes every class tool and traps the tablet/mobile navigation', () => {
  const system = load('features/admin-ui.ts');
  const classKeys = system.adminNavigationGroups.find(([label]) => label === '클래스 관리')[1];
  for (const key of ['products', 'cohorts', 'contents', 'missions', 'members', 'reviews', 'questions']) assert.ok(classKeys.includes(key), key);
  assert.equal(classKeys.includes('weeks'), false);
  assert.equal(classKeys.includes('learning'), true);
  assert.equal(system.adminNavigationTitles.products, '상품·판매 설정');
  assert.equal(system.normalizeAdminSectionKey('learning-editor'), 'learning');
  assert.equal(system.normalizeAdminSectionKey('learning'), 'learning');
  assert.equal(system.normalizeAdminSectionKey('weeks'), 'products');
  const shell = fs.readFileSync('features/admin-ui/layouts/admin-shell.tsx', 'utf8');
  for (const text of ["event.key === 'Escape'", "event.key !== 'Tab'", "document.body.style.overflow = 'hidden'", 'admin-sidebar-backdrop', 'aria-modal']) assert.ok(shell.includes(text), text);
  const css = fs.readFileSync('features/admin-ui/styles/admin-system.css', 'utf8');
  assert.match(css, /@media\(max-width:1024px\)/);
  assert.match(css, /\.edu-admin \.sidebar-close\{display:flex\}/);
});

test('tracking composition uses shared primitives without reintroducing local generic UI CSS', () => {
  const source = fs.readFileSync('app/ui/landing/admin.tsx', 'utf8') + fs.readFileSync('app/ui/landing/performance-dashboard.tsx', 'utf8') + fs.readFileSync('app/ui/landing/tracking-operations.tsx', 'utf8');
  for (const name of ['AdminPage','AdminPageHeader','AdminMetricGrid','AdminDataTable','AdminDrawer','AdminStatusBadge']) assert.ok(source.includes(name), name);
  const local = fs.readFileSync('app/ui/landing/tracking-admin.css', 'utf8');
  for (const selector of ['.tracking-card{','.tracking-modal{','.tracking-error{','.tracking-empty{','.tracking-admin .btn{']) assert.ok(!local.includes(selector), selector);
});
