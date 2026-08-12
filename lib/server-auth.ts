import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDevelopmentAdminBypassEnabled } from "@/lib/app-environment";
import { randomUUID } from "node:crypto";

export type AdminScope = "products" | "articles" | "orders" | "members" | "settings";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

const DEVELOPMENT_ADMIN_EMAIL = "dev-admin@brandyaction.local";

async function getDevelopmentAdminUser() {
  const admin = createAdminClient();
  const { data: existingAdmin } = await admin
    .from("profiles")
    .select("id,email,role")
    .eq("role", "admin")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingAdmin) {
    return { id: existingAdmin.id, email: existingAdmin.email, role: "admin" as const };
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id,email")
    .eq("email", DEVELOPMENT_ADMIN_EMAIL)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingProfile) {
    const { error } = await admin
      .from("profiles")
      .update({ full_name: "DEV 관리자", role: "admin", status: "active" })
      .eq("id", existingProfile.id);
    if (error) return null;
    return { id: existingProfile.id, email: existingProfile.email, role: "admin" as const };
  }

  const { data: created } = await admin.auth.admin.createUser({
    email: DEVELOPMENT_ADMIN_EMAIL,
    password: `${randomUUID()}Aa1!`,
    email_confirm: true,
    user_metadata: { full_name: "DEV 관리자" },
  });

  let developmentUser = created.user;
  if (!developmentUser) {
    const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    developmentUser = listed.users.find((user) => user.email === DEVELOPMENT_ADMIN_EMAIL) ?? null;
  }
  if (!developmentUser) return null;

  const { error } = await admin.from("profiles").upsert(
    {
      id: developmentUser.id,
      email: DEVELOPMENT_ADMIN_EMAIL,
      full_name: "DEV 관리자",
      role: "admin",
      status: "active",
    },
    { onConflict: "id" },
  );
  if (error) return null;

  return { id: developmentUser.id, email: DEVELOPMENT_ADMIN_EMAIL, role: "admin" as const };
}

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
  if (isDevelopmentAdminBypassEnabled()) {
    return getDevelopmentAdminUser();
  }

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
