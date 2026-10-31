'use client';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import './question-image-dropzone.css';

export function QuestionImageDropzone({ enabled, locked, onFiles, children }: { enabled: boolean; locked: boolean; onFiles: (files: File[]) => void; children: ReactNode }) {
 const [dragging, setDragging] = useState(false);
 const depth = useRef(0);
 const hasFiles = (event: DragEvent<HTMLDivElement>) => Array.from(event.dataTransfer.types).includes('Files') || event.dataTransfer.files.length > 0;
 function clear() { depth.current = 0; setDragging(false); }
 return <div className="question-image-dropzone" data-dragging={enabled && !locked && dragging || undefined}
  onDragEnter={event => { if (!enabled || !hasFiles(event)) return; event.preventDefault(); depth.current++; if (!locked) setDragging(true); }}
  onDragOver={event => { if (!enabled || !hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = locked ? 'none' : 'copy'; if (!locked) setDragging(true); }}
  onDragLeave={() => { if (depth.current > 0) depth.current--; if (!depth.current) setDragging(false); }}
  onDrop={event => {
   if (!enabled || !hasFiles(event)) return;
   // Prevent a file drop from navigating away, including while an upload or
   // question is pending. Text and URL drags keep their normal browser behavior.
   event.preventDefault(); event.stopPropagation(); clear();
   if (!locked) onFiles(Array.from(event.dataTransfer.files));
  }}>
  {children}
  {enabled && !locked && dragging && <div className="question-image-drop-hint" aria-hidden="true"><strong>사진·화면 캡처를 여기에 놓으세요</strong><span>이미지 한 장 · 최대 10MB</span></div>}
 </div>;
}
