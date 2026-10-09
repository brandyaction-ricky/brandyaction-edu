import { safeUrl } from "./platform";

// Versioned rich content uses the existing text column. Legacy text is not HTML
// and is only converted when the author changes the document.
export const LESSON_BODY_PREFIX = "edu-lesson:v1\n";
export const LESSON_FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32] as const;
// Keep CSS values finite and deterministic across pasted HTML, storage and rendering.
export function normalizeLessonColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const color = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) return "#" + [...color.slice(1)].map(c => c + c).join("");
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(color);
  if (rgb && rgb.slice(1).every(c => Number(c) <= 255)) return "#" + rgb.slice(1).map(c => Number(c).toString(16).padStart(2, "0")).join("");
  return null;
}
export type LessonMark = { type: string; attrs?: Record<string, string | number> };
export type LessonNode = { type: string; text?: string; attrs?: Record<string, string | number>; marks?: LessonMark[]; content?: LessonNode[] };
export type LessonSegment = { text: string; href?: string };

function trimBareUrl(value: string) {
  let url = value.replace(/[.,!?;:。！？]+$/, "");
  for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
    let unmatched = url.split(close).length - url.split(open).length;
    while (url.endsWith(close) && unmatched-- > 0) url = url.slice(0, -1);
  }
  return url;
}

export function lessonTextSegments(text: string): LessonSegment[] {
  const nodes: LessonSegment[] = [];
  const starts = /\[([^\]\r\n]+)\]\(|https?:\/\/[^\s<>"'\u0000-\u001f]+/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = starts.exec(text))) {
    const start = match.index;
    let end = starts.lastIndex, label = match[0], url = "";
    if (match[1] !== undefined) {
      const destination = end;
      let depth = 1;
      while (end < text.length && depth && text[end] !== "\n" && text[end] !== "\r") {
        if (text[end] === "(") depth++;
        if (text[end] === ")") depth--;
        end++;
      }
      starts.lastIndex = end;
      if (depth) continue;
      label = match[1];
      url = safeUrl(text.slice(destination, end - 1).trim());
    } else {
      label = trimBareUrl(match[0]);
      end = start + label.length;
      url = safeUrl(label);
      starts.lastIndex = end;
    }
    if (!url) continue;
    nodes.push({ text: text.slice(cursor, start) }, { text: label, href: url });
    cursor = end;
  }
  nodes.push({ text: text.slice(cursor) });
  return nodes.filter(node => node.text);
}

const blockTypes = new Set(["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "details", "detailsSummary", "detailsContent", "callout"]);
const simpleMarks = new Set(["bold", "italic", "underline", "strike"]);
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

// Both stored and pasted documents use a small allowlist. Never spread arbitrary
// attributes or styles from a saved document onto DOM elements.
export function normalizeLessonDocument(value: unknown): LessonNode | null {
  let count = 0;
  function visit(value: unknown, depth = 0): LessonNode | null {
    if (++count > 20000 || depth > 40) throw new Error("Lesson document exceeds supported size");
    const node = record(value), type = String(node.type || ""), attrs = record(node.attrs);
    if (type === "text") {
      if (typeof node.text !== "string" || !node.text) return null;
      const marks: LessonMark[] = [];
      for (const raw of Array.isArray(node.marks) ? node.marks : []) {
        const mark = record(raw), markAttrs = record(mark.attrs);
        if (simpleMarks.has(String(mark.type))) marks.push({ type: String(mark.type) });
        if (mark.type === "link" && safeUrl(markAttrs.href)) marks.push({ type: "link", attrs: { href: safeUrl(markAttrs.href) } });
        if (mark.type === "textStyle") {
          const style: Record<string, string> = {};
          if (LESSON_FONT_SIZES.some(size => `${size}px` === markAttrs.fontSize)) style.fontSize = String(markAttrs.fontSize);
          for (const key of ["color", "backgroundColor"] as const) {
            const color = normalizeLessonColor(markAttrs[key]);
            if (color) style[key] = color;
          }
          if (Object.keys(style).length) marks.push({ type: "textStyle", attrs: style });
        }
      }
      return { type, text: node.text, ...(marks.length ? { marks } : {}) };
    }
    if (type === "hardBreak") return { type };
    if (!blockTypes.has(type)) return null;
    const content = (Array.isArray(node.content) ? node.content : []).map(child => visit(child, depth + 1)).filter((child): child is LessonNode => Boolean(child));
    if (type === "heading") return { type, attrs: { level: attrs.level === 1 ? 1 : attrs.level === 3 ? 3 : 2 }, content };
    if (type === "callout" && (!content.length || content.some(child => ["text", "hardBreak", "doc", "detailsSummary", "detailsContent"].includes(child.type)))) throw new Error("Invalid lesson callout");
    if (type === "details") {
      if (content.length !== 2 || content[0].type !== "detailsSummary" || content[1].type !== "detailsContent") throw new Error("Invalid lesson toggle");
      return { type, content };
    }
    if (type === "detailsSummary" && content.some(child => child.type !== "text")) throw new Error("Invalid lesson toggle title");
    if (type === "detailsContent" && (!content.length || content.some(child => ["text", "hardBreak", "doc", "detailsSummary", "detailsContent"].includes(child.type)))) throw new Error("Invalid lesson toggle content");
    if (type === "orderedList") return { type, attrs: { start: Number.isSafeInteger(attrs.start) && Number(attrs.start) > 0 && Number(attrs.start) <= 10000 ? Number(attrs.start) : 1 }, content };
    return { type, content };
  }
  try { const doc = visit(value); return doc?.type === "doc" ? doc : null; } catch { return null; }
}

export function parseLessonDocument(text: string): LessonNode | null {
  if (!text.startsWith(LESSON_BODY_PREFIX)) return null;
  try { return normalizeLessonDocument(JSON.parse(text.slice(LESSON_BODY_PREFIX.length))); } catch { return null; }
}

export function lessonDocumentForEditor(text: string): LessonNode {
  return parseLessonDocument(text) || { type: "doc", content: text.split(/\r\n|\r|\n/).map(line => ({ type: "paragraph", content: lessonTextSegments(line).map(segment => ({ type: "text", text: segment.text, ...(segment.href ? { marks: [{ type: "link", attrs: { href: segment.href } }] } : {}) })) })) };
}

function documentText(node: LessonNode): string {
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  return (node.content || []).map(documentText).join(["paragraph", "heading", "detailsSummary"].includes(node.type) ? "" : "\n");
}
export function lessonBodyHasText(text: string): boolean {
  return Boolean(lessonBodyPlainText(text).trim());
}
export function lessonBodyPlainText(text: string): string {
  const doc = parseLessonDocument(text);
  return doc ? documentText(doc) : text;
}
export function serializeLessonDocument(value: unknown): string {
  const doc = normalizeLessonDocument(value);
  if (!doc || !documentText(doc).trim()) return "";
  return LESSON_BODY_PREFIX + JSON.stringify(doc);
}
