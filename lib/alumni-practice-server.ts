import 'server-only';
import type { LessonBlockAnswers } from './lesson-blocks';

export type AlumniPractice = { enabled: boolean; draft: { values: LessonBlockAnswers; writeId: string; updatedAt: string } | null };
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

export async function readAlumniPractice(db: RpcClient, actor: string, lesson: string, enrollment: string, revision: string): Promise<AlumniPractice> {
  const { data, error } = await db.rpc('edu_read_alumni_practice', { p_actor: actor, p_lesson: lesson, p_enrollment: enrollment, p_revision: revision });
  if (error) throw error;
  return data as AlumniPractice;
}
