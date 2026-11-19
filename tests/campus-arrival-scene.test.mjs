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
  const attributes = {}, classes = [];
  let label = '', openResult;
  const sent = [];
  const button = {classList: {add: value => classes.push(value)}, replaceChildren: value => {label = value;}, setAttribute: (key, value) => {attributes[key] = value;}};
  const context = {guidedPreview: true, officeIntro: false, guidedDemoTitle: '내 경험으로 할 일 후보 찾기', room: 'office', currentRole: 'student', deskMarkers: [],
    layer: {}, officeSeats: [], deskProfiles: [], deskJobs: [], deskLive: false,
    send: (type, payload) => sent.push([type, payload.id]),
    makeDeskMarkers: (_layer, _seats, _profiles, _jobs, open) => {openResult = open; return [{b: button}];}};
  vm.createContext(context);
  vm.runInContext(functionSource(source, 'renderDeskMarkers', 'positionCurrentDeskMarkers') + '\nrenderDeskMarkers();', context);
  assert.equal(button.title, '내 경험으로 할 일 후보 찾기 · 미리 준비한 예시');
  assert.equal(attributes['aria-label'], '예시 결과 보기');
  assert.equal(attributes['aria-description'], button.title);
  assert.equal(label, '예시 결과 보기');
  assert.deepEqual(classes, ['guided-example-action']);
  openResult('demo-copy');
  assert.deepEqual(sent, [['action', 'office:demo']], 'one click opens the prepared example, never a member job');
});

test('the short mobile scene keeps its one action clear of the top route and bottom room label', () => {
  for (const [width, height] of [[320, 160], [390, 160], [390, 210], [390, 120]]) {
    for (const point of [{x: -100, y: -100}, {x: width / 2, y: height / 2}, {x: width + 100, y: height + 100}]) {
      const button = {style: {}};
      const context = {guidedPreview: true, officeIntro: false, office: {cw: width, ch: height, projectInteriorPoint: () => point}, deskMarkers: [{b: button, item: {}}]};
      vm.createContext(context);
      vm.runInContext(functionSource(source, 'positionCurrentDeskMarkers', 'configureGuidedLabels') + '\npositionCurrentDeskMarkers();', context);
      const [x, y] = button.style.transform.match(/[\d.]+/g).map(Number);
      assert.equal(x, 12);
      assert.ok(x + 144 <= width - 12);
      assert.ok(y >= 44, 'the route ends above the 44px action lane');
      assert.ok(y + 44 <= height - 32, 'the room caption remains clear');
      assert.equal(button.hidden, false);
    }
  }
});

test('member markers keep the existing positioning and names', () => {
  let positioned = 0, bubbles = 0, names = 0;
  const office = {bubble: () => bubbles++, drawCampusAvatarLabel: () => names++};
  const context = {guidedPreview: false, office, deskMarkers: [{b: {}}], positionDeskMarkers: (received, markers) => {assert.equal(received, office); assert.equal(markers.length, 1); positioned++;}};
  vm.createContext(context);
  vm.runInContext(functionSource(source, 'positionCurrentDeskMarkers', 'refreshDeskLabels') + '\npositionCurrentDeskMarkers();configureGuidedLabels();', context);
  office.bubble(); office.drawCampusAvatarLabel();
  assert.equal(positioned, 1);
  assert.equal(bubbles, 1);
  assert.equal(names, 1);
  context.guidedPreview = true;
  vm.runInContext('configureGuidedLabels();', context);
  office.bubble(); office.drawCampusAvatarLabel();
  assert.equal(bubbles, 1, 'only synthetic employee bubbles are suppressed');
  assert.equal(names, 1, 'only the guided visitor name is suppressed');
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

test('first visit starts in the aisle facing the selected employee in the movable office layout', async () => {
  const {introSeatIndex, introEntrance, introBalloonPosition} = await import('../public/campus/world/tour/intro-desk.mjs');
  const {createCampusPlan, findCampusRoomAt} = await import('../public/campus/world/office/vendor/campus-plan.js');
  const desk = createCampusPlan().officeSeats[introSeatIndex];
  const spawn = introEntrance(desk);
  assert.equal(findCampusRoomAt(spawn.x, spawn.y), 'office');
  const heading = Math.atan2(desk.seat.x - spawn.x, desk.seat.y - spawn.y);
  assert.ok(Math.abs(heading - spawn.yaw) < .35);
  let projected;
  const office = {cw: 390, ch: 720, projectInteriorPoint(item) {projected = item; return {x: 190, y: 270};}};
  assert.deepEqual(introBalloonPosition(office, desk), {x: 118, y: 226});
  assert.equal(projected.x, desk.seat.x);
  assert.equal(projected.y, desk.seat.y);
  office.projectInteriorPoint = () => null;
  assert.equal(introBalloonPosition(office, desk), null);
});

test('tap the demo employee, their workstation or neither from two camera directions', async () => {
  const {introSeatIndex, hitsIntroDesk} = await import('../public/campus/world/tour/intro-desk.mjs');
  const {createCampusPlan} = await import('../public/campus/world/office/vendor/campus-plan.js');
  const desks = createCampusPlan().officeSeats;
  const desk = desks[introSeatIndex], other = desks[introSeatIndex + 1];
  const tapFromAbove = (x, z) => hitsIntroDesk({x, y: 5, z}, {x, y: -5, z}, desks);
  assert.ok(tapFromAbove(desk.seat.x, desk.seat.y));
  assert.ok(tapFromAbove(desk.x + .7, desk.y + .6));
  assert.ok(!tapFromAbove(other.x + .7, other.y + .6));
  assert.ok(!tapFromAbove(27, 17));
  assert.ok(hitsIntroDesk({x: 26, y: 1.2, z: desk.seat.y}, {x: 18, y: 1.2, z: desk.seat.y}, desks));
  // A neighbouring desk in front of the selected one intercepts the tap.
  assert.ok(!hitsIntroDesk({x: desk.x + .7, y: .8, z: 24}, {x: desk.x + .7, y: .8, z: 10}, desks));
});
