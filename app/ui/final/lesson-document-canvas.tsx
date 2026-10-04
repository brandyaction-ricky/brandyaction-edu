"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, Node, Extension, ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps, type JSONContent, type Editor } from '@tiptap/react';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';
import { isHistoryTransaction } from '@tiptap/pm/history';
import { publicLessonBlocks, type LessonBlock, type LessonBlockType } from '@/lib/lesson-blocks';
import { blocksFromCanvas, canvasTextContent, duplicateLessonBlock, isCanvasText, lessonCanvasNodes, type CanvasNode } from '@/lib/lesson-document-canvas';
import { LessonBlockView } from './lesson-block-view';
import { GripVertical } from 'lucide-react';
import { lessonRichExtensions, LessonFormatToolbar } from './lesson-rich-input';
import './lesson-document-canvas.css';

type Props = {
  blocks: LessonBlock[]; disabled: boolean; choices: { type: LessonBlockType; label: string }[];
  onChange: (blocks: LessonBlock[]) => void; onSettings: (id: string) => void;
  onError: (message: string) => void;
  create: (type: LessonBlockType) => LessonBlock;
  onImage: (files: File[], position: { blockId: string | null; after?: boolean; textBoundary?: number }) => void;
};
const emptyValues = { blocks: {}, checklist: [] };
function Activity({ node, extension, editor, selected }: NodeViewProps) {
  const block = node.attrs.block as LessonBlock;
  if (!block) return <NodeViewWrapper />;
  return <NodeViewWrapper className={'ldc-activity' + (selected ? ' is-selected' : '')} data-author-block={block.id} data-block-type={block.type} contentEditable={false}>
    <div className="ldc-activity-actions"><span data-drag-handle className="ldc-drag" aria-label="드래그하여 항목 순서 변경" title="드래그하여 순서 변경"><GripVertical size={18} aria-hidden="true" /></span><button type="button" className="btn small" disabled={!editor.isEditable} onClick={() => extension.options.onSettings(block.id)}>{extension.options.labels[block.type] || '항목'} 설정</button></div>
    <LessonBlockView document={publicLessonBlocks({ schemaVersion: 1, blocks: [block], checklist: [] })} values={emptyValues} onChange={() => {}} readOnly />
  </NodeViewWrapper>;
}

function itemAt(editor: Editor) {
  const { $from } = editor.state.selection;
  if ($from.depth) return { node: $from.node(1), pos: $from.before(1), index: $from.index(0) };
  const node = editor.state.doc.nodeAt($from.pos);
  return node ? { node, pos: $from.pos, index: $from.index(0) } : null;
}

