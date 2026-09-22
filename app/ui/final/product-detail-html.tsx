'use client';
import { createElement, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { parseProductHtml, PRODUCT_APPLICATION_MARKERS, type ProductHtmlNode } from '@/lib/product-metadata';
import { buildProductDocument } from '@/lib/product-html-document';
import { conversionUrl, PRODUCT_CTA_EVENT } from '@/lib/product-conversion';
import { isProductApplicationLink, type ProductApplicationCta } from '@/lib/product-application-cta';

function ProductDocumentFrame({ source, applicationCta }: { source: string; applicationCta?: ProductApplicationCta }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => buildProductDocument(source), [source]);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let detach = () => {};
    const attach = () => {
      detach();
      const doc = frame.contentDocument;
      if (!doc?.body || frame.contentWindow?.location.href !== 'about:srcdoc') return;
      if (applicationCta) {
        doc.querySelectorAll<HTMLAnchorElement>('a').forEach(link => {
          const application = link.dataset.eduApplication === 'true' || isProductApplicationLink(link.getAttribute('href') || '', link.textContent || '', PRODUCT_APPLICATION_MARKERS.some(marker => link.hasAttribute(marker)), applicationCta.conversionUrl);
          if (!application) return;
          link.dataset.eduApplication = 'true';
          link.removeAttribute('data-product-cta');
          link.removeAttribute('data-landing-cta');
          link.removeAttribute('target');
          link.setAttribute('aria-label', applicationCta.label);
          // Replace only text nodes, retaining the uploaded layout, icons and styles.
          const walker = doc.createTreeWalker(link, NodeFilter.SHOW_TEXT);
          let node: Node | null, first = true;
          while ((node = walker.nextNode())) {
            if (!/[\p{L}\p{N}]/u.test(node.textContent || '')) continue;
            node.textContent = first ? applicationCta.label : '';
            first = false;
          }
          if (first) link.append(doc.createTextNode(applicationCta.label));
          if (applicationCta.disabled) {
            link.removeAttribute('href');
            link.setAttribute('role', 'link');
            link.setAttribute('aria-disabled', 'true');
            link.tabIndex = -1;
            link.style.setProperty('opacity', '0.55', 'important');
            link.style.setProperty('cursor', 'not-allowed', 'important');
          } else {
            link.setAttribute('href', applicationCta.href);
            link.removeAttribute('aria-disabled');
            link.removeAttribute('tabindex');
            link.style.removeProperty('opacity');
            link.style.removeProperty('cursor');
          }
        });
      }
      frame.style.visibility = 'visible';
      let raf = 0;
      const resize = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          // Measure body rather than the viewport-sized root to permit shrinking too.
          const height = Math.ceil(Math.max(doc.body.scrollHeight, doc.body.getBoundingClientRect().height));
          // Do not add padding here: body min-height:100vh would grow on every observation.
          frame.style.height = `${Math.max(120, Math.min(200000, height))}px`;
        });
      };
      const click = (event: MouseEvent) => {
        const link = (event.target as Element)?.closest?.('a');
        if (!link) return;
        event.preventDefault();
        if (link.getAttribute('aria-disabled') === 'true') { event.stopImmediatePropagation(); return; }
        const href = link.getAttribute('href') || '';
        if (href.startsWith('#')) {
          try {
            const target = doc.getElementById(decodeURIComponent(href.slice(1)));
            if (target) window.scrollTo({ top: window.scrollY + frame.getBoundingClientRect().top + target.getBoundingClientRect().top, behavior: 'smooth' });
          } catch {}
        } else {
          const url = conversionUrl(href);
          if (url) {
            if (link.dataset.eduApplication === 'true' && !applicationCta?.enrolled) window.dispatchEvent(new CustomEvent(PRODUCT_CTA_EVENT, { detail: { href: url } }));
            if (url.startsWith('/')) window.location.assign(url);
            else window.open(url, '_blank', 'noopener,noreferrer');
          }
        }
      };
      const observer = new ResizeObserver(resize);
      observer.observe(doc.body);
      doc.addEventListener('load', resize, true);
      doc.addEventListener('click', click, true);
      resize();
      detach = () => { cancelAnimationFrame(raf); observer.disconnect(); doc.removeEventListener('load', resize, true); doc.removeEventListener('click', click, true); };
    };
    frame.addEventListener('load', attach);
    attach();
    return () => { frame.removeEventListener('load', attach); detach(); };
  }, [srcDoc, applicationCta]);
  return <iframe ref={ref} title="상품 HTML 상세페이지" sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={srcDoc} style={{ display: 'block', visibility: applicationCta ? 'hidden' : 'visible', width: '100%', height: 640, border: 0 }} />;
}

export function ProductDetailHtml({ html, documentSource = '', className = 'product-detail-html reading-copy', applicationCta }: { html: string; documentSource?: string; className?: string; applicationCta?: ProductApplicationCta }) {
  if (documentSource) return <div className={className}><ProductDocumentFrame source={documentSource} applicationCta={applicationCta} /></div>;
  const text = (nodes: ProductHtmlNode[]): string => nodes.map(node => typeof node === 'string' ? node : text(node.children)).join('');
  function render(nodes: ProductHtmlNode[], replacement?: { label: string; placed: boolean }): ReactNode[] {
    return nodes.map((node, index) => {
      if (typeof node === 'string') {
        if (!replacement || !/[\p{L}\p{N}]/u.test(node)) return node;
        const value = replacement.placed ? '' : replacement.label;
        replacement.placed = true;
        return value;
      }
      const props: Record<string, unknown> = { key: index };
      for (const [key, value] of Object.entries(node.attrs)) props[key === 'colspan' ? 'colSpan' : key === 'rowspan' ? 'rowSpan' : key] = value;
      if (node.tag === 'a') props.rel = 'noopener noreferrer';
      if (node.tag === 'img') { props.loading = 'lazy'; props.alt ||= ''; }
      if (node.tag === 'a' && applicationCta && isProductApplicationLink(node.attrs.href || '', text(node.children), PRODUCT_APPLICATION_MARKERS.some(marker => Object.hasOwn(node.attrs, marker)), applicationCta.conversionUrl)) {
        props.href = applicationCta.disabled ? undefined : applicationCta.href;
        props['aria-label'] = applicationCta.label;
        if (applicationCta.disabled || applicationCta.enrolled) for (const marker of PRODUCT_APPLICATION_MARKERS) delete props[marker];
        props['aria-disabled'] = applicationCta.disabled || undefined;
        props.role = applicationCta.disabled ? 'link' : undefined;
        props.tabIndex = applicationCta.disabled ? -1 : undefined;
        props.style = applicationCta.disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined;
        props.onClick = applicationCta.disabled ? (event: React.MouseEvent) => { event.preventDefault(); event.stopPropagation(); } : undefined;
        const replacement = { label: applicationCta.label, placed: false };
        const children = render(node.children, replacement);
        if (!replacement.placed) children.push(applicationCta.label);
        return createElement(node.tag, props, ...children);
      }
      return createElement(node.tag, props, ...render(node.children, replacement));
    });
  }
  return <div className={className}>{render(parseProductHtml(html))}</div>;
}
