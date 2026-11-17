import {audiences, audienceContent, buildRequest, cleanAnswer, requestReady, ANSWER_LIMIT, REVISION_LIMIT, type Audience, type Answers} from './content';
import {calendarReady, liveEvent, type LiveEvent} from './model';
import {youtubeVideoId} from '../webinar/resources';
import {DEFAULT_WORK_TRIAL, validateWorkTrialConfig, type WorkTrialConfig} from './work-trial';

export type ArrivalAudienceConfig = {
  label: string;
  goal: string;
  q1: string;
  q2: string;
  hint1: string;
  hint2: string;
  example: Answers & {before: string; after: string; revision: string};
  requestTemplate: string;
};
export type ArrivalConfig = {
  version: 1;
  title: string;
  description: string;
  welcomeBenefits: string[];
  workTrial: WorkTrialConfig;
  instructorName: string;
  instructorIntro: string;
  videoUrl: string;
  liveTitle: string;
  startsAt: string;
  endsAt: string | null;
  liveUrl: string;
  audiences: Record<Audience, ArrivalAudienceConfig>;
};

export const ARRIVAL_CONFIG_LIMITS = {
  title: 80, description: 400, welcomeBenefit: 160, instructorName: 80, instructorIntro: 1200,
  liveTitle: 160, url: 1200, label: 80, goal: 160, question: 240,
  hint: 320, exampleAnswer: ANSWER_LIMIT, exampleResult: 2000,
  exampleRevision: REVISION_LIMIT, requestTemplate: 6000,
} as const;

const choiceLabels: Record<Audience, string> = {
  work: '회사 업무에 AI를 써보고 싶어요',
  business: '이미 사업을 하고 있어요',
  preparing: '창업을 준비하고 있어요',
  exploring: '아직 아이템이 없어요',
};
function defaultAudience(id: Audience): ArrivalAudienceConfig {
  const source = audienceContent[id];
  return {
    label: choiceLabels[id], goal: id === 'work' ? '내 업무 기준을 만들고, 다음 업무에도 재사용하기' : source.goal, q1: source.q1, q2: source.q2,
    hint1: source.hint1, hint2: source.hint2, example: {...source.example},
    requestTemplate: buildRequest(id, {a: '{{answer1}}', b: '{{answer2}}'}),
  };
}

/** Editorial defaults only. Saving the settings never executes an AI request. */
export const DEFAULT_ARRIVAL: ArrivalConfig = {
  version: 1,
  title: '혼자 하던 일,\nAI에게 맡길 수 있을까요?',
  description: '회사 업무를 더 수월하게 하고 싶을 때도, 새로운 일을 준비할 때도. 문샷 무료 라이브 전에 AI를 내 상황에 맞게 써보는 공간입니다.',
  welcomeBenefits: ['흩어진 업무 메모를 보고할 초안으로 정리하기', '막연한 아이디어에서 다음에 할 일 찾기', '내가 원하는 형식과 기준으로 AI 답변 다듬기'],
  workTrial: DEFAULT_WORK_TRIAL,
  instructorName: '윤익 · 브랜디액션 팀',
  instructorIntro: '업무를 정리하고, 고객을 이해하고, 아이디어의 다음 단계를 구체화하는 과정까지. 윤익님과 브랜디액션 팀이 내가 하는 일과 원하는 결과를 알려주고, 반복해서 업무를 맡길 AI 직원을 만드는 방법을 알려드립니다.',
  videoUrl: '',
  liveTitle: '매번 설명해야 했던 AI, 이제 내 일을 아는 직원으로',
  startsAt: liveEvent.startsAt!, endsAt: liveEvent.endsAt, liveUrl: liveEvent.infoUrl ?? '',
  audiences: {work: defaultAudience('work'), business: defaultAudience('business'), preparing: defaultAudience('preparing'), exploring: defaultAudience('exploring')},
};

