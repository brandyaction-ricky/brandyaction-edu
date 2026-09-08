import type { CurriculumWeek } from "@/app/data";
import { validateQuiz } from "./mission-quiz";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const RESOURCE_MAX_BYTES = 50 * 1024 * 1024;
export const RESOURCE_MIME: Record<string, string> = {
  pdf: "application/pdf", zip: "application/zip", txt: "text/plain", csv: "text/csv", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  hwp: "application/x-hwp", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
export function resourceMime(name: string) { return RESOURCE_MIME[name.split(".").pop()?.toLowerCase() || ""] || null; }
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function validateCurriculum(value: unknown, courseId = ""): string | null {
  if (!Array.isArray(value) || value.length > 52) return "섹션은 최대 52개까지 등록할 수 있습니다.";
  const weeks = value as CurriculumWeek[];
  const ids = new Set<string>();
  let count = 0;
  for (const w of weeks) {
    if (!w || typeof w.id !== "string" || !w.id || ids.has(w.id)) return "섹션 ID를 확인해 주세요.";
    ids.add(w.id);
    if (typeof w.title !== "string" || !w.title.trim() || w.title.length > 200 || typeof w.goal !== "string" || w.goal.length > 2000 || !Array.isArray(w.lessons)) return "섹션 제목·목표를 확인해 주세요.";
    for (const l of w.lessons) {
      if (++count > 500) return "한 클래스의 콘텐츠는 최대 500개까지 등록할 수 있습니다.";
      if (!l || typeof l.id !== "string" || !l.id || ids.has(l.id)) return "중복된 콘텐츠가 있습니다.";
      ids.add(l.id);
      if (typeof l.title !== "string" || !l.title.trim() || l.title.length > 200 || typeof l.description !== "string" || l.description.length > 2000 || typeof l.duration !== "string" || l.duration.length > 100) return "콘텐츠 제목·설명·분량을 확인해 주세요.";
      if (!["VOD", "자료", "텍스트", "링크"].includes(l.kind)) return "지원하지 않는 콘텐츠 형식입니다.";
      if (l.accessMode && !["enrolled", "member"].includes(l.accessMode)) return "콘텐츠 접근 범위를 확인해 주세요.";
      if ((l.kind === "VOD" || l.kind === "링크") && l.contentUrl && !httpsUrl(l.contentUrl)) return `${l.title}: https 링크를 입력해 주세요.`;
      if (l.bodyText && (typeof l.bodyText !== "string" || l.bodyText.length > 50000)) return "텍스트 본문은 50,000자 이내로 입력해 주세요.";
      if (l.resourcePath && (typeof l.resourcePath !== "string" || !courseId || !l.resourcePath.startsWith(`${courseId}/`) || l.resourcePath.includes(".."))) return "이 클래스에 업로드한 자료만 연결할 수 있습니다.";
      if (l.mission) {
        const m = l.mission;
        if (typeof m.title !== "string" || !m.title.trim() || m.title.length > 200 || typeof m.instructions !== "string" || m.instructions.length > 10000 || !["text", "link", "mixed", "quiz"].includes(m.submissionType)) return `${l.title}: 과제 제목·안내·제출 형식을 확인해 주세요.`;
        if (m.submissionType === "quiz" && !m.quiz) return "퀴즈 전용 과제에는 퀴즈가 필요합니다.";
        if (m.quiz) { const error = validateQuiz(m.quiz); if (error) return `${l.title}: ${error}`; }
      }
      // Drafts may be incomplete, but member-facing offers must deliver something.
      if (w.isPublished !== false && l.isPublished !== false && l.accessMode === "member") {
        if (l.kind === "자료" && !l.resourcePath && !l.resourceName) return `${l.title}: 무료 제공할 자료 파일을 선택해 주세요.`;
        if (l.kind === "텍스트" && !l.bodyText?.trim()) return `${l.title}: 무료 콘텐츠 본문을 입력해 주세요.`;
        if ((l.kind === "VOD" || l.kind === "링크") && !l.contentUrl?.trim()) return `${l.title}: 무료 콘텐츠 링크를 입력해 주세요.`;
      }
    }
  }
  return null;
}
