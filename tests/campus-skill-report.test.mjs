import test from 'node:test';
import assert from 'node:assert/strict';
import {reportSkill,skillBinding} from '../scripts/campus-skill-report.mjs';
const config={environment:'development',endpoint:'https://edu.test/api/campus/office/webhook',connectorId:'pilot',keyVersion:'v1',enrollmentId:'00000000-0000-4000-8000-000000000031',sessionId:'s1',connectionId:'c1',channelId:'telegram:42',notBefore:100};
const context={platform:'telegram',sessionId:'s1',connectionId:'c1',channelId:'telegram:42',messageId:'42:11',requestedAt:110};
const start={action:'start',context,requestText:'캠퍼스 업무: 내 사업의 고객을 이해할 질문 세 가지를 작성하세요.'};
test('skill reports start and actual result once; plain conversation, old and wrong connection cannot register',async()=>{
 let saved;const received=new Map();const persist=async s=>{saved=structuredClone(s);};const send=async(c,r)=>received.set(r.eventId,r.raw);
 const first=await reportSkill(config,start,null,send,persist);assert.equal(received.size,3);assert.equal(first.reported,'started');
 await reportSkill(config,start,saved,send,persist);assert.equal(received.size,3);
 const result={action:'result',context,resultText:'실제로 작성한 고객 질문 세 가지의 최종 답변입니다.'};
 await reportSkill(config,result,saved,send,persist);assert.equal(received.size,4);
 await reportSkill(config,result,saved,send,persist);assert.equal(received.size,4);
 await assert.rejects(reportSkill(config,{...result,resultText:'다른 결과로 몰래 덮어쓰려는 답변입니다.'},saved,send,persist),/Terminal report changed/);
 for(const input of [{...start,requestText:'일반 대화 내용입니다.'},{...start,context:{...context,sessionId:'other'}},{...start,context:{...context,channelId:'telegram:other'}},{...start,context:{...context,requestedAt:99}}])await assert.rejects(reportSkill(config,input,null,send,persist));
 assert.equal(received.size,4);
 assert.throws(()=>skillBinding({...config,environment:'production'},start));
});
test('lost acknowledgement retries exact saved event without restarting work, and changed configuration is rejected',async()=>{
 let saved;let fail=true;const received=new Map();const persist=async s=>{saved=structuredClone(s);};
 const send=async(c,r)=>{received.set(r.eventId,r.raw);if(fail){fail=false;throw Error('ack lost');}};
 await assert.rejects(reportSkill(config,start,null,send,persist),/ack lost/);assert.equal(received.size,1);
 await assert.rejects(reportSkill(config,{action:'result',context,resultText:'너무 이른 결과를 전송하려는 요청입니다.'},saved,send,persist),/Start delivery unconfirmed/);
 await reportSkill(config,{action:'retry',context},saved,send,persist);assert.equal(received.size,3);
 await assert.rejects(reportSkill({...config,enrollmentId:'other'},{action:'retry',context},saved,send,persist),/another connection/);
 assert.notEqual(skillBinding(config,start).jobId,skillBinding(config,{...start,context:{...context,messageId:'42:12'}}).jobId);
 await assert.rejects(reportSkill(config,{action:'result',context,resultText:'미등록 요청의 결과를 먼저 보내면 안 됩니다.'},null,send,persist),/No saved start/);
});
test('failed report never becomes a fabricated completed result',async()=>{
 let saved;const events=[];const persist=async s=>{saved=structuredClone(s);};const send=async(c,r)=>events.push(JSON.parse(r.raw));
 await reportSkill(config,start,null,send,persist);
 await reportSkill(config,{action:'failed',context,failureNote:'자료 접근이 거절되어 업무를 수행하지 못했습니다.'},saved,send,persist);
 assert.deepEqual(events.map(e=>e.event),['registered','accepted','started','failed']);
 await assert.rejects(reportSkill(config,{action:'result',context,resultText:'실패를 완료로 덮어쓰려는 답변입니다.'},saved,send,persist),/Terminal report changed/);
});

test('a newly paired employee reports one natural-language assignment without publishing the original DM', async () => {
  const paired = {...config, transport: 'student-device', reportMode: 'assigned-tasks'};
  const request = {action: 'start', context, requestText: '공지 써줘', taskObjective: '수강생에게 보낼 공지 초안 작성'};
  const events = [];
  let saved;
  const send = async (_config, envelope) => events.push(JSON.parse(envelope.raw));
  const persist = async state => { saved = structuredClone(state); };

  for (const unsupported of [config, {...paired, reportMode: undefined}]) {
    await assert.rejects(reportSkill(unsupported, request, null, send, persist));
  }
  for (const chat of [{...request, requestText: '안녕!', taskObjective: undefined},
    {...request, requestText: '캠퍼스 연결 준비'}, {...request, requestText: '/start'}]) {
    await assert.rejects(reportSkill(paired, chat, null, send, persist));
  }
  assert.equal(events.length, 0);
  await reportSkill(paired, request, null, send, persist);
  await reportSkill(paired, request, saved, send, persist);
  await reportSkill(paired, {action: 'result', context, resultText: '이번 주 수업은 금요일 오후에 시작합니다.'}, saved, send, persist);
  assert.deepEqual(events.map(event => event.event), ['registered', 'accepted', 'started', 'draft']);
  assert.equal(events[0].objective, request.taskObjective);
  assert.equal(events[0].outputType, 'analysis');
  assert.ok(!JSON.stringify(events).includes(request.requestText));
  // The employee may name the kind of result; an unknown kind falls back instead of failing the report.
  for (const [given, stored] of [['copy', 'copy'], ['checklist', 'checklist'], ['essay', 'analysis']]) {
    const typed = [];
    await reportSkill(paired, {...request, context: {...context, messageId: 'kind-' + given}, outputType: given}, null,
      async (_config, envelope) => typed.push(JSON.parse(envelope.raw)), async () => {});
    assert.equal(typed[0].outputType, stored);
    assert.ok(!JSON.stringify(typed).includes('시스템 감시'));
  }
});

