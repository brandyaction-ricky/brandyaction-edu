export function youtubeThumbnailUrl(videoUrl: string) {
  if (!videoUrl) return "";

  try {
    const url = new URL(videoUrl);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";

    const hostname = url.hostname.toLowerCase();
    const videoId = hostname === "youtu.be"
      ? url.pathname.split("/")[1]
      : hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtube-nocookie.com" || hostname.endsWith(".youtube-nocookie.com")
        ? url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]
        : null;

    return videoId && /^[\w-]{11}$/.test(videoId)
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : "";
  } catch {
    return "";
  }
}
