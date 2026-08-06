import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function LegacySessionPage() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) redirect("/login?next=/my/cohort");
  const { data: enrollment } = await supabase.from("enrollments").select("id").eq("user_id", user.user.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle();
  redirect(enrollment ? `/my/cohort/${enrollment.id}` : "/my/cohort");
}
