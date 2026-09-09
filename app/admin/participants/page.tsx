import { redirect } from "next/navigation";
import { AdminPageTitle, AdminShell } from "@/app/components/admin-shell";
import { AdminParticipantsManager } from "@/app/components/admin-participants-manager";
import { getAdminUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ParticipantReport } from "@/lib/admin-participants";
export default async function Page() {
  if (!await getAdminUser("members")) redirect("/admin?notice=permission_required");
  const { data, error } = await createAdminClient().rpc("admin_participant_report");
  return <AdminShell active="participants"><AdminPageTitle eyebrow="PARTICIPANTS" title="참가자 현황" description="기수별 콘텐츠 진도와 미션 실행·승인, 달성 레벨을 한 화면에서 확인합니다."/><AdminParticipantsManager initial={error ? null : data as ParticipantReport}/></AdminShell>;
}
