export function safePublicHref(value: unknown, fallback = "/") {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  try {
    const url = new URL(candidate);
    return ["https:", "mailto:", "tel:"].includes(url.protocol) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

export function safeExternalUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
