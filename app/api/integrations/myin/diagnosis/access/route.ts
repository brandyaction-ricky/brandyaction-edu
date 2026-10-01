import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeDiagnosisAccess, DiagnosisAccessError, diagnosisAccessEnvironment,
  DIAGNOSIS_ACCESS_MAX_BYTES, verifyDiagnosisAccessRequest } from '@/lib/diagnosis-access';

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: {
  'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
} });

export async function POST(request: Request) {
  if (process.env.EDU_MYIN_DIAGNOSIS_ENABLED !== 'true' || process.env.EDU_MYIN_DIAGNOSIS_SESSIONS_ENABLED !== 'true'
    || process.env.EDU_MYIN_DIAGNOSIS_REPORTS_ENABLED !== 'true') return reply({ code: 'DISABLED' }, 404);
  try {
    // This integration accepts a server signature, never a browser session.
    if (request.headers.has('origin')) return reply({ code: 'FORBIDDEN' }, 403);
    const environment = diagnosisAccessEnvironment(process.env);
    if (request.headers.get('x-edu-environment') !== environment) return reply({ code: 'FORBIDDEN' }, 403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
      return reply({ code: 'INVALID' }, 415);
    const reader = request.body?.getReader(); if (!reader) return reply({ code: 'INVALID' }, 400);
    const parts: Uint8Array[] = []; let size = 0;
    try { for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > DIAGNOSIS_ACCESS_MAX_BYTES) { await reader.cancel(); return reply({ code: 'TOO_LARGE' }, 413); }
      parts.push(value);
    } } finally { reader.releaseLock(); }
    const body = Buffer.concat(parts).toString('utf8');
    if (!verifyDiagnosisAccessRequest({ body, environment, secret: process.env.EDU_MYIN_BRIDGE_SECRET!,
      timestamp: request.headers.get('x-edu-timestamp'), authorization: request.headers.get('authorization') }))
      return reply({ code: 'UNAUTHORIZED' }, 401);
    let input: unknown;
    try { input = JSON.parse(body); } catch { return reply({ code: 'INVALID' }, 400); }
    const db = createAdminClient();
    return reply(await authorizeDiagnosisAccess({ input, environment, rpc: async (name, args) => await db.rpc(name, args) }));
  } catch (error) {
    return reply({ code: error instanceof DiagnosisAccessError ? error.code : 'UNAVAILABLE' },
      error instanceof DiagnosisAccessError ? error.status : 503);
  }
}
