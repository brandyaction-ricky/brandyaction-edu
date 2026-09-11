import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const h = React.createElement;
const common = {
  "next/link": { default: (props) => h("a", Object.fromEntries(Object.entries(props).filter(([key]) => key !== "prefetch"))) },
  "next/image": { default: (props) => h("img", Object.fromEntries(Object.entries(props).filter(([key]) => !["fill","unoptimized","priority"].includes(key)))) },
  "next/navigation": { redirect: url => { throw new Error(`redirect:${url}`); }, useRouter: () => ({ refresh() {}, push() {} }) },
};
function source(file, overrides = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const code = ts.transpileModule(readFileSync(new URL(file, root), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} }; cache.set(file, mod.exports);
  new Function("require", "module", "exports", code)(id => {
    if (id in overrides) return overrides[id];
    if (id in common) return common[id];
    if (id.startsWith("@/") || id.startsWith(".")) {
      const base = id.startsWith("@/") ? id.slice(2) : path.posix.join(path.posix.dirname(file), id);
      const resolved = [base, base+".ts", base+".tsx"].find(candidate => existsSync(new URL(candidate, root)));
      return source(resolved, overrides, cache);
    }
    return require(id);
  }, mod, mod.exports);
  return mod.exports;
}
const item = { slug:"my-class", title:"실행 클래스", summary:"실제 소개", programType:"free", status:"모집 중", duration:"4주", startDate:"9월", price:"무료", applicationOpen:true, curriculum:[] };
test("connected class cards keep free, paid, digital types and valid detail links", () => {
  const { ClassCard } = source("app/components/class-card.tsx");
  for (const [override,label] of [[{},"무료 클래스"],[{programType:"paid",price:"30,000원"},"유료 클래스"],[{programType:"paid",productKind:"digital"},"디지털 상품"]]) {
    const html = renderToStaticMarkup(h(ClassCard,{item:{...item,...override}}));
    assert.match(html,/href="\/classes\/my-class"/); assert.ok(html.includes(label));
  }
});
test("empty catalog renders explicit empty state, not prototype products", () => {
  const { ClassCatalog } = source("app/components/class-catalog.tsx");
  const html = renderToStaticMarkup(h(ClassCatalog,{classes:[]}));
  assert.match(html,/새로운 클래스를 준비/); assert.match(html,/0개의 클래스/); assert.doesNotMatch(html,/ba-course-card/);
});
test("free conversion page has no external navigation and gates its single primary CTA", () => {
  const { FreeClassDetail } = source("app/components/free-class-detail.tsx",{
    "./class-resource-downloads":{ClassResourceDownloads:()=>h("div",null,"자료 다운로드")},
    "./site-live-content":{DetailImageStack:()=>h("div",null,"등록된 상세 이미지")},
  });
  const props = { item, appearance:{images:[],pixels:{}}, reviews:[] };
  const html = renderToStaticMarkup(h(FreeClassDetail,props));
  assert.equal((html.match(/<a\b/g)||[]).length,1); assert.match(html,/href="\/checkout\?course=my-class"/);
  const closed = renderToStaticMarkup(h(FreeClassDetail,{...props,item:{...item,applicationOpen:false,status:"모집 마감"}}));
  assert.doesNotMatch(closed,/<a\b/); assert.match(closed,/disabled=""/); assert.match(closed,/모집 마감/);
});
test("approved mission displays saved answer and reviewer feedback without resubmit", () => {
  const { MissionSubmissionForm } = source("app/components/lesson-actions.tsx");
  const html = renderToStaticMarkup(h(MissionSubmissionForm,{enrollmentId:"own",mission:{id:"mission",title:"실행",required:true,submissionType:"text",submission:{id:"attempt",status:"approved",answerText:"내가 실행한 내용",feedback:"정확하게 실행했습니다."}}}));
  assert.match(html,/내가 실행한 내용/); assert.match(html,/정확하게 실행했습니다/); assert.match(html,/승인 완료/); assert.doesNotMatch(html,/mission-submit-button/);
});
test("new admin menu renders only authorized entries and has accessible mobile controls", () => {
  const { AdminNavigation } = source("app/components/admin-navigation.tsx");
  const html = renderToStaticMarkup(h(AdminNavigation,{active:"missions",groups:[{label:"학습",items:[{id:"missions",label:"미션 관리",href:"/admin/missions"}]}]}));
  assert.match(html,/aria-current="page"/); assert.match(html,/관리자 메뉴 열기/); assert.match(html,/관리자 메뉴 검색/); assert.doesNotMatch(html,/\/admin\/members/);
});

