import { safeUrl } from './platform';
import { conversionUrl } from './product-conversion';
import { validateProductDocument } from './product-html-document';

function validProductImage(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 2048 || value.includes('..')) return false;
  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return !url.username && !url.password;
    } catch { return false; }
  }
  return /^(?:\/?(?:edu|site|images|assets|courses)\/)[a-z0-9/_\-.]+\.(?:png|jpe?g|webp|gif|avif)(?:\?[^#]*)?$/i.test(value);
}

export const productMetadataFields = ['thumbnail_url', 'detail_image_url', 'detail_images', 'regular_price', 'seo_title', 'seo_description', 'detail_html', 'detail_html_document', 'cta_label', 'cta_url', 'cta_color', 'meta_pixel_id'] as const;
export type ProductDetailImage = { path: string; name: string; alt: string };
export const productResourceScopes = ['public', 'authenticated', 'enrolled', 'purchaser'] as const;
export type ProductResourceScope = (typeof productResourceScopes)[number];
export type ProductResource = { id: string; name: string; path: string; scope: ProductResourceScope };

const validProductResourcePath = (value: unknown) => typeof value === 'string' && /^edu\/[a-z0-9-]+\.[a-z0-9]{1,12}$/i.test(value) && !value.includes('..');
export function productResources(metadata: Record<string, unknown>): ProductResource[] {
  if (!Array.isArray(metadata.product_resources)) return [];
  return metadata.product_resources.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const id = String(item.id || ''), name = String(item.name || '').trim().slice(0, 240);
    const scope = String(item.scope || 'public') as ProductResourceScope;
    const path = validProductResourcePath(item.path) ? String(item.path) : '';
    if (!/^[0-9a-f-]{36}$/i.test(id) || !name || !productResourceScopes.includes(scope)) return [];
    return [{ id, name, path, scope }];
  }).slice(0, 30);
}

export function mergeProductResources(previous: unknown, next: ProductResource[]) {
  const metadata: Record<string, unknown> = previous && typeof previous === 'object' && !Array.isArray(previous) ? { ...previous } : {};
  if (next.length > 30) throw new Error('제공 자료는 최대 30개까지 등록할 수 있습니다.');
  metadata.product_resources = next.map((item) => {
    if (!/^[0-9a-f-]{36}$/i.test(item.id) || !item.name.trim() || item.name.length > 240 || !validProductResourcePath(item.path) || !productResourceScopes.includes(item.scope)) throw new Error('제공 자료 정보를 확인해 주세요.');
    return { id: item.id, name: item.name.trim(), path: item.path, scope: item.scope };
  });
  return metadata;
}

export function productDetailImages(metadata: Record<string, unknown>): ProductDetailImage[] {
  const stored = Array.isArray(metadata.detail_images) ? metadata.detail_images : [];
  const images = stored.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>, path = String(item.path || item.url || '').trim();
    if (!validProductImage(path)) return [];
    return [{ path, name: String(item.name || `상세 이미지 ${index + 1}`).slice(0, 240), alt: String(item.alt || '').slice(0, 500) }];
  });
  if (images.length) return images.slice(0, 30);
  const legacy = String(metadata.detail_image_url || metadata.detailImageUrl || '').trim();
  return validProductImage(legacy) ? [{ path: legacy, name: '기존 상세 이미지', alt: '' }] : [];
}
export type ProductHtmlNode = string | { tag: string; attrs: Record<string, string>; children: ProductHtmlNode[] };
const MAX_PRODUCT_HTML_LENGTH = 3_000_000;
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
  const tokens = value.slice(0, MAX_PRODUCT_HTML_LENGTH).match(/<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+|</gi) || [];
  for (const token of tokens.slice(0, 100000)) {
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
  if (value.length > MAX_PRODUCT_HTML_LENGTH) throw new Error('HTML 파일이 너무 큽니다. 이미지 파일은 상세 이미지 영역에 별도로 등록해 주세요.');
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
    } else if (field === 'detail_images') {
      if (!Array.isArray(value) || value.length > 30) throw new Error('상세 이미지는 최대 30장까지 등록할 수 있습니다.');
      const images = value.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${index + 1}번째 상세 이미지 정보를 확인해 주세요.`);
        const item = entry as Record<string, unknown>, path = String(item.path || '').trim();
        if (!validProductImage(path)) throw new Error(`${index + 1}번째 상세 이미지 주소를 확인해 주세요.`);
        return { path, name: String(item.name || `상세 이미지 ${index + 1}`).slice(0, 240), alt: String(item.alt || '').slice(0, 500) };
      });
      metadata.detail_images = images;
      metadata.detail_image_url = images[0]?.path || '';
      delete metadata.detailImageUrl;
    } else if (field === 'detail_html_document') {
      const source = validateProductDocument(value);
      metadata.detail_html_document = source;
      // Keep the legacy text-only fallback safe for older clients and search previews.
      metadata.detail_html = sanitizeProductHtml(source);
    } else if (field === 'cta_label' || field === 'cta_url' || field === 'cta_color' || field === 'meta_pixel_id') {
      if (value !== null && typeof value !== 'string') throw new Error('CTA·추적 설정 형식을 확인해 주세요.');
      const content = String(value || '').trim();
      if (field === 'cta_label' && content.length > 100) throw new Error('버튼 문구는 100자 이하로 입력해 주세요.');
      if (field === 'cta_url' && content && !conversionUrl(content)) throw new Error('이동 주소는 https 주소 또는 사이트 내 경로로 입력해 주세요.');
      if (field === 'cta_color' && content && !/^#[0-9a-f]{6}$/i.test(content)) throw new Error('버튼 색상은 #을 포함한 6자리 HEX 코드로 입력해 주세요.');
      if (field === 'meta_pixel_id' && content && !/^\d{5,30}$/.test(content)) throw new Error('Meta Pixel ID는 5~30자리 숫자로 입력해 주세요.');
      metadata[field] = field === 'cta_url' ? conversionUrl(content) : content;
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
