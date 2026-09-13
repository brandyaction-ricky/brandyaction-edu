'use client';
import { useEffect, useMemo, useRef } from 'react';
import type { LandingConfig } from '@/lib/landing';
import { startLandingTracking } from '@/lib/landing-browser';
import { object, safeUrl, text as t, type Row } from '@/lib/platform';
import { Cover } from '../final/primitives';
import { ProductDetailHtml } from '../final/product-detail-html';
import { productDetailImages, type ProductResource } from '@/lib/product-metadata';
import { ProductResourceRow } from '../final/primitives';
import { productConversion } from '@/lib/product-conversion';
import { productDocument } from '@/lib/product-html-document';
import { ProductCtaLink, ProductPixel } from '../final/product-conversion';

export function LandingTracker({ config, children }: { config: LandingConfig; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if(ref.current) return startLandingTracking(ref.current,config); },[config]);
  return <div ref={ref} className="landing-campaign">{children}</div>;
}
export function CampaignFreeClass({ course, config, resources = [] }: { course: Row; config: LandingConfig; resources?: ProductResource[] }) {
  const meta = object(course,'metadata'), images = productDetailImages(meta).map(item => ({ ...item, path: safeUrl(item.path) })).filter(item => item.path), image = images[0]?.path || '';
  const detailHtml = typeof meta.detail_html === 'string' ? meta.detail_html : '';
  const documentSource = productDocument(meta);
  const conversion = productConversion(meta, config);
  const trackingConfig = useMemo(() => ({ ...config, pixel_enabled: false }), [config]);
  const cta = (position: string, full = false) => <ProductCtaLink conversion={conversion} courseId={course.id} position={position} tracked={config.enabled} conversionEvent="CompleteRegistration" className={'btn primary large ' + (full ? 'full' : '')} />;
  // The product integration owns Pixel events; internal landing analytics remain active.
  return <LandingTracker config={trackingConfig}>
    <ProductPixel courseId={course.id} pixelId={conversion.pixelId} />
    <div className="free-body"><div className="free-sheet">
      <section data-section="detail">{documentSource || detailHtml ? <ProductDetailHtml html={detailHtml} documentSource={documentSource} /> : image ? <div className="detail-image-stack">{images.map((item, index) => <img className="detail-image" src={item.path} alt={item.alt || `${t(course,'title')} 상세 안내 ${index + 1}`} loading="lazy" decoding="async" key={item.path + index} />)}</div> : <div className="panel-body"><Cover course={course}/><div className="reading-copy mt24">{t(course,'description') || t(course,'summary')}</div></div>}</section>
      {config.custom_sections && config.sections.map(s=><section className="campaign-section" data-section={s.id} key={s.id}>
        {s.title && <h2>{s.title}</h2>}{s.image && <img src={s.image} alt={s.title || ''} loading="lazy" decoding="async" />}{s.body && <div className="reading-copy">{s.body}</div>}
      </section>)}
      <section className="campaign-section" data-section="materials"><h2>{resources.length ? '무료 제공 자료' : '무료 라이브 참여 안내'}</h2><p>{resources.length ? '클래스와 함께 활용할 자료를 내려받아 사용하세요.' : '참여 링크와 강의 관련 안내는 카카오 오픈채팅방에서 확인해 주세요.'}</p>{resources.map(resource => <ProductResourceRow key={resource.id} resource={resource} courseId={course.id} />)}</section>
    </div></div>
    <aside className="bottom-cta campaign-sticky"><div className="wrap"><div><strong>무료 라이브</strong><p className="meta">{t(course,'title')}</p></div>{cta('sticky_cta')}</div></aside>
  </LandingTracker>;
}
