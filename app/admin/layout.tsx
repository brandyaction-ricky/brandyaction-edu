import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) redirect("/login?error=service_unavailable");
  {
    const supabase = await createClient();
    const { data: authData, error } = await supabase.auth.getClaims();
    const userId = authData?.claims?.sub;
    if (error || !userId) redirect("/login?next=/admin");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role,status")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.status !== "active" || !["staff", "admin"].includes(profile.role)) {
      redirect("/my?notice=admin_required");
    }
  }
  return children;
}
