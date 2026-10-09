import { Fragment, type ReactNode } from "react";
import { lessonTextSegments, parseLessonDocument, type LessonNode } from "@/lib/lesson-body";
import "./lesson-text.css";

function RichNode({ node }: { node: LessonNode }): ReactNode {
  if (node.type === "text") {
    let text: ReactNode = node.marks?.some(mark => mark.type === "link") ? node.text : <PlainLinks text={node.text || ""} />;
    for (const mark of node.marks || []) {
      if (mark.type === "bold") text = <strong>{text}</strong>;
      if (mark.type === "italic") text = <em>{text}</em>;
      if (mark.type === "underline") text = <u>{text}</u>;
      if (mark.type === "strike") text = <s>{text}</s>;
      if (mark.type === "textStyle") text = <span style={{ fontSize: mark.attrs?.fontSize ? String(mark.attrs.fontSize) : undefined, color: mark.attrs?.color ? String(mark.attrs.color) : undefined, backgroundColor: mark.attrs?.backgroundColor ? String(mark.attrs.backgroundColor) : undefined }}>{text}</span>;
      if (mark.type === "link") text = <a href={String(mark.attrs?.href)} target="_blank" rel="noopener noreferrer">{text}</a>;
    }
    return text;
  }
  if (node.type === "hardBreak") return <br />;
  const children = node.content?.map((child, index) => <RichNode key={index} node={child} />);
  switch (node.type) {
    case "heading": return node.attrs?.level === 1 ? <h1>{children}</h1> : node.attrs?.level === 3 ? <h3>{children}</h3> : <h2>{children}</h2>;
    case "paragraph": return <p>{children?.length ? children : <br />}</p>;
    case "bulletList": return <ul>{children}</ul>;
    case "orderedList": return <ol start={Number(node.attrs?.start) || 1}>{children}</ol>;
    case "listItem": return <li>{children}</li>;
    case "blockquote": return <blockquote>{children}</blockquote>;
    case "callout": return <aside className="lesson-callout" data-lesson-callout="" aria-label="학습 안내"><span className="lesson-callout-icon" aria-hidden="true">💡</span><div className="lesson-callout-content">{children}</div></aside>;
    case "details": return <details>{children}</details>;
    case "detailsSummary": return <summary>{children?.length ? children : "내용 펼치기"}</summary>;
    case "detailsContent": return <div className="lesson-toggle-content">{children}</div>;
    default: return <>{children}</>;
  }
}

export function LessonText({ text }: { text: string }) {
  const doc = parseLessonDocument(text);
  if (doc) return <div className="lesson-rich-body"><RichNode node={doc} /></div>;
  return <span className="lesson-text-links"><PlainLinks text={text} /></span>;
}
export function AnswerText({ text }: { text: string }) {
  return <span className="lesson-text-links"><PlainLinks text={text} /></span>;
}
function PlainLinks({ text }: { text: string }) {
  return <>{lessonTextSegments(text).map((part, index) => part.href
    ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>
    : <Fragment key={index}>{part.text}</Fragment>)}</>;
}
