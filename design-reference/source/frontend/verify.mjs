import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const files=['core.js','worksheets.js','article-banner.js','public.js','home.js','member.js','articles-update.js','mypage.js','runtime.js'];
const scripts=Object.fromEntries(files.map(f=>[f,fs.readFileSync(path.join(root,'src',f),'utf8')]));
for(const [file,script]of Object.entries(scripts))new vm.Script(script,{filename:file});
const ctx=vm.createContext({console});vm.runInContext("const DETAIL_IMAGE='data:image/png;base64,preview';\n"+files.slice(0,-1).map(f=>scripts[f].split('// ARTICLE FRONT EVENTS')[0].split('// MYPAGE EVENTS')[0]).join('\n'),ctx);
const routes=vm.runInContext('ROUTES',ctx),knownActions=new Set([...scripts['runtime.js'].matchAll(/^'([^']+)':/gm)].map(m=>m[1]));
const checks=[];let count=0;
function checkView(route,setup=''){
vm.runInContext(`state.route=${JSON.stringify(route)};${setup}`,ctx);
const html=vm.runInContext(`header()+'<main id="main">'+views[${JSON.stringify(route)}]()+'</main>'+footer()`,ctx);
const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,route+' duplicate IDs');
for(const [,target]of html.matchAll(/href="#([^"]+)"/g))assert(target in routes||ids.includes(target),route+' broken target '+target);
for(const [,action]of html.matchAll(/data-action="([^"]+)"/g))assert(knownActions.has(action),route+' unbound action '+action);
assert(/<h1[^>]*>[^<\s]/.test(html)||/<h1[^>]*><span/.test(html),route+' nonempty heading');
assert(!/\b(?:src|href)="https?:\/\//.test(html),route+' unexpected remote dependency');
if(route==='free'){
const body=vm.runInContext('views.free()',ctx);
assert.equal((body.match(/<img\b/g)||[]).length,1,'free uses one registered detail image');
assert.equal((body.match(/<section\b/g)||[]).length,1,'free contains only the resources section after image');
assert(body.includes('bottom-cta')&&body.includes('download'),'free download and fixed CTA exist');
assert(!/purchase-card|subnav|id="curriculum"|id="reviews"/.test(body),'free has no expanded detail modules');
}
count++;
}
for(const [route,[title,file]]of Object.entries(routes)){checkView(route);const f=path.join(root,'dist',file);assert(fs.existsSync(f),file+' missing');const html=fs.readFileSync(f,'utf8');assert(html.startsWith('<!doctype html>'));assert(html.includes('<meta charset="utf-8">'));const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];assert(script,file+' script missing');new vm.Script(script,{filename:file});}
for(const value of ['draft','submitted','returned','approved'])checkView('mission',`state.missionState=${JSON.stringify(value)}`);
for(const value of ['무료 클래스','유료 클래스','디지털 상품'])checkView('classes',`state.classType=${JSON.stringify(value)}`);
checkView('classes',"state.classQuery='없는 클래스'");
for(const value of ['수강 중','수강 예정','수강 완료'])checkView('myclasses',`state.myClassTab=${JSON.stringify(value)}`);
for(const value of ['전체 자료','무료 클래스','AI 온보딩 챌린지','AI 마케팅 실전 과정','AI 업무 템플릿 팩'])checkView('resources',`state.resourceFilter=${JSON.stringify(value)}`);
for(const value of [1,5,15])checkView('learning',`state.lesson=${value}`);
checkView('paid',"state.paidId='p5'");
checkView('checkout',"state.checkoutId='p3';state.coupon=false");
checkView('result',"state.paymentFailed=true");
checkView('questions',"state.questions=[{id:3,title:'<검토>',body:'작성 내용 & 질문',answer:'',date:'2026.09.10',lesson:'Day 1'}]");
checkView('myreviews',"state.reviewTab='내가 쓴 후기';state.reviews=[{product:'p1',rating:4,text:'수강 후 <실행>한 내용'}]");
vm.runInContext("state.purchases=[];state.checkoutId='p1';state.coupon=true;recordPurchase();state.checkoutId='p3';state.coupon=false;recordPurchase();",ctx);
assert.equal(vm.runInContext('state.purchases.length',ctx),2,'second product preserves earlier order');
assert.equal(vm.runInContext("state.purchases.find(o=>o.product==='p1').price",ctx),1460000,'first purchase retains applied amount');
assert(vm.runInContext("hasPurchase('p1')&&hasPurchase('p3')&&orderData().length===4",ctx),'owned products and history remain connected');
checkView('resources',"state.resourceFilter='AI 업무 템플릿 팩'");
checkView('myclasses',"state.myClassTab='수강 예정';state.applied=true");
checkView('orders',"state.orderFrom='2026-09-01';state.orderTo='2026-09-30';state.orderType='p3'");
const filtered=vm.runInContext('orderResults()',ctx);assert(filtered.includes('AI 업무 템플릿 팩')&&!filtered.includes('AI 마케팅 실전 과정'),'orders product/date filters');

for(const value of ['전체','제출 전','검토 대기','보완 요청','승인 완료'])checkView('mymissions',`state.myMissionFilter=${JSON.stringify(value)}`);
checkView('mymissions',"state.memberClass='p1'");
checkView('mypage',"state.memberClass='p5';state.lesson=1;state.missionState='submitted'");
assert.equal(vm.runInContext('personalCounts().approved',ctx),1,'submission awaiting review must not increase approvals');
checkView('mypage',"state.missionState='approved'");
assert.equal(vm.runInContext('personalCounts().approved',ctx),2,'approval increases completed missions');
const dashboard=vm.runInContext('views.mypage()',ctx);assert(dashboard.includes('나의 실행 레벨')&&dashboard.includes('회원 무료강의 3강'),'dashboard connects progress and free videos');
checkView('articles',"state.logged=false");assert(vm.runInContext('views.articles()',ctx).includes('회원가입하면 바로 시청'),'article guest gate retained');
checkView('articles',"state.logged=true");assert(vm.runInContext('views.articles()',ctx).includes('아티클 읽으러 가기'),'member free lessons retained');
const css=['interface.css','experience.css'].map(f=>fs.readFileSync(path.join(root,'src',f),'utf8')).join('\n');assert(css.includes('.bottom-cta{position:fixed;bottom:0;'),'CTA remains viewport-fixed');assert(css.includes('env(safe-area-inset-bottom)'),'mobile safe area');assert(css.includes('.detail-image{width:100%;height:auto;object-fit:contain}'),'detail image ratio preserved');assert(css.includes('@media(max-width:680px)'),'phone layout');assert(css.includes('.radio-row{grid-template-columns:1fr}'),'mobile payment methods');assert(css.includes('.learning-layout{display:block}'),'mobile learning single column');assert(css.includes('.checkout-layout .product-aside{order:0}'),'mobile checkout respects reading order');
for(const file of Object.values(vm.runInContext('WORKSHEETS',ctx))){assert(fs.existsSync(path.join(root,'dist/assets',file.filename)));assert(file.html.includes('<textarea'),'worksheet is usable');}
const report={scope:'Static HTML, JavaScript syntax, template rendering, navigation targets, representative states, local sample resources. No browser or live service testing.',pages:Object.keys(routes).length,renderedStates:count,externalDependencies:0,downloadSamples:4,result:'passed',date:'2026-09-11'};
fs.writeFileSync(path.join(root,'dist','validation-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
