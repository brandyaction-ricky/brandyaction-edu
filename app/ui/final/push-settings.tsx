"use client";
import { useEffect, useRef, useState } from 'react';
import { disableDevicePush, enableDevicePush, pushDeviceStatus, pushSupported } from '@/lib/web-push-client';
export function PushSettings({ userId }: { userId: string }) {
  const [state, setState] = useState<{ publicKey?: string; active?: boolean; unsupported?: boolean; error?: string; loading?: boolean }>({ loading: true });
  const [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false), gate = useRef(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!pushSupported()) { if (alive) setState({ unsupported: true }); return; }
      const response = await fetch('/api/member/push', { cache: 'no-store' }), config = await response.json();
      if (!response.ok) throw new Error(config.error || '알림 설정을 불러오지 못했습니다.');
      const active = await pushDeviceStatus(userId);
      if (alive) setState({ publicKey: config.enabled ? config.publicKey : undefined, active });
    })().catch(e => { if (alive) setState(old => ({ ...old, loading: false, error: e.message })); });
    return () => { alive = false; };
  }, [userId, refresh]);
  async function change(enable: boolean) {
    if (gate.current) return; gate.current = true; setBusy(true);
    try { if (enable) await enableDevicePush(userId, state.publicKey!); else await disableDevicePush(); setState(old => ({ ...old, active: enable, error: undefined })); }
    catch (e) { setState(old => ({ ...old, error: (e as Error).message })); }
    finally { gate.current = false; setBusy(false); }
  }
  return <section className="panel pad" aria-label="이 기기의 앱 알림"><h2>앱 알림</h2>
    <p>질문·답변 소식을 이 기기로 받습니다. 질문과 답변 본문은 알림에 표시하지 않습니다.</p>
    {state.unsupported ? <p>이 브라우저에서는 앱 알림을 지원하지 않습니다. iPhone·iPad에서는 Safari에서 ‘홈 화면에 추가’한 뒤 앱을 열어 주세요. 답변은 질문·답변에서도 확인할 수 있습니다.</p> : <>
      {state.loading ? <p role="status">알림 설정을 확인하고 있습니다.</p> : <p role="status">{state.active ? '이 기기 알림 켜짐' : state.publicKey ? '이 기기 알림 꺼짐' : '앱 알림을 준비 중입니다.'}</p>}
      {state.error && <p role="alert">{state.error}</p>}
      <div className="row"><button className="btn" disabled={busy || state.loading || (!state.active && !state.publicKey && !state.error)} onClick={() => void change(state.error && !state.publicKey ? false : !state.active)}>{busy ? '설정 확인 중…' : state.active || (state.error && !state.publicKey) ? '이 기기 알림 끄기' : '이 기기 알림 켜기'}</button><button className="btn" disabled={busy} onClick={() => setRefresh(n => n + 1)}>알림 설정 다시 확인</button></div>
    </>}
  </section>;
}
