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
const domain = compile('../features/commerce/domain/coupon.ts');
const application = compile('../features/commerce/application/coupon-service.ts', {
  '@/lib/coupon-rules': rules,
  '../domain/coupon': domain,
});
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
  const repository={
    getHistory:async(couponId,page)=>{calls.push({name:'history',args:{couponId,page}});return {data:[],count:0,error:null};},
    quote:async(userId,cohortId,code)=>{calls.push({name:'quote',args:{userId,cohortId,code}});return error?{data:null,error:{message:error}}:{data:{couponCode:code,couponDiscount:1000,totalAmount:0},error:null};},
    cancelZeroOrder:async(actorId,orderId)=>{calls.push({name:'cancel',args:{actorId,orderId}});return {data:{ok:true},error:null};},
  };
  const handlers=compile('../features/commerce/api/coupons.ts',{
    '@/lib/server-auth':{getAuthenticatedUser:async()=>user},
    '../application/coupon-service':application,
    '../infrastructure/coupon-repository':{createCouponRepository:()=>repository},
  });
  return {calls,...handlers};
}
const request=(body,origin='https://edu.test')=>new Request('https://edu.test/api/coupons',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('coupon API uses server identity and rejects forged role/ID and cross-origin mutations',async()=>{
  const member={id:'real-member',role:'student'}, h=setup(member,'COUPON_ADMIN_ONLY');
  assert.equal((await h.POST(request({cohortId:cohort,code:'admin_qa',role:'admin',userId:'admin'}))).status,409);
  assert.deepEqual(h.calls[0],{name:'quote',args:{userId:'real-member',cohortId:cohort,code:'ADMIN_QA'}});
  assert.equal((await h.POST(request({cohortId:cohort,couponId:cohort,code:'ADMIN_QA'}))).status,400);
  assert.equal((await h.POST(request({action:'cancel-zero',orderId:cohort}))).status,403);
  assert.equal((await h.GET(new Request('https://edu.test/api/coupons?history='+cohort))).status,403);
  assert.equal((await h.POST(request({code:'ADMIN_QA',cohortId:cohort},'https://other.test'))).status,403);
  assert.equal(h.calls.length,1);
  assert.equal((await setup(null).GET(new Request('https://edu.test/api/coupons?cohort='+cohort))).status,401);
});
test('customer coupon GET never enumerates coupon names or codes',async()=>{
  const h=setup({id:'real-member',role:'student'});
  const response=await h.GET(new Request('https://edu.test/api/coupons?cohort='+cohort));
  assert.equal(response.status,405);
  assert.match((await response.json()).error,/목록은 제공하지 않습니다/);
  assert.equal(h.calls.length,0);
  assert.doesNotMatch(fs.readFileSync(new URL('../features/commerce/api/coupons.ts',import.meta.url),'utf8'),/edu_available_coupons/);
  assert.match(fs.readFileSync(new URL('../app/api/coupons/route.ts',import.meta.url),'utf8'),/features\/commerce\/api/);
  assert.doesNotMatch(fs.readFileSync(new URL('../app/api/platform/route.ts',import.meta.url),'utf8'),/user && view === 'checkout'[\s\S]{0,500}customer_coupons/);
});
