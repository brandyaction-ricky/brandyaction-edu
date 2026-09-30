import type { LessonBlockAnswers } from './lesson-blocks';

export type DraftWrite = { requestId: string; expectedWriteId: string | null; values: LessonBlockAnswers };
export type AutosaveState = { phase: 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'; message: string; updatedAt: string | null };
type SaveDraft = (write: DraftWrite) => Promise<{ writeId: string; updatedAt: string }>;

// One in-flight request per mounted lesson. A failed request retains its UUID
// for idempotent retry; edits typed during that request form the next snapshot.
// A 409 never silently adopts the remote write token and overwrites another tab.
export class LessonBlockAutosave {
  private values: LessonBlockAnswers;
  private committed: string;
  private writeId: string | null;
  private pending: DraftWrite | null = null;
  private active = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private settled = new Set<() => void>();
  private state: AutosaveState = { phase: 'saved', message: '', updatedAt: null };
  constructor(initial: LessonBlockAnswers, writeId: string | null, private save: SaveDraft, private delay = 700) {
    this.values = structuredClone(initial); this.committed = JSON.stringify(initial); this.writeId = writeId;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getValues = () => structuredClone(this.values);
  hasUnsaved = () => this.active || this.pending !== null || JSON.stringify(this.values) !== this.committed;
  private publish(phase: AutosaveState['phase'], message = '', updatedAt = this.state.updatedAt) {
    this.state = { phase, message, updatedAt }; for (const listener of this.listeners) listener();
  }
  change(values: LessonBlockAnswers) {
    if (this.disposed) return;
    this.values = structuredClone(values);
    if (this.active || this.state.phase === 'conflict' || this.state.phase === 'error') return;
    clearTimeout(this.timer);
    this.publish(JSON.stringify(this.values) === this.committed ? 'saved' : 'dirty');
    if (this.hasUnsaved()) this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }
  async flush() {
    if (this.disposed || this.active || this.state.phase === 'conflict') return;
    clearTimeout(this.timer);
    if (!this.hasUnsaved()) return;
    this.pending ??= { requestId: crypto.randomUUID(), expectedWriteId: this.writeId, values: structuredClone(this.values) };
    const write = this.pending;
    this.active = true; this.publish('saving');
    try {
      // Consumer cannot mutate the pending retry payload.
      const saved = await this.save(structuredClone(write));
      if (this.disposed) return;
      if (saved.writeId !== write.requestId) throw new Error('저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
      this.writeId = saved.writeId; this.committed = JSON.stringify(write.values); this.pending = null;
      const dirty = JSON.stringify(this.values) !== this.committed;
      this.publish(dirty ? 'dirty' : 'saved', '', saved.updatedAt);
      if (dirty) this.timer = setTimeout(() => { void this.flush(); }, this.delay);
    } catch (error) {
      if (this.disposed) return;
      const failure = error as { status?: number; message?: string };
      this.publish(failure.status === 409 ? 'conflict' : 'error', failure.message || '답변을 저장하지 못했습니다. 입력 내용은 이 화면에 남아 있습니다.');
    } finally { this.active = false; for (const resolve of this.settled) resolve(); this.settled.clear(); }
  }
  async finish(): Promise<string> {
    if (this.disposed || this.state.phase === 'conflict') throw new Error('저장된 답변을 다시 확인해 주세요.');
    do {
      if (this.active) await new Promise<void>(resolve => this.settled.add(resolve));
      else {
        // Content-only lessons also need an acknowledged empty draft snapshot.
        if (!this.writeId && !this.pending) this.pending = { requestId: crypto.randomUUID(), expectedWriteId: null, values: structuredClone(this.values) };
        await this.flush();
      }
      const phase = this.getSnapshot().phase;
      if (this.disposed || phase === 'error' || phase === 'conflict') throw new Error(this.state.message || '답변을 저장한 뒤 다시 제출해 주세요.');
    } while (this.hasUnsaved());
    return this.writeId!;
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); this.listeners.clear(); for (const resolve of this.settled) resolve(); this.settled.clear(); }
}
