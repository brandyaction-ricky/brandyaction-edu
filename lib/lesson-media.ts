import { ongoingReviewFileUrl, type OngoingReviewSelection } from './ongoing-lessons';
import { answerFileSpec, answerFileTypes, matchesAnswerFile } from './lesson-files';
export type LessonMediaKind = 'image' | 'audio' | 'video' | 'file';
export const lessonDownloadExtensions = ['pdf', 'zip', 'docx', 'xlsx', 'pptx', 'hwp', 'hwpx', 'txt', 'md', 'csv'] as const;
export const lessonMediaTypes: Record<string, { kind: LessonMediaKind; mime: string }> = {
  ...Object.fromEntries(Object.entries(answerFileTypes).filter(([, value]) => value.kind === 'image')) as Record<string, { kind: 'image'; mime: string }>,
  ...Object.fromEntries(lessonDownloadExtensions.map(ext => [ext, { kind: 'file' as const, mime: 'application/octet-stream' }])),
  mp3: { kind: 'audio', mime: 'audio/mpeg' }, wav: { kind: 'audio', mime: 'audio/wav' }, ogg: { kind: 'audio', mime: 'audio/ogg' }, m4a: { kind: 'audio', mime: 'audio/mp4' },
  mp4: { kind: 'video', mime: 'video/mp4' }, webm: { kind: 'video', mime: 'video/webm' }, mov: { kind: 'video', mime: 'video/quicktime' },
};
export type LessonMediaSpec = { name: string; size: number; kind: LessonMediaKind; extension: string; contentType: string };
export function lessonMediaSpec(name: unknown, size: unknown, kind: unknown): LessonMediaSpec {
  if (typeof name !== 'string' || !name.trim() || name.length > 240 || /[\\/\u0000-\u001f\u007f]/.test(name)) throw new Error('파일 이름을 확인해 주세요.');
  const extension = name.split('.').pop()?.toLowerCase() || '', type = lessonMediaTypes[extension];
  if (!type || type.kind !== kind) throw new Error(kind === 'file' ? 'PDF·ZIP·DOCX·XLSX·PPTX·HWP·HWPX·TXT·MD·CSV 파일을 선택해 주세요.' : '이미지는 JPG·PNG·WEBP·GIF, 음성은 MP3·WAV·OGG·M4A, 영상은 MP4·WEBM·MOV를 선택해 주세요.');
  const max = kind === 'image' ? 10 : 50;
  if (!Number.isSafeInteger(size) || Number(size) < 1 || Number(size) > max * 1024 * 1024) throw new Error(`${max}MB 이하의 파일을 선택해 주세요.`);
  return { name: name.normalize('NFC'), size: Number(size), kind: type.kind, extension, contentType: type.mime };
}
export function matchesLessonMedia(bytes: Uint8Array, spec: LessonMediaSpec) {
  if (bytes.length !== spec.size || bytes.length > 50 * 1024 * 1024) return false;
  if (spec.kind === 'image') return matchesAnswerFile(bytes, answerFileSpec(spec.name, spec.size, 'image'));
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (spec.kind === 'file') {
    // Files are downloaded as attachments, never rendered as HTML. Do not unzip
    // archives on the server; validate their container without decompression.
    if (spec.extension === 'pdf') return ascii(0, 5) === '%PDF-';
    if (['zip', 'docx', 'xlsx', 'pptx', 'hwpx'].includes(spec.extension)) return bytes[0] === 80 && bytes[1] === 75 && ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6) || (bytes[2] === 7 && bytes[3] === 8));
    if (spec.extension === 'hwp') return [208, 207, 17, 224, 161, 177, 26, 225].every((v, i) => bytes[i] === v);
    if (['txt', 'md', 'csv'].includes(spec.extension)) {
      try { const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); return !text.includes('\0'); } catch { return false; }
    }
    return false;
  }
  switch (spec.extension) {
    case 'mp3': return ascii(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224 && (bytes[1] & 6) !== 0);
    case 'wav': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
    case 'ogg': return ascii(0, 4) === 'OggS';
    case 'mp4': case 'm4a': case 'mov': return bytes.length >= 16 && ascii(4, 8) === 'ftyp';
    case 'webm': return bytes.length >= 16 && bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163 && ascii(4, Math.min(bytes.length, 256)).includes('webm');
    default: return false;
  }
}
export type LessonMediaContext = { ongoingReview?: OngoingReviewSelection; lessonId: string; enrollmentId: string; revision: string };
// Stable same-origin endpoint; signed Storage URLs never enter lesson JSON.
export function lessonMediaUrl(assetId: string, context?: LessonMediaContext, submissionId?: string) {
  if (context?.ongoingReview) return ongoingReviewFileUrl(context.lessonId, context.enrollmentId, context.ongoingReview, assetId, 'content');
  const params = new URLSearchParams({ asset: assetId });
  if (submissionId) params.set('submission', submissionId);
  else if (context) { params.set('lesson', context.lessonId); params.set('enrollment', context.enrollmentId); params.set('revision', context.revision); }
  return '/api/platform/lesson-media?' + params;
}