function accountFixture(options={}) {
  const calls = [];
  const enrollment = {id:"owned",course_id:"course",cohort_id:"cohort",courses:{title:"내 수강 클래스"},cohorts:{name:"1기"}};
  const result = {
    profiles:{data:{full_name:"회원",status:options.suspended?"suspended":"active"}},
    enrollments:options.enrollmentError?{data:null,error:{message:"unavailable"}}:{data:[enrollment]},
    customer_coupons:{data:options.wallets||[]},
    reviews:{data:[]},
  };
  const db = { from(table) {
    calls.push(["from",table]); const builder={};
    for (const method of ["select","eq","lte","or","order","limit"]) builder[method]=(...args)=>{calls.push([table,method,...args]);return builder;};
    builder.maybeSingle=async()=>result[table]; builder.then=(resolve,reject)=>Promise.resolve(result[table]).then(resolve,reject); return builder;
  }};
  const { AccountLibrary } = source("app/components/account-library.tsx", {
    "./learner-shell":{LearnerShell:({children})=>h("div",null,children)},
    "@/lib/server-auth":{getAuthenticatedUser:async()=>options.anonymous?null:{id:"student",email:"student@example.test"}},
    "@/lib/supabase/server":{createClient:async()=>db},
    "@/lib/supabase/admin":{createAdminClient:()=>{calls.push(["service"]);return db;}},
    "@/lib/education-data":{getPublicSupport:async()=>({supportEmail:"support@example.test"})},
    "@/lib/learning-data":{getLearningHome:async id=>{calls.push(["learning",id]);return {weeks:[{number:1,lessons:[{id:"lesson",title:"연결된 학습 자료",day:1,resourcePath:"PRIVATE_STORAGE_PATH",resourceName:"워크북.pdf",mission:{title:"미션",submission:{status:"submitted"}}}]}],achievement:{available:true,percent:0,level:{number:1,name:"시작"}}};}},
  });
  return {calls,render:async(section="resources",enrollmentId)=>renderToStaticMarkup(await AccountLibrary({section,enrollmentId}))};
}
test("anonymous member library cannot query data", async () => {
  const f=accountFixture({anonymous:true}); await assert.rejects(f.render("coupons"),/redirect:\/login/); assert.equal(f.calls.length,0);
});
test("suspended member cannot reach service-role wallet/review reads", async () => {
  const f=accountFixture({suspended:true}); await f.render("coupons"); assert.ok(!f.calls.some(call=>call[0]==="service"));
});
test("foreign enrollment parameter never crosses account ownership or leaks storage path", async () => {
  const f=accountFixture(); const html=await f.render("resources","foreign-id");
  assert.ok(f.calls.some(call=>call[0]==="learning"&&call[1]==="owned"));
  assert.ok(f.calls.some(call=>call[0]==="enrollments"&&call[1]==="eq"&&call[2]==="user_id"&&call[3]==="student"));
  assert.ok(f.calls.some(call=>call[0]==="enrollments"&&call[1]==="lte"&&call[2]==="access_starts_at"));
  assert.ok(f.calls.some(call=>call[0]==="enrollments"&&call[1]==="or"&&call[2].includes("access_ends_at")));
  assert.match(html,/\/api\/learning\/resources\?enrollment=owned/); assert.doesNotMatch(html,/PRIVATE_STORAGE_PATH|foreign-id/);
});
test("mission library keeps pending distinct from achievement", async () => {
  const f=accountFixture(); const html=await f.render("missions"); assert.match(html,/승인 대기/); assert.match(html,/0%/); assert.match(html,/Lv.1 시작/);
});
test("member data errors render recovery message instead of misleading empty state", async () => {
  const f=accountFixture({enrollmentError:true}); const html=await f.render(); assert.match(html,/불러오지 못했습니다/); assert.ok(!f.calls.some(call=>call[0]==="learning"));
});
test("wallet page scopes privileged query to current user and handles expiry", async () => {
  const f=accountFixture({wallets:[{id:"wallet",status:"available",expires_at:"2000-01-01T00:00:00Z",coupons:{name:"지난 쿠폰",discount_type:"percentage",discount_value:10,is_active:true}}]});
  const html=await f.render("coupons"); assert.match(html,/기간 만료/); assert.match(html,/10% 할인/);
  assert.ok(f.calls.some(call=>call[0]==="customer_coupons"&&call[1]==="eq"&&call[2]==="user_id"&&call[3]==="student"));
  const select=f.calls.find(call=>call[0]==="customer_coupons"&&call[1]==="select")[2]; assert.ok(!select.includes("code"));
});
test("image optimizer only proxies explicitly allowed public assets", () => {
  const {canOptimizePublicImage}=source("lib/public-image.ts");
  assert.equal(canOptimizePublicImage("https://vjmjhaidlqkmascdjocw.supabase.co/storage/v1/object/public/course-assets/a.png"),true);
  for(const url of ["https://example.test/a.png","//example.test/a.png","https://vjmjhaidlqkmascdjocw.supabase.co/storage/v1/object/sign/private/a.png"]) assert.equal(canOptimizePublicImage(url),false);
});
test("checkout reading order is product, applicant, coupon, payment, total, agreement, CTA", () => {
  const {CheckoutClient}=source("app/components/checkout-client.tsx");
  const html=renderToStaticMarkup(h(CheckoutClient,{course:{id:"course",slug:"class",title:"검증 상품",listPrice:30000,durationLabel:"4주",cohorts:[{id:"cohort",name:"1기",price:30000,operationStartAt:null}]},initialCohortId:"cohort",customer:{id:"student",name:"수강생",email:"s@example.test",phone:"01012345678"},clientKey:"",paymentMode:"test",paymentReady:false,paymentConfigError:"테스트"}));
  const sections=["checkout-product-preview","신청자 정보","쿠폰 사용","결제 수단","총 결제금액","약관 동의","type=\"submit\""];
  let previous=-1;
  for(const section of sections){const index=html.indexOf(section);assert.ok(index>previous,section);previous=index;}
  assert.match(html,/disabled=""/);
});
