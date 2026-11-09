import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {configureDevice,deviceDir} from '../scripts/campus-student-device.mjs';
import {prepareReport,deliverReport} from '../scripts/campus-office-report.mjs';
const c={platform:'telegram',sessionId:'s',connectionId:'b1',channelId:'telegram:7'};
test('Only the employee DM can confirm its local verifier and report to the pinned endpoint',async()=>{
  const root=await mkdtemp(join(tmpdir(),'campus-device-'));
  const start=await configureDevice(root,c,'캠퍼스 연결 준비');
  assert.match(start.pairingCode,/^MS1-[0-9]{10}-[a-f0-9]{64}$/);
  assert.deepEqual(await configureDevice(root,c,'캠퍼스 연결 준비'),start);
  assert.throws(()=>deviceDir(root,{...c,channelId:'telegram:-7'}));
  assert.notEqual(deviceDir(root,c),deviceDir(root,{...c,connectionId:'b2'}));
  const own='00000000-0000-4000-8000-000000000001';
  const jobId='00000000-0000-4000-8000-000000000002';
  const ack={notBefore:Date.now(),enrollmentId:own,connectorId:'s-'+own};
  await assert.rejects(configureDevice(root,c,'캠퍼스 연결 확인 0123456789ab',async()=>new Response(null,{status:403})),/403/);
  await configureDevice(root,c,'캠퍼스 연결 확인 0123456789ab',async(url,init)=>{
    const token=init.headers['x-campus-device'];
    assert.equal(createHash('sha256').update(token).digest('hex'),start.pairingCode.split('-')[2]);
    assert.ok(!start.pairingCode.includes(token));return Response.json(ack);
  });
  const cfg=JSON.parse(await readFile(join(deviceDir(root,c),'connection.json'),'utf8'));
  const key=await readFile(cfg.secretFile,'utf8'),env=prepareReport({event:'started',expectedRevision:2,jobId});
  await deliverReport({...cfg,jobId},env,key,async(url,init)=>{
    assert.equal(init.redirect,'error');assert.equal(init.headers['x-campus-device'],key);return Response.json({jobId,revision:3});
  });
  await assert.rejects(deliverReport({...cfg,jobId,endpoint:'https://other.test/api/campus/office/webhook'},env,key),/student endpoint/);
});
