import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const here=path.dirname(new URL(import.meta.url).pathname);
const css=[fs.readFileSync(path.join(here,'src/interface.css'),'utf8'),...['tokens.css','components.css'].map(f=>fs.readFileSync(path.join(here,'../shared',f),'utf8')),fs.readFileSync(path.join(here,'src/experience.css'),'utf8')].join('\n');
const base=fs.readFileSync(path.join(here,'src/app.js'),'utf8');
const ops=fs.readFileSync(path.join(here,'src/operations.js'),'utf8');
const articleUpdate=['article-banner.js','articles-update.js'].map(f=>fs.readFileSync(path.join(here,'src',f),'utf8')).join('\n');
const marker="state.route=routes[location.hash.slice(1)]?";
if(!base.includes(marker))throw new Error('Initial route marker missing');
const js=base.replace(marker,ops+'\n'+articleUpdate+'\n'+marker);
fs.mkdirSync(path.join(here,'dist'),{recursive:true});
new vm.Script(js);
const pages=[['brandy-admin-uiux-v2.html','overview','Brandy Edu · 브랜드 최종 관리자'],['01-admin-overview.html','overview','운영 홈'],['02-member-missions.html','members','회원 미션관리'],['03-submission-review.html','reviews','제출물 검토'],['04-mission-content.html','missions','미션 관리'],['05-question-inbox.html','questions','질문함'],['06-landing-analytics.html','analytics','랜딩 성과'],['07-manual-metrics.html','metrics','실측 입력'],['08-admin-settings.html','settings','운영·트래킹 설정'],['09-products.html','products','상품 관리'],['10-product-editor.html','product-editor','상품 등록·수정'],['11-learning-content.html','learning','학습 콘텐츠 관리'],['12-learning-editor.html','learning-editor','학습 콘텐츠 편집'],['13-cohorts.html','cohorts','기수·회차 관리'],['14-customers.html','customers','회원 관리'],['15-customer-tags.html','tags','고객 태그 관리'],['16-coupons.html','coupons','쿠폰 관리'],['17-product-reviews.html','product-reviews','상품 후기 관리'],['18-main-banners.html','banners','메인 배너 관리'],['19-articles.html','articles','아티클 관리'],['20-customer-stories.html','testimonials','고객 후기 관리'],['21-orders-payments.html','orders','주문 결제'],['22-search-code.html','seo','검색코드 설정']];
for(const [name,route,title]of pages){fs.writeFileSync(path.join(here,'dist',name),`<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="description" content="브랜디액션 교육 관리자 UIUX 개편안. 상품·학습·고객·콘텐츠·매출·마케팅을 연결한 22개 화면의 오프라인 디자인 시안."><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>${title} | BrandyAction Edu</title><style>${css}</style></head><body><a class="skip" href="#main">본문으로 이동</a><div id="root"></div><noscript>이 HTML 시안은 화면 이동을 위해 브라우저 JavaScript가 필요합니다. 외부 서비스에는 연결되지 않습니다.</noscript><dialog id="dialog" aria-labelledby="dialog-title"></dialog><div id="toast" class="toast" role="status" aria-live="polite" hidden></div><script>window.INITIAL_ROUTE=${JSON.stringify(route)};\n${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);}
console.log(JSON.stringify({pages:pages.length,standalone:true,externalDependencies:0,output:pages.map(p=>p[0])},null,2));
