import { createHash } from 'node:crypto';
import { readLimitedUtf8Body } from '../../../features/campus/community/request-body';
import { validateOfficeEvent, validateOfficeRegistration } from '../../../features/campus/office/domain';
import { isCampusId } from '../../../features/campus/snapshot';

const dev = 'https://vjmjhaidlqkmascdjocw.supabase.co';
const production = 'https://qitqxizuwmmlhlcgsrqe.supabase.co';
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const reply = (status: number, data: unknown = {}) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
export async function receiveStudentReport(request: Request, url: string | undefined, key: string | undefined, transport = fetch, productionEnabled = false) {
  if ((url !== dev && !(productionEnabled && url === production)) || !key) return reply(404);
  if (request.method !== 'POST') return reply(405);
  const token = request.headers.get('x-campus-device') || '';
  if (!/^[0-9]{10}\.[a-f0-9]{64}$/.test(token)) return reply(401);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(400);
  try {
    const raw = await readLimitedUtf8Body(request, 48000);
    const input = JSON.parse(raw);
    const confirm = input?.action === 'confirm';
    const id = request.headers.get('x-campus-event-id');
    if (confirm ? !/^[a-f0-9]{12}$/.test(input.code || '') : !id || !isCampusId(id)) return reply(400);
    const event = confirm ? null : input?.event === 'registered' ? validateOfficeRegistration(input) : validateOfficeEvent(input);
    const response = await transport(url+'/rest/v1/rpc/edu_campus_student_report', {
      method:'POST', headers:{ apikey:key, Authorization:'Bearer '+key,'content-type':'application/json' },
      body: JSON.stringify({p_verifier:digest(token),p_issued:Number(token.slice(0,10)),p_confirm:confirm?input.code:null,
        p_event_id:confirm?null:id,p_payload_hash:confirm?null:digest(raw),p_event:event}), redirect:'error', signal:AbortSignal.timeout(10000),
    });
    const receipt = await response.json();
    if (!response.ok) return reply(receipt.code==='42501'?403:['40001','23505'].includes(receipt.code)?409:receipt.code==='23514'?400:503);
    return reply(200,receipt);
  } catch(e) { return reply(e instanceof SyntaxError || (e as {status?:number})?.status===400 ? 400 : 503); }
}
declare const Deno: {env:{get(name:string):string|undefined};serve(fn:(r:Request)=>Promise<Response>):void};
if (typeof Deno!=='undefined') Deno.serve(r=>receiveStudentReport(r,Deno.env.get('SUPABASE_URL'),Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), fetch, Deno.env.get('EDU_STUDENT_REPORTING_ENABLED') === 'true'));
