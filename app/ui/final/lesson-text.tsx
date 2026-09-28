import type { ReactNode } from "react";
import { safeUrl } from "@/lib/platform";
import "./lesson-text.css";

function trimBareUrl(value: string) {
  let url = value.replace(/[.,!?;:。！？]+$/, "");
  for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
    let unmatched = url.split(close).length - url.split(open).length;
    while (url.endsWith(close) && unmatched > 0) {
      url = url.slice(0, -1);
      unmatched--;
    }
  }
  return url;
}

// Only links are interpreted; all other text (including HTML) stays React text.
// Keep saved line breaks and numbering rather than reformatting existing lessons.
export function LessonText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const starts = /\[([^\]\r\n]+)\]\(|https?:\/\/[^\s<>"'\u0000-\u001f]+/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = starts.exec(text))) {
    const start = match.index;
    let end = starts.lastIndex;
    let label = match[0];
    let url = "";
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
    nodes.push(text.slice(cursor, start));
    nodes.push(<a key={start} href={url} target="_blank" rel="noopener noreferrer">{label}</a>);
    cursor = end;
  }
  nodes.push(text.slice(cursor));
  return <span className="lesson-text-links">{nodes}</span>;
}
