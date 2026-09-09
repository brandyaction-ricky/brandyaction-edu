import { redirect } from "next/navigation";
import "../admin-operations.css";
import "../admin-studio.css";
import "../admin-workspace.css";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getAdminSession } from "@/lib/server-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) redirect("/login?error=service_unavailable");
  const operator = await getAdminSession();
  if (!operator) redirect("/login?next=/admin");
  return children;
}
