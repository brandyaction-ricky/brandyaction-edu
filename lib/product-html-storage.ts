import type { createAdminClient } from './supabase/admin';
import { MAX_STORED_PRODUCT_DOCUMENT_BYTES, validProductDocumentPath, validateStoredProductDocument } from './product-html-document';
import { sanitizeProductHtml } from './product-metadata';
import { containsFreeClassCampaign } from './platform-rules';

export const PRODUCT_DOCUMENT_BUCKET = 'course-resources';
type Database = ReturnType<typeof createAdminClient>;

export async function checkProductDocumentFile(db: Database, path: string) {
  if (!validProductDocumentPath(path)) throw new Error('상세 HTML 저장 파일을 확인해 주세요.');
  const result = await db.storage.from(PRODUCT_DOCUMENT_BUCKET).info(path);
  const file = result.data;
  if (result.error || !file || file.contentType !== 'text/plain' || typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_STORED_PRODUCT_DOCUMENT_BYTES) {
    throw new Error('HTML 업로드가 완료되지 않았거나 파일이 20MB를 초과했습니다. 파일을 다시 선택해 주세요.');
  }
  return file.size;
}

/** The client only supplies a reference. Derive the fallback and sales checks from immutable stored bytes. */
export async function prepareStoredProductMetadata(db: Database, actorId: string, previous: Record<string, unknown>, values: Record<string, unknown>) {
  if (values.detail_html_file && values.detail_html_document) throw new Error('HTML 원본과 저장 파일 중 하나만 선택해 주세요.');
  const path = values.detail_html_file === undefined ? previous.detail_html_file : values.detail_html_file;
  if (!path || values.detail_html_document) return;
  if (!validProductDocumentPath(path)) throw new Error('상세 HTML 저장 파일을 확인해 주세요.');
  if (path === previous.detail_html_file) {
    // Unrelated saves cannot replace the server-derived fallback with caller-supplied content.
    values.detail_html = previous.detail_html || '';
    return;
  }
  if (!path.startsWith(`edu/product-html/${actorId}/`)) throw new Error('이 계정에서 업로드한 HTML 파일을 선택해 주세요.');
  const size = await checkProductDocumentFile(db, path);
  const result = await db.storage.from(PRODUCT_DOCUMENT_BUCKET).download(path);
  if (result.error || !result.data || result.data.size !== size) throw new Error('HTML 파일을 확인하지 못했습니다. 다시 저장해 주세요.');
  const source = validateStoredProductDocument(new TextDecoder('utf-8', { fatal: true }).decode(await result.data.arrayBuffer()));
  // Keep a small, safe fallback for older readers; never duplicate embedded images in course metadata.
  const text = source.replace(/<!--[^]*?-->/g, '').replace(/<(script|style|head)\b[^>]*>[^]*?<\/\1\s*>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100_000);
  if (!text && !/<(?:img|picture|svg|video)\b/i.test(source)) throw new Error('등록 가능한 HTML 본문이 없습니다. 파일 내용을 확인해 주세요.');
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  let fallback = sanitizeProductHtml(`<p>${escaped || '상품 상세페이지'}</p>`);
  // Preserve the existing paid/free campaign guard even when its URL occurred only in an attribute.
  if (containsFreeClassCampaign(source) && !containsFreeClassCampaign(fallback)) fallback += '<p>무료 강의 · open.kakao.com</p>';
  values.detail_html = fallback;
}
