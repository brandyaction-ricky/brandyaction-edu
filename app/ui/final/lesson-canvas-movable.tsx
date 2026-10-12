"use client";

import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import { BulletList, OrderedList } from '@tiptap/extension-list';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { GripVertical } from 'lucide-react';
import { LessonQuote } from './lesson-rich-input';

function MovableBlock({ node, editor, getPos }: NodeViewProps) {
  const type = node.type.name;
  const tag = type === 'paragraph' ? 'p' : type === 'heading' ? (`h${node.attrs.level}` as 'h1' | 'h2' | 'h3') : type === 'blockquote' ? 'blockquote' : 'div';
  const label = type === 'paragraph' ? '문단' : type === 'heading' ? '제목' : type === 'blockquote' ? '인용문' : '목록';
  function select() {
    const pos = getPos();
    if (editor.isEditable && typeof pos === 'number') editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
  }
  return <NodeViewWrapper as={tag} className={`ldc-movable ldc-movable-${type}`} data-lesson-movable="" onDragStartCapture={() => editor.view.dispatch(closeHistory(editor.state.tr))}>
    <span role="button" tabIndex={0} draggable={editor.isEditable} data-drag-handle="" className="ldc-move-handle" contentEditable={false} aria-label={`${label} 이동`} title={`끌어서 ${label} 이동`} onClick={select} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } }}><GripVertical size={17} aria-hidden="true" /></span>
    {type === 'paragraph' || type === 'heading' ? <NodeViewContent as={'span' as never} className="ldc-move-content" /> : <NodeViewContent className="ldc-move-content" />}
  </NodeViewWrapper>;
}

export const lessonCanvasMovableExtensions = [
  Paragraph.extend({ draggable: true, addNodeView: () => ReactNodeViewRenderer(MovableBlock, { contentDOMElementTag: 'span' }) }),
  Heading.extend({ draggable: true, addNodeView: () => ReactNodeViewRenderer(MovableBlock, { contentDOMElementTag: 'span' }) }).configure({ levels: [1, 2, 3] }),
  BulletList.extend({ draggable: true, addNodeView: () => ReactNodeViewRenderer(MovableBlock, { contentDOMElementTag: 'ul' }) }),
  OrderedList.extend({ draggable: true, addNodeView: () => ReactNodeViewRenderer(MovableBlock, { contentDOMElementTag: 'ol' }) }),
  LessonQuote.extend({ draggable: true, addNodeView: () => ReactNodeViewRenderer(MovableBlock, { contentDOMElementTag: 'div' }) }),
];
