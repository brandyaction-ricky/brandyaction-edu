import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/campus/world/tour/tour.mjs', import.meta.url), 'utf8');
const functionSource = (text, name, next) => text.slice(text.indexOf(`function ${name}(`), text.indexOf(`function ${next}(`));
function runFit(text, guidedPreview, width, height, room = 'office') {
  const camera = {isOrthographicCamera: true, position: {set() {}}, lookAt() {}, updateProjectionMatrix() {}, updateMatrixWorld() {}};
  const context = {
    guidedPreview, room, office: {camera, cw: width, ch: height, controls: {target: {set() {}}}},
    info: {office: {cx: 27, cy: 17}, welcome: {cx: 1, cy: 12, w: 24, d: 26}},
    Plan: {getCampusRoom: () => ({bounds: {minX: 17, maxX: 37, minY: 7, maxY: 27}})},
  };
  vm.runInNewContext(functionSource(text, 'fit', 'box') + '\nfit();', context);
  return {left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom, zoom: camera.zoom};
}

test('guided framing leaves the desktop dock clear without changing ordinary campus cameras', () => {
  // Golden frustum edges captured from the existing member renderer before this change.
  for (const [width, height, extent] of [[1440, 900, 20.483144217878007], [1280, 720, 22.759049130975562], [390, 180, 27.737591128376465], [390, 260, 19.20294770426063]]) {
    const standard = runFit(source, false, width, height);
    assert.deepEqual(standard, {left: -extent, right: extent, top: 14.016380801265335, bottom: -11.587549471082173, zoom: 1});
    const guided = runFit(source, true, width, height);
    for (const number of Object.values(guided)) assert.ok(Number.isFinite(number));
    if (width > 700) {
      const originalCenter = (standard.left + standard.right) / 2;
      const screenCenter = (originalCenter - guided.left) / (guided.right - guided.left) * width;
      assert.ok(screenCenter > width / 2 + 220, 'room is centered in the area to the right of the guide');
    } else {
      assert.deepEqual(guided, standard, 'a short mobile scene keeps the room centered');
    }
  }
});

test('the tablet guide reserves space from 701px while the 700px mobile scene stays centered', () => {
  for (const width of [700, 701, 801, 1000, 1001, 1440]) {
    const standard = runFit(source, false, width, 800);
    const guided = runFit(source, true, width, 800);
    const center = ((standard.left + standard.right) / 2 - guided.left) / (guided.right - guided.left) * width;
    const reserve = width > 700 ? Math.min(width <= 1000 ? 500 : 560, width * .65) : 0;
    assert.ok(Math.abs(center - (width + reserve) / 2) < .001);
    assert.ok(width - reserve + .001 >= width * .35, 'the room retains at least 35% of the width');
  }
});

test('brief and result are reversible local presentation states, ignored by the member scene', () => {
  let refreshes = 0, draws = 0;
  const context = {guidedPreview: true, guidedDemoPhase: 'result', guidedDemoTitle: '내 AI에게 맡길 첫 업무', deskJobs: [], ready: true,
    refreshDeskLabels: () => refreshes++, budget: {wake() {}}, performance: {now: () => 1}, office: {draw: () => draws++}};
  vm.createContext(context);
  vm.runInContext(functionSource(source, 'setGuidedDemoPhase', 'transitionGuidedRoom'), context);
  const phase = value => vm.runInContext(`setGuidedDemoPhase(${JSON.stringify(value)})`, context);
  phase('brief'); assert.equal(context.deskJobs.length, 0);
  phase('result'); assert.equal(context.deskJobs.length, 1); assert.equal(context.deskJobs[0].status, 'review');
  phase('result'); assert.equal(context.deskJobs.length, 1, 'repeating presentation messages cannot duplicate results');
  phase('brief'); assert.equal(context.deskJobs.length, 0);
  phase('untrusted'); assert.equal(refreshes, 4);
  context.guidedPreview = false;
  context.deskJobs = [{jobId: 'real-member-job'}];
  phase('result'); assert.deepEqual(context.deskJobs, [{jobId: 'real-member-job'}]);
  assert.equal(draws, 4);
});

test('the prepared result follows the audience goal without changing any member job', () => {
  const context = {guidedPreview: true, guidedDemoPhase: 'result', guidedDemoTitle: '처음 제목', deskJobs: [], ready: false};
  vm.createContext(context);
  vm.runInContext(functionSource(source, 'setGuidedDemoPhase', 'transitionGuidedRoom'), context);
  vm.runInContext("setGuidedDemoPhase('result', '  고객에게 물어볼 질문 3개  ')", context);
  assert.equal(context.guidedDemoTitle, '고객에게 물어볼 질문 3개');
  assert.equal(context.deskJobs.length, 1);
  vm.runInContext("setGuidedDemoPhase('result', '가'.repeat(300))", context);
  assert.equal(context.guidedDemoTitle.length, 160);
  vm.runInContext("setGuidedDemoPhase('result', '  ')", context);
  assert.equal(context.guidedDemoTitle.length, 160, 'blank titles do not erase the selected goal');
  context.guidedPreview = false;
  vm.runInContext("setGuidedDemoPhase('result', '회원 제목 변경')", context);
  assert.equal(context.guidedDemoTitle.length, 160);
});

test('the guided marker announces a prepared example rather than real AI completion', () => {
  const caption = {}, attributes = {};
  const button = {querySelector: () => caption, setAttribute: (key, value) => {attributes[key] = value;}};
  const context = {guidedPreview: true, guidedDemoTitle: '내 경험으로 할 일 후보 찾기', room: 'office', currentRole: 'student', deskMarkers: [],
    layer: {}, officeSeats: [], deskProfiles: [], deskJobs: [], deskLive: false, makeDeskMarkers: () => [{b: button}]};
  vm.createContext(context);
  vm.runInContext(functionSource(source, 'renderDeskMarkers', 'refreshDeskLabels') + '\nrenderDeskMarkers();', context);
  assert.equal(button.title, '내 경험으로 할 일 후보 찾기 · 미리 준비한 시연 결과');
  assert.equal(attributes['aria-label'], '내 경험으로 할 일 후보 찾기 · 시연 결과 보기');
  assert.equal(caption.textContent, '시연 결과 보기');
});

test('room transition honors reduced motion and does not schedule delayed navigation', () => {
  let reduced = false, animations = 0, cancelled = 0;
  const context = {guidedPreview: true, guidedTransition: undefined,
    matchMedia: () => ({matches: reduced}),
    root: {animate: () => {animations++; return {cancel: () => cancelled++};}}};
  vm.createContext(context);
  vm.runInContext(functionSource(source, 'transitionGuidedRoom', 'renderDeskMarkers'), context);
  vm.runInContext('transitionGuidedRoom()', context);
  assert.equal(animations, 1);
  reduced = true;
  vm.runInContext('transitionGuidedRoom()', context);
  assert.equal(cancelled, 1);
  assert.equal(animations, 1);
  // No timer or DOM disabling API is provided: this executes without either.
});

test('the guided world leaves the main next action to the host', () => {
  const context = {guidedPreview: true};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function actions(){'), source.indexOf('\nlet ', source.indexOf('function actions(){'))), context);
  assert.equal(vm.runInContext('actions().length', context), 0);
});
