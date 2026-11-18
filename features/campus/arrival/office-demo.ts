export type OfficeDemoPhase = 'draft' | 'feedback' | 'approved';
export type OfficeDemoChoice = 0 | 1;

type Revision = { feedback: string; revised: string; rule: string; approvedAnswer?: string };

export type OfficeDemoConfig = {
  greeting: string;
  deskLabel: string;
  brief: string;
  material: string;
  draft: string;
  teamNote: string;
  choices: [Revision, Revision];
};

export const OFFICE_DEMO_LIMITS = {
  greeting: 160, deskLabel: 42, brief: 300, material: 500, draft: 180, teamNote: 400,
  feedback: 100, revised: 180, rule: 240, approvedAnswer: 600,
} as const;

export const DEFAULT_OFFICE_DEMO: OfficeDemoConfig = {
  greeting: '마침 광고 담당자가 초안을 가져왔어요. 책상을 눌러 같이 볼까요?',
  deskLabel: '광고 초안 열기',
  brief: '같은 광고를 보고도 “이건 내 얘기다” 싶게, 첫 문장을 바꿔주세요.',
  material: '문샷 모집 광고에는 광고·디자인·콘텐츠·고객 응대를 맡은 AI 직원들이 나옵니다. 각자 결과를 보고하고, 사람은 내 일의 기준에 맞는지 검토합니다.',
  draft: 'AI한테 이렇게 물어본 적 있으시죠?',
  teamNote: '윤익님과 브랜디액션 팀은 문샷 라이브에서 내 자료로 업무 기준을 만들고, AI 직원에게 일을 맡기는 과정을 보여드립니다.',
  choices: [
    {
      feedback: '퇴근을 늦추는 일로 시작해줘요.',
      revised: '회의는 끝났는데, 팀에 보낼 요약은 아직인가요? 흩어진 메모를 보고 초안으로 정리할 AI 직원에게 맡겨보세요.',
      rule: '직장인을 위한 광고는 퇴근 전에 남은 일 한 가지로 시작한다.',
    },
    {
      feedback: 'AI가 무슨 일을 끝냈는지 먼저 보여줘요.',
      revised: '“광고 첫 문장과 고객 문의 답변, 검토 부탁드립니다.” AI 직원들이 결과를 가져오면 나는 고칠 부분을 짚어줍니다.',
      rule: 'AI 직원을 소개할 때는 그 직원이 만들어 낸 결과물부터 보여준다.',
    },
  ],
};

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

const plainFields = ['greeting', 'deskLabel', 'brief', 'material', 'draft', 'teamNote'] as const;
const revisionFields = ['feedback', 'revised', 'rule'] as const;

function exactRecord(value: unknown, fields: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('광고 직원 시연 설정을 확인해 주세요.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !fields.includes(key) && !optional.includes(key)) || fields.some(key => !Object.hasOwn(result, key))) {
    invalid('광고 직원 시연의 설정 항목을 확인해 주세요.');
  }
  return result;
}

function editorialText<K extends keyof typeof OFFICE_DEMO_LIMITS>(record: Record<string, unknown>, fields: readonly K[]): Record<K, string> {
  const parsed = {} as Record<K, string>;
  for (const field of fields) {
    const raw = record[field];
    const limit = OFFICE_DEMO_LIMITS[field];
    if (typeof raw !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw)) {
      invalid('광고 직원 시연 문구를 확인해 주세요.');
    }
    const value = raw.replace(/\r\n?/g, '\n').trim();
    if (!value || value.length > limit) invalid(`광고 직원 시연 문구는 빈칸 없이 ${limit}자 이내로 입력해 주세요.`);
    parsed[field] = value;
  }
  return parsed;
}

export function validateOfficeDemoConfig(input: unknown): OfficeDemoConfig {
  const record = exactRecord(input, [...plainFields, 'choices']);
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length !== 2) invalid('광고 직원이 반영할 피드백을 두 가지 입력해 주세요.');
  function revision(value: unknown): Revision {
    const record = exactRecord(value, revisionFields, ['approvedAnswer']);
    const fields = editorialText(record, revisionFields);
    if (!Object.hasOwn(record, 'approvedAnswer') || record.approvedAnswer === '') return fields;
    return {...fields, ...editorialText(record, ['approvedAnswer'])};
  }
  return {
    ...editorialText(record, plainFields),
    choices: [revision(choices[0]), revision(choices[1])],
  };
}
