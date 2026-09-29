"use client";

import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { LessonBlock } from '@/lib/lesson-blocks';
import type { LessonImagePosition } from '@/lib/lesson-image-position';

type Guide = { position: LessonImagePosition; top: number; left: number; width: number };
function locate(root: HTMLElement, y: number): Guide {
  const origin = root.getBoundingClientRect();
  const articles = [...root.querySelectorAll<HTMLElement>('[data-author-block]')];
  const candidates: { position: LessonImagePosition; y: number; left: number; width: number }[] = [];
  for (const article of articles) {
    const blockId = article.dataset.authorBlock!, rect = article.getBoundingClientRect();
    candidates.push({ position: { blockId }, y: rect.top, left: rect.left, width: rect.width }, { position: { blockId, after: true }, y: rect.bottom, left: rect.left, width: rect.width });
    if (article.dataset.blockType !== 'text') continue;
    const body = article.querySelector<HTMLElement>('.lesson-rich-body');
    if (!body) continue;
    const bodyRect = body.getBoundingClientRect();
    // Only direct children count: never insert media inside headings or lists.
    const children = [...body.children];
    children.forEach((child, index) => {
      const rect = child.getBoundingClientRect();
      candidates.push({ position: { blockId, textBoundary: index }, y: rect.top, left: bodyRect.left, width: bodyRect.width });
      candidates.push({ position: { blockId, textBoundary: index + 1 }, y: rect.bottom, left: bodyRect.left, width: bodyRect.width });
    });
  }
  const closest = candidates.reduce<(typeof candidates)[number] | null>((best, item) => !best || Math.abs(item.y - y) < Math.abs(best.y - y) ? item : best, null);
  return closest ? { position: closest.position, top: closest.y - origin.top, left: closest.left - origin.left, width: closest.width }
    : { position: { blockId: null }, top: 0, left: 0, width: origin.width };
}

export function LessonImageLayout({ blocks, disabled, uploading, onMove, onFiles, children }: {
  blocks: LessonBlock[]; disabled: boolean; uploading: boolean; children: ReactNode;
  onMove: (image: LessonBlock, position: LessonImagePosition) => void;
  onFiles: (files: File[], position: LessonImagePosition) => void;
}) {
  const root = useRef<HTMLDivElement>(null), moving = useRef<string | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  function accepts(event: DragEvent) { return !disabled && (Boolean(moving.current) || event.dataTransfer.types.includes('Files')); }
  function clear() { moving.current = null; setGuide(null); }
  return <div className="lba-image-layout" ref={root}
    onDragStartCapture={event => {
      const source = (event.target as Element).closest<HTMLElement>('[data-image-move]');
      if (!source || !root.current?.contains(source)) return;
      if (disabled || uploading) { event.preventDefault(); return; }
      moving.current = source.dataset.imageMove!;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-edu-lesson-image', moving.current);
    }}
    onDragOverCapture={event => {
      if (!accepts(event)) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = moving.current ? 'move' : 'copy';
      setGuide(locate(event.currentTarget, event.clientY));
    }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setGuide(null); }}
    onDragEnd={clear}
    onDropCapture={event => {
      if (!accepts(event)) return;
      event.preventDefault(); event.stopPropagation();
      const position = locate(event.currentTarget, event.clientY).position;
      const image = blocks.find(block => block.id === moving.current && block.type === 'image');
      if (image) onMove(image, position);
      else if (!moving.current) onFiles([...event.dataTransfer.files], position);
      clear();
    }}
    onPasteCapture={event => {
      if (disabled || !event.clipboardData.files.length) return;
      const article = (event.target as Element).closest<HTMLElement>('[data-block-type="text"]');
      const body = article?.querySelector<HTMLElement>('.ProseMirror');
      if (!article || !body?.contains(event.target as Node)) return;
      event.preventDefault(); event.stopPropagation();
      const anchor = window.getSelection()?.anchorNode;
      const index = [...body.children].findIndex(child => anchor && child.contains(anchor));
      onFiles([...event.clipboardData.files], { blockId: article.dataset.authorBlock!, ...(index < 0 ? { after: true } : { textBoundary: index + 1 }) });
    }}>
    {children}
    {guide && <div className="lba-image-drop-guide" role="status" aria-label="이미지가 들어갈 위치" style={{ top: guide.top, left: guide.left, width: guide.width }} />}
  </div>;
}
