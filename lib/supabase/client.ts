"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./config";

export function createClient() {
  const { publicUrl, publishableKey } = getSupabasePublicConfig();
  return createBrowserClient(publicUrl, publishableKey);
}
