"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { defaultKakaoSyncConfig, type KakaoSyncConfig } from '@/lib/kakao-sync';
import { POLICY_VERSION } from '@/lib/legal-policies';

export function KakaoSyncSettings() {
  const [config, setConfig] = useState<KakaoSyncConfig>(defaultKakaoSyncConfig);
  const [loaded, setLoaded] = useState(false);
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const saving = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/kakao-sync/admin', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (response.status === 403) { setDenied(true); return; }
      const value = await response.json();
      if (!response.ok) throw Error(value.error);
      setConfig(value.config); setLoaded(true); setMessage('');
    }).catch(error => { if (error.name !== 'AbortError') setMessage(error.message || '설정을 불러오지 못했습니다.'); });
    return () => controller.abort();
  }, [retry]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!loaded || saving.current) return;
    saving.current = true; setPending(true); setMessage('');
    try {
      const response = await fetch('/api/kakao-sync/admin', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
      const value = await response.json();
      if (!response.ok) throw Error(value.error);
      setConfig(value.config);
      setMessage(value.config.enabled ? '저장했습니다. 실제 카카오 동의 화면은 카카오 앱·채널 설정에 따라 표시됩니다.' : '저장했습니다. 기존 카카오 로그인을 유지합니다.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.'); }
    finally { saving.current = false; setPending(false); }
  }
  if (denied) return null;
  const field = (key: 'appId' | 'channelId' | 'termsTag' | 'privacyTag', label: string, placeholder: string) => (
    <label className="field"><span>{label}</span><input value={config[key]} placeholder={placeholder} maxLength={100}
      onChange={event => setConfig({ ...config, [key]: event.target.value, setupConfirmed: false })} /></label>
  );
  return <section className="panel pad mt24" aria-labelledby="kakao-sync-heading">
    <h2 id="kakao-sync-heading">카카오싱크 · 가입 및 채널 추가</h2>
    <p className="muted">카카오 가입 시 선택 동의로 채널을 추가합니다. 미동의해도 가입할 수 있으며, 무료강의 CTA는 로그인 없이 오픈채팅으로 바로 이동합니다.</p>
    <p className="muted">카카오 채널과 오픈채팅방은 서로 다릅니다. 채널 추가는 이메일·문자 마케팅 동의로 저장하지 않습니다.</p>
    <form onSubmit={save}>
      <fieldset disabled={!loaded || pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="form-grid mt24">
          {field('appId', '기존 카카오 앱 ID (숫자, REST API 키 아님)', 'Kakao Developers의 앱 ID')}
          {field('channelId', '대표 채널 공개 ID', '채널 주소 pf.kakao.com/ 뒤의 _...')}
          {field('termsTag', '이용약관 태그', '카카오에 등록한 필수 이용약관 태그')}
          {field('privacyTag', '개인정보 수집·이용 약관 태그', '카카오에 등록한 필수 개인정보 약관 태그')}
        </div>
        <p className="muted small">현재 사이트 약관 버전: {POLICY_VERSION}. 카카오에 동일한 약관을 등록하고, 약관 개정 시 새 태그를 사용하세요.</p>
        <label className="checkline mt16"><input type="checkbox" checked={config.readChannel} onChange={event => setConfig({ ...config, readChannel: event.target.checked, setupConfirmed: false })} />
          채널 관계 조회 사용 (카카오에서 plusfriends 동의항목 설정을 완료한 경우만)</label>
        <p className="muted small">관계 조회는 로그인 시점의 추가·차단 상태를 확인하는 기능입니다. 채널 추가를 실행하는 기능이 아니며, 실시간 상태는 아닙니다.</p>
        <label className="checkline mt16"><input type="checkbox" checked={config.setupConfirmed} onChange={event => setConfig({ ...config, setupConfirmed: event.target.checked })} />
          기존 비즈 앱, 대표 비즈니스 채널, 간편가입·필수 약관 및 선택 채널 추가 설정을 확인했습니다.</label>
        <label className="checkline mt16"><input type="checkbox" checked={config.enabled} onChange={event => setConfig({ ...config, enabled: event.target.checked })} />
          카카오싱크 연동 사용</label>
        <div className="mt24"><button className="btn primary" disabled={pending} type="submit">{pending ? '저장 중…' : '카카오싱크 설정 저장'}</button></div>
      </fieldset>
    </form>
    {!loaded && !message && <p role="status">설정을 불러오는 중입니다.</p>}
    {message && <p className="notice mt16" role="status">{message}</p>}
    {!loaded && message && <button className="btn" onClick={() => setRetry(retry + 1)}>다시 불러오기</button>}
    <p className="small muted mt24"><a href="https://developers.kakao.com/console/app" target="_blank" rel="noopener noreferrer">카카오 앱 설정 열기</a> · 채널 추가 동의 노출은 카카오 설정이 필요합니다. 앱 키나 토큰은 이 화면에 입력하지 마세요.</p>
  </section>;
}
