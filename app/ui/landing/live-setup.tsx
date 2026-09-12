'use client';
import { useRef, useState, type FormEvent } from 'react';
import { UploadField } from '../editor-fields';
import { kakaoUrl, type LandingConfig } from '@/lib/landing';
import { object, text as t, type Row } from '@/lib/platform';

export function LiveSetup({ course, initial, onSaved }: { course: Row; initial: LandingConfig; onSaved: (config: LandingConfig, image: string) => void }) {
  const meta = object(course, 'metadata');
  const [url, setUrl] = useState(initial.kakao_url), [label, setLabel] = useState(initial.cta_label || '카카오톡방 입장하기');
  const [imageMode, setImageMode] = useState(!initial.custom_sections), [message, setMessage] = useState(''), [pending, setPending] = useState(false);
  const busy = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    if (!kakaoUrl(url)) { setMessage('실제 카카오 오픈채팅 주소(https://open.kakao.com/o/...)를 입력해 주세요.'); return; }
    const form = new FormData(event.currentTarget), image = String(form.get('live-detail-image') || '');
    busy.current = true; setPending(true); setMessage('');
    try {
      const response = await fetch('/api/landing/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'publish_live', config: { ...initial, kakao_url: url, cta_label: label, custom_sections: !imageMode }, detail_image_url: image, note: '무료 라이브 CTA·상세 이미지 저장' }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '저장하지 못했습니다.');
      onSaved(result.config, image);
    } catch (error) { setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.'); }
    finally { busy.current = false; setPending(false); }
  }
  return <form className="landing-panel live-setup" onSubmit={save}>
    <h2>무료 라이브 · CTA와 상세 이미지</h2>
    <p className="muted">참여 버튼은 회원가입 없이 카카오 오픈채팅으로 바로 연결됩니다. CTA와 이미지를 함께 저장해 현재 상세페이지에 반영합니다.</p>
    {course.status !== 'published' && <p className="notice">현재 비공개 클래스입니다. 광고를 시작하기 전에 상품 관리에서 공개 상태로 변경해 주세요.</p>}
    <fieldset disabled={pending} className="live-setup-fields">
      <div className="landing-form-grid">
        <label className="field"><span>카카오톡방 입장 CTA 링크 *</span><input type="url" required maxLength={2048} placeholder="https://open.kakao.com/o/..." value={url} onChange={event => setUrl(event.target.value)} /></label>
        <label className="field"><span>CTA 버튼 문구 *</span><input required maxLength={100} value={label} onChange={event => setLabel(event.target.value)} /></label>
      </div>
      <label className="field"><span>클래스 상세페이지 이미지</span><UploadField name="live-detail-image" value={String(meta.detail_image_url || meta.detailImageUrl || '')} image disabled={pending} /></label>
      <label className="check-row"><input type="checkbox" checked={imageMode} onChange={event => setImageMode(event.target.checked)} />상세 이미지 중심으로 표시</label>
      {!imageMode && <p className="muted">아래 고급 설정에 등록된 맞춤 섹션을 사용합니다. 대표 상세 이미지는 이미지 중심 표시를 선택하면 보입니다.</p>}
      <div className="landing-toolbar mt24"><button className="btn primary" disabled={pending}>{pending ? '저장·발행 중…' : 'CTA·이미지 저장하고 발행'}</button>{initial.kakao_url && <a className="btn" href={'/classes/' + t(course, 'slug') + '?testmode=1'} target="_blank" rel="noreferrer">반영 화면 확인</a>}</div>
    </fieldset>
    {message && <p className="notice" role="alert">{message}</p>}
    {!initial.kakao_url && <p className="notice">참여 링크 미등록 · 실제 오픈채팅방 주소를 입력해야 광고 방문자가 입장할 수 있습니다.</p>}
  </form>;
}
