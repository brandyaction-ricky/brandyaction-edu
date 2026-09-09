import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/server-auth";
import { AdminPageTitle, AdminShell } from "@/app/components/admin-shell";
import { AdminSeoManager } from "@/app/components/admin-seo-manager";
export default async function Page() {
  if (!await getAdminUser("settings")) redirect("/admin?notice=permission_required");
  return <AdminShell active="seo"><AdminPageTitle eyebrow="SEO" title="SEO" description="검색 제목·설명과 SNS 공유 정보를 설정합니다."/><AdminSeoManager/></AdminShell>;
}