test('a stdin draft keeps the original start context and literal Unicode across chunks',async()=>{
  const {resultFromStart}=await import('../scripts/campus-skill-report.mjs');
  const start={action:'start',context:{messageId:'17'}};
  const text='제목\n\n$HOME과 `기호`까지 원문 그대로';
  const bytes=Buffer.from(text+'\n');
  assert.deepEqual(await resultFromStart(start,[bytes.subarray(0,2),bytes.subarray(2)]),
    {action:'result',context:start.context,resultText:text});
  await assert.rejects(resultFromStart({action:'retry'},[]),/start file/);
  await assert.rejects(resultFromStart(start,[Buffer.alloc(40003)]),/too large/);
});
test('a paired employee keeps reporting after /new starts another session, but not from another bot or chat',async()=>{
  const paired={...config,transport:'student-device',reportMode:'assigned-tasks'};
  const sent=[];const send=async(_c,e)=>sent.push(JSON.parse(e.raw));
  const later={...context,sessionId:'s2-after-new',messageId:'42:77'};
  const receipt=await reportSkill(paired,{action:'start',context:later,requestText:'공지 써줘',taskObjective:'수강생에게 보낼 공지 초안 작성'},null,send,async()=>{});
  assert.equal(receipt.reported,'started');assert.equal(sent.length,3);
  for(const other of [{...later,connectionId:'another-bot'},{...later,channelId:'telegram:99'},{...later,sessionId:'bad id with spaces'}])
    await assert.rejects(reportSkill(paired,{action:'start',context:other,requestText:'공지 써줘',taskObjective:'수강생에게 보낼 공지 초안 작성'},null,send,async()=>{}),/Invalid skill request binding/);
  // The legacy single-session pilot stays tied to its session.
  await assert.rejects(reportSkill(config,{...start,context:{...context,sessionId:'s2-after-new'}},null,send,async()=>{}),/Invalid skill request binding/);
});
test('the start file is removed after its result, with report files left behind for more than an hour',async()=>{
  const {tidyStartFiles}=await import('../scripts/campus-skill-report.mjs');
  const {mkdtemp,mkdir,writeFile,readdir,utimes,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const dir=await mkdtemp(join(tmpdir(),'campus-start-test-'));
  try{
    for(const name of ['campus-start-s1-1.json','campus-start-old-2.json','campus-connect-old-9.json','campus-start-fresh-3.json','notes.md','campus-start.txt'])await writeFile(join(dir,name),'{}');
    await mkdir(join(dir,'.campus-input'));
    const old=new Date(Date.now()-2*3600000);for(const name of ['campus-start-old-2.json','campus-connect-old-9.json','notes.md'])await utimes(join(dir,name),old,old);
    await tidyStartFiles(join(dir,'campus-start-s1-1.json'));
    assert.deepEqual((await readdir(dir)).sort(),['campus-start-fresh-3.json','campus-start.txt','notes.md']);
    // A folder the learner still keeps something in is left alone.
    await mkdir(join(dir,'.campus-input'));await writeFile(join(dir,'.campus-input','mine.txt'),'x');await writeFile(join(dir,'campus-start-s1-4.json'),'{}');
    await tidyStartFiles(join(dir,'campus-start-s1-4.json'));assert.ok((await readdir(dir)).includes('.campus-input'));
    await tidyStartFiles(join(dir,'notes.md'));assert.ok((await readdir(dir)).includes('notes.md'));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('a failed report gives the employee one first line to copy, with the right next step',async()=>{
  const {failureNotice}=await import('../scripts/campus-skill-report.mjs');
  const first=m=>failureNotice(m).split('\n')[0];
  for(const m of ['Report rejected (HTTP 403). Keep the saved report; check mapping/revision before retrying.','Report rejected (HTTP 401). x','Invalid skill request binding'])
    assert.match(first(m),/^⚠️ 캠퍼스 사무실에는 기록되지 않았어요\. .*해제됐거나 만료됐어요.*캠퍼스 연결 준비/);
  assert.match(first('Delivery unconfirmed. Keep this saved report and retry it; do not create another event.'),/인터넷 연결/);
  assert.match(first('Local report file unavailable'),/아직 캠퍼스에 연결되지 않았어요/);
  assert.match(first('Report rejected (HTTP 409). x'),/^⚠️ 캠퍼스 사무실에는 기록되지 않았어요\. 잠시 뒤/);
  assert.match(failureNotice('Invalid skill request binding'),/\n\(Invalid skill request binding\)$/);
});
test('report text shows the words of a Telegram-markdown answer without changing links or plain text',async()=>{
  const {officeReportText}=await import('../features/campus/office/report-text.ts');
  assert.equal(officeReportText('# 공지 초안\n**이번 주 일정**\n- 목요일 저녁 8시\n* 금요일 마감\n- [ ] 링크 확인\n- [x] 문구 확인\n> 다시 보내드립니다.\n1. 첫째 `코드`\n2 * 3 = 6, a-b, https://example.com/a_b_c'),
    '공지 초안\n이번 주 일정\n• 목요일 저녁 8시\n• 금요일 마감\n☐ 링크 확인\n☑ 문구 확인\n다시 보내드립니다.\n1. 첫째 코드\n2 * 3 = 6, a-b, https://example.com/a_b_c');
  assert.equal(officeReportText('<citation refs="a1, b2">근거</citation> 문장'),'근거 문장');
});
