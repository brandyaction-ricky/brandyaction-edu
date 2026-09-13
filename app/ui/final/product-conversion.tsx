'use client';
import { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { pixel } from '@/lib/landing-browser';
import { ctaTextColor, type productConversion } from '@/lib/product-conversion';

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

export function ProductCtaLink({ conversion, courseId, position, className = 'btn primary large', tracked = false, conversionEvent = 'Lead' }: { conversion: Conversion; courseId: string; position: string; className?: string; tracked?: boolean; conversionEvent?: 'Lead' | 'CompleteRegistration' }) {
  return <a href={conversion.url} className={className} style={{ backgroundColor: conversion.color, borderColor: conversion.color, color: ctaTextColor(conversion.color) }} data-landing-cta={tracked ? position : undefined} onClick={() => {
    if (conversion.pixelId && livePixel()) pixel({ pixel_enabled: true, pixel_id: conversion.pixelId }, conversionEvent, { content_ids: [courseId], content_name: position.replace('_cta', '') }, crypto.randomUUID());
  }}>{conversion.label}<ArrowRight /></a>;
}
