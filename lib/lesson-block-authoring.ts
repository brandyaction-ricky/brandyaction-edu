import { validateLessonBlocks, type LessonBlockDocument } from './lesson-blocks';

export type LessonDocumentWrite = { action: 'document'; lessonId: string; expectedRevision: string | null; requestId: string; document: LessonBlockDocument };
export type LessonWriterCheckpoint = { revision: string | null; committed: LessonBlockDocument | null; pending: LessonDocumentWrite | null };
// A lost response must be retried with the original document and request id
// before sending any subsequent edits. Never adopt another author's revision.
export class LessonDocumentWriter {
  private pending: LessonDocumentWrite | null = null;
  private busy = false;
  private conflicted = false;
  private committed: string;
  constructor(private revision: string | null, document: LessonBlockDocument | null, private write: (request: LessonDocumentWrite) => Promise<{ revision: string }>) {
    this.committed = JSON.stringify(document);
  }
  checkpoint(): LessonWriterCheckpoint {
    return structuredClone({ revision: this.revision, committed: JSON.parse(this.committed), pending: this.pending });
  }
  restore(checkpoint: LessonWriterCheckpoint, lessonId: string) {
    if (this.busy || this.conflicted) throw new Error('저장 결과를 확인한 뒤 임시저장본을 불러와 주세요.');
    if (checkpoint.pending && checkpoint.pending.lessonId !== lessonId) throw new Error('다른 학습의 저장 요청입니다.');
    const sameBase = this.revision === checkpoint.revision && this.committed === JSON.stringify(checkpoint.committed);
    const acknowledged = checkpoint.pending && this.revision === checkpoint.pending.requestId && this.committed === JSON.stringify(checkpoint.pending.document);
    if (!sameBase && !acknowledged) throw new Error('서버에 더 새로운 학습 내용이 있습니다. 임시저장본을 내려받아 비교해 주세요.');
    // If the previous POST committed but its response was lost, the fresh GET
    // is the acknowledgment. Otherwise replay that exact write on next save.
    if (sameBase) this.pending = structuredClone(checkpoint.pending);
  }
  async save(lessonId: string, input: LessonBlockDocument) {
    if (this.busy) throw new Error('학습 내용을 저장하고 있습니다.');
    if (this.conflicted) throw Object.assign(new Error('다른 화면에서 학습을 수정했습니다. 현재 내용을 보관한 뒤 다시 열어 주세요.'), { status: 409 });
    const document = validateLessonBlocks(input), target = JSON.stringify(document);
    this.busy = true;
    try {
      while (this.pending || this.committed !== target) {
        this.pending ??= { action: 'document', lessonId, expectedRevision: this.revision, requestId: crypto.randomUUID(), document: structuredClone(document) };
        if (this.pending.lessonId !== lessonId) throw new Error('다른 학습의 저장 요청이 남아 있습니다.');
        const result = await this.write(structuredClone(this.pending));
        if (result.revision !== this.pending.requestId) throw new Error('저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
        this.revision = result.revision; this.committed = JSON.stringify(this.pending.document); this.pending = null;
      }
      return this.revision;
    } catch (error) {
      if ((error as { status?: number }).status === 409) this.conflicted = true;
      throw error;
    } finally { this.busy = false; }
  }
}
