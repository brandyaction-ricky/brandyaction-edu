import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";
import { solapiConfigured } from "@/lib/solapi";
import { processDueCrmJobs, sendCampaignById } from "@/lib/crm-engine";

async function highestAdmin(){const user=await getAdminUser();return user?.role==="admin"?user:null}
const cleanPhone=(value:string|null)=>value?.replace(/\D/g,"")||"";
const maskPhone=(value:string)=>value.length>=8?`${value.slice(0,3)}****${value.slice(-4)}`:"****";

export async function GET(){
  const operator=await highestAdmin();if(!operator)return NextResponse.json({error:"최고 관리자만 CRM에 접근할 수 있습니다."},{status:403});
  const admin=createAdminClient();
  const [tags,templates,campaigns,members,memberTags,automations,automationRuns,courses]=await Promise.all([
    admin.from("crm_tags").select("*").order("name"),admin.from("crm_templates").select("*").order("updated_at",{ascending:false}),
    admin.from("crm_campaigns").select("*,crm_templates(name,channel),crm_tags(name)").order("created_at",{ascending:false}).limit(100),
    admin.from("profiles").select("id,email,full_name,phone,status,marketing_consent,marketing_consent_at").neq("status","withdrawn").order("created_at",{ascending:false}),
    admin.from("crm_member_tags").select("member_id,tag_id"),
    admin.from("crm_automations").select("*,crm_templates(name,channel,purpose),crm_tags!crm_automations_trigger_tag_id_fkey(name),courses!crm_automations_trigger_course_id_fkey(title)").order("updated_at",{ascending:false}),
    admin.from("crm_automation_runs").select("id,automation_id,member_id,status,scheduled_for,executed_at,error_message,created_at").order("created_at",{ascending:false}).limit(200),
    admin.from("courses").select("id,title,status").order("display_order",{ascending:false})
  ]);
  const failed=[tags,templates,campaigns,members,memberTags,automations,automationRuns,courses].find(result=>result.error);if(failed?.error)return NextResponse.json({error:`CRM 데이터를 불러오지 못했습니다. (${failed.error.code})`},{status:500});
  return NextResponse.json({tags:tags.data||[],templates:templates.data||[],campaigns:campaigns.data||[],members:(members.data||[]).map(member=>({...member,phone:member.phone?maskPhone(cleanPhone(member.phone)):null})),memberTags:memberTags.data||[],automations:automations.data||[],automationRuns:automationRuns.data||[],courses:courses.data||[],solapiConfigured:solapiConfigured(),alimtalkConfigured:Boolean(process.env.SOLAPI_KAKAO_PF_ID),engineConfigured:Boolean(process.env.CRON_SECRET)});
}

