import { matchesPortfolioFile, portfolioFileSpec } from './files';
export type UploadedFile = { id: string; name: string; size: number; contentType: string; revision: number; ready: boolean; visibility: 'private' | 'cohort'; accessRevision: number };
/** Files picked in the demo composer wait here for the post's attachment list (browser memory only). */
export const demoUploads = new Map<string, { files: File[]; shared: boolean }>();
async function request(body: unknown) {
  const r = await fetch('/api/campus/community/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json(); if (!r.ok) throw Error(d.error); return d;
}
export async function checkPortfolioFile(file: File) {
  const spec = portfolioFileSpec(file.name, file.size);
  if (!matchesPortfolioFile(new Uint8Array(await file.arrayBuffer()), { size: spec.size, contentType: spec.contentType })) throw Error('파일 내용과 확장자가 맞지 않습니다.');
  return spec;
}
/** Reserve → send straight to storage → have the server verify. The file starts private. */
export async function uploadPortfolioFile(postId: string, revision: number, file: File): Promise<UploadedFile> {
  const spec = await checkPortfolioFile(file);
  const ready = await request({ action: 'prepare', postId, expectedRevision: revision, requestId: crypto.randomUUID(), name: spec.name, size: spec.size });
  if (ready.ready) return ready;
  const sent = await fetch(ready.signedUrl, { method: 'PUT', headers: { 'Content-Type': ready.contentType, 'x-upsert': 'false' }, body: file });
  if (!sent.ok) throw Error('파일 전송이 끝나지 않았습니다. 다시 선택해 주세요.');
  await request({ action: 'complete', fileId: ready.id });
  return { ...ready, ready: true };
}
export const sharePortfolioFile = (file: Pick<UploadedFile, 'id' | 'accessRevision'>, visibility: 'private' | 'cohort') =>
  request({ action: 'share', requestId: crypto.randomUUID(), fileId: file.id, expectedRevision: file.accessRevision, visibility, confirmed: visibility === 'cohort' });