function fail(message: string): never { throw Object.assign(Error(message), {status: 400}); }
function record(value: unknown, keys: readonly string[], label: string, optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 설정을 확인해 주세요.`);
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !keys.includes(key)) || keys.some(key => !optional.includes(key) && !Object.hasOwn(data, key))) fail(`${label} 설정 항목을 확인해 주세요.`);
  return data;
}
function text(value: unknown, limit: number, label: string, required = true): string {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(`${label}을 확인해 주세요.`);
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if ((required && !normalized) || normalized.length > limit) fail(`${label}은 ${limit}자 이내로 입력해 주세요.`);
  return normalized;
}

const privateSuffixes = ['.localhost', '.local', '.internal', '.test', '.invalid', '.lan', '.home', '.localdomain'];
const secretParameter = /(?:^|[_-])(?:token|secret|password|passwd|credential|signature|authorization|api[_-]?key|access[_-]?key|private[_-]?key)(?:$|[_-])|^(?:key|auth|sig|code|access_token|refresh_token|id_token|client_secret|apikey|apiKey)$/i;
function publicLink(value: unknown, label: string): string {
  const input = text(value, ARRIVAL_CONFIG_LIMITS.url, label, false);
  if (!input) return '';
  let url: URL;
  try { url = new URL(input); } catch { return fail(`${label}은 https://로 시작하는 전체 주소를 넣어 주세요.`); }
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || privateSuffixes.some(suffix => host.endsWith(suffix))) fail(`${label}은 공개된 HTTPS 주소를 사용해 주세요.`);
  const hashFields = new URLSearchParams(url.hash.replace(/^#\??/, ''));
  if ([...url.searchParams.keys(), ...hashFields.keys()].some(key => secretParameter.test(key))) fail(`${label}에는 비밀번호나 인증 키가 포함된 주소를 넣을 수 없어요.`);
  return url.href;
}

/** Reject date rollover (such as February 30) as well as timezone-free timestamps. */
function timestamp(value: unknown, label: string): string {
  const input = text(value, 35, label);
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/);
  if (!match) return fail(`${label}은 시간대가 포함된 날짜와 시각으로 입력해 주세요.`);
  const [, year, month, day, hour, minute, second, , , offsetHour, offsetMinute] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(year) < 2000 || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > daysInMonth || Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59 || Number(offsetHour ?? 0) > 14 || Number(offsetMinute ?? 0) > 59 || (Number(offsetHour) === 14 && Number(offsetMinute) !== 0) || !Number.isFinite(new Date(input).getTime())) fail(`${label}의 날짜와 시각을 확인해 주세요.`);
  return input;
}
function requestTemplate(value: unknown, label: string): string {
  const result = text(value, ARRIVAL_CONFIG_LIMITS.requestTemplate, label);
  if (!result.includes('{{answer1}}') || !result.includes('{{answer2}}') || /\{\{|\}\}/.test(result.replace(/\{\{answer[12]\}\}/g, ''))) fail(`${label}에는 {{answer1}}과 {{answer2}}를 모두 넣어 주세요. 다른 치환 표시는 사용할 수 없어요.`);
  return result;
}