export async function POST(request:Request){
  const operator=await highestAdmin();if(!operator)return NextResponse.json({error:"최고 관리자만 CRM을 변경할 수 있습니다."},{status:403});
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!body)return NextResponse.json({error:"요청 정보를 확인해 주세요."},{status:400});
  const action=String(body.action||"");const admin=createAdminClient();
  if(action==="saveTemplate"){
    const channel=String(body.channel||"sms");const content=String(body.content||"").trim();const name=String(body.name||"").trim();if(!name||!content||!["sms","lms","alimtalk"].includes(channel))return NextResponse.json({error:"템플릿 이름·채널·내용을 확인해 주세요."},{status:400});
    if(channel==="alimtalk"&&!String(body.alimtalkTemplateId||"").trim())return NextResponse.json({error:"알림톡 승인 템플릿 ID를 입력해 주세요."},{status:400});
    const buttons=Array.isArray(body.buttons)?body.buttons.flatMap(item=>{if(!item||typeof item!=="object")return[];const row=item as Record<string,unknown>;const name=String(row.name||"").trim().slice(0,30);const url=String(row.url||"").trim().slice(0,500);return name&&/^https?:\/\//.test(url)?[{name,url}]:[]}):[];
    const payload={name,channel,purpose:String(body.purpose)==="transactional"?"transactional":"marketing",content,alimtalk_template_id:String(body.alimtalkTemplateId||"").trim()||null,buttons,is_active:body.isActive!==false,created_by:operator.id};
    const result=body.id?await admin.from("crm_templates").update(payload).eq("id",String(body.id)):await admin.from("crm_templates").insert(payload);if(result.error)return NextResponse.json({error:"메시지 템플릿을 저장하지 못했습니다."},{status:500});
  }else if(action==="deleteTemplate"){
    const {error}=await admin.from("crm_templates").delete().eq("id",String(body.id));if(error)return NextResponse.json({error:"캠페인에서 사용 중인 템플릿은 삭제할 수 없습니다."},{status:500});
  }else if(action==="saveCampaign"){
    const payload={name:String(body.name||"").trim(),template_id:String(body.templateId||""),target_tag_id:body.targetTagId?String(body.targetTagId):null,status:body.scheduledAt?"scheduled":"draft",scheduled_at:body.scheduledAt?String(body.scheduledAt):null,created_by:operator.id};
    if(!payload.name||!payload.template_id)return NextResponse.json({error:"캠페인 이름과 템플릿을 선택해 주세요."},{status:400});
    const {data,error}=await admin.from("crm_campaigns").insert(payload).select("id").single();if(error)return NextResponse.json({error:"캠페인을 저장하지 못했습니다."},{status:500});return NextResponse.json({ok:true,id:data.id},{status:201});
  }else if(action==="sendCampaign"){
    const campaignId=String(body.campaignId||"");
    try{return NextResponse.json({ok:true,...await sendCampaignById(campaignId)})}catch(reason){return NextResponse.json({error:reason instanceof Error?reason.message:"발송 실패"},{status:502})}
  }else if(action==="cancelCampaign"){
    const {error}=await admin.from("crm_campaigns").update({status:"cancelled"}).eq("id",String(body.campaignId||"")).in("status",["draft","scheduled"]);if(error)return NextResponse.json({error:"캠페인을 취소하지 못했습니다."},{status:500});
  }else if(action==="saveAutomation"){
    const triggerType=String(body.triggerType||"");const delayMinutes=Number(body.delayMinutes||0);const templateId=String(body.templateId||"");const name=String(body.name||"").trim();
    if(!name||!templateId||!["member_joined","marketing_consent","tag_assigned","purchase_completed"].includes(triggerType)||!Number.isInteger(delayMinutes)||delayMinutes<0)return NextResponse.json({error:"자동화 이름·시작 조건·템플릿·대기 시간을 확인해 주세요."},{status:400});
    if(triggerType==="tag_assigned"&&!body.triggerTagId)return NextResponse.json({error:"태그 지정 자동화는 기준 태그가 필요합니다."},{status:400});
    const payload={name,trigger_type:triggerType,trigger_tag_id:triggerType==="tag_assigned"?String(body.triggerTagId):null,trigger_course_id:triggerType==="purchase_completed"&&body.triggerCourseId?String(body.triggerCourseId):null,template_id:templateId,delay_minutes:delayMinutes,is_active:body.isActive===true,created_by:operator.id};
    const result=body.id?await admin.from("crm_automations").update(payload).eq("id",String(body.id)):await admin.from("crm_automations").insert(payload);if(result.error)return NextResponse.json({error:"자동화 규칙을 저장하지 못했습니다."},{status:500});
  }else if(action==="toggleAutomation"){
    const {error}=await admin.from("crm_automations").update({is_active:body.isActive===true}).eq("id",String(body.id||""));if(error)return NextResponse.json({error:"자동화 상태를 변경하지 못했습니다."},{status:500});
  }else if(action==="deleteAutomation"){
    const {error}=await admin.from("crm_automations").delete().eq("id",String(body.id||""));if(error)return NextResponse.json({error:"실행 이력이 있는 자동화를 삭제하지 못했습니다. 일시중지를 사용해 주세요."},{status:409});
  }else if(action==="runEngine"){
    try{return NextResponse.json({ok:true,...await processDueCrmJobs()})}catch(reason){return NextResponse.json({error:reason instanceof Error?reason.message:"자동화 엔진 실행 실패"},{status:500})}
  }else return NextResponse.json({error:"지원하지 않는 CRM 작업입니다."},{status:400});
  await admin.from("audit_logs").insert({actor_user_id:operator.id,action:`crm.${action}`,entity_type:"crm",after_data:body});return NextResponse.json({ok:true});
}
