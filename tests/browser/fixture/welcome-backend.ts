import type { Page } from '@playwright/test';
import type { WelcomeRequest, WelcomeSnapshot } from '../../../lib/welcome-consent';
export async function welcomeBackend(page:Page,options:{lost?:boolean;conflict?:boolean;unavailable?:boolean;existing?:boolean;termsUnavailable?:boolean;failure?:boolean;renewal?:boolean;personalOff?:boolean}={}) {
  const on=!!options.existing, revision=on ? '11111111-1111-4111-8111-111111111111' : null;
  let s:WelcomeSnapshot={
    marketing:{choices:{marketingUse:on,sms:false,email:on,kakao:on},revision,updatedAt:null,dates:{marketingUse:null,sms:null,email:null,kakao:null},legacyRetired:true},
    personal:{choices:{analysis:on,overseas:on},activeChoices:{analysis:on&&!options.renewal,overseas:on&&!options.renewal},revision,updatedAt:null,needsRenewal:!!options.renewal,eligible:on&&!options.renewal,accepting:!options.personalOff,terms:{version:'synthetic-personal-v1',analysis:'합성 맞춤 추천 목적·구매 이용 기록·보유 기간·거부 권리',overseas:'합성 Modal 미국 · 분석용 번호 · 암호화 전송 · 철회 시 처리 중단'}},
    meta:{consented:on,active:on&&!options.renewal,needsRenewal:!!options.renewal,revision,updatedAt:null,terms:{version:'synthetic-meta-v1',recipient:'합성 Meta 수신처',country:'미국',items:'합성 구매액·이메일 해시·브라우저 정보',purpose:'합성 광고 성과 측정',transfer:'합성 결제 확인 후 암호화 API',retention:'합성 보유 기간',refusal:'쿠폰과 서비스에는 영향 없음',contact:'합성 문의'}},
    reward:{available:!options.unavailable,handled:on,awarded:on,analysisAvailable:true,personalRevision:revision,marketingRevision:revision,terms:null,reward:{days:30,minimum:0}},
    handled:on,promptedAt:on ? '2026-10-17T01:00:00Z' : null,accepting:{marketing:true,personal:!options.personalOff,meta:!options.termsUnavailable},
  };
  if(options.termsUnavailable)s.meta.terms=null;
  const writes:WelcomeRequest[]=[],auth:unknown[]=[],receipts=new Set<string>();let lost=options.lost,failure=options.failure,issues=0;
  await page.route('**/synthetic-auth/consent',async r=>{auth.push(r.request().postDataJSON());await r.fulfill({json:{ok:true}});});
  await page.route('**/api/account/welcome-consent',async route=>{
    if(route.request().method()==='GET')return route.fulfill({json:s});
    const b=route.request().postDataJSON() as WelcomeRequest;writes.push(b);
    if(options.conflict)return route.fulfill({status:409,json:{error:'다른 화면에서 설정이 바뀌었어요.'}});
    if(failure)return route.fulfill({status:503,json:{error:'저장 결과를 확인하지 못했어요.'}});
    if(!receipts.has(b.requestId)) {
      const all=b.scope==='welcome';
      if(all || b.scope==='marketing') {s.marketing.choices={marketingUse:b.choices.email||b.choices.kakao,sms:false,email:b.choices.email,kakao:b.choices.kakao};s.marketing.revision=b.requestId;
        if((b.choices.email||b.choices.kakao)&&s.reward.available&&!s.reward.awarded){s.reward.awarded=true;issues++;}}
      if(all||b.scope==='analysis'){s.personal.choices.analysis=b.choices.analysis;s.personal.activeChoices!.analysis=b.choices.analysis;}
      if(all||b.scope==='overseas'){s.personal.choices.overseas=b.choices.overseas;s.personal.activeChoices!.overseas=b.choices.overseas;}
      if(all||b.scope==='analysis'||b.scope==='overseas'){s.personal.revision=b.requestId;s.personal.needsRenewal=(s.personal.choices.analysis&&!s.personal.activeChoices!.analysis)||(s.personal.choices.overseas&&!s.personal.activeChoices!.overseas);}
      if(all||b.scope==='meta'){s.meta.consented=b.choices.meta;s.meta.active=b.choices.meta;s.meta.revision=b.requestId;s.meta.needsRenewal=false;}
      s={...s,handled:true,promptedAt:'2026-10-17T01:00:00Z'};receipts.add(b.requestId);
    }
    if(lost){lost=false;return route.abort();}
    return route.fulfill({json:s});
  });
  return {writes,auth,issues:()=>issues,snapshot:()=>s,setFailure:(v:boolean)=>{failure=v;}};
}
