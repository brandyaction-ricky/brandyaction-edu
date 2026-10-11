"use client";

import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import type { Editor } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { blocksFromCanvas, lessonCanvasNodes, type CanvasNode } from '@/lib/lesson-document-canvas';
import { lessonImageRows, moveLessonImage, type ImageDropPlacement } from '@/lib/lesson-image-row';
import type { LessonBlock } from '@/lib/lesson-blocks';
import { removeLessonImageReference } from '@/lib/lesson-toggle-images';

type Hint = { target: string; placement: ImageDropPlacement | 'inside'; position?: number; label: string; blocked: boolean; left: number; top: number; width: number; height: number };
const mime = 'application/x-edu-lesson-image';

export function useLessonImageDrag(editor: Editor | null, disabled: boolean, onError: (message: string) => void) {
  const source = useRef<string | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  useEffect(() => {
    const clear = () => { source.current = null; setHint(null); };
    document.addEventListener('dragend', clear);
    window.addEventListener('blur', clear);
    return () => { document.removeEventListener('dragend', clear); window.removeEventListener('blur', clear); };
  }, []);

  function targetAt(event: DragEvent<HTMLDivElement>): Hint | null {
    const toggle = (event.target as Element).closest<HTMLElement>('[data-type="detailsContent"]');
    if (toggle && editor?.view.dom.contains(toggle) && !toggle.hidden) {
      const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      const $pos = editor.state.doc.resolve(hit?.pos ?? editor.view.posAtDOM(toggle, 0));
      for (let depth = $pos.depth; depth > 0; depth--) {
        if ($pos.node(depth).type.name !== 'detailsContent') continue;
        const position = $pos.depth > depth ? $pos.after(depth + 1) : $pos.pos;
        const rect = toggle.getBoundingClientRect();
        return { target: '', placement: 'inside', position, blocked: false, left: rect.left, top: event.clientY, width: rect.width, height: 4, label: '토글 안에 이미지 넣기' };
      }
    }
    const element = (event.target as Element).closest<HTMLElement>('[data-author-block]');
    if (!element || !editor?.view.dom.contains(element) || element.dataset.authorBlock === source.current) return null;
    const blocks: LessonBlock[] = [];
    editor.state.doc.descendants(node => { if (node.attrs.block) blocks.push(node.attrs.block); });
    const row = lessonImageRows(blocks).find(items => items.some(block => block.id === element.dataset.authorBlock));
    if (!row) return null;
    const rect = element.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    const verticalEdge = Math.min(32, rect.height * .2);
    const beside = row[0].type === 'image' && y > verticalEdge && y < rect.height - verticalEdge;
    const placement: ImageDropPlacement = beside ? (x < rect.width / 2 ? 'left' : 'right') : y < rect.height / 2 ? 'above' : 'below';
    const side = placement === 'left' || placement === 'right';
    const count = row.filter(block => block.id !== source.current).length + 1;
    const blocked = side && count > 3;
    let { left, top, width, height } = rect;
    if (side) { left = placement === 'left' ? rect.left : rect.right; width = 4; }
    else {
      // A horizontal guide spans the whole row, including unequal-height images.
      const ids = new Set(row.map(block => block.id));
      const rects = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-author-block]')].filter(item => ids.has(item.dataset.authorBlock || '')).map(item => item.getBoundingClientRect());
      left = Math.min(...rects.map(item => item.left)); width = Math.max(...rects.map(item => item.right)) - left;
      top = placement === 'above' ? Math.min(...rects.map(item => item.top)) : Math.max(...rects.map(item => item.bottom)); height = 4;
    }
    return { target: element.dataset.authorBlock!, placement, blocked, left, top, width, height,
      label: blocked ? '최대 3장 · 위나 아래에 놓아 주세요' : side ? `${placement === 'left' ? '왼쪽' : '오른쪽'}에 나란히 놓기 · ${count}장` : `${placement === 'above' ? '위' : '아래'}에 한 장으로 놓기` };
  }

  return {
    handlers: {
      onMouseDownCapture(event: MouseEvent<HTMLDivElement>) {
        const target = event.target as Element;
        // ProseMirror's node selection mousedown otherwise cancels the browser's
        // native image drag. Keep clicks (including enlarge) working normally.
        if (!disabled && editor?.isEditable && target.closest('[data-author-block][data-block-type="image"]') && target.closest('.lb-image-open img, [data-drag-handle]')) event.stopPropagation();
      },
      onDragStartCapture(event: DragEvent<HTMLDivElement>) {
        source.current = null;
        const target = event.target as Element, image = target.closest<HTMLElement>('[data-author-block][data-block-type="image"]');
        if (!image || !editor?.view.dom.contains(image) || !target.closest('.lb-image-open img, [data-drag-handle]')) return;
        // Own only internal image moves. File uploads and other block drags keep
        // using the canvas' existing handlers; never import data from another tab.
        event.stopPropagation();
        if (disabled || !editor.isEditable) { event.preventDefault(); return; }
        source.current = image.dataset.authorBlock!;
        event.dataTransfer.clearData(); event.dataTransfer.setData(mime, source.current); event.dataTransfer.effectAllowed = 'move';
        onError('');
      },
      onDragOverCapture(event: DragEvent<HTMLDivElement>) {
        if (!source.current) return;
        event.preventDefault(); event.stopPropagation();
        const next = disabled || !editor?.isEditable ? null : targetAt(event);
        event.dataTransfer.dropEffect = next && !next.blocked ? 'move' : 'none';
        setHint(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      },
      onDragLeaveCapture(event: DragEvent<HTMLDivElement>) {
        if (!(event.relatedTarget instanceof globalThis.Node) || !event.currentTarget.contains(event.relatedTarget)) setHint(null);
      },
      onDropCapture(event: DragEvent<HTMLDivElement>) {
        const id = source.current;
        if (!id) return;
        event.preventDefault(); event.stopPropagation();
        try {
          if (disabled || !editor?.isEditable) return;
          const target = targetAt(event);
          if (!target) return;
          if (target.blocked) { onError(target.label); return; }
          if (target.placement === 'inside') {
            let sourcePos = -1, sourceNode: typeof editor.state.doc | null = null;
            editor.state.doc.descendants((node, pos) => { if (node.attrs.block?.id === id) { sourcePos = pos; sourceNode = node; } });
            if (!sourceNode || sourcePos < 0 || target.position === undefined) return;
            const node = sourceNode as typeof editor.state.doc;
            const block = { ...node.attrs.block }; delete block.imageGroup;
            const $source = editor.state.doc.resolve(sourcePos);
            const replacement = $source.parent.type.name === 'detailsContent' && $source.parent.childCount === 1 ? editor.schema.nodes.paragraph.create() : [];
            const tr = editor.state.tr.replaceWith(sourcePos, sourcePos + node.nodeSize, replacement).setMeta('lessonStructure', true);
            const position = tr.mapping.map(target.position);
            tr.insert(position, editor.schema.nodes.lessonImage.create({ blockId: id, block }));
            editor.view.dispatch(closeHistory(tr)); editor.view.dispatch(closeHistory(editor.state.tr));
            return;
          }
          const blocks = blocksFromCanvas((editor.getJSON().content || []) as CanvasNode[]);
          const moved = moveLessonImage(removeLessonImageReference(blocks, id), id, target.target, target.placement, crypto.randomUUID());
          const nodes = lessonCanvasNodes(moved).map(node => editor.schema.nodeFromJSON(node));
          editor.view.dispatch(closeHistory(editor.state.tr.replaceWith(0, editor.state.doc.content.size, nodes).setMeta('lessonStructure', true)));
          // Keep typing immediately after a move in its own undo step.
          editor.view.dispatch(closeHistory(editor.state.tr));
        } catch (error) { onError((error as Error).message); }
        finally { source.current = null; setHint(null); }
      },
      onDragEndCapture() { source.current = null; setHint(null); },
    },
    hint: hint && <div className={'ldc-image-drop-hint' + (hint.blocked ? ' is-blocked' : '')} data-image-drop={hint.placement} data-drop-blocked={hint.blocked} role="status" style={{ left: hint.left, top: hint.top, width: hint.width, height: hint.height }}><span style={hint.placement === 'left' || hint.placement === 'right' ? { top: Math.max(8, 80 - hint.top) } : undefined}>{hint.label}</span></div>,
  };
}
