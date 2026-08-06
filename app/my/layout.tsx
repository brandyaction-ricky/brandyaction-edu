import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) redirect("/login?error=service_unavailable");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) redirect("/login?next=/my");
  const { data: profile } = await supabase.from("profiles").select("status").eq("id", userId).maybeSingle();
  if (!profile || profile.status !== "active") {
    return <main className="payment-result-page"><section><h1>계정 이용이 제한되었습니다</h1><p>구매 내역과 학습 콘텐츠에 접근할 수 없습니다. 고객센터에 문의해 주세요.</p><form action="/auth/signout" method="post"><button className="button button-dark" type="submit">로그아웃</button></form></section></main>;
  }
  return children;
}
