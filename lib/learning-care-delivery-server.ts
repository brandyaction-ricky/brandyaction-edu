import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { pushConfiguration } from '@/lib/web-push-server';
import { loadSmsSettings } from '@/lib/crm-sms-settings';
import { CARE_ALIMTALK_BODY, CARE_SMS_BODY, type CareChannelConfig } from '@/lib/learning-care-channels';

export async function careDeliveryConfiguration(): Promise<CareChannelConfig> {
  const enabled = process.env.EDU_CARE_DELIVERY_ENABLED === 'true';
  const config: CareChannelConfig = { enabled, push: enabled && !!pushConfiguration(), email: enabled && process.env.CRM_DELIVERY_ENABLED === 'true' && !!process.env.RESEND_API_KEY && !!process.env.CRM_EMAIL_FROM, alimtalk: false, sms: false, alimtalkTemplateId: null };
  if (!enabled || process.env.CRM_DELIVERY_ENABLED !== 'true' || !process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET) return config;
  const settings = await loadSmsSettings();
  if (!settings.transactionalEnabled || !settings.senderPhone) return config;
  config.sms = true;
  const id = process.env.EDU_CARE_ALIMTALK_TEMPLATE_ID;
  if (!id || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) || !process.env.SOLAPI_KAKAO_PF_ID) return config;
  const result = await createAdminClient().from('crm_templates').select('id,channel,purpose,content,is_active,alimtalk_template_id').eq('id',id).maybeSingle();
  const t = result.data;
  if (!result.error && t?.is_active && t.channel === 'alimtalk' && t.purpose === 'transactional' && t.alimtalk_template_id && t.content === CARE_ALIMTALK_BODY) { config.alimtalk = true; config.alimtalkTemplateId = t.id; }
  return config;
}
type Job = { id: string; lease: string; channel: 'email' | 'alimtalk' | 'sms'; destination: string; name: string; content: string; templateId: string | null };
type Rpc = (name: string,args: Record<string,unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
type Outcome = { status: 'accepted' | 'failed' | 'unknown' | 'skipped'; code: string; providerId?: string };
export async function deliverCareEmail(job: Job, request: typeof fetch = fetch): Promise<Outcome> {
  try {
    const response = await request('https://api.resend.com/emails', { method:'POST', headers: { Authorization:`Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type':'application/json', 'Idempotency-Key':`edu-care-${job.id}` }, body:JSON.stringify({from:process.env.CRM_EMAIL_FROM,to:[job.destination],subject:'[브랜디에듀] 학습 안내',text:job.content}),signal:AbortSignal.timeout(10000) });
    if (!response.ok) return {status:response.status>=500?'unknown':'failed',code:`HTTP_${response.status}`};
    const data = await response.json(); return typeof data.id === 'string' ? {status:'accepted',code:'ACCEPTED',providerId:data.id} : {status:'unknown',code:'MISSING_RECEIPT'};
  } catch { return {status:'unknown',code:'TRANSPORT_UNCERTAIN'}; }
}
export async function deliverCareAlimtalk(job: Job): Promise<Outcome> {
  const db=createAdminClient();
  const [settings, result] = await Promise.all([loadSmsSettings(),db.from('crm_templates').select('is_active,channel,purpose,content,alimtalk_template_id').eq('id',job.templateId!).maybeSingle()]);
  const t=result.data;
  if (result.error || !settings.senderPhone || !settings.transactionalEnabled || !t?.is_active || t.channel!=='alimtalk' || t.purpose!=='transactional' || t.content!==CARE_ALIMTALK_BODY || !t.alimtalk_template_id) return {status:'skipped',code:'TEMPLATE_UNAVAILABLE'};
  return sendCareMobile({to:job.destination,from:settings.senderPhone,type:'ATA',kakaoOptions:{pfId:process.env.SOLAPI_KAKAO_PF_ID!,templateId:t.alimtalk_template_id,variables:{'#{이름}':job.name || '회원'},disableSms:true}});
}
export async function deliverCareSms(job: Job): Promise<Outcome> {
  const settings=await loadSmsSettings();
  if (!settings.transactionalEnabled || !settings.senderPhone) return {status:'skipped',code:'SENDER_UNAVAILABLE'};
  return sendCareMobile({to:job.destination,from:settings.senderPhone,type:'SMS',text:CARE_SMS_BODY});
}
type MobileMessage = Parameters<import('solapi').SolapiMessageService['send']>[0];
async function sendCareMobile(message: MobileMessage): Promise<Outcome> {
  try {
    const {SolapiMessageService}=await import('solapi');
    const pending=new SolapiMessageService(process.env.SOLAPI_API_KEY!,process.env.SOLAPI_API_SECRET!).send(message);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('PROVIDER_TIMEOUT')), 10000); })]).finally(() => clearTimeout(timer));
    if (result.failedMessageList?.length) return {status:'failed',code:'PROVIDER_REJECTED'};
    return result.groupInfo?.groupId ? {status:'accepted',code:'ACCEPTED',providerId:result.groupInfo.groupId} : {status:'unknown',code:'MISSING_RECEIPT'};
  } catch { return {status:'unknown',code:'TRANSPORT_UNCERTAIN'}; }
}

export async function dispatchCareChannels(deps?: {config:CareChannelConfig;rpc:Rpc;send:(job:Job)=>Promise<Outcome>}) {
  const config=deps?.config || await careDeliveryConfiguration();
  if (!config.enabled) return {enabled:false,processed:0};
  const rpc:Rpc=deps?.rpc || ((name,args)=>createAdminClient().rpc(name,args));
  const call=async(name:string,args:Record<string,unknown>)=>{const r=await rpc(name,args);if(r.error)throw new Error('학습 안내 발송 기록을 확인하지 못했습니다.');return r.data;};
  const jobs=await call('edu_claim_care_channels',{p_email:config.email,p_sms:config.sms,p_alimtalk:config.alimtalk,p_template:config.alimtalkTemplateId}) as {id:string;lease:string}[];
  let processed=0, index=0;
  // Three workers keep each invocation bounded; the DB leases at most nine.
  // Lease expiry is UNKNOWN, never an invitation to send the same job again.
  const workers=await Promise.allSettled(Array.from({length:Math.min(3,jobs.length)},async()=>{
    while(index<jobs.length){
      const claim=jobs[index++];
      const job=await call('edu_read_care_channel',{p_id:claim.id,p_lease:claim.lease}) as Job|null;
      const outcome:Outcome=job ? await (deps?.send || (j=>j.channel==='email'?deliverCareEmail(j):j.channel==='sms'?deliverCareSms(j):deliverCareAlimtalk(j)))(job) : {status:'skipped',code:'RECIPIENT_CHANGED'};
      await call('edu_finish_care_channel',{p_id:claim.id,p_lease:claim.lease,p_status:outcome.status,p_code:outcome.code,p_provider:outcome.providerId || null});processed++;
    }
  }));
  if(workers.some(worker=>worker.status==='rejected'))throw new Error('학습 안내 발송 기록을 확인하지 못했습니다.');
  return {enabled:true,processed};
}
