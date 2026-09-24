import { SolapiMessageService, type MessageSchema } from "solapi";
import { createAdminClient } from "@/lib/supabase/admin";

type Template = {
  id: string;
  channel: "sms" | "lms" | "alimtalk";
  purpose: "marketing" | "transactional";
  content: string;
  alimtalk_template_id?: string | null;
  buttons?: unknown;
};
type Member = {
  id: string;
  phone?: string | null;
  full_name?: string | null;
  email?: string | null;
  marketing_consent?: boolean;
  marketing_consent_at?: string | null;
  marketing_opt_out_at?: string | null;
  status?: string;
};

const digits = (value: unknown) => String(value || "").replace(/\D/g, "");
const mask = (phone: string) =>
  phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "미등록";
const render = (content: string, member: Member) =>
  content
    .replaceAll("{{name}}", member.full_name || "회원")
    .replaceAll("{{email}}", member.email || "")
    .replaceAll("#{이름}", member.full_name || "회원");

function provider() {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  const sender = digits(process.env.SOLAPI_SENDER_PHONE);
  if (process.env.CRM_DELIVERY_ENABLED !== "true" || !key || !secret || !sender)
    return null;
  return { service: new SolapiMessageService(key, secret), sender };
}

export function crmDeliveryState() {
  const configured = Boolean(
    process.env.SOLAPI_API_KEY &&
    process.env.SOLAPI_API_SECRET &&
    digits(process.env.SOLAPI_SENDER_PHONE),
  );
  return {
    enabled: process.env.CRM_DELIVERY_ENABLED === "true" && configured,
    configured,
  };
}

function message(
  template: Template,
  member: Member,
  sender: string,
): MessageSchema {
  const content = render(template.content, member);
  if (template.channel === "alimtalk") {
    if (template.purpose === "marketing")
      throw new Error("마케팅 안내는 정보성 알림톡으로 발송할 수 없습니다. 광고 문자 템플릿을 사용해 주세요.");
    if (!process.env.SOLAPI_KAKAO_PF_ID || !template.alimtalk_template_id)
      throw new Error("알림톡 채널·템플릿 설정이 필요합니다.");
    return {
      to: digits(member.phone),
      from: sender,
      text: content,
      type: "ATA",
      kakaoOptions: {
        pfId: process.env.SOLAPI_KAKAO_PF_ID,
        templateId: template.alimtalk_template_id,
      },
    };
  }
  if (template.purpose === "marketing" && !process.env.SOLAPI_OPTOUT_PHONE)
    throw new Error("광고 메시지 무료수신거부 번호가 설정되지 않았습니다.");
  const optout =
    template.purpose === "marketing"
      ? `\n무료수신거부 ${process.env.SOLAPI_OPTOUT_PHONE}`
      : "";
  const advertising =
    template.purpose === "marketing" ? "(광고) 브랜디액션\n" : "";
  return {
    to: digits(member.phone),
    from: sender,
    text: advertising + content + optout,
    type: template.channel === "lms" ? "LMS" : "SMS",
    autoTypeDetect: false,
  };
}

function hasCurrentMarketingConsent(member: Member, now: number) {
  if (member.marketing_consent !== true || !member.marketing_consent_at) return false;
  const consentAt = Date.parse(member.marketing_consent_at);
  if (!Number.isFinite(consentAt) || consentAt > now) return false;
  if (!member.marketing_opt_out_at) return true;
  const optedOutAt = Date.parse(member.marketing_opt_out_at);
  return Number.isFinite(optedOutAt) && optedOutAt < consentAt;
}

async function providerOptOuts(service: SolapiMessageService, sender: string) {
  const blocked = new Set<string>();
  const visited = new Set<string>();
  let startKey: string | undefined;
  for (let page = 0; page < 1000; page += 1) {
    let result;
    try {
      result = await service.getBlacks({ senderNumber: sender, limit: 100, startKey });
    } catch {
      throw new Error("080 수신거부 목록을 확인하지 못해 발송을 중단했습니다.");
    }
    for (const entry of result.blackList) blocked.add(digits(entry.recipientNumber));
    if (!result.nextKey) return blocked;
    if (visited.has(result.nextKey)) break;
    visited.add(result.nextKey);
    startKey = result.nextKey;
  }
  throw new Error("080 수신거부 목록을 끝까지 확인하지 못해 발송을 중단했습니다.");
}

