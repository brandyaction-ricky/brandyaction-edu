import { createHash } from 'node:crypto';
import type { createAdminClient } from './supabase/admin';
import { answerFileSpec, matchesAnswerFile } from './lesson-files';
import { questionVisionImage } from './question-ai-context';

// Accept an immutable, verified upload owned by this learner and this lesson.
// Never accept a client URL or client-provided image bytes for provider fetching.
export async function studentCurriculumImage(db: ReturnType<typeof createAdminClient>, actor: string, enrollmentId: string, lessonId: string, imageId: string) {
 const fail = (message: string, status = 409): never => { throw Object.assign(new Error(message), {expose:true,status}); };
 const result = await db.rpc('edu_owned_question_image', {p_actor:actor,p_image:imageId});
 if (result.error) fail('첨부 이미지의 이용 권한을 확인해 주세요.',403);
 const file = result.data;
 if (!file || file.id !== imageId || file.owner_id !== actor || file.enrollment_id !== enrollmentId || file.lesson_id !== lessonId || !file.ready_at || !file.sha256) fail('현재 수업에 첨부한 이미지가 아닙니다. 다시 첨부해 주세요.');
 const spec = answerFileSpec(file.name,file.size,'image');
 const downloaded = await db.storage.from('question-images').download(file.path);
 if (downloaded.error || !downloaded.data || downloaded.data.size !== spec.size) fail('첨부 이미지를 불러오지 못했어요. 다시 시도해 주세요.',503);
 const bytes = new Uint8Array(await downloaded.data!.arrayBuffer());
 if (!matchesAnswerFile(bytes,spec) || createHash('sha256').update(bytes).digest('hex') !== file.sha256) fail('첨부 이미지가 원본과 다릅니다. 다시 첨부해 주세요.');
 try { return (await questionVisionImage(bytes)).url; }
 catch { fail('첨부 이미지를 읽지 못했어요. 파일 또는 해상도를 확인해 주세요.',422); }
}
