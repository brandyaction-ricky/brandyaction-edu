import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// CEO 11-18: staff/admins open lessons still locked for their enrollment (read-only preview); members stay locked.
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, '..');
function load(file, mocks = {}) {
  const exports = {}, absolute = path.resolve(root, file);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', 'process', code)(exports, name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('../') || name.startsWith('./')) { const target = path.resolve(path.dirname(absolute), name); for (const ext of ['.ts', '.tsx']) if (fs.existsSync(target + ext)) return load(path.relative(root, target + ext), mocks); return new Proxy({}, { get: () => () => null }); }
    if (name.startsWith('@/lib/')) return load(name.slice(2) + '.ts', mocks);
    return require(name);
  }, { env: { NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED: 'true' } });
  return exports;
}
const noop = () => null;
const { LessonTaskPanel } = load('features/campus/ui/lesson-task-panel.tsx', {
  '@/app/ui/final/floating-learning-question': { FloatingLearningQuestion: noop }, '@/app/ui/final/lesson-questions': { LessonQuestions: noop },
  '@/app/ui/final/lesson-pages': { NextLessonAction: noop }, '@/app/ui/final/diagnosis-entry': { DiagnosisEntry: noop },
  'next/dynamic': { default: () => noop }, './lesson-task-panel.module.css': new Proxy({}, { get: (_, k) => String(k) }),
  '@/app/ui/final/use-lesson-progression': { useLessonProgression: () => ({ lessons: [{ lessonId: 'l2', isUnlocked: false, reason: '앞 학습에서 학습 완료하기를 눌러 주세요.' }], error: undefined, reload() {} }) },
  '../learner-metrics': { learnerMetrics: () => ({ nextActions: [], steps: [] }) },
});
const snapshot = staffPreview => ({ selectedEnrollmentId: 'e1', guidedLessons: true, fetchedAt: 'now', scopes: [], viewer: { id: 'v', displayName: 'v' },
  lessons: [{ id: 'l2', title: '2일차', day: 2, week: 0, completed: false, locked: !staffPreview, ...(staffPreview && { staffPreview: true }), missions: [], href: '', version: '1' }] });
const html = s => renderToStaticMarkup(React.createElement(LessonTaskPanel, { snapshot: s, live: true, onOpen() {}, initialLesson: undefined }));
test('the lesson panel opens a staff preview lesson but keeps a member lesson locked', () => {
  const staff = html(snapshot(true)), member = html(snapshot(false));
  assert.match(staff, /<button[^>]*>캠퍼스에서 수업 열기/); assert.doesNotMatch(staff, /<button[^>]*disabled=""[^>]*>캠퍼스에서 수업 열기/);
  assert.match(member, /<button[^>]*disabled=""[^>]*>캠퍼스에서 수업 열기/); assert.match(member, /앞 학습에서 학습 완료하기를 눌러 주세요/);
});
