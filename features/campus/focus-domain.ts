/** A planning aid, not evidence of attention, lesson completion or earned rewards. */
export const FOCUS_SECONDS = 15 * 60;
export type FocusSession = {
  id: string;
  user_id: string;
  enrollment_id: string;
  lesson_id: string;
  lesson_version: string;
  action_text: string;
  result_note: string;
  next_step: string;
  status: 'running' | 'paused' | 'finished';
  elapsed_seconds: number;
  running_since: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type FocusCommand = {
  kind: 'pause' | 'resume' | 'finish';
  expectedRevision: number;
  resultNote?: string;
  nextStep?: string;
};
export type FocusIdentity = Pick<FocusSession, 'id' | 'user_id' | 'enrollment_id' | 'lesson_id' | 'lesson_version' | 'action_text'>;

function fail(status: 400 | 409, message: string): never {
  throw Object.assign(new Error(message), { status });
}
function clock(now: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) fail(400, '현재 시각을 확인하지 못했습니다.');
  return now;
}
function date(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) fail(400, '실행 기록의 시각을 확인해 주세요.');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(400, '실행 기록의 시각을 확인해 주세요.');
  return parsed;
}
function text(value: unknown, max: number, label: string, required = true): string {
  if (typeof value !== 'string') fail(400, `${label}을 확인해 주세요.`);
  const trimmed = value.trim();
  if ((required && !trimmed) || trimmed.length > max) fail(400, `${label}은 ${max}자 이내로 입력해 주세요.`);
  return trimmed;
}
function identity(input: FocusIdentity): FocusIdentity {
  if (!input || typeof input !== 'object') fail(400, '실행할 수업을 확인해 주세요.');
  const ids = [input.id, input.user_id, input.enrollment_id, input.lesson_id];
  if (ids.some(value => typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))) fail(400, '실행할 수업을 확인해 주세요.');
  return { id: input.id, user_id: input.user_id, enrollment_id: input.enrollment_id, lesson_id: input.lesson_id,
    lesson_version: text(input.lesson_version, 160, '수업 버전'), action_text: text(input.action_text, 300, '오늘의 실행') };
}
function validate(session: FocusSession): void {
  identity(session);
  if (!['running', 'paused', 'finished'].includes(session.status)
    || !Number.isSafeInteger(session.revision) || session.revision < 1
    || !Number.isInteger(session.elapsed_seconds) || session.elapsed_seconds < 0 || session.elapsed_seconds > FOCUS_SECONDS) fail(400, '실행 기록의 상태를 확인해 주세요.');
  const created = date(session.created_at), updated = date(session.updated_at);
  if (updated < created) fail(400, '실행 기록의 시각을 확인해 주세요.');
  if (session.status === 'running') {
    const started = date(session.running_since);
    if (started < created || started > updated) fail(400, '실행 기록의 시각을 확인해 주세요.');
  } else if (session.running_since !== null) fail(400, '실행 기록의 상태를 확인해 주세요.');
  text(session.result_note, 1000, '실행 결과', session.status === 'finished');
  text(session.next_step, 500, '다음 할 일', session.status === 'finished');
}
function elapsed(session: FocusSession, now: number): number {
  // Client display may briefly lag the server clock; never make elapsed time negative.
  const running = session.status === 'running' ? Math.max(0, Math.floor((now - date(session.running_since)) / 1000)) : 0;
  return Math.min(FOCUS_SECONDS, session.elapsed_seconds + running);
}

/** Parse untrusted local-demo/transport data without carrying unknown fields forward. */
export function validateFocusSession(value: unknown): FocusSession {
  const candidate = value as FocusSession;
  validate(candidate);
  return { ...identity(candidate), result_note: candidate.result_note, next_step: candidate.next_step,
    status: candidate.status, elapsed_seconds: candidate.elapsed_seconds, running_since: candidate.running_since,
    revision: candidate.revision, created_at: candidate.created_at, updated_at: candidate.updated_at };
}

export function createFocusSession(input: FocusIdentity, now: number): FocusSession {
  const fields = identity(input), stamp = new Date(clock(now)).toISOString();
  return { ...fields, result_note: '', next_step: '', status: 'running', elapsed_seconds: 0,
    running_since: stamp, revision: 1, created_at: stamp, updated_at: stamp };
}

export function remainingSeconds(session: FocusSession, now: number): number {
  validate(session);
  return FOCUS_SECONDS - elapsed(session, clock(now));
}

export function resumeDisposition(session: FocusSession, currentLessonVersion: string): 'finished' | 'version_changed' | 'ready' {
  validate(session);
  if (session.status === 'finished') return 'finished';
  return session.lesson_version === text(currentLessonVersion, 160, '수업 버전') ? 'ready' : 'version_changed';
}

export function transitionFocusSession(session: FocusSession, command: FocusCommand, now: number): FocusSession {
  validate(session);
  clock(now);
  if (!command || typeof command !== 'object' || !['pause', 'resume', 'finish'].includes(command.kind)
    || !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 1) fail(400, '실행 기록 변경 요청을 확인해 주세요.');
  if (session.revision !== command.expectedRevision) fail(409, '다른 화면에서 기록이 바뀌었습니다. 최신 기록을 다시 확인해 주세요.');
  if (session.status === 'finished') fail(409, '이미 마무리한 실행 기록입니다.');
  if (now < date(session.updated_at)) fail(409, '실행 기록보다 이른 시각입니다. 잠시 후 다시 시도해 주세요.');
  if (session.revision === Number.MAX_SAFE_INTEGER) fail(409, '실행 기록을 더 변경할 수 없습니다.');
  const elapsedSeconds = elapsed(session, now), stamp = new Date(now).toISOString();
  // Construct known fields only; identity and creation time never change.
  const next: FocusSession = { ...identity(session), result_note: session.result_note, next_step: session.next_step,
    status: session.status, elapsed_seconds: elapsedSeconds, running_since: null,
    revision: session.revision + 1, created_at: session.created_at, updated_at: stamp };
  if (command.kind === 'pause') {
    if (session.status !== 'running') fail(409, '이미 쉬고 있는 실행입니다.');
    next.status = 'paused';
  } else if (command.kind === 'resume') {
    if (session.status !== 'paused') fail(409, '이미 진행 중인 실행입니다.');
    if (elapsedSeconds >= FOCUS_SECONDS) fail(409, '15분이 지났습니다. 실행 결과를 남기고 마무리해 주세요.');
    next.status = 'running'; next.running_since = stamp;
  } else {
    next.result_note = text(command.resultNote, 1000, '실행 결과');
    next.next_step = text(command.nextStep, 500, '다음 할 일');
    next.status = 'finished';
  }
  return next;
}
