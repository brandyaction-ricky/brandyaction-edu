import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { emptyCodeSettings, type CodeSettings } from "@/lib/code-settings-shared";

async function queryCodeSettings(): Promise<CodeSettings> {
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

export const loadCodeSettings = unstable_cache(queryCodeSettings, ["public-code-settings"], {
  revalidate: 300,
});