/** Strict input boundary used by both the administrator editor and the public reader. */
export function validateArrivalConfig(value: unknown): ArrivalConfig {
  const v = record(value, ['version', 'title', 'description', 'welcomeBenefits', 'workTrial', 'instructorName', 'instructorIntro', 'videoUrl', 'liveTitle', 'startsAt', 'endsAt', 'liveUrl', 'audiences'], '무료 체험', ['welcomeBenefits', 'workTrial']);
  if (v.version !== 1) fail('무료 체험 설정 버전을 확인해 주세요.');
  const groups = record(v.audiences, audiences, '체험 대상', ['work']);
  const parsedAudiences = {} as Record<Audience, ArrivalAudienceConfig>;
  for (const id of audiences) {
    // Earlier saved campaigns have three routes. Add only the new work route;
    // never overwrite an administrator's existing text or a malformed explicit route.
    const group = id === 'work' && !Object.hasOwn(groups, id) ? defaultAudience(id) : groups[id];
    const source = record(group, ['label', 'goal', 'q1', 'q2', 'hint1', 'hint2', 'example', 'requestTemplate'], `${audienceContent[id].shortLabel} 체험`);
    const example = record(source.example, ['a', 'b', 'before', 'after', 'revision'], '체험 예시');
    parsedAudiences[id] = {
      label: text(source.label, ARRIVAL_CONFIG_LIMITS.label, '선택지 이름'),
      goal: text(source.goal, ARRIVAL_CONFIG_LIMITS.goal, '체험 결과 안내'),
      q1: text(source.q1, ARRIVAL_CONFIG_LIMITS.question, '첫 번째 질문'),
      q2: text(source.q2, ARRIVAL_CONFIG_LIMITS.question, '두 번째 질문'),
      hint1: text(source.hint1, ARRIVAL_CONFIG_LIMITS.hint, '첫 번째 질문 도움말', false),
      hint2: text(source.hint2, ARRIVAL_CONFIG_LIMITS.hint, '두 번째 질문 도움말', false),
      example: {
        a: text(example.a, ARRIVAL_CONFIG_LIMITS.exampleAnswer, '첫 번째 예시 답변'),
        b: text(example.b, ARRIVAL_CONFIG_LIMITS.exampleAnswer, '두 번째 예시 답변'),
        before: text(example.before, ARRIVAL_CONFIG_LIMITS.exampleResult, '첫 결과 예시'),
        after: text(example.after, ARRIVAL_CONFIG_LIMITS.exampleResult, '수정한 결과 예시'),
        revision: text(example.revision, ARRIVAL_CONFIG_LIMITS.exampleRevision, '수정 요청 예시'),
      },
      requestTemplate: requestTemplate(source.requestTemplate, `${audienceContent[id].shortLabel} 요청문`),
    };
  }
  const videoUrl = publicLink(v.videoUrl, '소개 영상 주소');
  if (videoUrl && !youtubeVideoId(videoUrl)) fail('소개 영상은 유튜브 영상의 전체 주소를 넣어 주세요.');
  const benefitValues = Object.hasOwn(v, 'welcomeBenefits') ? v.welcomeBenefits : DEFAULT_ARRIVAL.welcomeBenefits;
  if (!Array.isArray(benefitValues) || benefitValues.length !== 3) fail('첫 화면 체험 안내는 세 항목을 입력해 주세요.');
  const welcomeBenefits = benefitValues.map(item => text(item, ARRIVAL_CONFIG_LIMITS.welcomeBenefit, '첫 화면 체험 안내'));
  const config: ArrivalConfig = {
    version: 1,
    title: text(v.title, ARRIVAL_CONFIG_LIMITS.title, '무료 체험 제목'),
    description: text(v.description, ARRIVAL_CONFIG_LIMITS.description, '무료 체험 소개'),
    welcomeBenefits,
    workTrial: validateWorkTrialConfig(Object.hasOwn(v, 'workTrial') ? v.workTrial : DEFAULT_WORK_TRIAL),
    instructorName: text(v.instructorName, ARRIVAL_CONFIG_LIMITS.instructorName, '강사 이름'),
    instructorIntro: text(v.instructorIntro, ARRIVAL_CONFIG_LIMITS.instructorIntro, '강사·팀 소개'),
    videoUrl,
    liveTitle: text(v.liveTitle, ARRIVAL_CONFIG_LIMITS.liveTitle, '라이브 제목'),
    startsAt: timestamp(v.startsAt, '라이브 시작 시각'),
    endsAt: v.endsAt === null ? null : timestamp(v.endsAt, '라이브 종료 시각'),
    liveUrl: publicLink(v.liveUrl, '라이브 주소'),
    audiences: parsedAudiences,
  };
  if (!calendarReady(arrivalLiveEvent(config))) fail('라이브 종료 시각은 시작 시각 이후로 설정해 주세요.');
  return config;
}

/** One replacement pass prevents an answer containing another token from being expanded. */
export function buildManagedRequest(config: ArrivalConfig, id: Audience, answers: Answers): string {
  if (!requestReady(answers)) return '';
  const values = {answer1: cleanAnswer(answers.a), answer2: cleanAnswer(answers.b)};
  return config.audiences[id].requestTemplate.replace(/\{\{(answer1|answer2)\}\}/g, (_, key: keyof typeof values) => values[key]);
}

/** The campaign's stable UID survives schedule edits; no end time or live URL is invented. */
export function arrivalLiveEvent(config: ArrivalConfig): LiveEvent {
  const start = new Date(config.startsAt);
  const validStart = Number.isFinite(start.getTime());
  const date = validStart ? new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(start) : '';
  const when = validStart ? new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'}).format(start) : '';
  return {
    id: liveEvent.id, date, title: config.liveTitle, timeZone: 'Asia/Seoul',
    // The datetime editor serializes to ISO with milliseconds. Keep that edit
    // intact in config; calendar payloads represent event times to the second.
    startsAt: calendarTimestamp(config.startsAt), endsAt: config.endsAt === null ? null : calendarTimestamp(config.endsAt), infoUrl: config.liveUrl || null,
    description: [
      `${when}(한국시간)에 시작합니다.`, config.description, config.instructorIntro,
      config.endsAt === null ? '종료 시간은 추후 안내합니다.' : '',
      config.liveUrl ? '아래 라이브 주소로 참여해 주세요.' : 'YouTube 참여 링크는 카톡방에서 추가 안내할 예정입니다.',
      config.endsAt === null ? '이 일정은 시작 시각을 기억하기 위한 알림입니다.' : '',
    ].filter(Boolean).join('\n\n'),
  };
}

function calendarTimestamp(value: string): string {
  return value.replace(/\.\d{1,3}(?=Z|[+-]\d{2}:\d{2}$)/, '');
}
