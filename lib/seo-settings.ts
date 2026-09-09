import { unstable_cache } from "next/cache";
import { createAdminClient } from "./supabase/admin";
import { defaultSeoSettings, type SeoSettings } from "./seo-settings-shared";
export const loadSeoSettings = unstable_cache(async (): Promise<SeoSettings> => {
  try {
    const { data, error } = await createAdminClient().from("site_settings").select("value").eq("key", "seo_settings").maybeSingle();
    if (error || !data?.value) return defaultSeoSettings;
    return { title: typeof data.value.title === "string" ? data.value.title : defaultSeoSettings.title, description: typeof data.value.description === "string" ? data.value.description : defaultSeoSettings.description, image: typeof data.value.image === "string" ? data.value.image : "" };
  } catch { return defaultSeoSettings; }
}, ["seo-settings"], { revalidate: 300, tags: ["seo-settings"] });
