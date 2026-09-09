import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser, getAdminSession } from "@/lib/server-auth";
import type { MissionWorkspace } from "@/lib/admin-missions";
import { AdminShell } from "./admin-shell";
import { AdminMissionsManager } from "./admin-missions-manager";

export async function AdminMissionPage({ quizOnly = false }: { quizOnly?: boolean }) {
  const operator = await getAdminUser("products");
  if (!operator) redirect("/admin?notice=permission_required");
  const session = await getAdminSession();
  const { data, error } = await createAdminClient().rpc("admin_mission_workspace", { p_course_id: null });
  return <AdminShell active={quizOnly ? "quizzes" : "missions"}><AdminMissionsManager initial={error ? null : data as MissionWorkspace} initialError={error ? "미션 목록을 불러오지 못했습니다. 새로고침해 주세요." : ""} quizOnly={quizOnly} canReview={operator.role === "admin" || session?.preferences.staffCanManageMembers === true}/></AdminShell>;
}
