import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";
import { sendSolapiMessages, solapiConfigured, type SolapiMessage } from "@/lib/solapi";

async function highestAdmin(){const user=await getAdminUser();return user?.role==="admin"?user:null}
const cleanPhone=(value:string|null)=>value?.replace(/\D/g,"")||"";
const maskPhone=(value:string)=>value.length>=8?`${value.slice(0,3)}****${value.slice(-4)}`:"****";
const render=(text:string,name:string)=>text.replace(/#\{(?:이름|name)\}/g,name||"회원");

export async function GET(){
  const operator=await highestAdmin();if(!operator)return NextResponse.json({error:"최고 관리자만 CRM에 접근할 수 있습니다."},{status:403});
  const admin=createAdminClient();
  const [tags,templates,campaigns,members,memberTags]=await Promise.all([
    admin.from("crm_tags").select("*").order("name"),admin.from("crm_templates").select("*").order("updated_at",{ascending:false}),
    admin.from("crm_campaigns").select("*,crm_templates(name,channel),crm_tags(name)").order("created_at",{ascending:false}).limit(100),
    admin.from("profiles").select("id,email,full_name,phone,status,marketing_consent,marketing_consent_at").neq("status","withdrawn").order("created_at",{ascending:false}),
    admin.from("crm_member_tags").select("member_id,tag_id")
  ]);
  const failed=[tags,templates,campaigns,members,memberTags].find(result=>result.error);if(failed?.error)return NextResponse.json({error:`CRM 데이터를 불러오지 못했습니다. (${failed.error.code})`},{status:500});
  return NextResponse.json({tags:tags.data||[],templates:templates.data||[],campaigns:campaigns.data||[],members:(members.data||[]).map(member=>({...member,phone:member.phone?maskPhone(cleanPhone(member.phone)):null})),memberTags:memberTags.data||[],solapiConfigured:solapiConfigured(),alimtalkConfigured:Boolean(process.env.SOLAPI_KAKAO_PF_ID)});
}

export async function POST(request:Request){
  const operator=await highestAdmin();if(!operator)return NextResponse.json({error:"최고 관리자만 CRM을 변경할 수 있습니다."},{status:403});
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!body)return NextResponse.json({error:"요청 정보를 확인해 주세요."},{status:400});
  const action=String(body.action||"");const admin=createAdminClient();
  if(action==="saveTemplate"){
    const channel=String(body.channel||"sms");const content=String(body.content||"").trim();const name=String(body.name||"").trim();if(!name||!content||!["sms","lms","alimtalk"].includes(channel))return NextResponse.json({error:"템플릿 이름·채널·내용을 확인해 주세요."},{status:400});
    if(channel==="alimtalk"&&!String(body.alimtalkTemplateId||"").trim())return NextResponse.json({error:"알림톡 승인 템플릿 ID를 입력해 주세요."},{status:400});
    const payload={name,channel,purpose:String(body.purpose)==="transactional"?"transactional":"marketing",content,alimtalk_template_id:String(body.alimtalkTemplateId||"").trim()||null,is_active:body.isActive!==false,created_by:operator.id};
    const result=body.id?await admin.from("crm_templates").update(payload).eq("id",String(body.id)):await admin.from("crm_templates").insert(payload);if(result.error)return NextResponse.json({error:"메시지 템플릿을 저장하지 못했습니다."},{status:500});
  }else if(action==="deleteTemplate"){
    const {error}=await admin.from("crm_templates").delete().eq("id",String(body.id));if(error)return NextResponse.json({error:"캠페인에서 사용 중인 템플릿은 삭제할 수 없습니다."},{status:500});
  }else if(action==="saveCampaign"){
    const payload={name:String(body.name||"").trim(),template_id:String(body.templateId||""),target_tag_id:body.targetTagId?String(body.targetTagId):null,status:body.scheduledAt?"scheduled":"draft",scheduled_at:body.scheduledAt?String(body.scheduledAt):null,created_by:operator.id};
    if(!payload.name||!payload.template_id)return NextResponse.json({error:"캠페인 이름과 템플릿을 선택해 주세요."},{status:400});
    const {data,error}=await admin.from("crm_campaigns").insert(payload).select("id").single();if(error)return NextResponse.json({error:"캠페인을 저장하지 못했습니다."},{status:500});return NextResponse.json({ok:true,id:data.id},{status:201});
  }else if(action==="sendCampaign"){
    const campaignId=String(body.campaignId||"");
    const {data:campaign}=await admin.from("crm_campaigns").select("*,crm_templates(*)").eq("id",campaignId).maybeSingle();const template=Array.isArray(campaign?.crm_templates)?campaign.crm_templates[0]:campaign?.crm_templates;if(!campaign||!template)return NextResponse.json({error:"캠페인 또는 템플릿을 찾을 수 없습니다."},{status:404});
    if(!["draft","scheduled","failed"].includes(campaign.status))return NextResponse.json({error:"이미 처리 중이거나 발송된 캠페인입니다."},{status:409});
    let memberIds:string[]|null=null;if(campaign.target_tag_id){const {data}=await admin.from("crm_member_tags").select("member_id").eq("tag_id",campaign.target_tag_id);memberIds=(data||[]).map(row=>row.member_id);if(!memberIds.length)return NextResponse.json({error:"선택한 태그에 해당하는 회원이 없습니다."},{status:400});}
    let query=admin.from("profiles").select("id,full_name,phone").eq("status","active").not("phone","is",null).limit(500);if(template.purpose==="marketing")query=query.eq("marketing_consent",true);if(memberIds)query=query.in("id",memberIds);
    const {data:recipients,error:recipientError}=await query;if(recipientError)return NextResponse.json({error:"발송 대상을 조회하지 못했습니다."},{status:500});if(!recipients?.length)return NextResponse.json({error:"마케팅 수신 동의와 휴대폰 정보가 모두 있는 대상 회원이 없습니다."},{status:400});
    const channel=template.channel as "sms"|"lms"|"alimtalk";if(!solapiConfigured())return NextResponse.json({error:"SOLAPI API 키·시크릿·발신번호 환경변수를 먼저 등록해 주세요."},{status:503});
    if(template.purpose==="marketing"&&channel!=="alimtalk"&&!process.env.SOLAPI_OPTOUT_PHONE)return NextResponse.json({error:"광고 메시지 발송에는 무료 수신거부 번호(SOLAPI_OPTOUT_PHONE)가 필요합니다."},{status:503});
    if(channel==="alimtalk"&&!process.env.SOLAPI_KAKAO_PF_ID)return NextResponse.json({error:"알림톡 발신 프로필 ID가 설정되지 않았습니다."},{status:503});
    const optout=(process.env.SOLAPI_OPTOUT_PHONE||"").replace(/\D/g,"");const messages:SolapiMessage[]=recipients.map(recipient=>{let text=render(template.content,recipient.full_name||"회원");if(template.purpose==="marketing"&&channel!=="alimtalk")text=`(광고) ${text}\n무료수신거부 ${optout}`;return{to:cleanPhone(recipient.phone),text,type:channel==="sms"?"SMS":channel==="lms"?"LMS":"ATA",...(channel==="alimtalk"?{kakaoOptions:{pfId:process.env.SOLAPI_KAKAO_PF_ID!,templateId:template.alimtalk_template_id}}:{})}});
    await admin.from("crm_campaigns").update({status:"sending",recipient_count:messages.length,error_message:null}).eq("id",campaignId);
    try{const result=await sendSolapiMessages(messages);await admin.from("crm_campaigns").update({status:"completed",sent_at:new Date().toISOString(),success_count:messages.length,failure_count:0,provider_group_id:result.groupId}).eq("id",campaignId);await admin.from("crm_message_logs").insert(recipients.map((recipient,index)=>({campaign_id:campaignId,member_id:recipient.id,channel,recipient_masked:maskPhone(messages[index].to),status:"queued",provider_group_id:result.groupId,sent_at:new Date().toISOString()})));return NextResponse.json({ok:true,sent:messages.length,groupId:result.groupId});}catch(reason){const message=reason instanceof Error?reason.message:"발송 실패";await admin.from("crm_campaigns").update({status:"failed",failure_count:messages.length,error_message:message}).eq("id",campaignId);return NextResponse.json({error:message},{status:502});}
  }else return NextResponse.json({error:"지원하지 않는 CRM 작업입니다."},{status:400});
  await admin.from("audit_logs").insert({actor_user_id:operator.id,action:`crm.${action}`,entity_type:"crm",after_data:body});return NextResponse.json({ok:true});
}
