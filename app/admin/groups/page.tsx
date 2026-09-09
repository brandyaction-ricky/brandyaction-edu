import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/server-auth";
import { AdminPageTitle, AdminShell } from "@/app/components/admin-shell";
import { AdminGroupsManager } from "@/app/components/admin-groups-manager";
export default async function Page() {
  if (!await getAdminUser("members")) redirect("/admin?notice=permission_required");
  return <AdminShell active="groups"><AdminPageTitle eyebrow="GROUPS" title="회원 그룹 관리" description="교육·신청 목적에 따라 회원을 묶고 그룹별 참여자를 관리합니다. 고객 행동 태그와 별도로 운영합니다."/><AdminGroupsManager/></AdminShell>;
}
