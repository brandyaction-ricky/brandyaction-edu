'use client';
import { useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';

export function UploadField({ name, value, image, disabled }: { name: string; value: string; image: boolean; disabled: boolean }) {
  const [current, setCurrent] = useState(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return <span className="upload-field">
    <input name={name} type="text" value={current} onChange={e => setCurrent(e.target.value)} placeholder={image ? '이미지 주소 또는 파일 선택' : '등록된 자료 경로 또는 파일 선택'} disabled={disabled || pending} />
    <span className="upload-control"><Upload size={16} /><span>{pending ? '올리는 중…' : '파일 선택'}</span><input type="file" disabled={disabled || pending} accept={image ? '.png,.jpg,.jpeg,.webp' : '.pdf,.zip,.txt,.docx,.xlsx'} onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return;
      setPending(true); setError('');
      try { const form = new FormData(); form.set('file', file); form.set('kind', image ? 'image' : 'resource'); const response = await fetch('/api/platform/upload', { method: 'POST', body: form }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setCurrent(result.value); }
      catch (cause) { setError(cause instanceof Error ? cause.message : '업로드하지 못했습니다.'); }
      finally { setPending(false); }
    }} /></span>
    <small>최대 4MB{image ? ' · PNG, JPG, WEBP' : ''}</small>
    {pending && <input required aria-label="파일 업로드 완료 대기" value="" readOnly className="upload-pending-guard" tabIndex={-1} />}
    {error && <span role="alert">{error}</span>}
  </span>;
}

type Block = { type: string; text?: string; url?: string; alt?: string; [key: string]: unknown };
export function BlocksField({ name, value }: { name: string; value: unknown }) {
  const [blocks, setBlocks] = useState<Block[]>(Array.isArray(value) ? value : []);
  const update = (index: number, key: string, next: string) => setBlocks(all => all.map((block, i) => i === index ? { ...block, [key]: next } : block));
  return <span className="blocks-editor">
    <input name={name} type="hidden" value={JSON.stringify(blocks)} />
    {blocks.map((block, index) => <span className="block-editor" key={index}>
      <span className="between"><select aria-label={`${index + 1}번째 본문 형식`} value={block.type} onChange={e => update(index, 'type', e.target.value)}><option value="paragraph">본문</option><option value="heading">제목</option><option value="image">이미지</option><option value="video">영상</option></select><button className="icon-btn" type="button" aria-label={`${index + 1}번째 본문 삭제`} onClick={() => setBlocks(all => all.filter((_, i) => i !== index))}><Trash2 /></button></span>
      {['image', 'video'].includes(block.type) ? <input type="url" aria-label={`${index + 1}번째 콘텐츠 주소`} value={String(block.url || block.src || '')} onChange={e => update(index, 'url', e.target.value)} placeholder="https://" /> : <textarea rows={block.type === 'heading' ? 2 : 5} aria-label={`${index + 1}번째 본문`} value={String(block.text || block.content || block.body || '')} onChange={e => update(index, 'text', e.target.value)} />}
    </span>)}
    <button type="button" className="btn" onClick={() => setBlocks(all => [...all, { type: 'paragraph', text: '' }])}><Plus />본문 추가</button>
  </span>;
}
