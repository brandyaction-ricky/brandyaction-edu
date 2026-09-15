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
  const admin = fs.readFileSync('app/ui/final/admin-system.css', 'utf8');
  const publicTokens = fs.readFileSync('app/ui/final/tokens.css', 'utf8');
  for (const token of ['--admin-sidebar-width:224px', '--admin-topbar-height:64px', '--admin-content-wide:1440px', '--admin-content-standard:1280px', '--admin-content-narrow:960px', '--admin-control-height:38px', '--admin-control-height-sm:32px', '--admin-table-row-height:44px', '--admin-table-head-height:40px', '--admin-radius-control:6px', '--admin-radius-surface:8px']) assert.ok(admin.includes(token), token);
  assert.match(admin, /^\/\*[^\n]*\*\/\s*\.edu-admin\{/);
  assert.doesNotMatch(admin, /:root/);
  assert.match(publicTokens, /--control-height:\s*48px/);
  assert.match(publicTokens, /--table-row-height:\s*64px/);
});

test('common system exports the Phase 0 component inventory', () => {
  const system = load('app/ui/final/admin-system.tsx');
  for (const name of ['AdminPage','AdminPageHeader','AdminContent','AdminSection','AdminDivider','AdminStack','AdminGrid','AdminButton','AdminIconButton','AdminInput','AdminSelect','AdminTextarea','AdminCheckbox','AdminDatePicker','AdminSearchField','AdminFilterTrigger','AdminMetricGrid','AdminMetric','AdminDataTable','AdminTableToolbar','AdminPagination','AdminStatusBadge','AdminEmptyState','AdminSkeleton','AdminInlineError','AdminDrawer','AdminModal','AdminConfirmDialog','AdminPopover','AdminToast']) assert.ok(system[name], name);
});

test('shared status badges translate internal values and tables expose usable semantics', () => {
  const { AdminStatusBadge, AdminDataTable } = load('app/ui/final/admin-system.tsx');
  const badge = renderToStaticMarkup(React.createElement(AdminStatusBadge, { status: 'not_configured' }));
  assert.match(badge, /설정 필요/); assert.doesNotMatch(badge, /not_configured/);
  const table = renderToStaticMarkup(React.createElement(AdminDataTable, { label: '테스트 표' }, React.createElement('tbody', null, React.createElement('tr', null, React.createElement('td', null, '값')))));
  assert.match(table, /role="region"/); assert.match(table, /aria-label="테스트 표"/); assert.match(table, /tabindex="0"/);
});

test('tracking composition uses shared primitives without reintroducing local generic UI CSS', () => {
  const source = fs.readFileSync('app/ui/landing/admin.tsx', 'utf8') + fs.readFileSync('app/ui/landing/performance-dashboard.tsx', 'utf8') + fs.readFileSync('app/ui/landing/tracking-operations.tsx', 'utf8');
  for (const name of ['AdminPage','AdminPageHeader','AdminMetricGrid','AdminDataTable','AdminDrawer','AdminStatusBadge']) assert.ok(source.includes(name), name);
  const local = fs.readFileSync('app/ui/landing/tracking-admin.css', 'utf8');
  for (const selector of ['.tracking-card{','.tracking-modal{','.tracking-error{','.tracking-empty{','.tracking-admin .btn{']) assert.ok(!local.includes(selector), selector);
});
