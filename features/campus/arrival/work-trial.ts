/** A personal-AI exercise. No model call, inferred diagnosis, or external completion signal. */
export const WORK_TRIAL_PRIORITIES = ['decisions', 'scope', 'support'] as const;
export type WorkTrialPriority = (typeof WORK_TRIAL_PRIORITIES)[number];
export type WorkTrialTask = {title: string; description: string; label: string; hint: string; sample: string};
export type WorkTrialConfig = {
  title: string; description: string;
  roleLabel: string; roleDefault: string; readerLabel: string; readerDefault: string;
  priorityQuestion: string;
  priorities: {id: WorkTrialPriority; label: string; rule: string}[];
  boundaryLabel: string; boundaryDefault: string; formatLabel: string; formatDefault: string;
  firstTask: WorkTrialTask;
  feedback: {title: string; description: string; hint: string; suggestions: string[]};
  secondTask: WorkTrialTask;
  summaryTitle: string; summaryDescription: string; checks: string[]; liveBridge: string;
  valueExplanation: {title: string; before: string; after: string; takeaway: string};
  firstTemplate: string; updateTemplate: string; reuseTemplate: string;
};
export const WORK_TRIAL_LIMITS = {
  title: 120, description: 500, label: 160, hint: 500, role: 240, reader: 400,
  rule: 700, task: 2400, answer: 4000, feedback: 700, template: 7000,
} as const;

export const WORK_TRIAL_FIRST_CHECKS = [
  {label: '내가 고른 우선순위가 맨 위에 있어요.', feedback: '내가 고른 우선순위에 해당하는 내용을 답변 맨 위에 적어줘.'},
  {label: '메모에 없는 정보는 확인할 사항으로 남겼어요.', feedback: '메모에 없는 담당자·날짜·수치는 확인이 필요하다고 표시해줘.'},
  {label: '다음에 할 일이 구체적으로 적혀 있어요.', feedback: '다음에 할 일을 바로 실행할 수 있는 문장으로 적어줘.'},
] as const;

export const WORK_TRIAL_ANSWER_EXAMPLES = {
  first: '[결정 필요] 계정 신청 안내가 빠진 상태로 이번 주에 먼저 공유할지 정해야 합니다.\n[진행 상황] 안내자료 목차 정리 완료. 계정 신청 안내는 담당 부서의 회신 대기 중입니다.\n[다음 할 일] 안내자료를 준비합니다.',
  second: '[결정 필요] 참석 인원과 예산을 먼저 확인한 뒤 장소를 정할지 결정해 주세요.\n[진행 상황] 가까운 장소는 예약 가능 여부가 미정입니다. 먼 장소는 예약할 수 있습니다.\n[다음 할 일] 가까운 장소의 예약 가능 날짜를 확인하고, 두 장소의 비용과 이동 시간을 비교합니다.\n[확인 필요] 예약 담당자와 마감일은 미정입니다.',
} as const;

export function workReviewFeedback(checks: boolean[]): string {
  return WORK_TRIAL_FIRST_CHECKS.filter((_, index) => !checks[index]).map(item => item.feedback).join('\n');
}

