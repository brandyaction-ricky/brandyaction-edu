'use client';
import { useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { imagePreviewUrl } from '@/lib/qa-rules';

export type PlatformUploadKind = 'image' | 'detail-image' | 'resource';

export async function uploadPlatformFile(file: File, kind: PlatformUploadKind) {
    const response = await fetch('/api/platform/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, kind }),
    });
    const result = await response.json().catch(() => ({ error: '업로드 요청을 처리하지 못했습니다. 다시 시도해 주세요.' }));
    if (!response.ok) throw new Error(result.error || '파일 업로드를 시작하지 못했습니다.');
    const uploaded = await createClient().storage.from(result.bucket).uploadToSignedUrl(result.path, result.token, file, {
        contentType: result.contentType,
    });
    if (uploaded.error) throw new Error(`파일 전송에 실패했습니다. ${uploaded.error.message || '다시 시도해 주세요.'}`);
    return result as { bucket: string; path: string; token: string; contentType: string; value: string; name: string };
}

async function validImageHeader(file: File) {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'png') return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
    if (extension === 'webp') return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}

export function UploadField({ name, value, image, disabled, onChange, onStatusChange, optimize = false, dropzone = false }: { name: string; value: string; image: boolean; disabled: boolean; onChange?: (value: string) => void; optimize?: boolean; dropzone?: boolean; onStatusChange?: (status: 'idle' | 'uploading' | 'error') => void }) {
    const [current, setCurrent] = useState(value);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [brokenPreview, setBrokenPreview] = useState('');
    const preview = image ? imagePreviewUrl(current, process.env.NEXT_PUBLIC_SUPABASE_URL || '') : '';
    return (
        <span className={"upload-field" + (dropzone ? " upload-dropzone" : "")}>
            <span className={dropzone ? "upload-zone" : "upload-inline"}>
            {dropzone && <><Upload aria-hidden="true" /><span className="upload-label">{image ? (name.includes("detail") ? "상세페이지 이미지를 선택하세요." : "썸네일 이미지를 선택하세요.") : "PDF · 문서 · 템플릿 자료 추가"}</span></>}

            <span className="upload-control">
                <Upload size={16} />
                <span>{pending ? '올리는 중…' : '파일 선택'}</span>
                <input
                    type="file"
                    disabled={disabled || pending}
                    accept={image ? '.png,.jpg,.jpeg,.webp' : '.pdf,.zip,.txt,.csv,.hwp,.doc,.docx,.xls,.xlsx,.ppt,.pptx'}
                    onChange={async (e) => {
                        const input = e.currentTarget;
                        let file = input.files?.[0];
                        if (!file) return;
                        setPending(true);
                        setError('');
                        onStatusChange?.('uploading');
                        try {
                            const limit = (image ? 10 : 20) * 1024 * 1024;
                            if (!file.size || file.size > limit) throw new Error(`${image ? 10 : 20}MB 이하의 파일을 선택해 주세요.`);
                            if (image && !(await validImageHeader(file))) throw new Error('이미지 파일 형식을 확인해 주세요.');
                            if (image && optimize && file.type !== 'image/webp') {
                                const bitmap = await createImageBitmap(file);
                                const canvas = document.createElement('canvas');
                                const ratio = Math.min(1, 2000 / bitmap.width);
                                canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
                                const context = canvas.getContext('2d');
                                if (!context) throw Error('이미지 변환을 지원하지 않는 브라우저입니다. WEBP 파일을 선택해 주세요.');
                                context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
                                const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.88));
                                if (!blob || blob.type !== 'image/webp') throw Error('WEBP 변환에 실패했습니다. WEBP 파일을 선택해 주세요.');
                                file = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
                            }
                            const result = await uploadPlatformFile(file, image ? 'image' : 'resource');
                            setCurrent(result.value);
                            setBrokenPreview('');
                            onChange?.(result.value);
                            onStatusChange?.('idle');
                        } catch (cause) {
                            setError(cause instanceof Error ? cause.message : '업로드하지 못했습니다.');
                            onStatusChange?.('error');
                        } finally {
                            setPending(false);
                            input.value = '';
                        }
                    }}
                />
            </span>
            <small>
                최대 {image ? 10 : 20}MB
                {image ? ' · PNG, JPG, WEBP' : ' · PDF, ZIP, TXT, CSV, HWP, Office 문서'}
            </small>
            </span>
            <input id={"edit-" + name} name={name} aria-label={image ? '이미지 주소' : '자료 경로'} type="text" value={current} onChange={(e) => { setCurrent(e.target.value); setError(''); onStatusChange?.('idle'); setBrokenPreview(''); onChange?.(e.target.value); }} placeholder={image ? '이미지 주소 또는 파일 선택' : '등록된 자료 경로 또는 파일 선택'} disabled={disabled || pending} />
            {(pending || error) && <input required aria-label="파일 업로드 완료 대기" value="" onChange={() => {}} className="upload-pending-guard" tabIndex={-1} />}
            {error && <span role="alert">{error}</span>}
            {error && <button type="button" className="btn" disabled={disabled || pending} onClick={() => { setError(''); onStatusChange?.('idle'); }}>업로드 취소 · 기존 값 유지</button>}
            {preview && brokenPreview !== preview && <img className="upload-preview" src={preview} alt="등록할 이미지 미리보기" onError={() => setBrokenPreview(preview)} />}
            {preview && brokenPreview === preview && <small role="status">이미지를 불러오지 못했습니다. 주소와 공개 여부를 확인해 주세요.</small>}
        </span>
    );
}

type Block = {
    type: string;
    text?: string;
    url?: string;
    alt?: string;
    [key: string]: unknown;
};
export function BlocksField({ name, value }: { name: string; value: unknown }) {
    const [blocks, setBlocks] = useState<Block[]>(Array.isArray(value) ? value : []);
    const update = (index: number, key: string, next: string) => setBlocks((all) => all.map((block, i) => (i === index ? { ...block, [key]: next } : block)));
    return (
        <span className="blocks-editor">
            <input name={name} type="hidden" value={JSON.stringify(blocks)} />
            {blocks.map((block, index) => (
                <span className="block-editor" key={index}>
                    <span className="between">
                        <select aria-label={`${index + 1}번째 본문 형식`} value={block.type} onChange={(e) => update(index, 'type', e.target.value)}>
                            <option value="paragraph">본문</option>
                            <option value="heading">제목</option>
                            <option value="image">이미지</option>
                            <option value="video">영상</option>
                        </select>
                        <button className="icon-btn" type="button" aria-label={`${index + 1}번째 본문 삭제`} onClick={() => setBlocks((all) => all.filter((_, i) => i !== index))}>
                            <Trash2 />
                        </button>
                    </span>
                    {['image', 'video'].includes(block.type) ? <input type="url" aria-label={`${index + 1}번째 콘텐츠 주소`} value={String(block.url || block.src || '')} onChange={(e) => update(index, 'url', e.target.value)} placeholder="https://" /> : <textarea rows={block.type === 'heading' ? 2 : 5} aria-label={`${index + 1}번째 본문`} value={String(block.text || block.content || block.body || '')} onChange={(e) => update(index, 'text', e.target.value)} />}
                </span>
            ))}
            <button type="button" className="btn" onClick={() => setBlocks((all) => [...all, { type: 'paragraph', text: '' }])}>
                <Plus />
                본문 추가
            </button>
        </span>
    );
}
