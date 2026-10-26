"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, Node, Extension, ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps, type JSONContent, type Editor } from '@tiptap/react';
import { NodeSelection, Plugin, Selection, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { lessonImageColumns } from '@/lib/lesson-image-row';
import { Fragment, Mark, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { isHistoryTransaction } from '@tiptap/pm/history';
import { publicLessonBlocks, type LessonBlock, type LessonBlockType } from '@/lib/lesson-blocks';
import { blocksFromCanvas, canvasTextContent, duplicateLessonBlock, isCanvasText, lessonCanvasNodes, lessonClipboardNodes, type CanvasNode } from '@/lib/lesson-document-canvas';
import { LessonBlockView } from './lesson-block-view';
import { GripVertical } from 'lucide-react';
import { lessonRichExtensions, LessonFormatToolbar, focusLessonMoveHandle } from './lesson-rich-input';
import { lessonCanvasMovableExtensions } from './lesson-canvas-movable';
import { useLessonImageDrag } from './lesson-image-drag';
import type { LessonImagePosition } from '@/lib/lesson-image-position';
import './lesson-document-canvas.css';

type Props = {
  blocks: LessonBlock[]; disabled: boolean; choices: { type: LessonBlockType; label: string }[];
  onChange: (blocks: LessonBlock[]) => void; onSettings: (id: string) => void;
  onError: (message: string) => void;
  create: (type: LessonBlockType) => LessonBlock;
  onImage: (files: File[], position: LessonImagePosition) => void;
};
const emptyValues = { blocks: {}, checklist: [] };
function Activity({ node, extension, editor, selected, getPos }: NodeViewProps) {
  const block = node.attrs.block as LessonBlock;
  if (!block) return <NodeViewWrapper />;
  return <NodeViewWrapper className={'ldc-activity' + (selected ? ' is-selected' : '')} data-author-block={block.id} data-block-type={block.type} contentEditable={false}>
    <div className="ldc-activity-actions"><span data-drag-handle draggable={editor.isEditable} className="ldc-drag" role="button" tabIndex={0} aria-label="드래그하여 항목 순서 변경" title="드래그하여 순서 변경" onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && editor.isEditable) { event.preventDefault(); const pos = getPos(); if (typeof pos === 'number') editor.commands.setNodeSelection(pos); } }}><GripVertical size={18} aria-hidden="true" /></span><button type="button" className="btn small" disabled={!editor.isEditable} onClick={() => { const pos = getPos(); if (typeof pos === 'number') editor.commands.setNodeSelection(pos); extension.options.onSettings(block.id); }}>{extension.options.labels[block.type] || '항목'} 설정</button></div>
    <LessonBlockView floatingAudio document={publicLessonBlocks({ schemaVersion: 1, blocks: [block], checklist: [] })} values={emptyValues} onChange={() => {}} readOnly />
  </NodeViewWrapper>;
}

function itemAt(editor: Editor) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 1; depth--) if ($from.node(depth).attrs.block) return { node: $from.node(depth), pos: $from.before(depth), index: $from.index(depth - 1) };
  const at = editor.state.doc.nodeAt($from.pos);
  if (at && ['lessonImage', 'lessonFile'].includes(at.type.name)) return { node: at, pos: $from.pos, index: $from.index() };
  if ($from.depth) return { node: $from.node(1), pos: $from.before(1), index: $from.index(0) };
  const node = editor.state.doc.nodeAt($from.pos);
  return node ? { node, pos: $from.pos, index: $from.index(0) } : null;
}
function imagePosition($pos: Editor['state']['selection']['$from']): LessonImagePosition {
  for (let depth = $pos.depth; depth > 1; depth--) {
    if ($pos.node(depth).type.name === 'detailsContent') return { blockId: $pos.node(1).attrs.block?.id || null, togglePath: Array.from({ length: depth - 1 }, (_, i) => $pos.index(i + 1)), toggleBoundary: $pos.index(depth) + ($pos.depth > depth ? 1 : 0) };
  }
  return { blockId: $pos.depth ? $pos.node(1).attrs.block?.id || null : null, ...($pos.depth > 1 && $pos.node(1).attrs.block?.type === 'text' ? { textBoundary: $pos.index(1) + 1 } : { after: true }) };
}

