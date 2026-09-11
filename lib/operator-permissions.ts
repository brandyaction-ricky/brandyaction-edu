import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/server-auth";
import {
  emptyOperatorPermissions,
  normalizeOperatorPermissions,
  operatorScopes,
  type OperatorPermissions,
  type OperatorScope,
} from "@/lib/operator-scopes";

export {
  normalizeOperatorPermissions,
  sectionScopes,
} from "@/lib/operator-scopes";

export async function permissionsFor(user: { id: string; role: string }) {
  if (user.role === "admin")
    return Object.fromEntries(
      operatorScopes.map((scope) => [scope, true]),
    ) as OperatorPermissions;
  if (user.role !== "staff") return emptyOperatorPermissions();
  const { data } = await createAdminClient()
    .from("site_settings")
    .select("value")
    .eq("key", `edu_staff_permissions_${user.id}`)
    .maybeSingle();
  return normalizeOperatorPermissions(data?.value);
}

export async function getOperatorUser(scope?: OperatorScope) {
  const user = await getAuthenticatedUser();
  if (!user || !["admin", "staff"].includes(user.role)) return null;
  const permissions = await permissionsFor(user);
  if (scope && !permissions[scope]) return null;
  if (
    !scope &&
    user.role !== "admin" &&
    !Object.values(permissions).some(Boolean)
  )
    return null;
  return { ...user, permissions };
}