async function sendBatch(
  template: Template,
  members: Member[],
  context: { campaignId?: string; recruitment?: boolean; automationRuns?: Record<string, string> },
) {
  const active = provider();
  if (!active) return { sent: 0, failed: 0, disabled: true };
  if (template.channel === "alimtalk" && template.purpose === "marketing")
    throw new Error("마케팅 안내는 정보성 알림톡으로 발송할 수 없습니다.");
  const db = createAdminClient();
  let currentMembers = members;
  if (template.purpose === "marketing" && members.length) {
    // Recheck current consent and phone after campaign selection or recruitment claims.
    const latest = await db.from("profiles")
      .select("id,phone,full_name,email,marketing_consent,marketing_consent_at,marketing_opt_out_at,status")
      .in("id", members.map((member) => member.id));
    if (latest.error) throw new Error("최신 수신 동의 상태를 확인하지 못해 발송을 중단했습니다.");
    const byId = new Map((latest.data || []).map((member) => [member.id, member]));
    currentMembers = members.flatMap((member) => {
      const current = byId.get(member.id);
      return current && digits(current.phone) === digits(member.phone) ? [current] : [];
    });
  }
  const now = Date.now();
  let eligible = currentMembers.filter(
    (member) => member.status === "active" &&
      /^0\d{8,10}$/.test(digits(member.phone)) &&
      (template.purpose !== "marketing" || hasCurrentMarketingConsent(member, now)),
  );
  if (template.purpose === "marketing" && eligible.length) {
    // SOLAPI's 080 list applies to SMS/LMS, while Alimtalk is restricted above.
    const blocked = await providerOptOuts(active.service, active.sender);
    eligible = eligible.filter((member) => !blocked.has(digits(member.phone)));
  }
  if (!eligible.length)
    return { sent: 0, failed: members.length, disabled: false };
  const logs = eligible.map((member) => ({
    campaign_id: context.campaignId || null,
    automation_run_id: context.automationRuns?.[member.id] || null,
    member_id: member.id,
    channel: template.channel,
    recipient_masked: mask(digits(member.phone)),
    status: "processing",
  }));
  const inserted = await db
    .from("crm_message_logs")
    .insert(logs)
    .select("id,member_id");
  if (inserted.error) throw inserted.error;
  try {
    const response = await active.service.send(
      eligible.map((member) => message(template, member, active.sender)),
    );
    const groupId = response.groupInfo.groupId;
    const ids = inserted.data.map((log) => log.id);
    const accepted = await db
      .from("crm_message_logs")
      .update({
        status: "accepted",
        provider_status: response.groupInfo.status,
        provider_group_id: groupId,
        sent_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (accepted.error && context.recruitment) throw new Error("발송 접수 기록을 확인하지 못했습니다.");
    const failedPhones = new Set(
      response.failedMessageList.map((item) => digits(item.to)),
    );
    const failedIds = inserted.data
      .filter((log) =>
        failedPhones.has(
          digits(eligible.find((member) => member.id === log.member_id)?.phone),
        ),
      )
      .map((log) => log.id);
    if (failedIds.length)
      await db
        .from("crm_message_logs")
        .update({
          status: "failed",
          provider_status: "failed",
          error_message: "메시지 사업자 접수 실패",
        })
        .in("id", failedIds);
    return {
      sent: eligible.length - failedIds.length,
      failed: members.length - eligible.length + failedIds.length,
      groupId,
      disabled: false,
    };
  } catch (error) {
    const reason = context.recruitment ? "메시지 사업자 접수 결과를 확인할 수 없습니다. 자동 재발송하지 않습니다." :
      error instanceof Error
        ? error.message.slice(0, 500)
        : "메시지 사업자 요청 실패";
    await db
      .from("crm_message_logs")
      .update({
        status: context.recruitment ? "unknown" : "failed",
        provider_status: context.recruitment ? "unknown" : "failed",
        error_message: reason,
      })
      .in(
        "id",
        inserted.data.map((log) => log.id),
      );
    throw context.recruitment ? new Error(reason) : error;
  }
}

export async function dispatchDueCrm() {
  if (!provider())
    return { disabled: true, campaigns: 0, automations: 0, sent: 0, failed: 0 };
  const db = createAdminClient();
  let sent = 0,
    failed = 0,
    campaigns = 0,
    automations = 0;
  const campaignQuery = await db
    .from("crm_campaigns")
    .select("*,template:crm_templates(*)")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at")
    .limit(1)
    .maybeSingle();
  if (campaignQuery.error) throw campaignQuery.error;
  const campaign = campaignQuery.data;
  if (campaign) {
    const locked = await db
      .from("crm_campaigns")
      .update({ status: "sending", error_message: null })
      .eq("id", campaign.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (locked.data) {
      try {
        let selectedMembers: Member[];
        let selectedTemplate = campaign.template as Template;
        if (campaign.recruitment_id) {
          if (process.env.EDU_CONVERSION_REVIEW_ENABLED !== "true") throw new Error("모집 운영 기능이 중지되어 발송을 보류했습니다.");
          // Validate provider message configuration before making durable recipient claims.
          message(selectedTemplate, {id: "preflight",phone:"01000000000"}, provider()!.sender);
          // No fallback to tags/all members. SQL rechecks consent, orders and durable claims.
          const claim = await db.rpc('edu_claim_recruitment_delivery', { p_campaign: campaign.id });
          if (claim.error) throw new Error('모집 안내 발송 전 검토가 중단됐습니다. 모집·문구·권한을 다시 확인해 주세요.');
          if (!claim.data || !Array.isArray(claim.data.members) || !claim.data.template)
            throw new Error('모집 안내 대상 응답을 확인하지 못했습니다.');
          selectedMembers = claim.data.members;
          selectedTemplate = claim.data.template;
        } else {
          let ids: string[] | null = null;
          if (campaign.target_tag_id) {
            const tagged = await db
              .from("crm_member_tags")
              .select("member_id")
              .eq("tag_id", campaign.target_tag_id)
              .limit(501);
            if (tagged.error) throw tagged.error;
            if (tagged.data.length > 500)
              throw new Error("캠페인 대상이 500명을 초과했습니다. 대상을 나눠 예약해 주세요.");
            ids = tagged.data.map((row) => row.member_id);
          }
          let memberQuery = db
            .from("profiles")
            .select("id,phone,full_name,email,marketing_consent,status")
            .eq("status", "active")
            .limit(501);
          if (ids)
            memberQuery = memberQuery.in(
              "id",
              ids.length ? ids : ["00000000-0000-0000-0000-000000000000"],
            );
          const memberResult = await memberQuery;
          if (memberResult.error) throw memberResult.error;
          if (memberResult.data.length > 500)
            throw new Error("캠페인 대상이 500명을 초과했습니다. 대상을 나눠 예약해 주세요.");
          selectedMembers = memberResult.data;
        }
        const result = await sendBatch(selectedTemplate, selectedMembers, { campaignId: campaign.id, recruitment: !!campaign.recruitment_id });
        if (result.disabled) throw new Error("발송 설정이 중지됐습니다. 자동 재발송하지 않습니다.");
        sent += result.sent;
        failed += result.failed;
        campaigns += 1;
        await db
          .from("crm_campaigns")
          .update({
            status: "completed",
            sent_at: new Date().toISOString(),
            recipient_count: selectedMembers.length,
            success_count: result.sent,
            failure_count: result.failed,
            provider_group_id: result.groupId || null,
          })
          .eq("id", campaign.id);
      } catch (error) {
        await db
          .from("crm_campaigns")
          .update({
            status: "failed",
            error_message:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "발송 실패",
          })
          .eq("id", campaign.id);
      }
    }
  }
  // Older environments can contain queued automation runs before delivery is
  // connected. Keep those runs held until an operator explicitly enables them.
  if (process.env.CRM_AUTOMATIONS_ENABLED !== "true")
    return { disabled: false, campaigns, automations, sent, failed };
  const runResult = await db
    .from("crm_automation_runs")
    .select(
      "*,automation:crm_automations(*,template:crm_templates(*)),member:profiles(id,phone,full_name,email,marketing_consent,status)",
    )
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
    .limit(100);
  if (runResult.error) throw runResult.error;
  for (const run of runResult.data) {
    const locked = await db
      .from("crm_automation_runs")
      .update({ status: "processing", error_message: null })
      .eq("id", run.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!locked.data) continue;
    try {
      const result = await sendBatch(
        run.automation.template as Template,
        [run.member as Member],
        { automationRuns: { [run.member_id]: run.id } },
      );
      const status = result.sent ? "accepted" : "skipped";
      await db
        .from("crm_automation_runs")
        .update({
          status,
          provider_group_id: result.groupId || null,
          executed_at: new Date().toISOString(),
          error_message: result.sent
            ? null
            : "수신번호·동의 상태를 확인해 주세요.",
        })
        .eq("id", run.id);
      sent += result.sent;
      failed += result.failed;
      automations += 1;
    } catch (error) {
      await db
        .from("crm_automation_runs")
        .update({
          status: "failed",
          executed_at: new Date().toISOString(),
          error_message:
            error instanceof Error ? error.message.slice(0, 500) : "발송 실패",
        })
        .eq("id", run.id);
      failed += 1;
    }
  }
  return { disabled: false, campaigns, automations, sent, failed };
}
