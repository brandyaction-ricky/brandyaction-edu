'use client';
import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import type { LandingConfig } from '@/lib/landing';
import { startLandingTracking } from '@/lib/landing-browser';
import { object, safeUrl, text as t, type Row } from '@/lib/platform';
import { Cover } from '../final/primitives';
import { ProductDetailHtml } from '../final/product-detail-html';

export function LandingTracker({ config, children }: { config: LandingConfig; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if(ref.current) return startLandingTracking(ref.current,config); },[config]);
  return <div ref={ref} className="landing-campaign">{children}</div>;
}
export function CampaignFreeClass({ course, config }: { course: Row; config: LandingConfig }) {
  const meta = object(course,'metadata'), image = safeUrl(meta.detailImageUrl || meta.detail_image_url);
  const detailHtml = typeof meta.detail_html === 'string' ? meta.detail_html : '';
  const cta = (position: string, full = false) => <a className={'btn primary large ' + (full ? 'full' : '')} href={config.kakao_url} data-landing-cta={config.enabled ? position : undefined}>{config.cta_label}<ArrowRight /></a>;
  return <LandingTracker config={config}>
    <div className="free-body"><div className="free-sheet">
      <section className="campaign-hero panel-body" data-section="hero">
        <div className="eyebrow">FREE LIVE CLASS</div><h1>{t(course,'title')}</h1><p className="lead">{t(course,'summary')}</p>
        {t(course,'schedule_label') && <p className="meta">{t(course,'schedule_label')}</p>}
        {cta('hero_cta')}<p className="meta mt16">카카오 오픈채팅에서 무료 라이브 참여 안내를 확인하세요.</p>
      </section>
      {config.custom_sections ? config.sections.map(s=><section className="campaign-section" data-section={s.id} key={s.id}>
        {s.title && <h2>{s.title}</h2>}{s.image && <img src={s.image} alt={s.title || ''} loading="lazy" decoding="async" />}{s.body && <div className="reading-copy">{s.body}</div>}
      </section>) : <>
        <section data-section="detail">{image ? <img className="detail-image" src={image} alt={t(course,'title')+' 상세 안내'} loading="lazy" decoding="async" /> : <div className="panel-body"><Cover course={course}/>{detailHtml ? <ProductDetailHtml html={detailHtml} className="product-detail-html reading-copy mt24" /> : <div className="reading-copy mt24">{t(course,'description') || t(course,'summary')}</div>}</div>}</section>
        <section className="campaign-section" data-section="materials"><h2>무료 라이브 참여 안내</h2><p>참여 링크와 강의 관련 안내는 카카오 오픈채팅방에서 확인해 주세요.</p></section>
      </>}
      <section className="campaign-section campaign-final" data-section="final"><h2>무료 라이브에서 만나요.</h2><p>{t(course,'schedule_label')}</p>{cta('final_cta')}</section>
    </div></div>
    <aside className="bottom-cta campaign-sticky"><div className="wrap"><div><strong>무료 라이브</strong><p className="meta">{t(course,'title')}</p></div>{cta('sticky_cta')}</div></aside>
  </LandingTracker>;
}
