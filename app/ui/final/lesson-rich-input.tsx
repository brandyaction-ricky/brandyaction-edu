"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, Extension, InputRule, wrappingInputRule, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Blockquote from "@tiptap/extension-blockquote";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { Bold, Italic, Underline, List, ListOrdered, Link2, Undo2, Redo2, RemoveFormatting, Quote, ListCollapse } from "lucide-react";
import { LESSON_FONT_SIZES, lessonDocumentForEditor, serializeLessonDocument } from "@/lib/lesson-body";
import { safeUrl } from "@/lib/platform";
import "./lesson-text.css";
import "./lesson-body-editor.css";

export type LessonBodyEditorProps = { value: string; onChange: (value: string) => void; label?: string; disabled?: boolean; name?: string; id?: string; showLabel?: boolean };

const LessonFontSize = FontSize.extend({
  addGlobalAttributes() {
    return (this.parent?.() || []).map(group => ({ ...group, attributes: {
      ...group.attributes, fontSize: { ...group.attributes.fontSize, parseHTML: (element: HTMLElement) =>
        LESSON_FONT_SIZES.some(size => `${size}px` === element.style.fontSize) ? element.style.fontSize : null },
    } }));
  },
});

const LessonQuote = Blockquote.extend({
  addInputRules() { return [wrappingInputRule({ find: /^" $/, type: this.type })]; },
});
const LessonDetails = Details.extend({
  addInputRules() {
    return [new InputRule({ find: /^> $/, handler: ({ chain, range }) => {
      if (!chain().deleteRange(range).setDetails().run()) return null;
    } })];
  },
}).configure({
  // Opening a toggle is a reading preference, not a change to lesson content.
  persist: false,
  renderToggleButton: ({ element, isOpen }) => {
    element.contentEditable = "false";
    element.setAttribute("aria-label", isOpen ? "내용 접기" : "내용 펼치기");
    element.setAttribute("aria-expanded", String(isOpen));
    element.textContent = isOpen ? "▾" : "▸";
    // ProseMirror's Enter/Space handlers must not consume a focused button.
    element.onkeydown = event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); event.stopPropagation(); element.click();
      }
    };
  },
});
const LessonInputUndo = Extension.create({
  name: "lessonInputUndo", priority: 1000,
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => this.editor.commands.undoInputRule() || this.editor.commands.undo(),
      Backspace: () => this.editor.commands.undoInputRule(),
    };
  },
});

export function lessonRichExtensions() {
  return [StarterKit.configure({
      // An automatic trailing paragraph appends a second transaction after an
      // input rule and discards its undo state. Enter already creates paragraphs.
      heading: { levels: [1, 2, 3] }, trailingNode: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false,
      link: { openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" }, isAllowedUri: url => Boolean(safeUrl(url)) },
    }), TextStyle, LessonFontSize, LessonQuote, LessonDetails, DetailsSummary, DetailsContent, LessonInputUndo];
}

export function LessonRichInput({ value, onChange, label = "학습 내용", disabled = false, name, id, showLabel = true }: LessonBodyEditorProps) {
  const generatedId = useId(), editorId = id || `lesson-body-${generatedId}`;
  const lastValue = useRef(value);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: lessonRichExtensions(),
    content: lessonDocumentForEditor(value),
    editable: !disabled,
    editorProps: { attributes: { id: editorId, role: "textbox", "aria-label": label, "aria-multiline": "true", "aria-describedby": `${editorId}-help`, class: "lesson-rich-body" } },
    onUpdate: ({ editor }) => {
      const next = serializeLessonDocument(editor.getJSON());
      lastValue.current = next;
      onChange(next);
    },
  });
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  useEffect(() => {
    if (editor && value !== lastValue.current) {
      editor.commands.setContent(lessonDocumentForEditor(value), { emitUpdate: false });
      lastValue.current = value;
    }
  }, [editor, value]);
  return <div className="lesson-body-field field">
    {showLabel && <label className="field-label" htmlFor={editorId}>{label}</label>}
    <div className="lesson-body-editor" aria-disabled={disabled}>
      <LessonFormatToolbar editor={editor} disabled={disabled} />
      {!editor && <p role="status" className="lesson-editor-loading">편집기를 준비하고 있습니다.</p>}
      <EditorContent editor={editor} />
    </div>
    {name && <input type="hidden" name={name} value={value} />}
    <small id={`${editorId}-help`} className="field-hint">줄 맨 앞에 <code>#</code> · <code>##</code> · <code>###</code>와 공백을 입력하면 제목, <code>-</code>는 글머리 목록, <code>1.</code>은 번호 목록, <code>&gt;</code>는 접기·펼치기, <code>&quot;</code>는 인용문이 됩니다. 토글은 화살표로 펼친 뒤 제목에서 Enter를 누르면 안쪽에 글을 쓸 수 있습니다. Shift+Enter는 줄바꿈입니다. 변경 후 학습을 저장해 주세요.</small>
  </div>;
}

