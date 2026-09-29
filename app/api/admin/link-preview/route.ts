import { getAuthenticatedUser } from '@/lib/server-auth';
import { getOperatorUser } from '@/lib/operator-permissions';
import { previewUrl, readLinkPreview } from '@/lib/lesson-link-preview';
export const runtime = 'nodejs';
const recent = new Map<string, number[]>();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED !== 'true') return reply({ error: '학습 링크 기능을 준비 중입니다.' }, 404);
  try {
    const user = await getAuthenticatedUser(); if (!user) return reply({ error: '로그인이 필요합니다.' }, 401);
    if (!await getOperatorUser('products', user)) return reply({ error: '학습 편집 권한이 필요합니다.' }, 403);
    const raw = new URL(request.url).searchParams.get('url') || '';
    try { previewUrl(raw); } catch { return reply({ error: '공개된 HTTPS 웹페이지 주소를 입력해 주세요.' }, 400); }
    const now = Date.now(); for (const [id, times] of recent) if (times.at(-1)! < now - 60_000) recent.delete(id);
    const times = (recent.get(user.id) || []).filter(at => at > now - 60_000);
    if (times.length >= 20 || recent.size >= 1000 && !recent.has(user.id)) return reply({ error: '잠시 후 다시 불러오거나 제목을 직접 입력해 주세요.' }, 429);
    recent.set(user.id, [...times, now]);
    return reply(await readLinkPreview(raw));
  } catch { return reply({ error: '사이트 제목을 가져오지 못했습니다. 링크 문구를 직접 입력해도 저장할 수 있습니다.' }, 502); }
}
