import { getOperatorUser } from '@/lib/operator-permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuid } from '@/lib/edu-workflows';
const reply = (data: unknown, status = 200) => Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
// Read-only, stable snapshot traversal of ALL unanswered questions, not only the
// admin table's current page. The browser prepares drafts with bounded concurrency.
export async function GET(request: Request) {
 try {
  if (process.env.NEXT_PUBLIC_EDU_QUESTION_AI_BATCH_ENABLED !== 'true' || process.env.EDU_QUESTION_AI_CONTEXT_ENABLED !== 'true') return reply({error:'사용할 수 없는 기능입니다.'},404);
  if (!await getOperatorUser('members')) return reply({error:'회원 관리 권한이 필요합니다.'},403);
  const params = new URL(request.url).searchParams, cursor = params.get('cursor'), snapshot = params.get('snapshot') || new Date().toISOString();
  if ((cursor && !uuid(cursor)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(snapshot) || !Number.isFinite(Date.parse(snapshot)) || Date.parse(snapshot)>Date.now()+1000) return reply({error:'질문 목록의 조회 기준을 확인해 주세요.'},400);
  let query = createAdminClient().from('edu_questions').select('id,title,content,learning_context,image_id,created_at').eq('is_archived',false).eq('status','open').eq('is_resolved',false).is('answer_head_id',null).lte('created_at',snapshot).order('id').limit(26);
  if (cursor) query = query.gt('id',cursor);
  const {data,error} = await query; if (error) throw error;
  const rows = (data || []).slice(0,25);
  return reply({rows,snapshot,nextCursor:(data || []).length>25 ? rows[rows.length-1].id : null});
 } catch { return reply({error:'미답변 질문을 불러오지 못했습니다. 다시 시도해 주세요.'},503); }
}
