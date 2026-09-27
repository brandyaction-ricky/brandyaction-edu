import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const compile = (file, imports = {}) => {
  const exports = {};
  new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>imports[name]||{});
  return exports;
};
const rules = compile('../lib/coupon-rules.ts');
test('coupon status separates draft, inactive, issue window and end-exclusive use period', () => {
  const now=Date.parse('2026-09-27T11:00:00Z'), row={id:'x',is_active:true};
  assert.equal(rules.couponStatus({...row,is_draft:true},now),'draft');
  assert.equal(rules.couponStatus({...row,is_active:false},now),'inactive');
  assert.equal(rules.couponStatus({...row,issue_start_at:'2026-09-27T11:00:01Z'},now),'upcoming');
  assert.equal(rules.couponStatus({...row,issue_start_at:'2026-09-27T11:00:00Z'},now),'active');
  assert.equal(rules.couponStatus({...row,ends_at:'2026-09-27T11:00:00Z'},now),'expired');
});
test('coupon date input uses KST regardless of machine timezone',()=>{
  assert.equal(rules.couponKstInput('2026-09-27T11:00:00Z'),'2026-09-27T20:00');
  assert.equal(rules.couponKstUtc('2026-09-27T20:00'),'2026-09-27T11:00:00.000Z');
  assert.equal(rules.couponKstUtc(''),null);
});
const cohort='00000000-0000-4000-8000-000000000001';
function setup(user, error) {
  const calls=[];
  const handlers=compile('../app/api/coupons/route.ts',{
    '@/lib/server-auth':{getAuthenticatedUser:async()=>user},
    '@/lib/coupon-rules':rules,
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args}); return error?{error:{message:error}}:{data:{totalAmount:0}};}})},
  });
  return {calls,...handlers};
}
const request=(body,origin='https://edu.test')=>new Request('https://edu.test/api/coupons',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('coupon API uses server identity and rejects forged role/ID and cross-origin mutations',async()=>{
  const member={id:'real-member',role:'student'}, h=setup(member,'COUPON_ADMIN_ONLY');
  assert.equal((await h.POST(request({cohortId:cohort,code:'ADMIN_QA',role:'admin',userId:'admin'}))).status,409);
  assert.equal(h.calls[0].args.p_user,'real-member');
  assert.equal((await h.POST(request({cohortId:cohort,couponId:cohort,code:'ADMIN_QA'}))).status,400);
  assert.equal((await h.POST(request({action:'cancel-zero',orderId:cohort}))).status,403);
  assert.equal((await h.GET(new Request('https://edu.test/api/coupons?history='+cohort))).status,403);
  assert.equal((await h.POST(request({code:'ADMIN_QA',cohortId:cohort},'https://other.test'))).status,403);
  assert.equal(h.calls.length,1);
  assert.equal((await setup(null).GET(new Request('https://edu.test/api/coupons?cohort='+cohort))).status,401);
});