export function LessonFormatToolbar({ editor, disabled = false }: { editor: Editor | null; disabled?: boolean }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkSelection, setLinkSelection] = useState({ from: 1, to: 1 });
  const state = useEditorState({ editor, selector: ({ editor }) => ({
    block: editor?.isActive("heading", { level: 1 }) ? "h1" : editor?.isActive("heading", { level: 2 }) ? "h2" : editor?.isActive("heading", { level: 3 }) ? "h3" : "p",
    size: String(editor?.getAttributes("textStyle").fontSize || ""),
    bold: editor?.isActive("bold"), italic: editor?.isActive("italic"), underline: editor?.isActive("underline"),
    bullet: editor?.isActive("bulletList"), ordered: editor?.isActive("orderedList"), link: editor?.isActive("link"),
    quote: editor?.isActive("blockquote"), details: editor?.isActive("details"),
    undo: editor?.can().undoInputRule() || editor?.can().undo(), redo: editor?.can().redo(),
  }) });
  function toggleLink() {
    if (!editor) return;
    setLinkSelection({ from: editor.state.selection.from, to: editor.state.selection.to });
    setLinkUrl(String(editor.getAttributes("link").href || ""));
    setLinkError(""); setLinkOpen(!linkOpen);
  }
  function applyLink(remove = false) {
    if (!editor || disabled) return;
    const href = safeUrl(linkUrl.trim());
    if (!remove && !href) { setLinkError("https:// 또는 /로 시작하는 올바른 주소를 입력해 주세요."); return; }
    const { from, to } = linkSelection;
    const chain = editor.chain().focus().setTextSelection({ from, to }).extendMarkRange("link");
    if (remove) chain.unsetLink().run();
    else if (from === to && !editor.isActive("link")) chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    else chain.setLink({ href }).run();
    setLinkOpen(false); setLinkError("");
  }
  const buttons = [
    { label: "굵게", icon: Bold, active: state?.bold, action: () => editor?.chain().focus().toggleBold().run() },
    { label: "기울임", icon: Italic, active: state?.italic, action: () => editor?.chain().focus().toggleItalic().run() },
    { label: "밑줄", icon: Underline, active: state?.underline, action: () => editor?.chain().focus().toggleUnderline().run() },
    { label: "글머리 목록", icon: List, active: state?.bullet, action: () => editor?.chain().focus().toggleBulletList().run() },
    { label: "번호 목록", icon: ListOrdered, active: state?.ordered, action: () => editor?.chain().focus().toggleOrderedList().run() },
    { label: "접기·펼치기", icon: ListCollapse, active: state?.details, action: () => editor?.isActive("details") ? editor.chain().focus().unsetDetails().run() : editor?.chain().focus().setDetails().run() },
    { label: "인용문", icon: Quote, active: state?.quote, action: () => editor?.chain().focus().toggleBlockquote().run() },
    { label: "링크", icon: Link2, active: state?.link || linkOpen, action: toggleLink },
    { label: "서식 지우기", icon: RemoveFormatting, action: () => editor?.chain().focus().unsetAllMarks().clearNodes().run() },
    { label: "실행 취소", icon: Undo2, unavailable: !state?.undo, action: () => editor?.chain().focus().undoInputRule().run() || editor?.chain().focus().undo().run() },
    { label: "다시 실행", icon: Redo2, unavailable: !state?.redo, action: () => editor?.chain().focus().redo().run() },
  ];
  return <>
      <div className="lesson-format-controls" role="group" aria-label="본문 서식">
        <select aria-label="문단 스타일" value={state?.block || "p"} disabled={disabled || !editor} onChange={event => {
          const chain = editor?.chain().focus().command(({ tr, state }) => {
            // Heading size applies to the entire affected paragraph, including
            // when only the caret (rather than its text) is selected.
            tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
              if (node.isTextblock) tr.removeMark(pos + 1, pos + node.nodeSize - 1, state.schema.marks.textStyle);
            });
            return true;
          }).unsetFontSize();
          if (event.target.value === "p") chain?.setParagraph().run();
          else chain?.setHeading({ level: event.target.value === "h1" ? 1 : event.target.value === "h2" ? 2 : 3 }).run();
        }}><option value="p">본문</option><option value="h1">제목 1 · H1</option><option value="h2">제목 2 · H2</option><option value="h3">제목 3 · H3</option></select>
        <select aria-label="글자 크기" value={state?.size || ""} disabled={disabled || !editor} onChange={event => event.target.value ? editor?.chain().focus().setFontSize(event.target.value).run() : editor?.chain().focus().unsetFontSize().run()}><option value="">기본 크기</option>{LESSON_FONT_SIZES.map(size => <option key={size} value={`${size}px`}>{size}px</option>)}</select>
        {buttons.map(button => <button type="button" key={button.label} title={button.label} aria-label={button.label} aria-pressed={button.active} disabled={disabled || !editor || button.unavailable} onMouseDown={event => event.preventDefault()} onClick={button.action}><button.icon size={16} aria-hidden="true" /></button>)}
      </div>
      {linkOpen && <div className="lesson-link-controls" role="group" aria-label="링크 편집">
        <input aria-label="링크 주소" value={linkUrl} placeholder="https://" autoFocus disabled={disabled} onChange={event => setLinkUrl(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); applyLink(); } if (event.key === "Escape") { event.preventDefault(); setLinkOpen(false); editor?.commands.focus(); } }} />
        <button type="button" disabled={disabled} onClick={() => applyLink()}>적용</button><button type="button" disabled={disabled} onClick={() => applyLink(true)}>링크 해제</button><button type="button" onClick={() => { setLinkOpen(false); editor?.commands.focus(); }}>닫기</button>
        {linkError && <p role="alert">{linkError}</p>}
      </div>}
  </>;
}
