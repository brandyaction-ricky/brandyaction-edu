import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./config";

export async function createClient() {
  const cookieStore = await cookies();
  const { publicUrl, publishableKey } = getSupabasePublicConfig();

  return createServerClient(publicUrl, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component에서는 쿠키를 쓸 수 없습니다.
          // 세션 갱신은 루트 proxy가 처리합니다.
        }
      },
    },
  });
}
