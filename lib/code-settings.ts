import { createAdminClient } from "@/lib/supabase/admin";
import { emptyCodeSettings, type CodeSettings } from "@/lib/code-settings-shared";

export async function loadCodeSettings(): Promise<CodeSettings> {
  try {
    const { data, error } = await createAdminClient().from("site_settings").select("value").eq("key", "search_code_settings").maybeSingle();
    if (error || !data?.value || typeof data.value !== "object" || Array.isArray(data.value)) return emptyCodeSettings;
    const value = data.value as Record<string, unknown>;
    return {
      metaCode: typeof value.metaCode === "string" ? value.metaCode : "",
      headerCode: typeof value.headerCode === "string" ? value.headerCode : "",
      bodyCode: typeof value.bodyCode === "string" ? value.bodyCode : "",
    };
  } catch { return emptyCodeSettings; }
}
