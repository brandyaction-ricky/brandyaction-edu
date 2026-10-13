import { classStudentsProjection, classStudentsUuid, ClassStudentsInputError, parseClassStudentsInput, resolveClassStudentsCohort } from './class-students';
import type { CareSnapshot } from './learning-care';

export const classStudentsToolDefinition = {
  name: 'get_class_students', title: '기수별 수강생 현황 조회',
  description: '관리자 권한으로 기수별 수강생 이름·공개 학습 진도·완료 수·다음 학습·최근 방문·확인 필요 여부를 읽습니다. 진도 구간: starting(10% 미만), progressing(10% 이상 80% 미만), finishing(80% 이상), unknown(공개 전·설정 확인). 장기 미접속은 관리자 화면과 같은 3일 초과 방문 기록 기준이며 기록 없음은 미접속으로 단정하지 않습니다. 전체 인원과 필터 적용 건수는 페이지 크기와 별도로 반환합니다.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['cohort'],
    properties: {
      cohort: { type: 'string', minLength: 1, maxLength: 200, description: '과정명과 기수명 또는 기수 ID. 예: AI 문샷 챌린지 4기' },
      student_name: { type: 'string', maxLength: 100, description: '수강생 이름에 포함된 글자. 이메일 검색은 제공하지 않습니다.' },
      progress_range: { type: 'string', enum: ['all', 'starting', 'progressing', 'finishing', 'unknown'], default: 'all' },
      inactive_only: { type: 'boolean', default: false },
      attention_only: { type: 'boolean', default: false },
      offset: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    },
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
} as const;

export type ClassStudentsDatabase = {
  rpc(name: 'edu_admin_learning_care', args: { p_actor: string; p_cohort: string | null }, options: { get: true }): {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
  };
};
type Dependencies = {
  // The transport supplies the current authenticated caller, checked with the
  // existing 'members' permission. Never take this ID from model arguments or
  // bind every caller to a shared administrator account.
  authorizeMembers(): Promise<{ id: string } | null>;
  database(): ClassStudentsDatabase;
};
export function createClassStudentsTool(deps: Dependencies) {
  return {
    ...classStudentsToolDefinition,
    async execute(arguments_: unknown) {
      try {
        const actor = await deps.authorizeMembers();
        if (!actor || !classStudentsUuid(actor.id)) return failure('회원 관리 권한으로 로그인해 주세요.');
        const input = parseClassStudentsInput(arguments_);
        const db = deps.database();
        async function read(cohort: string | null): Promise<CareSnapshot> {
          const { data, error } = await db.rpc('edu_admin_learning_care', { p_actor: actor!.id, p_cohort: cohort }, { get: true }).abortSignal(AbortSignal.timeout(20000));
          if (error || !data || typeof data !== 'object') throw new Error('read failed');
          const snapshot = data as CareSnapshot;
          if (!Array.isArray(snapshot.cohorts) || !Array.isArray(snapshot.rows)) throw new Error('invalid snapshot');
          return snapshot;
        }
        let snapshot = await read(classStudentsUuid(input.cohort) ? input.cohort : null);
        const selected = resolveClassStudentsCohort(snapshot, input.cohort);
        if (selected !== snapshot.cohortId) snapshot = await read(selected);
        // Do not silently return a different cohort after a concurrent change.
        if (snapshot.cohortId !== selected || resolveClassStudentsCohort(snapshot, input.cohort) !== selected) throw new Error('scope changed');
        const result = classStudentsProjection(snapshot, input);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        return failure(error instanceof ClassStudentsInputError ? error.message : '현황을 불러오지 못했습니다. 다시 시도해 주세요.');
      }
    },
  };
}
const failure = (text: string) => ({ isError: true, content: [{ type: 'text' as const, text }] });
