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
