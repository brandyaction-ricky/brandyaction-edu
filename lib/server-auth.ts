import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminScope = "products" | "articles" | "orders" | "members" | "settings";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.id || !data.user.email) return null;
    return { id: data.user.id, email: data.user.email };
  } catch {
    return null;
  }
}

export async function getAdminUser(scope?: AdminScope) {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role,status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.status !== "active" || !["staff", "admin"].includes(profile.role)) return null;
  if (scope && profile.role === "staff") {
    if (scope === "settings") return null;
    const { data } = await createAdminClient().from("site_settings").select("value").eq("key", "operator_preferences").maybeSingle();
    const preferences = data?.value && typeof data.value === "object" && !Array.isArray(data.value) ? data.value as Record<string, unknown> : {};
    const key = scope === "products" || scope === "articles" ? "staffCanManageProducts" : scope === "orders" ? "staffCanManageOrders" : "staffCanManageMembers";
    if (preferences[key] !== true) return null;
  }
  return { ...user, role: profile.role as "staff" | "admin" };
}
