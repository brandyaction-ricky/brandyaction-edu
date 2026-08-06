"use client";

import { useEffect, useState } from "react";
import { FileCheck2, LockKeyhole, RotateCcw } from "lucide-react";
import { POLICY_EFFECTIVE_DATE, PolicyKey } from "@/lib/legal-policies";
import { defaultSiteSettings, loadSiteSettings } from "@/lib/site-settings";
import { BrandHeader } from "./brand-header";

const policyMeta = {
  terms: { eyebrow: "TERMS OF USE", title: "이용약관", description: "브랜디액션 에듀 서비스의 이용조건과 회사·회원의 권리 및 의무를 안내합니다.", icon: FileCheck2 },
  privacy: { eyebrow: "PRIVACY POLICY", title: "개인정보처리방침", description: "수집하는 개인정보와 이용 목적, 보유기간 및 이용자의 권리를 안내합니다.", icon: LockKeyhole },
  refund: { eyebrow: "REFUND POLICY", title: "환불규정", description: "온라인 콘텐츠와 기수제 라이브 교육상품의 청약철회·환불 기준을 안내합니다.", icon: RotateCcw },
} as const;

export function PolicyDocument({ type }: { type: PolicyKey }) {
  const [policies, setPolicies] = useState(defaultSiteSettings.policies);
  const meta = policyMeta[type];
  const Icon = meta.icon;

  useEffect(() => {
    let active = true;
    const refresh = () => loadSiteSettings().then((value) => { if (active) setPolicies(value.policies); }).catch(() => undefined);
    refresh();
    window.addEventListener("brandyaction:settings-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("brandyaction:settings-updated", refresh);
    };
  }, []);

  return <main className="policy-page">
    <BrandHeader />
    <section className="policy-hero">
      <div className="container policy-hero-inner">
        <div><span className="section-kicker">{meta.eyebrow}</span><h1>{meta.title}</h1><p>{meta.description}</p></div>
        <Icon aria-hidden="true" />
      </div>
    </section>
    <section className="policy-content-wrap">
      <article className="container policy-document">
        <div className="policy-document-head"><strong>시행일</strong><span>{POLICY_EFFECTIVE_DATE}</span></div>
        <div className="policy-text">{policies[type]}</div>
      </article>
    </section>
  </main>;
}