// Text items are isolating so ordinary joins cannot absorb questions or media.
// At their boundary, remove only one empty paragraph (or its now-empty wrapper)
// and map the caret through the deletion, allowing the next key to do the same.
function deleteEmptyTextBoundary(editor: Editor, direction: -1 | 1) {
  const { view } = editor;
  if (!view.editable) return false;
  const { selection, doc } = view.state;
  if (!(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  if ($from.depth < 2 || $from.node(1).type.name !== 'lessonText' || !$from.parent.isTextblock) return false;
  if ($from.parentOffset !== (direction < 0 ? 0 : $from.parent.content.size)) return false;
  for (let depth = 1; depth < $from.depth; depth++) {
    if ($from.index(depth) !== (direction < 0 ? 0 : $from.node(depth).childCount - 1)) return false;
  }
  const current = $from.node(1), currentPos = $from.before(1);
  const boundary = direction < 0 ? currentPos : currentPos + current.nodeSize;
  const $boundary = doc.resolve(boundary);
  const neighbor = direction < 0 ? $boundary.nodeBefore : $boundary.nodeAfter;
  if (!neighbor) return false;
  const neighborPos = direction < 0 ? boundary - neighbor.nodeSize : boundary;
  const edge = neighbor.type.name === 'lessonText' ? direction < 0 ? neighbor.lastChild : neighbor.firstChild : null;
  const emptyParagraph = (node: ProseMirrorNode | null) => node?.type.name === 'paragraph' && node.content.size === 0;
  const tr = view.state.tr;
  if (emptyParagraph(edge)) {
    const from = neighbor.childCount === 1 ? neighborPos : direction < 0 ? boundary - 1 - edge!.nodeSize : neighborPos + 1;
    const to = neighbor.childCount === 1 ? neighborPos + neighbor.nodeSize : from + edge!.nodeSize;
    tr.delete(from, to);
    tr.setSelection(selection.map(tr.doc, tr.mapping));
  } else if ($from.depth === 2 && emptyParagraph($from.parent)) {
    // A caret in an empty item should join the adjacent text, as an ordinary
    // blank paragraph would. Move into text without merging its list or toggle.
    const next = Selection.findFrom(doc.resolve(boundary), direction, true);
    const from = current.childCount === 1 ? currentPos : $from.before(2);
    const to = current.childCount === 1 ? currentPos + current.nodeSize : $from.after(2);
    tr.delete(from, to);
    tr.setSelection(next instanceof TextSelection && next.$from.depth >= 2 && next.$from.before(1) === neighborPos
      ? next.map(tr.doc, tr.mapping)
      : Selection.near(tr.doc.resolve(tr.mapping.map(boundary, direction)), direction));
  } else return false;
  // Preserve the editor's usual first Backspace after a Markdown input rule.
  if (direction < 0 && editor.commands.undoInputRule()) return true;
  view.dispatch(tr.scrollIntoView());
  return true;
}

export function LessonDocumentCanvas(props: Props) {
  const latest = useRef(props);
  useEffect(() => { latest.current = props; }, [props]);
  const last = useRef(JSON.stringify(props.blocks));
  const [menu, setMenu] = useState(false), [message, setMessage] = useState(''), [selectedId, setSelectedId] = useState<string | null>(null);
  // useEditor consumes initial content once. Parent edits and autosave status
  // rerenders must not parse a second full document; external replacements are
  // handled by the props.blocks effect below.
  const [initialContent] = useState(() => ({ type: 'doc', content: lessonCanvasNodes(props.blocks) as JSONContent[] }));
  const root = useRef<HTMLDivElement>(null), insertRange = useRef<{ from: number; to: number } | null>(null);
  function openMenu(editor: Editor, slash = false) {
    const { from, to } = editor.state.selection;
    insertRange.current = { from, to: slash ? from + 1 : to };
    setMenu(true);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.ldc-insert-menu button')?.focus());
  }
  function syncTextSelection(view: Editor['view']) {
    if (view.composing) return false;
    const selection = view.dom.ownerDocument.getSelection();
    if (!selection?.anchorNode || !selection.focusNode || !view.dom.contains(selection.anchorNode) || !view.dom.contains(selection.focusNode)) return false;
    try {
      const anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset), head = view.posAtDOM(selection.focusNode, selection.focusOffset);
      // selectionchange can still be queued after a click/delete. Editing and
      // clipboard commands must use the visible range, not the previous lesson
      // block. Leave matching node/all selections intact.
      if (anchor !== view.state.selection.anchor || head !== view.state.selection.head) {
        view.dispatch(view.state.tr.setSelection(TextSelection.between(view.state.doc.resolve(anchor), view.state.doc.resolve(head))));
      }
    } catch { /* The DOM may be being replaced; keep the current safe selection. */ }
    return false;
  }
  const editor = useEditor({
    immediatelyRender: false, shouldRerenderOnTransaction: false,
    extensions: [
      ...lessonRichExtensions().filter(extension => !['starterKit', 'lessonImage', 'lessonFile', 'blockquote'].includes(extension.name)),
      // Same text schema and input rules as the existing body editor, with one
      // document root for the whole lesson rather than one editor per paragraph.
      lessonRichExtensions()[0].configure({ document: false, paragraph: false, heading: false, bulletList: false, orderedList: false }),
      ...lessonCanvasMovableExtensions,
      Node.create({ name: 'doc', topNode: true, content: 'lessonItem*' }),
      Node.create({
        name: 'lessonText', group: 'lessonItem', content: 'block+', defining: true, isolating: true,
        addAttributes: () => ({ block: { default: null, rendered: false } }),
        parseHTML: () => [{ tag: 'section[data-lesson-text]' }],
        renderHTML: ({ node }) => ['section', { 'data-lesson-text': '', 'data-author-block': node.attrs.block?.id, 'data-block-type': 'text', class: 'ldc-text' }, 0],
      }),
      Node.create({
        name: 'lessonActivity', group: 'lessonItem', atom: true, draggable: true,
        addOptions: () => ({ onSettings: (id: string) => latest.current.onSettings(id), labels: Object.fromEntries(props.choices.map(choice => [choice.type, choice.label])) }),
        addAttributes: () => ({ block: { default: null, rendered: false } }),
        // Clipboard HTML never carries private quiz keys or arbitrary widgets.
        renderHTML: () => ['div', { 'data-lesson-activity': '' }, '학습 항목'],
        addNodeView: () => ReactNodeViewRenderer(Activity),
      }),
      Node.create({
        name: 'lessonImage', group: 'block', atom: true, draggable: true,
        addOptions: () => ({ onSettings: (id: string) => latest.current.onSettings(id), labels: { image: '이미지', file: '파일 첨부' } }),
        addAttributes: () => ({ blockId: { default: null }, block: { default: null, rendered: false } }),
        renderHTML: () => ['div', { 'data-lesson-image-reference': '' }, '학습 이미지'],
        addNodeView: () => ReactNodeViewRenderer(Activity),
      }),
      Node.create({
        name: 'lessonFile', group: 'block', atom: true, draggable: true,
        addOptions: () => ({ onSettings: (id: string) => latest.current.onSettings(id), labels: { image: '이미지', file: '파일 첨부' } }),
        addAttributes: () => ({ blockId: { default: null }, block: { default: null, rendered: false } }),
        renderHTML: () => ['div', { 'data-lesson-file-reference': '' }, '첨부 파일'],
        addNodeView: () => ReactNodeViewRenderer(Activity),
      }),
      // Plugin callbacks run on editor transactions, never during React render.
      Extension.create({
        name: 'lessonDocumentIntegrity',
        addProseMirrorPlugins() {
          return [new Plugin({
            props: {
              handleDOMEvents: {
                keydown(view, event) {
                  if (event.key !== 'Enter' && event.key !== ' ') return false;
                  const wrapper = (event.target as HTMLElement).closest('.lesson-toggle-drag')?.closest('[data-type="details"]');
                  if (!wrapper) return false;
                  const $pos = view.state.doc.resolve(view.posAtDOM(wrapper, 0));
                  for (let depth = $pos.depth; depth > 0; depth--) {
                    if ($pos.node(depth).type.name !== 'details') continue;
                    event.preventDefault();
                    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, $pos.before(depth))));
                    return true;
                  }
                  return false;
                },
              },
              decorations(state) {
                const blocks: LessonBlock[] = []; state.doc.forEach(node => { if (node.attrs.block) blocks.push(node.attrs.block); });
                const columns = lessonImageColumns(blocks), decorations: Decoration[] = [];
                state.doc.forEach((node, pos) => {
                  const column = columns.get(node.attrs.block?.id);
                  if (column) decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-image-columns': String(column.count), style: `grid-column:${column.start} / span ${6 / column.count}` }));
                });
                return DecorationSet.create(state.doc, decorations);
              },
            },
            filterTransaction(tr, state) {
              if (!tr.docChanged || tr.getMeta('lessonStructure') || isHistoryTransaction(tr)) return true;
              const activityIds = new Set<string>(); tr.doc.descendants(node => { if (['lessonActivity', 'lessonImage', 'lessonFile'].includes(node.type.name)) activityIds.add(node.attrs.block?.id); });
              let lost = false; state.doc.descendants(node => { if (['lessonActivity', 'lessonImage', 'lessonFile'].includes(node.type.name) && !activityIds.has(node.attrs.block?.id)) lost = true; });
              if (lost) queueMicrotask(() => setMessage('질문·자료가 포함된 영역입니다. 해당 항목을 선택한 뒤 ‘항목 삭제’를 사용해 주세요.'));
              return !lost;
            },
            appendTransaction(transactions, _old, state) {
              if (!transactions.some(tr => tr.docChanged)) return null;
              const tr = state.tr, ids = new Set<string>();
              state.doc.descendants((node, pos) => {
                if (!['lessonText', 'lessonActivity', 'lessonImage', 'lessonFile'].includes(node.type.name)) return;
                const block = node.attrs.block as LessonBlock | null;
                if (!block || ids.has(block.id)) {
                  const next = block ? duplicateLessonBlock(block, () => crypto.randomUUID()) : latest.current.create('text');
                  tr.setNodeMarkup(pos, undefined, { ...node.attrs, block: next, ...(['lessonImage', 'lessonFile'].includes(node.type.name) ? { blockId: next.id } : {}) }); ids.add(next.id);
                } else ids.add(block.id);
              });
              return tr.docChanged ? tr : null;
            },
          })];
        },
      }),
    ],
    content: initialContent,
    editable: !props.disabled,
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': '수업 문서', 'aria-multiline': 'true', class: 'lesson-rich-body ldc-document' },
      handleDOMEvents: { copy: syncTextSelection, cut: syncTextSelection, paste: syncTextSelection },
      transformCopied(slice, view) {
        return new Slice(Fragment.fromJSON(view.state.schema, lessonClipboardNodes(slice.content.toJSON() || [])), slice.openStart, slice.openEnd);
      },
      transformPasted(slice, view) {
        // Also accept clipboard data produced before this fix without retaining
        // its unselected original body in the pasted nodes or undo history.
        return new Slice(Fragment.fromJSON(view.state.schema, lessonClipboardNodes(slice.content.toJSON() || [])), slice.openStart, slice.openEnd);
      },
      handleKeyDown(view, event) {
        if (event.isComposing || view.composing) return false;
        if (focusLessonMoveHandle(view, event)) return true;
        if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && (event.key === 'Backspace' || event.key === 'Delete')) {
          if (view.state.selection instanceof TextSelection) syncTextSelection(view);
          const activeEditor = editorRef.current;
          if (activeEditor && deleteEmptyTextBoundary(activeEditor, event.key === 'Backspace' ? -1 : 1)) return true;
        }
        if (event.key === 'Escape') { setMenu(false); return false; }
        if (event.key === '/' && view.state.selection.empty && view.state.selection.$from.parent.isTextblock && !view.state.selection.$from.parent.textContent) {
          const activeEditor = editorRef.current;
          if (activeEditor) { openMenu(activeEditor); return true; }
        }
        return false;
      },
      handlePaste(view, event) {
        if (!event.clipboardData?.files.length) return false;
        let { $from } = view.state.selection;
        // Selectionchange can arrive after paste, especially on touch devices.
        // Use the current DOM caret rather than the previous editor selection.
        const selection = view.dom.ownerDocument.getSelection();
        if (selection?.anchorNode && selection.focusNode && view.dom.contains(selection.anchorNode) && view.dom.contains(selection.focusNode)) {
          try { $from = view.state.doc.resolve(Math.min(view.posAtDOM(selection.anchorNode, selection.anchorOffset), view.posAtDOM(selection.focusNode, selection.focusOffset))); } catch { /* Keep the editor selection if the DOM is being replaced. */ }
        }
        if (!$from.depth) return false;
        latest.current.onImage([...event.clipboardData.files], imagePosition($from));
        return true;
      },
      handleDrop(view, event) {
        if (!event.dataTransfer?.files.length) return false;
        const hit = view.posAtCoords({ left: event.clientX, top: event.clientY }), pos = view.state.doc.resolve(hit?.pos || 0);
        latest.current.onImage([...event.dataTransfer.files], imagePosition(pos));
        return true;
      },
    },
    onSelectionUpdate({ editor }) { setSelectedId(itemAt(editor)?.node.attrs.block?.id || null); },
    onUpdate({ editor }) {
      try {
        const blocks = blocksFromCanvas((editor.getJSON().content || []) as CanvasNode[]);
        last.current = JSON.stringify(blocks); latest.current.onChange(blocks); latest.current.onError(''); setMessage('');
      } catch (error) { const reason = (error as Error).message; setMessage(reason); latest.current.onError(reason); }
    },
  });
  const editorRef = useRef(editor);
  useEffect(() => { editorRef.current = editor; }, [editor]);
  useEffect(() => { editor?.setEditable(!props.disabled, false); }, [editor, props.disabled]);
  useEffect(() => {
    if (!editor || JSON.stringify(props.blocks) === last.current) return;
    const open = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-type="details"]')].map((element, index) => element.classList.contains('is-open') ? index : -1).filter(index => index >= 0);
    const nodes = lessonCanvasNodes(props.blocks).map(node => editor.schema.nodeFromJSON(node));
    const next = editor.schema.topNodeType.create(null, nodes);
    const updates: { pos: number; node: ProseMirrorNode }[] = [];
    function sameContent(before: ProseMirrorNode, after: ProseMirrorNode, pos: number): boolean {
      if (before.eq(after)) return true;
      if (before.type !== after.type || before.isText || before.childCount !== after.childCount || before.nodeSize !== after.nodeSize) return false;
      // Settings change attributes, never text or marks. Keep the existing
      // content DOM and toggle state instead of replacing the whole lesson.
      if (!Mark.sameSet(before.marks, after.marks)) return false;
      if (!before.sameMarkup(after)) updates.push({ pos, node: after });
      let offset = pos + 1;
      for (let index = 0; index < before.childCount; index++) {
        if (!sameContent(before.child(index), after.child(index), offset)) return false;
        offset += before.child(index).nodeSize;
      }
      return true;
    }
    const attributesOnly = sameContent(editor.state.doc, next, -1);
    const tr = editor.state.tr.setMeta('lessonStructure', true);
    if (attributesOnly) {
      for (const { pos, node } of updates) tr.setNodeMarkup(pos, undefined, node.attrs, node.marks);
      // Replacing even a leaf's attributes maps its node selection past it.
      // Equal content/structure makes the original selection positions valid.
      tr.setSelection(Selection.fromJSON(tr.doc, editor.state.selection.toJSON()));
    } else tr.replaceWith(0, editor.state.doc.content.size, nodes);
    last.current = JSON.stringify(props.blocks); editor.view.dispatch(tr);
    const toggles = editor.view.dom.querySelectorAll<HTMLElement>('[data-type="details"]');
    open.forEach(index => { const toggle = toggles[index]; if (toggle && !toggle.classList.contains('is-open')) toggle.querySelector<HTMLButtonElement>(':scope > button')?.click(); });
  }, [editor, props.blocks]);

  function insert(type: LessonBlockType) {
    if (!editor || props.disabled || props.blocks.length >= 999) return;
    const range = insertRange.current || editor.state.selection;
    const $pos = editor.state.doc.resolve(Math.min(range.from, editor.state.doc.content.size));
    const block = props.create(type), newNode = editor.schema.nodeFromJSON(lessonCanvasNodes([block])[0]);
    const tr = editor.state.tr.setMeta('lessonStructure', true);
    let focus = 0;
    const inside = ['image', 'file'].includes(type) && imagePosition($pos).togglePath;
    if (inside) {
      for (let depth = $pos.depth; depth > 1; depth--) if ($pos.node(depth).type.name === 'detailsContent') {
        const at = $pos.depth > depth ? $pos.after(depth + 1) : $pos.pos;
        tr.insert(at, editor.schema.nodes[type === 'file' ? 'lessonFile' : 'lessonImage'].create({ blockId: block.id, block }));
        editor.view.dispatch(tr); props.onSettings(block.id); setMenu(false); insertRange.current = null; return;
      }
    }
    if ($pos.depth && $pos.node(1).type.name === 'lessonText') {
      const old = $pos.node(1), offset = $pos.pos - $pos.start(1), before = old.content.cut(0, offset), after = old.content.cut(offset);
      const parts = [];
      if (before.size) parts.push(old.type.create(old.attrs, before));
      const start = $pos.before(1); focus = start + (parts[0]?.nodeSize || 0);
      parts.push(newNode);
      if (after.size) parts.push(old.type.create({ block: props.create('text') }, after));
      else if (newNode.isAtom) parts.push(editor.schema.nodeFromJSON(lessonCanvasNodes([props.create('text')])[0]));
      tr.replaceWith(start, $pos.after(1), Fragment.fromArray(parts));
    } else {
      const pos = $pos.depth ? $pos.after(1) : $pos.pos; focus = pos;
      tr.insert(pos, newNode);
      if (newNode.isAtom && pos + newNode.nodeSize === tr.doc.content.size) tr.insert(pos + newNode.nodeSize, editor.schema.nodeFromJSON(lessonCanvasNodes([props.create('text')])[0]));
    }
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(focus + (newNode.isAtom ? newNode.nodeSize + 1 : 2), tr.doc.content.size))));
    editor.view.dispatch(tr.scrollIntoView()); editor.commands.focus(); setMenu(false); insertRange.current = null;
    if (newNode.isAtom) props.onSettings(block.id);
  }
  function structural(action: 'up' | 'down' | 'duplicate' | 'delete') {
    if (!editor || props.disabled) return;
    const nodes = (editor.getJSON().content || []) as CanvasNode[];
    function find(items: CanvasNode[]): CanvasNode[] | null {
      if (items.some(node => node.attrs?.block?.id === selectedId)) return items;
      for (const node of items) { const found = node.content && find(node.content); if (found) return found; }
      return null;
    }
    const items = find(nodes); if (!items) return;
    const index = items.findIndex(node => node.attrs?.block?.id === selectedId);
    if (index < 0) return;
    if (action === 'delete') {
      if (!window.confirm('선택한 항목을 삭제할까요? 실행 취소로 되돌릴 수 있고, 이전 학생 제출본은 보관됩니다.')) return;
      items.splice(index, 1); if (!items.length && items !== nodes) items.push({ type: 'paragraph' });
    } else if (action === 'duplicate') {
      if (nodes.length >= 1000) return;
      function copyNode(node: CanvasNode): CanvasNode {
        const copy = structuredClone(node);
        if (copy.attrs?.block) { const block = duplicateLessonBlock(copy.attrs.block, () => crypto.randomUUID()); copy.attrs = { ...copy.attrs, block, ...(['lessonImage', 'lessonFile'].includes(copy.type) ? { blockId: block.id } : {}) }; }
        if (copy.content) copy.content = copy.content.map(copyNode);
        return copy;
      }
      items.splice(index + 1, 0, copyNode(items[index]));
    } else {
      const next = index + (action === 'up' ? -1 : 1); if (next < 0 || next >= items.length) return;
      [items[index], items[next]] = [items[next], items[index]];
    }
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, nodes.map(node => editor.schema.nodeFromJSON(node))).setMeta('lessonStructure', true));
  }
  const selected = props.blocks.find(block => block.id === selectedId);
  const imageDrag = useLessonImageDrag(editor, props.disabled, setMessage);
  const outline = useMemo(() => props.blocks.flatMap(block => isCanvasText(block) ? canvasTextContent(block).filter(node => node.type === 'heading').map((node, index) => ({ id: block.id, index, label: (node.content || []).map(child => child.text || '').join('') })) : []), [props.blocks]);
  function jump(id: string, index: number) {
    if (!editor) return;
    editor.state.doc.forEach((item, pos) => {
      if (item.attrs.block?.id !== id) return;
      let heading = 0;
      item.forEach((node, offset) => { if (node.type.name === 'heading' && heading++ === index) editor.chain().focus().setTextSelection(pos + offset + 2).scrollIntoView().run(); });
    });
  }
  return <div className="ldc-root" ref={root} {...imageDrag.handlers}>
    <p className="meta">글을 바로 클릭해 수정하세요. 빈 줄에서 / 또는 ‘현재 위치에 추가’로 질문·자료를 넣고, 왼쪽 손잡이를 끌어 순서를 바꿀 수 있어요. 토글 제목에서 Enter는 안쪽 입력, Ctrl+Enter(맥은 ⌘+Enter)는 토글 밖 새 문단입니다.</p>
    {props.blocks.some(block => block.type === 'image') && <p className="meta ldc-image-drag-help">이미지를 펼친 토글 안에 끌어 넣을 수 있어요. 이미지 설정의 ‘토글 안으로 이동’도 사용할 수 있습니다. 다른 이미지 옆에 놓으면 최대 3장까지 나란히 붙어요.</p>}
    {outline.length > 0 && <details className="ldc-outline"><summary>수업 목차 · {outline.length}개</summary><nav aria-label="수업 목차">{outline.map(item => <button type="button" className="btn small" key={`${item.id}-${item.index}`} onClick={() => jump(item.id, item.index)}>{item.label || '제목 입력 전'}</button>)}</nav></details>}
    <div className="lesson-body-editor ldc-editor">
      <div className="ldc-sticky-toolbar">
      <LessonFormatToolbar editor={editor} disabled={props.disabled} />
      <div className="ldc-tools"><button type="button" className="btn small" disabled={props.disabled || !editor} onClick={() => editor && openMenu(editor)}>+ 현재 위치에 추가</button>
        {selected && <><span>{props.choices.find(choice => choice.type === selected.type)?.label}</span><button type="button" className="btn small" disabled={props.disabled} onClick={() => structural('up')} aria-label="선택 항목 위로">↑</button><button type="button" className="btn small" disabled={props.disabled} onClick={() => structural('down')} aria-label="선택 항목 아래로">↓</button><button type="button" className="btn small" disabled={props.disabled} onClick={() => structural('duplicate')}>항목 복제</button><button type="button" className="btn small" disabled={props.disabled} onClick={() => structural('delete')}>항목 삭제</button></>}
      </div>
      {menu && <div className="ldc-insert-menu" role="group" aria-label="문서에 넣을 항목">{props.choices.map(choice => <button className="btn small" type="button" disabled={props.disabled} key={choice.type} onClick={() => insert(choice.type)}>{choice.label}</button>)}<button className="btn small" type="button" onClick={() => { setMenu(false); editor?.commands.focus(); }}>닫기</button></div>}
      </div>
      <EditorContent editor={editor} onKeyDownCapture={event => {
        // Node views intentionally stop handle key events before ProseMirror.
        // Capture Tab here so handles and editable text share one sequence.
        if (editor && (event.target as HTMLElement).closest('[data-drag-handle]') && focusLessonMoveHandle(editor.view, event.nativeEvent)) event.stopPropagation();
      }} />
      {!props.blocks.length && <button type="button" className="btn" onClick={() => insert('text')} disabled={props.disabled}>글 쓰기 시작</button>}
    </div>
    {message && <p className="notice" role="alert">{message}</p>}
    {imageDrag.hint}
  </div>;
}
