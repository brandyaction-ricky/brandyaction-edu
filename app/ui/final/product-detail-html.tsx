'use client';
import { createElement, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { parseProductHtml, type ProductHtmlNode } from '@/lib/product-metadata';
import { buildProductDocument } from '@/lib/product-html-document';
import { conversionUrl } from '@/lib/product-conversion';

function ProductDocumentFrame({ source }: { source: string }) {
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
        const href = link.getAttribute('href') || '';
        if (href.startsWith('#')) {
          try {
            const target = doc.getElementById(decodeURIComponent(href.slice(1)));
            if (target) window.scrollTo({ top: window.scrollY + frame.getBoundingClientRect().top + target.getBoundingClientRect().top, behavior: 'smooth' });
          } catch {}
        } else {
          const url = conversionUrl(href);
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
        }
      };
      const observer = new ResizeObserver(resize);
      observer.observe(doc.body);
      doc.addEventListener('load', resize, true);
      doc.addEventListener('click', click);
      resize();
      detach = () => { cancelAnimationFrame(raf); observer.disconnect(); doc.removeEventListener('load', resize, true); doc.removeEventListener('click', click); };
    };
    frame.addEventListener('load', attach);
    attach();
    return () => { frame.removeEventListener('load', attach); detach(); };
  }, [srcDoc]);
  return <iframe ref={ref} title="상품 HTML 상세페이지" sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={srcDoc} style={{ display: 'block', width: '100%', height: 640, border: 0 }} />;
}

export function ProductDetailHtml({ html, documentSource = '', className = 'product-detail-html reading-copy' }: { html: string; documentSource?: string; className?: string }) {
  if (documentSource) return <div className={className}><ProductDocumentFrame source={documentSource} /></div>;
  function render(nodes: ProductHtmlNode[]): ReactNode[] {
    return nodes.map((node, index) => {
      if (typeof node === 'string') return node;
      const props: Record<string, unknown> = { key: index };
      for (const [key, value] of Object.entries(node.attrs)) props[key === 'colspan' ? 'colSpan' : key === 'rowspan' ? 'rowSpan' : key] = value;
      if (node.tag === 'a') props.rel = 'noopener noreferrer';
      if (node.tag === 'img') { props.loading = 'lazy'; props.alt ||= ''; }
      return createElement(node.tag, props, ...render(node.children));
    });
  }
  return <div className={className}>{render(parseProductHtml(html))}</div>;
}