export const DEFAULT_WORK_TRIAL: WorkTrialConfig = {
  title: '내가 매번 고치는 부분까지,\n업무 기준으로 남겨보세요.',
  description: '회의 메모를 정리하는 AI 직원에게 내 판단 기준을 알려줍니다. 첫 답변을 고친 뒤, 새로운 메모에서도 그 기준이 적용되는지 확인해보세요.',
  roleLabel: 'AI 직원에게 어떤 일을 맡길까요?',
  roleDefault: '회의 메모에서 결정할 사항과 다음에 실행할 일을 정리하는 직원',
  readerLabel: '누가 읽고, 무엇을 판단하나요?',
  readerDefault: '팀장이 진행 상황을 파악하고, 지금 결정하거나 도움을 줘야 할 일을 확인합니다.',
  priorityQuestion: '일정 안에 모두 끝내기 어렵다면, 무엇부터 보여주면 좋겠나요?',
  priorities: [
    {id: 'decisions', label: '내가 결정해야 할 사항부터', rule: '읽는 사람이 결정해야 할 사항을 먼저 정리한다. 메모만으로 판단할 수 없다면 필요한 정보를 질문한다.'},
    {id: 'scope', label: '꼭 끝낼 일과 조정할 일부터', rule: '반드시 끝내야 할 일과 범위를 조정할 수 있는 일을 구분한다. 우선순위가 불명확하면 임의로 확정하지 않고 확인한다.'},
    {id: 'support', label: '일정을 지키는 데 필요한 도움부터', rule: '진행을 막는 문제와 필요한 도움을 먼저 정리한다. 확인되지 않은 담당자에게 일을 배정하거나 추가 비용을 약속하지 않는다.'},
  ],
  boundaryLabel: '혼자 판단하지 말고 확인할 것',
  boundaryDefault: '메모에 없는 마감일·담당자·수치·성과는 만들지 않는다. 일정 변경, 추가 비용, 다른 사람에게 업무 배정은 확인을 요청한다. 완료한 일과 계획을 구분한다.',
  formatLabel: '결과를 확인할 기준',
  formatDefault: '선택한 우선순위를 맨 위에 두고, 현재 상황과 다음 행동을 이어서 간결하게 정리한다. 확인된 사실과 제안을 구분하고, 정보가 없는 항목은 확인 필요라고 표시한다.',
  firstTask: {
    title: '첫 업무를 맡겨보세요.',
    description: '아래에 AI가 처리할 자료를 넣어주세요. 앞에서 만든 업무 기준과 이 자료를 합친 전체 요청문을 복사해 개인 AI에 보냅니다.',
    label: '이번에 AI에게 맡길 자료 · 첫 업무',
    hint: '이 칸에는 회의·업무 메모만 넣습니다. 회사 기밀·개인정보는 빼고, 준비된 가상 메모로 체험해도 됩니다. 복사 버튼은 업무 기준까지 포함한 전체 요청문을 복사합니다.',
    sample: '신입 동료 안내자료를 만드는 중이다. 자료 목차는 정리했다. 계정 신청 안내는 담당 부서의 회신을 기다리고 있다. 연락처 목록도 최신 정보인지 확인해야 한다. 팀장은 이번 주 안에 공유하기를 원하지만 전체 내용을 다 확인할 수 있을지는 아직 모른다. 계정 안내를 빼고 먼저 공유할지 논의가 필요하다. 확정된 담당자와 최종 마감일은 없다.',
  },
  feedback: {
    title: '한 번 고친 내용을,\n다음 업무의 기준으로.',
    description: '첫 답변에서 아쉬운 점을 적어주세요. 이번 결과를 고치는 요청과 앞으로도 적용할 업무 기준에 함께 반영합니다.',
    hint: '예: 결정할 사항마다 선택지와 추가로 확인할 정보를 함께 보여줘. 근거가 없는 추천은 하지 마.',
    suggestions: [
      '결정할 사항마다 선택지와 추가로 확인할 정보를 함께 보여줘. 근거가 없는 추천은 하지 마.',
      '다음 행동을 바로 실행할 수 있는 문장으로 써줘. 담당자나 일정이 없으면 확인 필요라고 표시해줘.',
      '확정된 사실과 네가 제안하는 행동을 각각 표시해줘. 내가 결정해야 하는 부분을 따로 모아줘.',
    ],
  },
  secondTask: {
    title: '새 메모에도,\n같은 기준이 적용될까요?',
    description: '첫 업무와 다른 자료를 넣어주세요. 앞서 정한 기준과 피드백은 전체 요청에 함께 담깁니다.',
    label: '이번에 AI에게 맡길 자료 · 두 번째 업무',
    hint: '이 칸의 메모는 전체 요청문의 일부입니다. 새 자료를 넣고 전체 요청문을 복사해 AI에 보내세요. 같은 종류의 다른 업무를 고르면 기준이 유지되는지 확인하기 쉽습니다.',
    sample: '팀 워크숍 준비 상황이다. 장소 후보 두 곳을 찾았다. 한 곳은 사무실에서 가깝지만 예약 가능 여부가 확인되지 않았다. 다른 곳은 예약 가능하나 이동 시간이 더 걸린다. 참석 인원과 예산은 아직 확정하지 않았다. 장소를 먼저 정할지, 인원과 예산을 확인한 뒤 정할지 결정이 필요하다. 예약 담당자와 마감일은 정하지 않았다.',
  },
  summaryTitle: '매번 다시 설명하던 기준,\n다음 업무에도 가져가세요.',
  summaryDescription: '맡길 역할과 목적, 우선순위에 내가 고친 내용까지 한 문서로 모았습니다. 다음 업무에서는 이 매뉴얼에 새 자료를 붙여 보내고, 원하는 기준이 지켜졌는지 확인해보세요.',
  checks: ['내가 고른 우선순위가 반영됐나요?', '첫 답변을 보고 추가한 기준도 지켰나요?', '없는 정보를 만들지 않고 확인할 사항을 남겼나요?'],
  liveBridge: '체험에서는 내 기준을 매뉴얼로 만들고 새 업무에 다시 사용해봤습니다. 라이브에서는 여기에 실제 업무 자료를 연결하고 직원별 역할을 정해, 텔레그램으로 일을 맡기는 과정까지 보여드립니다.',
  valueExplanation: {
    title: '이번에 만든 것은,\n다음 업무에도 쓸 수 있는 기준입니다.',
    before: '업무를 맡길 때마다 역할·목적·주의사항을 다시 적고, 답변을 보며 빠진 기준을 추가합니다.',
    after: '저장한 업무 기준에 이번 자료를 붙여 보냅니다. 새로 고친 기준도 매뉴얼에 남겨 다음 요청에 함께 넣습니다.',
    takeaway: '반복해서 설명하던 내용을 한곳에 모아두면, 다음에는 자료를 바꿔 맡기고 결과를 검토하는 데 집중할 수 있습니다.',
  },
  firstTemplate: '아래 업무 매뉴얼에 따라 첫 업무를 처리해줘. 매뉴얼과 업무 메모를 구분해서 읽고, 메모에 없는 사실을 만들지 마. 결과를 보여준 뒤 내가 검토할 수 있도록 확인이 필요한 사항을 남겨줘.\n\n[내 AI 직원의 업무 매뉴얼]\n{{manual}}\n\n[이번 업무 메모]\n{{task}}',
  updateTemplate: '아래 보완된 업무 매뉴얼과 내 피드백을 적용해 첫 업무의 결과를 다시 작성해줘. 피드백을 이번 문장 수정에만 쓰지 말고, 아래 매뉴얼의 기준으로 적용해줘. 다른 기준과 충돌하면 마음대로 결정하지 말고 확인해줘.\n\n[보완된 업무 매뉴얼]\n{{manual}}\n\n[이번에 추가한 피드백]\n{{feedback}}\n\n[다시 처리할 첫 업무 메모]\n{{task}}',
  reuseTemplate: '아래 업무 매뉴얼을 적용해 새로운 업무 메모를 처리해줘. 이전 업무의 사실·담당자·일정을 새 업무에 섞지 마. 우선순위와 피드백으로 보완한 기준을 유지하고, 확인되지 않은 정보는 질문으로 남겨줘.\n\n[재사용할 업무 매뉴얼]\n{{manual}}\n\n[새로운 업무 메모]\n{{task}}',
};

