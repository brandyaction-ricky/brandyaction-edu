import type { DiagnosisAnswer } from './diagnosis-session';

type Receipt = { revision: number };
type Write = { revision: number; answers: DiagnosisAnswer[]; version: number };
/** Serialize snapshots and replay an unacknowledged write before newer edits.
 * This preserves edits made during a slow request and recovers a lost save reply. */
export function createDiagnosisAutosave({ revision, save, onState }:
  { revision: number; save: (revision: number, answers: DiagnosisAnswer[]) => Promise<Receipt>;
    onState: (state: 'unsaved' | 'saving' | 'saved' | 'error', error?: unknown) => void }) {
  let latest: DiagnosisAnswer[] = [], version = 0, savedVersion = 0;
  let pending: Write | null = null, running: Promise<void> | null = null;
  let blocked = false;
  async function work() {
    if (blocked) throw Object.assign(Error('CONFLICT'), { code: 'CONFLICT' });
    try {
      while (savedVersion < version) {
        onState('saving');
        pending ??= { revision, answers: structuredClone(latest), version };
        const receipt = await save(pending.revision, pending.answers);
        if (!Number.isSafeInteger(receipt.revision) || receipt.revision < revision || receipt.revision > revision + 1) throw Error('Invalid save receipt');
        revision = receipt.revision;
        savedVersion = pending.version;
        pending = null;
      }
      onState('saved');
    } catch (error) {
      blocked = (error as { code?: string })?.code === 'CONFLICT';
      onState('error', error); throw error;
    }
  }
  return {
    update(answers: DiagnosisAnswer[]) { latest = structuredClone(answers); version++; onState('unsaved'); },
    flush() { if (!running) running = work().finally(() => { running = null; }); return running; },
    get dirty() { return savedVersion < version; },
    get revision() { return revision; },
  };
}