export function LessonDocumentCanvas(props: Props) {
  const latest = useRef(props);
  useEffect(() => { latest.current = props; }, [props]);
  const last = useRef(JSON.stringify(props.blocks));
  const [menu, setMenu] = useState(false), [message, setMessage] = useState(''), [selectedId, setSelectedId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null), insertRange = useRef<{ from: number; to: number } | null>(null);
  function openMenu(editor: Editor, slash = false) {
    const { from, to } = editor.state.selection;
    insertRange.current = { from, to: slash ? from + 1 : to };
    setMenu(true);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('.ldc-insert-menu button')?.focus());
  }
  const editor = useEditor({
    immediatelyRender: false, shouldRerenderOnTransaction: false,
    extensions: [
      ...lessonRichExtensions().filter(extension => extension.name !== 'starterKit'),
      // Same text schema and input rules as the existing body editor, with one
      // document root for the whole lesson rather than one editor per paragraph.
      lessonRichExtensions()[0].configure({ document: false }),
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
      // Plugin callbacks run on editor transactions, never during React render.
      // eslint-disable-next-line react-hooks/refs
      Extension.create({
        name: 'lessonDocumentIntegrity',
        addProseMirrorPlugins() {
          return [new Plugin({
            filterTransaction(tr, state) {
              if (!tr.docChanged || tr.getMeta('lessonStructure') || isHistoryTransaction(tr)) return true;
              const activityIds = new Set<string>(); tr.doc.forEach(node => { if (node.type.name === 'lessonActivity') activityIds.add(node.attrs.block?.id); });
              let lost = false; state.doc.forEach(node => { if (node.type.name === 'lessonActivity' && !activityIds.has(node.attrs.block?.id)) lost = true; });
              if (lost) queueMicrotask(() => setMessage('질문·자료가 포함된 영역입니다. 해당 항목을 선택한 뒤 ‘항목 삭제’를 사용해 주세요.'));
              return !lost;
            },
            appendTransaction(transactions, _old, state) {
              if (!transactions.some(tr => tr.docChanged)) return null;
              const tr = state.tr, ids = new Set<string>();
              state.doc.forEach((node, pos) => {
                const block = node.attrs.block as LessonBlock | null;
                if (!block || ids.has(block.id)) {
                  const next = block ? duplicateLessonBlock(block, () => crypto.randomUUID()) : latest.current.create('text');
                  tr.setNodeMarkup(pos, undefined, { block: next }); ids.add(next.id);
                } else ids.add(block.id);
              });
              return tr.docChanged ? tr : null;
            },
          })];
        },
      }),
    ],
    content: { type: 'doc', content: lessonCanvasNodes(props.blocks) as JSONContent[] },
    editable: !props.disabled,
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': '수업 문서', 'aria-multiline': 'true', class: 'lesson-rich-body ldc-document' },
      handleKeyDown(view, event) {
        if (event.isComposing || view.composing) return false;
        if (event.key === 'Escape') { setMenu(false); return false; }
        if (event.key === '/' && view.state.selection.empty && view.state.selection.$from.parent.isTextblock && !view.state.selection.$from.parent.textContent) {
          const activeEditor = editorRef.current;
          if (activeEditor) { openMenu(activeEditor); return true; }
        }
        return false;
      },
      handlePaste(view, event) {
        if (!event.clipboardData?.files.length) return false;
        const { $from } = view.state.selection;
        if (!$from.depth) return false;
        latest.current.onImage([...event.clipboardData.files], { blockId: $from.node(1).attrs.block?.id || null, ...($from.depth > 1 && $from.node(1).attrs.block?.type === 'text' ? { textBoundary: $from.index(1) + 1 } : { after: true }) });
        return true;
      },
      handleDrop(view, event) {
        if (!event.dataTransfer?.files.length) return false;
        const hit = view.posAtCoords({ left: event.clientX, top: event.clientY }), pos = view.state.doc.resolve(hit?.pos || 0);
        latest.current.onImage([...event.dataTransfer.files], { blockId: pos.depth ? pos.node(1).attrs.block?.id : null, ...(pos.depth > 1 && pos.node(1).attrs.block?.type === 'text' ? { textBoundary: pos.index(1) + 1 } : { after: true }) });
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
    const nodes = lessonCanvasNodes(props.blocks).map(node => editor.schema.nodeFromJSON(node));
    const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, nodes).setMeta('lessonStructure', true);
    last.current = JSON.stringify(props.blocks); editor.view.dispatch(tr);
  }, [editor, props.blocks]);

  function insert(type: LessonBlockType) {
    if (!editor || props.disabled || props.blocks.length >= 999) return;
    const range = insertRange.current || editor.state.selection;
    const $pos = editor.state.doc.resolve(Math.min(range.from, editor.state.doc.content.size));
    const block = props.create(type), newNode = editor.schema.nodeFromJSON(lessonCanvasNodes([block])[0]);
    const tr = editor.state.tr.setMeta('lessonStructure', true);
    let focus = 0;
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
    const nodes = (editor.getJSON().content || []) as CanvasNode[], index = nodes.findIndex(node => node.attrs?.block?.id === selectedId);
    if (index < 0) return;
    if (action === 'delete') {
      if (!window.confirm('선택한 항목을 삭제할까요? 실행 취소로 되돌릴 수 있고, 이전 학생 제출본은 보관됩니다.')) return;
      nodes.splice(index, 1);
    } else if (action === 'duplicate') {
      if (nodes.length >= 1000) return;
      const copy = structuredClone(nodes[index]); copy.attrs = { block: duplicateLessonBlock(copy.attrs!.block!, () => crypto.randomUUID()) }; nodes.splice(index + 1, 0, copy);
    } else {
      const next = index + (action === 'up' ? -1 : 1); if (next < 0 || next >= nodes.length) return;
      [nodes[index], nodes[next]] = [nodes[next], nodes[index]];
    }
    editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, nodes.map(node => editor.schema.nodeFromJSON(node))).setMeta('lessonStructure', true));
  }
  const selected = props.blocks.find(block => block.id === selectedId);
  const outline = useMemo(() => props.blocks.flatMap(block => isCanvasText(block) ? canvasTextContent(block).filter(node => node.type === 'heading').map((node, index) => ({ id: block.id, index, label: (node.content || []).map(child => child.text || '').join('') })) : []), [props.blocks]);
  function jump(id: string, index: number) {
    if (!editor) return;
    editor.state.doc.forEach((item, pos) => {
      if (item.attrs.block?.id !== id) return;
      let heading = 0;
      item.forEach((node, offset) => { if (node.type.name === 'heading' && heading++ === index) editor.chain().focus().setTextSelection(pos + offset + 2).scrollIntoView().run(); });
    });
  }
  return <div className="ldc-root" ref={root}>
    <p className="meta">글을 바로 클릭해 수정하세요. 빈 줄에서 / 또는 ‘현재 위치에 추가’로 질문·자료를 넣습니다.</p>
    {outline.length > 0 && <details className="ldc-outline"><summary>수업 목차 · {outline.length}개</summary><nav aria-label="수업 목차">{outline.map(item => <button type="button" className="btn small" key={`${item.id}-${item.index}`} onClick={() => jump(item.id, item.index)}>{item.label || '제목 입력 전'}</button>)}</nav></details>}
    <div className="lesson-body-editor ldc-editor">
      <div className="ldc-sticky-toolbar">
      <LessonFormatToolbar editor={editor} disabled={props.disabled} />
      <div className="ldc-tools"><button type="button" className="btn small" disabled={props.disabled || !editor} onClick={() => editor && openMenu(editor)}>+ 현재 위치에 추가</button>
        {selected && <><span>{props.choices.find(choice => choice.type === selected.type)?.label}</span><button type="button" className="btn small" disabled={props.disabled} onClick={() => structural('up')} aria-label="선택 항목 위로">↑</button><button type="button" className="btn small" disabled={props.disabled} onClick={() => structural('down')} aria-label="선택 항목 아래로">↓</button><button type="button" className="btn small" disabled={props.disabled} onClick={() => structural('duplicate')}>항목 복제</button><button type="button" className="btn small" disabled={props.disabled} onClick={() => structural('delete')}>항목 삭제</button></>}
      </div>
      {menu && <div className="ldc-insert-menu" role="group" aria-label="문서에 넣을 항목">{props.choices.map(choice => <button className="btn small" type="button" disabled={props.disabled} key={choice.type} onClick={() => insert(choice.type)}>{choice.label}</button>)}<button className="btn small" type="button" onClick={() => { setMenu(false); editor?.commands.focus(); }}>닫기</button></div>}
      </div>
      <EditorContent editor={editor} />
      {!props.blocks.length && <button type="button" className="btn" onClick={() => insert('text')} disabled={props.disabled}>글 쓰기 시작</button>}
    </div>
    {message && <p className="notice" role="alert">{message}</p>}
  </div>;
}