function fail(message: string): never {throw Object.assign(Error(message), {status: 400});}
function record(value: unknown, keys: string[], label: string, optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 설정을 확인해 주세요.`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key)) || keys.some(key => !optional.includes(key) && !Object.hasOwn(result, key))) fail(`${label} 설정 항목을 확인해 주세요.`);
  return result;
}
function text(value: unknown, limit: number, label: string): string {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(`${label}을 확인해 주세요.`);
  const result = value.replace(/\r\n?/g, '\n').trim();
  if (!result || result.length > limit) fail(`${label}은 1~${limit}자로 입력해 주세요.`);
  return result;
}
function texts(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length !== 3) fail(`${label}은 세 항목을 입력해 주세요.`);
  return value.map(item => text(item, WORK_TRIAL_LIMITS.rule, label));
}
function task(value: unknown, label: string): WorkTrialTask {
  const v = record(value, ['title', 'description', 'label', 'hint', 'sample'], label);
  return {title: text(v.title, WORK_TRIAL_LIMITS.title, label + ' 제목'), description: text(v.description, WORK_TRIAL_LIMITS.description, label + ' 설명'), label: text(v.label, WORK_TRIAL_LIMITS.label, label + ' 입력 제목'), hint: text(v.hint, WORK_TRIAL_LIMITS.hint, label + ' 도움말'), sample: text(v.sample, WORK_TRIAL_LIMITS.task, label + ' 예시 메모')};
}
function template(value: unknown, keys: string[], label: string): string {
  const result = text(value, WORK_TRIAL_LIMITS.template, label);
  const tokens = new RegExp('\\{\\{(' + keys.join('|') + ')\\}\\}', 'g');
  if (keys.some(key => !result.includes(`{{${key}}}`)) || /\{\{|\}\}/.test(result.replace(tokens, ''))) fail(`${label}에는 ${keys.map(key => `{{${key}}}`).join(', ')}를 모두 넣어 주세요. 다른 치환 표시는 사용할 수 없습니다.`);
  return result;
}
export function validateWorkTrialConfig(value: unknown): WorkTrialConfig {
  const v = record(value, Object.keys(DEFAULT_WORK_TRIAL), '직장인 업무 체험', ['valueExplanation']);
  if (!Array.isArray(v.priorities) || v.priorities.length !== 3) fail('업무 우선순위는 세 항목을 입력해 주세요.');
  const ids = new Set<string>();
  const priorities = v.priorities.map(item => {
    const p = record(item, ['id', 'label', 'rule'], '업무 우선순위');
    if (!WORK_TRIAL_PRIORITIES.includes(p.id as WorkTrialPriority) || ids.has(String(p.id))) fail('업무 우선순위 식별자를 확인해 주세요.');
    ids.add(String(p.id));
    return {id: p.id as WorkTrialPriority, label: text(p.label, WORK_TRIAL_LIMITS.label, '우선순위 선택지'), rule: text(p.rule, WORK_TRIAL_LIMITS.rule, '우선순위 업무 기준')};
  });
  const f = record(v.feedback, ['title', 'description', 'hint', 'suggestions'], '피드백');
  const firstTask = task(v.firstTask, '첫 업무'), secondTask = task(v.secondTask, '두 번째 업무');
  const explanation = record(Object.hasOwn(v, 'valueExplanation') ? v.valueExplanation : DEFAULT_WORK_TRIAL.valueExplanation, ['title', 'before', 'after', 'takeaway'], '업무 기준을 재사용하는 이유');
  if (normalizeTask(firstTask.sample) === normalizeTask(secondTask.sample)) fail('두 번째 예시 메모는 첫 업무와 다른 내용으로 입력해 주세요.');
  return {
    title: text(v.title, WORK_TRIAL_LIMITS.title, '업무 기준 제목'), description: text(v.description, WORK_TRIAL_LIMITS.description, '업무 기준 설명'),
    roleLabel: text(v.roleLabel, WORK_TRIAL_LIMITS.label, '역할 질문'), roleDefault: text(v.roleDefault, WORK_TRIAL_LIMITS.role, '예시 역할'), readerLabel: text(v.readerLabel, WORK_TRIAL_LIMITS.label, '독자 질문'), readerDefault: text(v.readerDefault, WORK_TRIAL_LIMITS.reader, '예시 독자'),
    priorityQuestion: text(v.priorityQuestion, WORK_TRIAL_LIMITS.label, '우선순위 질문'), priorities,
    boundaryLabel: text(v.boundaryLabel, WORK_TRIAL_LIMITS.label, '확인 기준 제목'), boundaryDefault: text(v.boundaryDefault, WORK_TRIAL_LIMITS.rule, '기본 확인 기준'), formatLabel: text(v.formatLabel, WORK_TRIAL_LIMITS.label, '완료 기준 제목'), formatDefault: text(v.formatDefault, WORK_TRIAL_LIMITS.rule, '기본 완료 기준'),
    firstTask, secondTask,
    feedback: {title: text(f.title, WORK_TRIAL_LIMITS.title, '피드백 제목'), description: text(f.description, WORK_TRIAL_LIMITS.description, '피드백 설명'), hint: text(f.hint, WORK_TRIAL_LIMITS.hint, '피드백 도움말'), suggestions: texts(f.suggestions, '피드백 제안')},
    summaryTitle: text(v.summaryTitle, WORK_TRIAL_LIMITS.title, '마무리 제목'), summaryDescription: text(v.summaryDescription, WORK_TRIAL_LIMITS.description, '마무리 설명'), checks: texts(v.checks, '재사용 확인 항목'), liveBridge: text(v.liveBridge, WORK_TRIAL_LIMITS.description, '라이브 연결 안내'),
    valueExplanation: {title: text(explanation.title, WORK_TRIAL_LIMITS.title, '체험 가치 제목'), before: text(explanation.before, WORK_TRIAL_LIMITS.description, '기존 요청 작성 방식'), after: text(explanation.after, WORK_TRIAL_LIMITS.description, '업무 기준 재사용 방식'), takeaway: text(explanation.takeaway, WORK_TRIAL_LIMITS.description, '체험 활용 안내')},
    firstTemplate: template(v.firstTemplate, ['manual', 'task'], '첫 업무 요청문'), updateTemplate: template(v.updateTemplate, ['manual', 'task', 'feedback'], '피드백 요청문'), reuseTemplate: template(v.reuseTemplate, ['manual', 'task'], '재사용 요청문'),
  };
}

export type WorkTrialState = {
  step: 0 | 1 | 2 | 3 | 4;
  role: string; reader: string; priority: WorkTrialPriority | ''; boundary: string; format: string;
  firstTask: string; feedback: string; secondTask: string;
  firstAnswer: string | null; secondAnswer: string | null;
  firstAnswerExample: boolean; secondAnswerExample: boolean;
  copiedRequestId: string;
  firstConfirmed: boolean; feedbackConfirmed: boolean; secondConfirmed: boolean;
  firstChecks: boolean[]; checks: boolean[];
};
export function initialWorkTrialState(): WorkTrialState {
  return {step: 0, role: '', reader: '', priority: '', boundary: '', format: '', firstTask: '', feedback: '', secondTask: '',
    firstAnswer: '', secondAnswer: '', firstAnswerExample: false, secondAnswerExample: false, copiedRequestId: '',
    firstConfirmed: false, feedbackConfirmed: false, secondConfirmed: false, firstChecks: [false, false, false], checks: [false, false, false]};
}
function input(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, limit) : '';
}
function normalizeTask(value: string): string {return value.trim().replace(/\s+/g, ' ');}
function hasCriteria(state: WorkTrialState): boolean {return Boolean(state.role.trim() && state.reader.trim() && WORK_TRIAL_PRIORITIES.includes(state.priority as WorkTrialPriority));}
export function criteriaReady(config: WorkTrialConfig, state: WorkTrialState): boolean {
  return hasCriteria(state) && config.priorities.some(option => option.id === state.priority);
}
export function secondTaskReady(state: WorkTrialState): boolean {
  return Boolean(state.secondTask.trim()) && normalizeTask(state.secondTask) !== normalizeTask(state.firstTask);
}
export function workAnswerReady(state: WorkTrialState, task: 'first' | 'second'): boolean {
  return task === 'first' ? Boolean(state.firstAnswer?.trim() || state.firstAnswerExample) : Boolean(state.secondAnswer?.trim() || state.secondAnswerExample);
}

// Null preserves a completed step from older versions that had no answer field.
function readAnswer(value: unknown, confirmed: boolean): string | null {
  return confirmed && (value === undefined || value === null) ? null : input(value, WORK_TRIAL_LIMITS.answer);
}

function readChecks(value: unknown): boolean[] {
  return [0, 1, 2].map(index => Array.isArray(value) && value[index] === true);
}

/** Pasted answers and review choices stay in the browser's work-trial state. */
export function parseWorkTrialState(value: unknown): WorkTrialState {
  const state = initialWorkTrialState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return state;
  const v = value as Record<string, unknown>;
  const bounds = {role: WORK_TRIAL_LIMITS.role, reader: WORK_TRIAL_LIMITS.reader, boundary: WORK_TRIAL_LIMITS.rule, format: WORK_TRIAL_LIMITS.rule, firstTask: WORK_TRIAL_LIMITS.task, feedback: WORK_TRIAL_LIMITS.feedback, secondTask: WORK_TRIAL_LIMITS.task};
  for (const key of Object.keys(bounds) as (keyof typeof bounds)[]) state[key] = input(v[key], bounds[key]);
  if (typeof v.copiedRequestId === 'string' && /^[a-z0-9]{1,7}$/.test(v.copiedRequestId)) state.copiedRequestId = v.copiedRequestId;
  state.priority = WORK_TRIAL_PRIORITIES.includes(v.priority as WorkTrialPriority) ? v.priority as WorkTrialPriority : '';
  const ready = hasCriteria(state);
  const firstSubmitted = ready && Boolean(state.firstTask.trim()) && v.firstConfirmed === true;
  state.firstAnswer = readAnswer(v.firstAnswer, firstSubmitted);
  state.firstAnswerExample = v.firstAnswerExample === true;
  state.firstConfirmed = firstSubmitted && (state.firstAnswer === null || workAnswerReady(state, 'first'));
  state.feedbackConfirmed = state.firstConfirmed && Boolean(state.feedback.trim()) && v.feedbackConfirmed === true;
  const secondSubmitted = state.feedbackConfirmed && secondTaskReady(state) && v.secondConfirmed === true;
  state.secondAnswer = readAnswer(v.secondAnswer, secondSubmitted);
  state.secondAnswerExample = v.secondAnswerExample === true;
  state.secondConfirmed = secondSubmitted && (state.secondAnswer === null || workAnswerReady(state, 'second'));
  if (workAnswerReady(state, 'first')) state.firstChecks = readChecks(v.firstChecks);
  if (state.secondConfirmed || workAnswerReady(state, 'second')) state.checks = readChecks(v.checks);
  const allowed = !ready ? 0 : !state.firstConfirmed ? 1 : !state.feedbackConfirmed ? 2 : !state.secondConfirmed ? 3 : 4;
  const requested = typeof v.step === 'number' && Number.isInteger(v.step) && v.step >= 0 && v.step <= 4 ? v.step : 0;
  state.step = Math.min(requested, allowed) as WorkTrialState['step'];
  return state;
}
/** Keep the work and feedback drafts while dropping answers attached to changed requests. */
export function updateWorkTrial(state: WorkTrialState, patch: Partial<WorkTrialState>): WorkTrialState {
  const next = {...state, ...patch};
  const changed = (keys: (keyof WorkTrialState)[]) => keys.some(key => Object.hasOwn(patch, key) && patch[key] !== state[key]);
  const criteriaChanged = changed(['role', 'reader', 'priority', 'boundary', 'format']);
  const firstTaskChanged = changed(['firstTask']);
  const firstReviewChanged = firstTaskChanged || changed(['firstAnswer', 'firstAnswerExample']);
  const feedbackChanged = changed(['feedback']);
  const secondTaskChanged = changed(['secondTask']);
  if (criteriaChanged || firstTaskChanged) {
    next.firstAnswer = patch.firstAnswer ?? '';
    next.firstAnswerExample = patch.firstAnswerExample ?? false;
  }
  if (criteriaChanged || firstReviewChanged || feedbackChanged || secondTaskChanged) {
    next.secondAnswer = patch.secondAnswer ?? '';
    next.secondAnswerExample = patch.secondAnswerExample ?? false;
  }
  if (criteriaChanged) {
    next.firstConfirmed = next.feedbackConfirmed = next.secondConfirmed = false;
    next.firstChecks = next.checks = readChecks(undefined);
    next.step = 0;
  } else if (firstReviewChanged) {
    next.firstConfirmed = next.feedbackConfirmed = next.secondConfirmed = false;
    next.firstChecks = next.checks = readChecks(undefined);
    next.step = Math.min(next.step, 1) as WorkTrialState['step'];
  } else if (feedbackChanged) {
    next.feedbackConfirmed = next.secondConfirmed = false;
    next.checks = readChecks(undefined);
    next.step = Math.min(next.step, 2) as WorkTrialState['step'];
  } else if (secondTaskChanged || changed(['secondAnswer', 'secondAnswerExample'])) {
    next.secondConfirmed = false;
    next.checks = readChecks(undefined);
    next.step = Math.min(next.step, 3) as WorkTrialState['step'];
  }
  return parseWorkTrialState(next);
}
export function buildWorkManual(config: WorkTrialConfig, state: WorkTrialState, {includeFeedback = true}: {includeFeedback?: boolean} = {}): string {
  if (!criteriaReady(config, state)) return '';
  const priority = config.priorities.find(option => option.id === state.priority)!;
  return [
    `[맡길 역할]\n${state.role.trim()}`, `[읽는 사람과 목적]\n${state.reader.trim()}`,
    `[먼저 판단할 기준]\n${priority.rule}`, `[확인이 필요한 상황]\n${state.boundary.trim() || config.boundaryDefault}`,
    `[결과 완료 기준]\n${state.format.trim() || config.formatDefault}`,
    ...(includeFeedback && state.feedback.trim() ? [`[피드백으로 보완한 기준]\n${state.feedback.trim()}`] : []),
  ].join('\n\n');
}
/** Template values are inserted once, so a visitor's literal {{task}} text is never expanded again. */
export function buildWorkPrompt(config: WorkTrialConfig, state: WorkTrialState, stage: 'first' | 'feedback' | 'reuse'): string {
  const manual = buildWorkManual(config, state, {includeFeedback: stage !== 'first'});
  const taskText = stage === 'reuse' ? state.secondTask.trim() : state.firstTask.trim();
  if (!manual || !taskText || (stage === 'feedback' && (!state.firstConfirmed || !state.feedback.trim())) || (stage === 'reuse' && (!state.feedbackConfirmed || !secondTaskReady(state)))) return '';
  const source = stage === 'first' ? config.firstTemplate : stage === 'feedback' ? config.updateTemplate : config.reuseTemplate;
  const values = {manual, task: taskText, feedback: state.feedback.trim()};
  return source.replace(/\{\{(manual|task|feedback)\}\}/g, (_, key: keyof typeof values) => values[key]);
}

/** A browser-only copy marker lets a returning visitor resume without storing a duplicate request. */
export function workPromptCopyId(prompt: string): string {
  if (!prompt) return '';
  let hash = 2166136261;
  for (let index = 0; index < prompt.length; index++) hash = Math.imul(hash ^ prompt.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}
