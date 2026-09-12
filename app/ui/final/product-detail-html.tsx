import { createElement, type ReactNode } from 'react';
import { parseProductHtml, type ProductHtmlNode } from '@/lib/product-metadata';

export function ProductDetailHtml({ html, className = 'product-detail-html reading-copy' }: { html: string; className?: string }) {
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
