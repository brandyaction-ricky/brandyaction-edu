// Match next.config.ts's allowlist. Legacy content may contain external images;
// leave those browser-loaded instead of proxying arbitrary hosts on the server.
export function canOptimizePublicImage(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["vjmjhaidlqkmascdjocw.supabase.co", "qitqxizuwmmlhlcgsrqe.supabase.co"].includes(url.hostname)
      && url.pathname.startsWith("/storage/v1/object/public/course-assets/");
  } catch { return false; }
}
