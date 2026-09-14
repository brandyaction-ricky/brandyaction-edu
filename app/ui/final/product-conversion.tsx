'use client';
import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { pixel } from '@/lib/landing-browser';
import { ctaTextColor, PRODUCT_CTA_EVENT, productCtaPosition, type productConversion } from '@/lib/product-conversion';

type Conversion = ReturnType<typeof productConversion>;
// DEV, previews, and local QA must never send events to an advertiser's live pixel.
function livePixel() { return ['brandyaction-edu.com', 'www.brandyaction-edu.com'].includes(window.location.hostname); }

export function ProductPixel({ courseId, pixelId }: { courseId: string; pixelId: string }) {
  const sent = useRef('');
  useEffect(() => {
    const key = `${courseId}:${pixelId}`;
    if (!pixelId || !livePixel() || sent.current === key) return;
    pixel({ pixel_enabled: true, pixel_id: pixelId }, 'PageView', { content_ids: [courseId], content_type: 'product' });
    sent.current = key;
  }, [courseId, pixelId]);
  return null;
}

export function ProductConversionClickTracker({ courseId, pixelId }: { courseId: string; pixelId: string }) {
  useEffect(() => {
    const track = (position: string) => {
      if (!position || !pixelId || !livePixel()) return;
      pixel({ pixel_enabled: true, pixel_id: pixelId }, 'CompleteRegistration', { content_ids: [courseId], content_name: position.replace('_cta', '') }, crypto.randomUUID());
    };
    const click = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]');
      if (!link?.closest('.landing-campaign')) return;
      track(productCtaPosition(link.href, link.dataset.productCta));
    };
    const frameClick = (event: Event) => track(productCtaPosition((event as CustomEvent<{ href?: unknown }>).detail?.href));
    document.addEventListener('click', click);
    window.addEventListener(PRODUCT_CTA_EVENT, frameClick);
    return () => { document.removeEventListener('click', click); window.removeEventListener(PRODUCT_CTA_EVENT, frameClick); };
  }, [courseId, pixelId]);
  return null;
}

export function ProductCtaLink({ conversion, courseId, position, className = 'btn primary large', tracked = false, conversionEvent = 'Lead', delegated = false }: { conversion: Conversion; courseId: string; position: string; className?: string; tracked?: boolean; conversionEvent?: 'Lead' | 'CompleteRegistration'; delegated?: boolean }) {
  const onClick = delegated ? undefined : () => {
    if (conversion.pixelId && livePixel()) pixel({ pixel_enabled: true, pixel_id: conversion.pixelId }, conversionEvent, { content_ids: [courseId], content_name: position.replace('_cta', '') }, crypto.randomUUID());
  };
  return <a href={conversion.url} className={className} style={{ backgroundColor: conversion.color, borderColor: conversion.color, color: ctaTextColor(conversion.color) }} data-product-cta={position} data-landing-cta={tracked ? position : undefined} onClick={onClick}>{conversion.label}<ArrowRight /></a>;
}
