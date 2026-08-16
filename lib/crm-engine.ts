import { createAdminClient } from "@/lib/supabase/admin";
import { getSolapiGroupStatus, sendSolapiMessages, solapiConfigured, type SolapiMessage } from "@/lib/solapi";

type Button={name?:string;url?:string};
type TemplateRow={id:string;name:string;channel:"sms"|"lms"|"alimtalk";purpose:"marketing"|"transactional";content:string;alimtalk_template_id:string|null;buttons:Button[]|null;is_active:boolean};
type CampaignRow={id:string;name:string;status:string;target_tag_id:string|null;template_id:string;crm_templates:TemplateRow|TemplateRow[]|null};
type AutomationRow={id:string;name:string;is_active:boolean;template_id:string;crm_templates:TemplateRow|TemplateRow[]|null};
type AutomationRunRow={id:string;automation_id:string;member_id:string|null;status:string;crm_automations:AutomationRow|AutomationRow[]|null};
type Recipient={id:string;full_name:string|null;phone:string|null;status:string;marketing_consent:boolean};

const one=<T,>(value:T|T[]|null)=>Array.isArray(value)?value[0]||null:value;
const cleanPhone=(value:string|null)=>value?.replace(/\D/g,"")||"";
const maskPhone=(value:string)=>value.length>=8?`${value.slice(0,3)}****${value.slice(-4)}`:"****";
const render=(text:string,name:string)=>text.replace(/#\{(?:이름|name)\}/g,name||"회원");

function validButtons(value:Button[]|null){return Array.isArray(value)?value.filter((button)=>button.name&&button.url&&/^https?:\/\//.test(button.url)):[]}
function buildMessage(template:TemplateRow,recipient:Recipient):SolapiMessage{
  const channel=template.channel;
  const buttons=validButtons(template.buttons);
  let text=render(template.content,recipient.full_name||"회원");
  if(channel!=="alimtalk"&&buttons.length)text+=buttons.map((button)=>`\n${button.name}: ${button.url}`).join("");
  if(template.purpose==="marketing"&&channel!=="alimtalk"){
    const optout=(process.env.SOLAPI_OPTOUT_PHONE||"").replace(/\D/g,"");
    if(!optout)throw new Error("광고 메시지 발송에는 무료 수신거부 번호가 필요합니다.");
    text=`(광고) ${text}\n무료수신거부 ${optout}`;
  }
  if(channel==="alimtalk"){
    const pfId=process.env.SOLAPI_KAKAO_PF_ID||"";
    if(!pfId||!template.alimtalk_template_id)throw new Error("알림톡 발신 프로필과 승인 템플릿 ID가 필요합니다.");
    return {to:cleanPhone(recipient.phone),text,type:"ATA",kakaoOptions:{pfId,templateId:template.alimtalk_template_id,...(buttons.length?{buttons:buttons.map((button)=>({buttonType:"WL" as const,buttonName:button.name!,linkMo:button.url!,linkPc:button.url!}))}:{})}};
  }
  return {to:cleanPhone(recipient.phone),text,type:channel==="sms"?"SMS":"LMS"};
}

function eligible(template:TemplateRow,recipient:Recipient){
  return recipient.status==="active"&&Boolean(cleanPhone(recipient.phone))&&(template.purpose!=="marketing"||recipient.marketing_consent);
}

export async function sendCampaignById(campaignId:string){
  if(!solapiConfigured())throw new Error("SOLAPI API 키·시크릿·발신번호가 설정되지 않았습니다.");
  const admin=createAdminClient();
  const claim=await admin.from("crm_campaigns").update({status:"sending",error_message:null}).eq("id",campaignId).in("status",["draft","scheduled","failed"]).select("id").maybeSingle();
  if(claim.error||!claim.data)throw new Error("이미 처리 중이거나 발송된 캠페인입니다.");
  const {data}=await admin.from("crm_campaigns").select("id,name,status,target_tag_id,template_id,crm_templates(*)").eq("id",campaignId).single();
  const campaign=data as unknown as CampaignRow;
  const template=one(campaign.crm_templates);
  if(!template||!template.is_active){await admin.from("crm_campaigns").update({status:"failed",error_message:"사용 가능한 메시지 템플릿을 찾을 수 없습니다."}).eq("id",campaignId);throw new Error("사용 가능한 메시지 템플릿을 찾을 수 없습니다.");}
  let memberIds:string[]|null=null;
  if(campaign.target_tag_id){const tagged=await admin.from("crm_member_tags").select("member_id").eq("tag_id",campaign.target_tag_id);memberIds=(tagged.data||[]).map((row)=>row.member_id);}
  let query=admin.from("profiles").select("id,full_name,phone,status,marketing_consent").eq("status","active").not("phone","is",null).limit(500);
  if(template.purpose==="marketing")query=query.eq("marketing_consent",true);
  if(memberIds)query=query.in("id",memberIds.length?memberIds:["00000000-0000-0000-0000-000000000000"]);
  const result=await query;
  if(result.error){await admin.from("crm_campaigns").update({status:"failed",error_message:"발송 대상을 조회하지 못했습니다."}).eq("id",campaignId);throw new Error("발송 대상을 조회하지 못했습니다.");}
  const recipients=(result.data||[]) as Recipient[];
  if(!recipients.length){await admin.from("crm_campaigns").update({status:"failed",error_message:"발송 가능한 대상 회원이 없습니다."}).eq("id",campaignId);throw new Error("발송 가능한 대상 회원이 없습니다.");}
  const messages=recipients.map((recipient)=>buildMessage(template,recipient));
  try{
    const sent=await sendSolapiMessages(messages);
    await admin.from("crm_campaigns").update({status:"sending",recipient_count:messages.length,success_count:0,failure_count:0,provider_group_id:sent.groupId,sent_at:new Date().toISOString()}).eq("id",campaignId);
    await admin.from("crm_message_logs").insert(recipients.map((recipient,index)=>({campaign_id:campaignId,member_id:recipient.id,channel:template.channel,recipient_masked:maskPhone(messages[index].to),status:"accepted",provider_status:"accepted",provider_group_id:sent.groupId,sent_at:new Date().toISOString()})));
    return {sent:messages.length,groupId:sent.groupId};
  }catch(reason){const message=reason instanceof Error?reason.message:"발송 실패";await admin.from("crm_campaigns").update({status:"failed",failure_count:messages.length,error_message:message}).eq("id",campaignId);throw reason;}
}

export async function sendAutomationRunById(runId:string){
  if(!solapiConfigured())throw new Error("SOLAPI 환경변수가 설정되지 않았습니다.");
  const admin=createAdminClient();
  const claim=await admin.from("crm_automation_runs").update({status:"processing",error_message:null}).eq("id",runId).eq("status","pending").select("id").maybeSingle();
  if(claim.error||!claim.data)throw new Error("이미 처리된 자동화 실행입니다.");
  const {data}=await admin.from("crm_automation_runs").select("id,automation_id,member_id,status,crm_automations(id,name,is_active,template_id,crm_templates(*))").eq("id",runId).single();
  const run=data as unknown as AutomationRunRow;
  const automation=one(run.crm_automations);
  const template=automation?one(automation.crm_templates):null;
  if(!automation?.is_active||!template?.is_active||!run.member_id){await admin.from("crm_automation_runs").update({status:"skipped",error_message:"자동화·템플릿·회원 상태를 확인해 주세요.",executed_at:new Date().toISOString()}).eq("id",runId);return {skipped:true};}
  const memberResult=await admin.from("profiles").select("id,full_name,phone,status,marketing_consent").eq("id",run.member_id).maybeSingle();
  const member=memberResult.data as Recipient|null;
  if(!member||!eligible(template,member)){await admin.from("crm_automation_runs").update({status:"skipped",error_message:"수신 동의·휴대폰·회원 상태 조건에서 제외되었습니다.",executed_at:new Date().toISOString()}).eq("id",runId);return {skipped:true};}
  try{
    const message=buildMessage(template,member);
    const sent=await sendSolapiMessages([message]);
    await admin.from("crm_automation_runs").update({status:"accepted",provider_group_id:sent.groupId,executed_at:new Date().toISOString()}).eq("id",runId);
    await admin.from("crm_message_logs").insert({automation_run_id:runId,member_id:member.id,channel:template.channel,recipient_masked:maskPhone(message.to),status:"accepted",provider_status:"accepted",provider_group_id:sent.groupId,sent_at:new Date().toISOString()});
    return {sent:1,groupId:sent.groupId};
  }catch(reason){const message=reason instanceof Error?reason.message:"자동화 발송 실패";await admin.from("crm_automation_runs").update({status:"failed",error_message:message,executed_at:new Date().toISOString()}).eq("id",runId);throw reason;}
}

async function syncGroup(groupId:string,status:Awaited<ReturnType<typeof getSolapiGroupStatus>>){
  const admin=createAdminClient();
  const done=status.pending===0;
  await admin.from("crm_campaigns").update({recipient_count:status.total,success_count:status.success,failure_count:status.failed,...(done?{status:status.success>0?"completed":"failed"}:{})}).eq("provider_group_id",groupId).eq("status","sending");
  if(done)await admin.from("crm_automation_runs").update({status:status.success>0?"completed":"failed"}).eq("provider_group_id",groupId).eq("status","accepted");
  if(done)await admin.from("crm_message_logs").update({status:status.success>0?"completed":"failed",provider_status:status.success>0?"success":"failed",...(status.success>0?{delivered_at:new Date().toISOString()}:{})}).eq("provider_group_id",groupId).in("status",["accepted","queued"]);
}

export async function processDueCrmJobs(){
  const admin=createAdminClient();
  const now=new Date().toISOString();
  const [campaignResult,runResult,activeCampaigns,activeRuns]=await Promise.all([
    admin.from("crm_campaigns").select("id").eq("status","scheduled").lte("scheduled_at",now).limit(10),
    admin.from("crm_automation_runs").select("id").eq("status","pending").lte("scheduled_for",now).order("scheduled_for").limit(25),
    admin.from("crm_campaigns").select("provider_group_id").eq("status","sending").not("provider_group_id","is",null).limit(50),
    admin.from("crm_automation_runs").select("provider_group_id").eq("status","accepted").not("provider_group_id","is",null).limit(50)
  ]);
  let campaigns=0,automations=0,failed=0;
  for(const row of campaignResult.data||[]){try{await sendCampaignById(row.id);campaigns++}catch{failed++}}
  for(const row of runResult.data||[]){try{await sendAutomationRunById(row.id);automations++}catch{failed++}}
  const groups=[...new Set([...(activeCampaigns.data||[]),...(activeRuns.data||[])].flatMap((row)=>row.provider_group_id?[row.provider_group_id]:[]))];
  for(const groupId of groups){try{await syncGroup(groupId,await getSolapiGroupStatus(groupId))}catch{failed++}}
  return {campaigns,automations,synced:groups.length,failed};
}
