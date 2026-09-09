export type Participant = { id: string; user_id: string; full_name: string | null; email: string; created_at: string; lesson_total: number; mission_total: number; learning_percent: number; submitted: number; approved: number; pending: number; achievement: number | null; level: number | null; last_activity: string | null; attention: boolean };
export type ParticipantReport = { cohorts: { id: string; name: string; course_title: string }[]; cohortId: string | null; capacity: number | null; rows: Participant[]; total: number; page: number; stats: { participants: number; average: number | null; participation: number; attention: number }; weeks: { id: string; title: string; week: number; participants: number }[] };
export const levelNames = ["", "시작", "실행", "성장", "성과", "완주"];
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
