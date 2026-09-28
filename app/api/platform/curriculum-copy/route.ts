import { getOperatorUser } from "@/lib/operator-permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const errors: Record<string, [string, number]> = {
  COPY_FORBIDDEN: ["상품 관리 권한이 필요합니다.", 403],
  COPY_INVALID: ["복사 요청을 확인해 주세요.", 400],
  COPY_REQUEST_REUSED: ["다른 복사 요청과 겹쳤습니다. 화면을 새로고침해 주세요.", 409],
  COPY_TARGET_DRAFT: ["작성 중인 클래스 상품에만 불러올 수 있습니다.", 409],
  COPY_TARGET_NOT_EMPTY: ["기존 주차나 공통 자료가 있어 복사하지 않았습니다. 새 상품을 사용해 주세요.", 409],
  COPY_SOURCE_MISSING: ["원본 상품이 삭제되었거나 복사할 수 없는 상품입니다.", 404],
  COPY_SOURCE_CHANGED: ["원본이 변경되었습니다. 복사 내용을 다시 확인해 주세요.", 409],
  COPY_SOURCE_LIMIT: ["주차가 없거나 복사 가능한 크기를 초과했습니다. 주차 100개·학습 1,000개·내용 10MB까지 지원합니다.", 400],
  COPY_RESOURCE_INVALID: ["원본의 공통 자료 설정을 확인해 주세요. 자료 경로나 다운로드 범위가 올바르지 않습니다.", 400],
  COPY_MEDIA_INVALID: ["원본 학습의 사진·영상·음성 파일 연결을 확인해 주세요. 확인되지 않은 파일이 있어 복사하지 않았습니다.", 409],
};
function failure(error: unknown) {
  const value = error && typeof error === "object" ? error as { message?: string; code?: string } : {};
  const match = Object.entries(errors).find(([key]) => value.message?.includes(key));
  if (match) return reply({ error: match[1][0], code: match[0] }, match[1][1]);
  return reply({ error: "커리큘럼 복사를 처리하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요." }, 503);
}

export async function GET(request: Request) {
  try {
    const user = await getOperatorUser("products");
    if (!user) return reply({ error: "상품 관리 권한이 필요합니다." }, 403);
    const url = new URL(request.url), source = url.searchParams.get("source");
    const db = createAdminClient();
    if (source) {
      if (!uuid.test(source)) return reply({ error: "원본 상품을 선택해 주세요." }, 400);
      const { data, error } = await db.rpc("edu_preview_curriculum_copy", { p_actor: user.id, p_source: source });
      if (error) return failure(error);
      return reply({ preview: data });
    }
    const target = url.searchParams.get("target");
    if (!target || !uuid.test(target)) return reply({ error: "대상 상품을 확인해 주세요." }, 400);
    const page = Math.min(1000, Math.max(0, Number(url.searchParams.get("page")) || 0));
    if (!Number.isInteger(page)) return reply({ error: "페이지 번호를 확인해 주세요." }, 400);
    // Bound results and escape LIKE metacharacters; search remains a single column filter.
    const search = (url.searchParams.get("q") || "").trim().slice(0, 100).replace(/[\\%_]/g, char => `\\${char}`);
    let query = db.from("courses").select("id,title,course_code", { count: "exact" })
      .neq("id", target).is("archived_at", null).neq("status", "archived").in("category", ["free", "paid_class"]);
    if (search) query = query.ilike("title", `%${search}%`);
    const { data, count, error } = await query.order("title").order("id").range(page * 20, page * 20 + 19);
    if (error) return failure(error);
    return reply({ sources: data, hasMore: (page + 1) * 20 < (count || 0) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "허용되지 않은 요청입니다." }, 403);
  try {
    const user = await getOperatorUser("products");
    if (!user) return reply({ error: "상품 관리 권한이 필요합니다." }, 403);
    let body: { sourceId?: string; targetId?: string; requestId?: string; revision?: string };
    try { body = await request.json(); } catch { return reply({ error: "요청 형식을 확인해 주세요." }, 400); }
    if (!body || ![body.sourceId, body.targetId, body.requestId].every(value => typeof value === "string" && uuid.test(value))
      || typeof body.revision !== "string" || !/^[a-f0-9]{32}$/.test(body.revision)) return reply({ error: "원본과 대상 상품을 다시 확인해 주세요." }, 400);
    const { data, error } = await createAdminClient().rpc("edu_copy_product_curriculum", {
      p_actor: user.id, p_request: body.requestId, p_source: body.sourceId, p_target: body.targetId, p_revision: body.revision,
    });
    if (error) return failure(error);
    return reply({ result: data });
  } catch (error) { return failure(error); }
}
