import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('app/experience/moonshot/page.tsx', 'utf8');
function fixture(env = {}) {
  let allowed = false, reads = 0, authReads = 0;
  const arrival = {title:'관리자 모집 초안'};
  const jsx = (type, props) => ({type, props});
  const mocks = {
    'react/jsx-runtime': {jsx, jsxs:jsx}, 'next/link': {default:'link'},
    'next/navigation': {notFound:() => {throw Error('404');}},
    '@/features/campus/arrival/experience': {ArrivalExperience:'arrival'},
    '@/features/campus/arrival/model': {ARRIVAL_CALENDAR_FILE:'/experience/moonshot/live.ics'},
    '@/lib/operator-permissions': {getOperatorUser:async scope => {assert.equal(scope,'marketing'); authReads++; return allowed ? {id:'operator'} : null;}},
    '@/features/campus/webinar/server': {readWebinar:async () => {reads++; return {arrival,welcome:{notices:[{body:'구매자 전용 공지'}]}};}},
    '@/features/campus/webinar/domain': {slugPattern:/^[a-z0-9][a-z0-9-]{2,59}$/},
  };
  const mod = {};
  new Function('exports','require','process',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(mod,name=>{assert.ok(name in mocks,name);return mocks[name];},{env});
  return {render:query=>mod.default({searchParams:Promise.resolve(query)}), allow:()=>{allowed=true;}, reads:()=>reads, authReads:()=>authReads, arrival};
}
test('production never opens the preview or reads settings even for a permitted operator', async () => {
  for (const env of [{VERCEL_ENV:'production'},{NEXT_PUBLIC_APP_ENV:'production'}]) {
    const f=fixture(env);f.allow();
    for (const query of [{},{event:'test-event'}]) await assert.rejects(f.render(query), /404/);
    assert.equal(f.reads(),0);assert.equal(f.authReads(),0);
  }
});
test('anonymous preset never reads member settings and saved draft requires marketing access first', async () => {
  const f=fixture();
  const publicPage = await f.render({});
  assert.equal(publicPage.type,'arrival');assert.equal(f.reads(),0);
  assert.equal(publicPage.props.calendarFileHref, '/experience/moonshot/live.ics');
  assert.notEqual((await f.render({event:'test-event'})).type,'arrival');assert.equal(f.reads(),0);
  f.allow();const result=await f.render({event:'test-event'});
  assert.equal(result.type,'arrival');assert.equal(result.props.config,f.arrival);
  assert.equal(result.props.persistenceKey,null);assert.equal(result.props.preview,true);
  assert.equal(result.props.calendarFileHref,undefined);
  assert.equal(JSON.stringify(result).includes('구매자 전용 공지'),false);
  assert.equal(f.reads(),1);
});
test('malformed and repeated event parameters do not query stored content', async () => {
  const f=fixture();f.allow();
  for (const event of ['../private', '', ['test-event','other-event']]) await assert.rejects(f.render({event}), /404/);
  assert.equal(f.reads(),0);
});


test('the calendar attachment is also closed in both production environments', async () => {
  const route = await readFile('app/experience/moonshot/live.ics/route.ts', 'utf8');
  const compiled = ts.transpileModule(route, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const evaluate = new Function('exports', 'require', 'process', compiled);
  const mocks = {
    '@/features/campus/arrival/config': {arrivalLiveEvent:() => assert.fail('production must exit before reading event settings')},
    '@/features/campus/arrival/model': {calendarIcs:() => assert.fail('production must exit before making a file')},
  };
  for (const env of [{VERCEL_ENV:'production'}, {NEXT_PUBLIC_APP_ENV:'production'}]) {
    const routeExports = {};
    evaluate(routeExports, name => mocks[name], {env});
    assert.equal(routeExports.GET().status, 404);
  }
});
