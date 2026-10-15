"use client";

import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import { BulletList, OrderedList } from '@tiptap/extension-list';
import type { NodeViewRenderer } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { LessonQuote } from './lesson-rich-input';

// Text blocks can number in the thousands after a paste. Native node views
// keep their editable DOM synchronous without a React portal/flushSync per line.
const movableBlock: NodeViewRenderer = ({ node, editor, getPos, HTMLAttributes }) => {
  const type = node.type.name;
  const tag = type === 'paragraph' ? 'p' : type === 'heading' ? `h${node.attrs.level}` : type === 'blockquote' ? 'blockquote' : 'div';
  const label = type === 'paragraph' ? '문단' : type === 'heading' ? '제목' : type === 'blockquote' ? '인용문' : '목록';
  const dom = document.createElement(tag), handle = document.createElement('span');
  for (const [key, value] of Object.entries(HTMLAttributes)) dom.setAttribute(key, String(value));
  dom.classList.add('ldc-movable', `ldc-movable-${type}`); dom.setAttribute('data-lesson-movable', '');
  handle.className = 'ldc-move-handle'; handle.contentEditable = 'false'; handle.draggable = true;
  handle.setAttribute('role', 'button'); handle.tabIndex = 0; handle.setAttribute('data-drag-handle', '');
  handle.setAttribute('aria-label', `${label} 이동`); handle.title = `끌어서 ${label} 이동`;
  handle.innerHTML = '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>';
  const select = () => {
    const pos = getPos();
    if (editor.isEditable && typeof pos === 'number') {
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
      // Keep subsequent IME input in the editor, not on the non-editable handle.
      editor.view.focus();
    }
  };
  handle.onclick = select;
  handle.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select(); } };
  dom.addEventListener('dragstart', () => editor.view.dispatch(closeHistory(editor.state.tr)), true);
  const contentDOM = document.createElement(type === 'bulletList' ? 'ul' : type === 'orderedList' ? 'ol' : ['paragraph', 'heading'].includes(type) ? 'span' : 'div');
  contentDOM.className = 'ldc-move-content';
  const attributes = (current: typeof node) => { if (type === 'orderedList') contentDOM.setAttribute('start', String(current.attrs.start || 1)); };
  attributes(node); dom.append(handle, contentDOM);
  return {
    dom, contentDOM,
    update(next) { if (next.type !== node.type || (type === 'heading' && next.attrs.level !== node.attrs.level)) return false; node = next; attributes(next); return true; },
    selectNode() { dom.classList.add('ProseMirror-selectednode'); },
    deselectNode() { dom.classList.remove('ProseMirror-selectednode'); },
    // Drag events reach ProseMirror; keyboard/click on the handle stay controls.
    stopEvent(event) { return !!event.target && handle.contains(event.target as globalThis.Node) && !event.type.startsWith('drag') && event.type !== 'mousedown'; },
    ignoreMutation(mutation) { return mutation.type !== 'selection' && (handle.contains(mutation.target) || mutation.target === dom); },
  };
};

export const lessonCanvasMovableExtensions = [
  Paragraph.extend({ draggable: true, addNodeView: () => movableBlock }),
  Heading.extend({ draggable: true, addNodeView: () => movableBlock }).configure({ levels: [1, 2, 3] }),
  BulletList.extend({ draggable: true, addNodeView: () => movableBlock }),
  OrderedList.extend({ draggable: true, addNodeView: () => movableBlock }),
  LessonQuote.extend({ draggable: true, addNodeView: () => movableBlock }),
];
