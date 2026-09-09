import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Compile the actual pure TypeScript modules in memory; no new test dependency.
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const source = readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} }; cache.set(name, compiled.exports);
  new Function("require", "module", "exports", code)((path) => load(path.replace(/^\.\//, "")), compiled, compiled.exports);
  return compiled.exports;
}
const { gradeQuiz, publicQuiz, validateQuiz } = load("mission-quiz");
const { validateCurriculum, resourceMime, httpsUrl } = load("course-content");
const { calculateAchievement, calculateLearningProgress, calculateLearningProgressByEnrollment } = load("achievement");
const { reorderWeekMissions, missionSummary, missionIsVisible } = load("admin-missions");
const { csvCell } = load("admin-participants");
const quiz = { passPercent: 100, questions: [ { id: "q1", prompt: "Question 1", options: ["A", "B"], correctIndex: 1 }, { id: "q2", prompt: "Question 2", options: ["C", "D"], correctIndex: 0 } ] };
const lesson = { id: "lesson1", title: "콘텐츠", description: "", kind: "텍스트", duration: "", bodyText: "내용", accessMode: "member", isPublished: true };
const curriculum = (patch = {}) => [{ id: "week1", title: "주차", goal: "", isPublished: true, lessons: [{ ...lesson, ...patch }] }];

test("all correct passes and exposes no correct indexes", () => { assert.equal(gradeQuiz(quiz, { q1: 1, q2: 0 }).passed, true); assert.ok(!JSON.stringify(publicQuiz(quiz, "rev")).includes("correctIndex")); });
test("mission reorder preserves normal lessons, stable IDs, quiz and resource metadata", () => {
  const a = { ...lesson, id: "a", mission: { title: "A", quiz }, resourcePath: "course/file.pdf" };
  const b = { ...lesson, id: "b", mission: { title: "B" } };
  const normal = { ...lesson, id: "normal" };
  const source = [{ id: "w", lessons: [a, normal, b] }, { id: "w2", lessons: [normal] }];
  const next = reorderWeekMissions(source, "w", "a", "b");
  assert.deepEqual(next[0].lessons.map((item) => item.id), ["b", "normal", "a"]);
  assert.equal(next[0].lessons[1], normal); assert.equal(next[0].lessons[2], a);
  assert.equal(next[1], source[1]); assert.equal(source[0].lessons[0], a);
});
test("invalid and cross-week mission drops do not remove any lesson", () => {
  const source = [{ id: "w", lessons: [{ ...lesson, mission: { title: "A" } }] }];
  assert.deepEqual(reorderWeekMissions(source, "w", "lesson1", "outside"), source);
  assert.equal(reorderWeekMissions(source, "w", "lesson1", "lesson1"), source);
});
test("mission visibility respects both content and week publication", () => {
  const l = { ...lesson, mission: { title: "A", isPublished: true, quiz } };
  assert.equal(missionIsVisible({ isPublished: false }, l), false);
  assert.equal(missionIsVisible({}, { ...l, isPublished: false }), false);
  const sum = missionSummary([{ isPublished: false, lessons: [l] }, { lessons: [l, { ...l, mission: { title: "B", isPublished: false } }] }]);
  assert.deepEqual(sum, { total: 3, published: 1, private: 2, quizzes: 2 });
});
test("CSV exports escape cells and neutralize spreadsheet formulas", () => {
  assert.equal(csvCell('Kim,"A"'), '"Kim,""A"""');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell("  @SUM(1)"), '"\'  @SUM(1)"');
});
test("wrong answers never enter approval queue", () => { const r = gradeQuiz(quiz, { q1: 0, q2: 0 }); assert.equal(r.passed, false); assert.deepEqual(r.wrongQuestionIds, ["q1"]); assert.equal(r.score, 50); });
test("configurable threshold uses exact ratio", () => { assert.equal(gradeQuiz({ ...quiz, passPercent: 50 }, { q1: 0, q2: 0 }).passed, true); assert.equal(gradeQuiz({ ...quiz, passPercent: 51 }, { q1: 0, q2: 0 }).passed, false); });
for (const [label, answers] of [["missing", {}], ["string index", { q1: "1", q2: 0 }], ["out of range", { q1: 2, q2: 0 }], ["null", null], ["array", [1, 0]], ["client passed flag", { passed: true, score: 100 }]]) test(`reject ${label} quiz responses`, () => assert.throws(() => gradeQuiz(quiz, answers)));
test("invalid quiz definitions rejected", () => { for (const value of [{ ...quiz, passPercent: 0 }, { ...quiz, passPercent: 101 }, { ...quiz, questions: [] }, { ...quiz, questions: [quiz.questions[0], quiz.questions[0]] }]) assert.ok(validateQuiz(value)); });
test("duplicate choices rejected", () => assert.ok(validateQuiz({ ...quiz, questions: [{ ...quiz.questions[0], options: ["A", " A "] }] })));
test("public projection creates a new question list", () => { const p = publicQuiz(quiz, "revision"); assert.equal(p.revision, "revision"); assert.notEqual(p.questions, quiz.questions); assert.equal(quiz.questions[0].correctIndex, 1); });
test("free text and link content validate", () => { assert.equal(validateCurriculum(curriculum()), null); assert.equal(validateCurriculum(curriculum({ kind: "링크", contentUrl: "https://example.com/help" })), null); });
test("free published content needs a delivery", () => { assert.ok(validateCurriculum(curriculum({ bodyText: "" }))); assert.ok(validateCurriculum(curriculum({ kind: "자료" }))); assert.ok(validateCurriculum(curriculum({ kind: "VOD" }))); });
test("private drafts can be incomplete", () => assert.equal(validateCurriculum(curriculum({ bodyText: "", isPublished: false })), null));
test("only current course file paths can be referenced", () => { assert.ok(validateCurriculum(curriculum({ kind: "자료", resourcePath: "other/file.pdf" }), "course")); assert.ok(validateCurriculum(curriculum({ kind: "자료", resourcePath: "course/../other/file.pdf" }), "course")); assert.equal(validateCurriculum(curriculum({ kind: "자료", resourcePath: "course/resource/file.pdf" }), "course"), null); });
test("duplicate lesson IDs rejected", () => { const c = curriculum(); c[0].lessons.push({ ...lesson }); assert.ok(validateCurriculum(c)); });
test("quiz-only mission requires valid quiz", () => { const mission = { title: "미션", instructions: "", required: true, isPublished: true, submissionType: "quiz" }; assert.ok(validateCurriculum(curriculum({ mission }))); assert.equal(validateCurriculum(curriculum({ mission: { ...mission, quiz } })), null); });
test("unsafe URLs blocked without fetching them", () => { for (const url of ["http://example.com", "javascript:alert(1)", "data:text/html,a", "https://user:password@example.com", "/relative"]) assert.equal(httpsUrl(url), null); assert.equal(httpsUrl("https://example.com"), "https://example.com/"); });
test("uploads use allowed extension mapping", () => { assert.equal(resourceMime("워크북.PDF"), "application/pdf"); assert.equal(resourceMime("a.html"), null); assert.equal(resourceMime("malware.exe"), null); });
test("pending and rejected missions do not count as approved", () => { const result = calculateAchievement(3, [{ mission_id: "a", status: "approved" }, { mission_id: "b", status: "submitted" }, { mission_id: "c", status: "rejected" }]); assert.equal(result.percent, 33); assert.equal(result.pending, 1); assert.equal(result.rejected, 1); });
test("rounding never awards completion early", () => { const rows = Array.from({ length: 199 }, (_, i) => ({ mission_id: String(i), status: "approved" })); const result = calculateAchievement(200, rows); assert.equal(result.percent, 99); assert.equal(result.level.number, 4); });
test("all required approvals unlock final level", () => { const result = calculateAchievement(1, [{ mission_id: "a", status: "approved" }]); assert.equal(result.percent, 100); assert.equal(result.level.number, 5); });
test("empty curriculum is not 100 percent", () => { assert.equal(calculateAchievement(0).percent, 0); assert.equal(calculateAchievement(null).available, false); });
test("lesson progress ignores unrelated lessons and cannot round to completed", () => { assert.equal(calculateLearningProgress(["a", "b"], [{ lesson_id: "a", progress_percent: 100 }, { lesson_id: "b", progress_percent: 99 }, { lesson_id: "other", progress_percent: 100 }]).percent, 99); });
test("enrollment progress remains isolated", () => { const m = calculateLearningProgressByEnrollment([{ id: "e1", course_id: "c1" }, { id: "e2", course_id: "c2" }], [{ course_id: "c1", lesson_id: "l1" }, { course_id: "c2", lesson_id: "l2" }], [{ enrollment_id: "e1", lesson_id: "l1", progress_percent: 100 }]); assert.equal(m.get("e1").percent, 100); assert.equal(m.get("e2").percent, 0); });
