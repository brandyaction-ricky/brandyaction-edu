import { Node, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps, type Editor } from "@tiptap/react";
import { GripVertical } from "lucide-react";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

function CalloutView({ editor, getPos }: NodeViewProps) {
  const select = () => {
    const pos = getPos();
    if (editor.isEditable && typeof pos === "number") editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
  };
  return <NodeViewWrapper as="aside" data-lesson-callout="" className="lesson-callout" aria-label="학습 안내" onDragStartCapture={() => editor.view.dispatch(closeHistory(editor.state.tr))}>
    <span role="button" tabIndex={0} draggable data-drag-handle className="lesson-callout-drag" contentEditable={false} aria-label="안내 박스 이동" title="드래그하여 안내 박스 이동" onClick={select} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } }}><GripVertical size={18} aria-hidden="true" /></span>
    <span className="lesson-callout-icon" contentEditable={false} aria-hidden="true">💡</span>
    <NodeViewContent className="lesson-callout-content" />
  </NodeViewWrapper>;
}

// Fixed markup keeps pasted/stored HTML attributes out of the lesson DOM.
export const LessonCallout = Node.create({
  name: "callout", group: "block", content: "block+", defining: true, draggable: true,
  parseHTML: () => [{ tag: "aside[data-lesson-callout]", contentElement: ".lesson-callout-content" }],
  renderHTML: () => ["aside", { "data-lesson-callout": "", class: "lesson-callout", "aria-label": "학습 안내" },
    ["span", { class: "lesson-callout-icon", "aria-hidden": "true", contenteditable: "false" }, "💡"],
    ["div", { class: "lesson-callout-content" }, 0]],
  addNodeView: () => ReactNodeViewRenderer(CalloutView),
});

export function insertLessonNotice(editor: Editor) {
  if (!editor.isEditable) return false;
  const { doc, schema } = editor.state;
  const canvas = Boolean(schema.nodes.lessonText);
  const first = canvas ? doc.firstChild?.firstChild : doc.firstChild;
  const offset = canvas ? 1 : 0;
  // The shortcut opens the existing top notice instead of adding duplicates.
  if (first?.type.name === "callout") return editor.chain().focus().setTextSelection(offset + 2).scrollIntoView().run();
  const notice = schema.nodes.callout.create(null, [
    schema.nodes.paragraph.create(null, schema.text("필독 안내", [schema.marks.bold.create()])),
    schema.nodes.paragraph.create(),
  ]);
  const tr = editor.state.tr;
  if (canvas) {
    if (doc.firstChild?.type.name === "lessonText") tr.insert(1, notice);
    else tr.insert(0, schema.nodes.lessonText.create(null, [notice]));
  } else tr.insert(0, notice);
  const position = offset + notice.firstChild!.nodeSize + 2;
  tr.setSelection(TextSelection.create(tr.doc, position));
  editor.view.dispatch(tr.scrollIntoView()); editor.commands.focus();
  return true;
}
