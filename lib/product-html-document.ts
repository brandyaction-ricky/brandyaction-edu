export const MAX_PRODUCT_DOCUMENT_LENGTH = 3_000_000;

/** Untrusted source. This must only be rendered in the script-disabled iframe below. */
export function validateProductDocument(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new Error('상세페이지 HTML 형식을 확인해 주세요.');
  if (value.length > MAX_PRODUCT_DOCUMENT_LENGTH) throw new Error('HTML 파일은 3MB 이하로 등록해 주세요.');
  return value.replace(/^\uFEFF/, '');
}

export function productDocument(metadata: Record<string, unknown>) {
  return typeof metadata.detail_html_document === 'string' ? metadata.detail_html_document : '';
}

/** CSP precedes ALL uploaded markup and cannot be relaxed by subsequent meta tags.
 * No allow-scripts, forms, popups, or top navigation may be added to the iframe.
 * CSS remains inside the frame; credentials and parent DOM are unavailable to scripts.
 */
export function buildProductDocument(source: string) {
  const policy = "default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:; media-src https:";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{height:auto;min-height:0}body{margin:0;min-height:0;display:flow-root}img{max-width:100%;height:auto}*,*::before,*::after{box-sizing:border-box}</style></head><body>${validateProductDocument(source)}</body></html>`;
}
