import type { OngoingReviewSelection } from './ongoing-lessons';
// Storage metadata is never an answer. Drafts keep only server-issued file IDs.
export const answerFileLimit = 10 * 1024 * 1024;
export const answerFileTypes: Record<string, { kind: 'image' | 'file'; mime: string }> = {
  png: { kind: 'image', mime: 'image/png' }, jpg: { kind: 'image', mime: 'image/jpeg' }, jpeg: { kind: 'image', mime: 'image/jpeg' }, webp: { kind: 'image', mime: 'image/webp' }, gif: { kind: 'image', mime: 'image/gif' },
  zip: { kind: 'file', mime: 'application/zip' }, rar: { kind: 'file', mime: 'application/vnd.rar' }, '7z': { kind: 'file', mime: 'application/x-7z-compressed' }, tar: { kind: 'file', mime: 'application/x-tar' }, gz: { kind: 'file', mime: 'application/gzip' }, tgz: { kind: 'file', mime: 'application/gzip' },
};
export type AnswerFileSpec = { name: string; size: number; kind: 'image' | 'file'; extension: string; contentType: string };
export function answerFileSpec(name: unknown, size: unknown, kind: unknown): AnswerFileSpec {
  if (typeof name !== 'string' || !name.trim() || name.length > 240 || /[\\/\u0000-\u001f\u007f]/.test(name)) throw new Error('파일 이름을 확인해 주세요.');
  const extension = name.split('.').pop()?.toLowerCase() || '', type = answerFileTypes[extension];
  if (!type || type.kind !== kind) throw new Error('이미지는 JPG·PNG·WEBP·GIF, 압축파일은 ZIP·RAR·7Z·TAR·GZ를 선택해 주세요.');
  if (!Number.isSafeInteger(size) || Number(size) < 1 || Number(size) > answerFileLimit) throw new Error('10MB 이하의 파일을 선택해 주세요.');
  return { name: name.normalize('NFC'), size: Number(size), kind: type.kind, extension, contentType: type.mime };
}
export function matchesAnswerFile(bytes: Uint8Array, spec: AnswerFileSpec): boolean {
  if (bytes.length !== spec.size || bytes.length > answerFileLimit) return false;
  const starts = (...expected: number[]) => expected.every((value, i) => bytes[i] === value);
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  switch (spec.extension) {
    case 'png': return starts(137, 80, 78, 71, 13, 10, 26, 10);
    case 'jpg': case 'jpeg': return starts(255, 216, 255);
    case 'webp': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'gif': return ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
    case 'zip': return starts(80, 75, 3, 4) || starts(80, 75, 5, 6) || starts(80, 75, 7, 8);
    case 'rar': return starts(82, 97, 114, 33, 26, 7, 0) || starts(82, 97, 114, 33, 26, 7, 1, 0);
    case '7z': return starts(55, 122, 188, 175, 39, 28);
    case 'tar': return ascii(257, 262) === 'ustar';
    case 'gz': case 'tgz': return starts(31, 139, 8);
    default: return false;
  }
}
export type AnswerFileContext = { ongoingReview?: OngoingReviewSelection; lessonId: string; enrollmentId: string; revision: string };
