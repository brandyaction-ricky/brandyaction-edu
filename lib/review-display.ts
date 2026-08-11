export function maskReviewerName(value: string | null | undefined) {
  const name = (value || "수강생").trim();
  if (!name) return "수강생";
  if (name.length === 1) return `${name}*`;
  return `${name[0]}${"*".repeat(Math.min(2, name.length - 1))}`;
}

export function publicReviewerName(realName: string | null | undefined, nickname: string | null | undefined) {
  const masked = maskReviewerName(realName);
  const safeNickname = (nickname || "").trim().slice(0, 20);
  return safeNickname ? `${masked} · ${safeNickname}` : masked;
}
