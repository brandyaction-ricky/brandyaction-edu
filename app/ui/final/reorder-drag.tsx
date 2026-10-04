"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";
import "./reorder-drag.css";

export function moveOrderedItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function useReorderDrag(ids: readonly string[], onMove: (from: number, to: number) => void, disabled = false) {
  const active = useRef<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const touch = useRef<{ id: string; pointerId: number; x: number; y: number; moving: boolean } | null>(null);
  const clear = () => { active.current = null; touch.current = null; setDraggedId(null); setOverId(null); };
  const indexOf = (id: string) => ids.indexOf(id);
  const pointerTarget = (x: number, y: number) => {
    let element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-reorder-id]');
    while (element) {
      const id = element.dataset.reorderId;
      if (id && indexOf(id) >= 0) return id;
      element = element.parentElement?.closest<HTMLElement>('[data-reorder-id]') || null;
    }
    return null;
  };

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (disabled || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    const from = indexOf(id);
    const to = from + (event.key === "ArrowUp" ? -1 : 1);
    if (from < 0 || to < 0 || to >= ids.length) return;
    event.preventDefault();
    onMove(from, to);
  }
  function handleDragStart(event: DragEvent<HTMLButtonElement>, id: string) {
    if (disabled || indexOf(id) < 0) { event.preventDefault(); return; }
    active.current = id;
    setDraggedId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "reorder-item");
  }
  function rowDragOver(event: DragEvent<HTMLElement>, id: string) {
    if (disabled || !active.current || active.current === id || indexOf(id) < 0) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOverId(id);
  }
  function rowDrop(event: DragEvent<HTMLElement>, id: string) {
    if (!active.current) return;
    event.preventDefault();
    const from = indexOf(active.current), to = indexOf(id);
    if (!disabled && from >= 0 && to >= 0 && from !== to) onMove(from, to);
    clear();
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (disabled || event.pointerType === 'mouse' || indexOf(id) < 0) return;
    touch.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moving: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = touch.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moving && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    drag.moving = true;
    active.current = drag.id;
    setDraggedId(drag.id);
    setOverId(pointerTarget(event.clientX, event.clientY));
  }
  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = touch.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moving) {
      const target = pointerTarget(event.clientX, event.clientY);
      const from = indexOf(drag.id), to = indexOf(target || '');
      if (!disabled && from >= 0 && to >= 0 && from !== to) onMove(from, to);
    }
    clear();
  }
  return {
    draggedId, overId,
    handle: (id: string, label: string) => <button type="button" className="reorder-handle" aria-label={`${label} 순서 변경: 끌어서 이동하거나 방향키로 이동`} title="끌어서 순서 변경 · 방향키로 이동" draggable={!disabled} disabled={disabled} onDragStart={event => handleDragStart(event, id)} onDragEnd={clear} onKeyDown={event => handleKeyDown(event, id)} onPointerDown={event => pointerDown(event, id)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={clear}><GripVertical size={18} aria-hidden="true" /></button>,
    row: (id: string) => ({ 'data-reorder-id': id, onDragOver: (event: DragEvent<HTMLElement>) => rowDragOver(event, id), onDrop: (event: DragEvent<HTMLElement>) => rowDrop(event, id) }),
  };
}
