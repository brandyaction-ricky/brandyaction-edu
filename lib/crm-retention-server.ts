import { SolapiMessageService, type KakaoAlimtalkTemplate } from 'solapi';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBatch, type Template, type Member } from '@/lib/crm-delivery';
import { loadSmsSettings, marketingAllowedNow } from '@/lib/crm-sms-settings';
import { retentionFailure } from '@/lib/crm-retention';

// A template ID entered by an operator is not evidence of provider approval.
export function verifiedRetentionTemplate(local: Template, remote: KakaoAlimtalkTemplate, channel: string) {
  return local.is_active === true && local.channel === 'alimtalk' && local.purpose === 'transactional'
    && remote.status === 'APPROVED' && !remote.isHidden && remote.channelId === channel
    && remote.templateId === local.alimtalk_template_id && ['BA','EX'].includes(remote.messageType)
    && typeof remote.content === 'string' && remote.content.replaceAll('\r\n','\n') === local.content.replaceAll('\r\n','\n')
    && [...local.content.matchAll(/#\{[^}]+\}|\{\{[^}]+\}\}/g)].every(match => match[0] === '#{이름}')
    && (!remote.variables || remote.variables.every(variable => ['이름','#{이름}'].includes(variable.name)));
}

export async function syncRetentionReceipts(db: ReturnType<typeof createAdminClient>, service: SolapiMessageService) {
  const pending=await db.from('crm_automation_runs').select('id,provider_group_id').eq('status','accepted')
    .like('trigger_key','retention:%').order('retention_receipt_checked_at',{nullsFirst:true}).limit(10);
  if(pending.error)throw new Error('수강 독려 수신 확인 목록을 읽지 못했습니다.');
  for(const run of pending.data || []) {
    if(!run.provider_group_id)continue;
    // Rotate pending groups so a slow/unknown provider receipt cannot starve
    // newer accepted sends on every cron run. This is a check time, not delivery.
    const checked=await db.from('crm_automation_runs').update({retention_receipt_checked_at:new Date().toISOString()}).eq('id',run.id).eq('status','accepted');
    if(checked.error)throw new Error('알림톡 수신 조회 시각을 저장하지 못했습니다.');
    let response;
    try{response=await service.getGroupMessages(run.provider_group_id,{limit:2});}catch{continue;}
    const messages=Object.values(response.messageList);
    // Retention uses exactly one ATA per group. Never infer reception from a
    // successful HTTP request/group status, or from an SMS fallback.
    if(response.nextKey || messages.length!==1 || messages[0].type!=='ATA' || messages[0].groupId!==run.provider_group_id)continue;
    const code=messages[0].statusCode;
    if(!code || !/^\d{4}$/.test(code) || ['2000','3000'].includes(code))continue;
    const received=code==='4000',at=new Date().toISOString();
    const logs=await db.from('crm_message_logs').update({status:received?'delivered':'failed',provider_status:code,
      delivered_at:received?at:null,error_message:received?null:`알림톡 수신 실패 · 상태 코드 ${code}`})
      .eq('automation_run_id',run.id).eq('provider_group_id',run.provider_group_id);
    if(logs.error)throw new Error('알림톡 수신 확인 증빙을 저장하지 못했습니다.');
    const saved=await db.from('crm_automation_runs').update({status:received?'completed':'failed',error_message:received?null:`알림톡 수신 실패 · 상태 코드 ${code}`})
      .eq('id',run.id).eq('status','accepted');
    if(saved.error)throw new Error('알림톡 수신 결과를 저장하지 못했습니다.');
  }
}

export async function dispatchRetentionCrm() {
  const paused={disabled:true,queued:0,sent:0,failed:0,skipped:0};
  if (process.env.CRM_RETENTION_ENABLED !== 'true' || process.env.CRM_AUTOMATIONS_ENABLED !== 'true'
    || process.env.CRM_DELIVERY_ENABLED !== 'true' || process.env.CRM_AUTOMATIONS_PURCHASE_ONLY === 'true'
    || !process.env.SOLAPI_API_KEY || !process.env.SOLAPI_API_SECRET || !process.env.SOLAPI_KAKAO_PF_ID) return paused;
  const settings=await loadSmsSettings();
  // Even service messages use the existing daytime window; no surprise night sends.
  if (!settings.transactionalEnabled || !settings.senderPhone || !marketingAllowedNow()) return paused;
  const db=createAdminClient();
  const service=new SolapiMessageService(process.env.SOLAPI_API_KEY,process.env.SOLAPI_API_SECRET);
  await syncRetentionReceipts(db,service);
  const scan=await db.rpc('edu_scan_retention_automations');
  if(scan.error)throw new Error('수강 독려 대상을 확인하지 못했습니다.');
  const result=await db.from('crm_automation_runs').select('id,automation:crm_automations(template:crm_templates(*))')
    .eq('status','pending').like('trigger_key','retention:%').lte('scheduled_for',new Date().toISOString()).order('scheduled_for').limit(10);
  if(result.error)throw new Error('수강 독려 대기열을 확인하지 못했습니다.');
  let sent=0,failed=0,skipped=0;
  for(const row of result.data || []) {
    // Nested relation shape is guaranteed by the FK; never use the scan's stale
    // recipient snapshot. All identity/contact/rule checks happen in authorize.
    const template=(row.automation as unknown as {template:Template})?.template;
    let approved=false;
    try {
      approved=!!template?.alimtalk_template_id && verifiedRetentionTemplate(template,
        await service.getKakaoAlimtalkTemplate(template.alimtalk_template_id),process.env.SOLAPI_KAKAO_PF_ID);
    } catch { /* No send without a current approval response. */ }
    if(!approved) {
      const held=await db.from('crm_automation_runs').update({status:'failed',error_message:retentionFailure.TEMPLATE_UNVERIFIED,executed_at:new Date().toISOString()}).eq('id',row.id).eq('status','pending');
      if(held.error)throw new Error('알림톡 검증 실패 기록을 저장하지 못했습니다.');
      failed++;continue;
    }
    const claim=await db.rpc('edu_authorize_retention_run',{p_run:row.id,p_template:template.id,p_content:template.content,p_provider_template:template.alimtalk_template_id});
    if(claim.error)throw new Error('발송 직전 수강 독려 조건을 확인하지 못했습니다.');
    if(!claim.data){skipped++;continue;}
    const member=claim.data as Member;
    let accepted=false,groupId:string|null=null,reason:string|null=null;
    try {
      const delivery=await sendBatch(template,[member],{retention:true,automationRuns:{[member.id]:row.id}},settings);
      accepted=delivery.sent===1;groupId=delivery.groupId || null;
      if(!accepted)reason='발송업체 접수 실패 또는 연락처·발송 설정을 확인해 주세요.';
    }catch {reason=retentionFailure.PROVIDER_UNKNOWN;}
    // Processing is intentionally not reclaimed after crashes/network uncertainty.
    // Provider delivery receipts resolve accepted separately in syncRetentionReceipts.
    const finished=await db.from('crm_automation_runs').update({status:accepted?'accepted':'failed',provider_group_id:groupId,error_message:reason,executed_at:new Date().toISOString()}).eq('id',row.id).eq('status','processing');
    if(finished.error)throw new Error('접수 결과 기록을 확인하지 못했습니다. 자동 재발송하지 않습니다.');
    if(accepted)sent++;else failed++;
  }
  return {disabled:false,queued:Number(scan.data)||0,sent,failed,skipped};
}
