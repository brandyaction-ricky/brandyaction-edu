import { lessonMediaSpec, type LessonMediaKind } from './lesson-media';

async function send(body: object) {
  const response = await fetch('/api/platform/lesson-media', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '파일을 올리지 못했습니다.');
  return result as { id: string; ready?: boolean; signedUrl?: string; contentType?: string };
}

// File picker and positioned drops share the same private, idempotent upload.
// Callers retain requestId when retrying. Completion validates stored bytes.
export async function uploadLessonMedia(file: File, kind: LessonMediaKind, courseId: string, requestId: string) {
  const spec = lessonMediaSpec(file.name, file.size, kind);
  const prepared = await send({ action: 'prepare', courseId, requestId, ...spec });
  if (!prepared.ready) {
    try { await fetch(prepared.signedUrl!, { method: 'PUT', credentials: 'omit', headers: { 'Content-Type': prepared.contentType!, 'x-upsert': 'false' }, body: file }); } catch { /* A lost response may still mean the upload succeeded. */ }
    await send({ action: 'complete', assetId: prepared.id });
  }
  return prepared.id;
}
