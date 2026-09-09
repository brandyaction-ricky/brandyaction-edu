"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function AdminDetailPanel({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: React.ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog className="admin-detail-panel" ref={ref} aria-label={title} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}><header><h2>{title}</h2><button disabled={busy} onClick={onClose} aria-label="상세 패널 닫기"><X/></button></header><div className="admin-panel-body">{children}</div></dialog>;
}
