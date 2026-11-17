import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadTs} from './helpers/question-ai.mjs';

const production = 'https://qitqxizuwmmlhlcgsrqe.supabase.co';
const development = 'https://vjmjhaidlqkmascdjocw.supabase.co';

test('private production package cannot send a device credential to the DEV receiver',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'office-package-'));
  try {
    execFileSync('unzip',['-q','skills/packages/moonshot-campus-report-production.zip','-d',dir]);
    const scripts=join(dir,'moonshot-campus-report','scripts');
    const {endpoint}=await import(pathToFileURL(join(scripts,'campus-student-device.mjs')));
    const {deliverReport}=await import(pathToFileURL(join(scripts,'campus-office-report.mjs')));
    assert.equal(endpoint,production+'/functions/v1/campus-student-report');
    // The production gateway rejects devices without the public project key; the package must carry it.
    const {gatewayHeaders}=await import(pathToFileURL(join(scripts,'student-target.mjs')));
    const headers=await gatewayHeaders();
    assert.match(headers.apikey,/^[\w-]+\.[\w-]+\.[\w-]+$/);assert.equal(headers.Authorization,'Bearer '+headers.apikey);
    let sent=false;
    await assert.rejects(deliverReport({environment:'production',transport:'student-device',endpoint:development+'/functions/v1/campus-student-report'}, {}, 'fixture',async()=>{sent=true;}),/Invalid student endpoint/);
    assert.equal(sent,false);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('production receiver defaults closed before inspecting any credential or invoking transport',async()=>{
  const {receiveStudentReport}=loadTs('supabase/functions/campus-student-report/index.ts');
  const result=await receiveStudentReport(new Request('https://example.test',{method:'POST'}),production,'fixture',()=>{throw Error('unexpected transport');});
  assert.equal(result.status,404);
});
