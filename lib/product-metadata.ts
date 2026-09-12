import { safeUrl } from './platform';

export const productMetadataFields = ['thumbnail_url', 'detail_image_url', 'regular_price', 'seo_title', 'seo_description', 'detail_html'] as const;
export type ProductHtmlNode = string | { tag: string; attrs: Record<string, string>; children: ProductHtmlNode[] };
const allowed = new Set('h1 h2 h3 h4 h5 h6 p div section article span strong b em i u s small blockquote pre code ul ol li dl dt dd figure figcaption a img br hr table thead tbody tfoot tr th td'.split(' '));
const discarded = new Set('head script style iframe object embed svg math template form button input textarea select option video audio canvas noscript'.split(' '));
const voidTags = new Set(['img', 'br', 'hr']);
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', mdash: '—', ndash: '–', hellip: '…' };
const decode = (value: string) => value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, key: string) => {
  if (key[0] !== '#') return entities[key.toLowerCase()] ?? entity;
  const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
  return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd';
});
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** A deliberately small HTML vocabulary. Rendering uses React nodes, never raw HTML. */
export function parseProductHtml(value: string): ProductHtmlNode[] {
  const roots: ProductHtmlNode[] = [];
  const stack: { tag: string; children: ProductHtmlNode[] }[] = [{ tag: '', children: roots }];
  const blocked: string[] = [];
  // Quoted attributes can contain >. No raw token is ever forwarded to the browser.
  const tokens = value.slice(0, 200000).match(/<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+|</gi) || [];
  for (const token of tokens.slice(0, 10000)) {
    if (token.startsWith('<!')) continue;
    const tagMatch = /^<(\/)?([a-z][\w:-]*)\b([\s\S]*?)>$/i.exec(token);
    if (!tagMatch) { if (!blocked.length) stack.at(-1)!.children.push(decode(token)); continue; }
    const [, closing, rawTag, attributes] = tagMatch;
    const tag = rawTag.toLowerCase();
    if (blocked.length) {
      if (closing && tag === blocked.at(-1)) blocked.pop();
      else if (!closing && discarded.has(tag) && !/\/\s*$/.test(attributes) && !['input', 'embed'].includes(tag)) blocked.push(tag);
      continue;
    }
    if (discarded.has(tag)) {
      if (!closing && !/\/\s*$/.test(attributes) && !['input', 'embed'].includes(tag)) blocked.push(tag);
      continue;
    }
    if (!allowed.has(tag)) continue;
    if (closing) {
      const index = stack.findLastIndex(node => node.tag === tag);
      if (index > 0) stack.length = index;
      continue;
    }
    const attrs: Record<string, string> = {};
    const attrPattern = /([^\s=<>/'"]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    for (const attr of attributes.matchAll(attrPattern)) {
      const name = attr[1].toLowerCase(), content = decode(attr[2] ?? attr[3] ?? attr[4] ?? '').trim();
      if ((tag === 'a' && name === 'href') || (tag === 'img' && name === 'src')) { const url = safeUrl(content); if (url) attrs[name] = url; }
      if (name === 'title' || (tag === 'img' && name === 'alt')) attrs[name] = content.slice(0, 500);
      if ((tag === 'img' && ['width', 'height'].includes(name)) || (['td', 'th'].includes(tag) && ['colspan', 'rowspan'].includes(name)) || (tag === 'ol' && name === 'start')) {
        if (/^\d{1,4}$/.test(content) && Number(content) > 0) attrs[name] = content;
      }
    }
    if (tag === 'img' && !attrs.src) continue;
    const node = { tag, attrs, children: [] as ProductHtmlNode[] };
    stack.at(-1)!.children.push(node);
    if (!voidTags.has(tag) && !/\/\s*$/.test(attributes) && stack.length < 40) stack.push(node);
  }
  return roots;
}

export function sanitizeProductHtml(value: string) {
  if (value.length > 200000) throw new Error('상세페이지 HTML은 200,000자 이하로 입력해 주세요.');
  const serialize = (nodes: ProductHtmlNode[]): string => nodes.map(node => {
    if (typeof node === 'string') return escape(node);
    const attrs = Object.entries(node.attrs).map(([key, content]) => ` ${key}="${escape(content)}"`).join('');
    return `<${node.tag}${attrs}>` + (voidTags.has(node.tag) ? '' : serialize(node.children) + `</${node.tag}>`);
  }).join('');
  return serialize(parseProductHtml(value));
}

export function mergeProductMetadata(previous: unknown, values: Record<string, unknown>) {
  const metadata: Record<string, unknown> = previous && typeof previous === 'object' && !Array.isArray(previous) ? { ...previous } : {};
  for (const field of productMetadataFields) {
    if (!(field in values)) continue;
    const value = values[field];
    if (field === 'regular_price') {
      if (value !== null && value !== '' && (!Number.isSafeInteger(Number(value)) || Number(value) < 0)) throw new Error('정가는 0원 이상의 정수로 입력해 주세요.');
      metadata[field] = value === null || value === '' ? null : Number(value);
    } else if (field === 'detail_html') {
      if (value !== null && typeof value !== 'string') throw new Error('상세페이지 HTML 형식을 확인해 주세요.');
      metadata[field] = sanitizeProductHtml(value || '');
    } else if (field === 'seo_title' || field === 'seo_description') {
      if (value !== null && typeof value !== 'string') throw new Error('검색 정보를 확인해 주세요.');
      const content = String(value || '').trim(), maximum = field === 'seo_title' ? 200 : 500;
      if (content.length > maximum) throw new Error(`검색 ${field === 'seo_title' ? '제목' : '설명'}은 ${maximum}자 이하로 입력해 주세요.`);
      metadata[field] = content;
    } else {
      metadata[field] = value;
      delete metadata[field === 'thumbnail_url' ? 'thumbnailUrl' : 'detailImageUrl'];
    }
  }
  return metadata;
}
