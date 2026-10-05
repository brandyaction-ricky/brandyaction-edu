"use client";
import { useEffect, useRef, useState } from 'react';
import { disableDevicePush, enableDevicePush, pushDeviceStatus, pushSupported, testDevicePush } from '@/lib/web-push-client';
export function PushSettings({ userId, diagnosis = false }: { userId: string; diagnosis?: boolean }) {
  const [state, setState] = useState<{ publicKey?: string; active?: boolean; unsupported?: boolean; error?: string; loading?: boolean }>({ loading: true });
  const [notice, setNotice] = useState(''), manualCheck = useRef(false);
  const [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false), gate = useRef(false);
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible' && !gate.current) setRefresh(n => n + 1); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!pushSupported()) { if (alive) setState({ unsupported: true }); return; }
      const response = await fetch('/api/member/push', { cache: 'no-store' }), config = await response.json();
      if (!response.ok) throw new Error(config.error || '알림 설정을 불러오지 못했습니다.');
      const active = await pushDeviceStatus(userId);
      if (alive) {
        setState({ publicKey: config.enabled ? config.publicKey : undefined, active });
        if (manualCheck.current) {
          setNotice(!config.enabled ? '확인 완료: 현재 서비스의 알림 발송이 중지되어 있습니다.' : active ? '확인 완료: 이 기기의 알림 연결이 정상입니다. 휴대폰에 표시되는지는 아래 버튼으로 확인해 주세요.' : '확인 완료: 이 기기 알림이 꺼져 있습니다. 알림 켜기를 눌러 연결해 주세요.');
          manualCheck.current = false;
        }
      }
    })().catch(e => { if (alive) { setNotice(''); manualCheck.current = false; setState(old => ({ ...old, loading: false, error: e.message })); } });
    return () => { alive = false; };
  }, [userId, refresh]);
  async function change(enable: boolean) {
    if (gate.current) return; gate.current = true; setBusy(true);
    try { if (enable) await enableDevicePush(userId, state.publicKey!); else await disableDevicePush(); setState(old => ({ ...old, active: enable, error: undefined })); }
    catch (e) { setState(old => ({ ...old, error: (e as Error).message })); }
    finally { gate.current = false; setBusy(false); }
  }
  async function checkDisplay() {
    if (gate.current) return; gate.current = true; setBusy(true);
    try { await testDevicePush(userId); setNotice('이 기기에 테스트 알림 표시를 요청했습니다. 알림 센터에서 확인해 주세요. 이 버튼은 기기 표시만 확인하며, 답변 알림의 서버 발송 테스트와는 다릅니다.'); }
    catch (e) { setNotice((e as Error).message); }
    finally { gate.current = false; setBusy(false); }
  }
  return <section className="panel pad" aria-label="이 기기의 앱 알림"><h2>{diagnosis ? "보고서 완성 알림" : "앱 알림"}</h2>
    <p>{diagnosis ? "알림을 켜 두면 화면을 닫아도 보고서가 완성됐을 때 알려드려요. 검사 답변과 결과 내용은 알림에 표시하지 않습니다." : "질문·답변 소식을 이 기기로 받습니다. 질문과 답변 본문은 알림에 표시하지 않습니다."}</p>
    {state.unsupported ? <p>이 브라우저에서는 앱 알림을 지원하지 않습니다. iPhone·iPad에서는 Safari에서 ‘홈 화면에 추가’한 뒤 앱을 열어 주세요. {diagnosis ? "완성된 보고서는 N6 진단 화면에서도 확인할 수 있습니다." : "답변은 질문·답변에서도 확인할 수 있습니다."}</p> : <>
      {state.loading ? <p role="status">알림 설정을 확인하고 있습니다.</p> : <p role="status">{!state.publicKey ? '앱 알림 발송이 일시 중지되어 있습니다.' : state.active ? (diagnosis ? '알림이 켜져 있어요. 완성되면 이 기기로 알려드릴게요.' : '이 기기 알림 켜짐') : '이 기기 알림 꺼짐'}</p>}
      {!state.loading && <p className="meta">알림은 이 기기의 앱·브라우저에 연결됩니다. iPhone은 홈 화면에 설치한 앱에서 켜 주세요. 알림이 안 보이면 iPhone 설정의 알림 허용·배너·집중 모드도 확인해 주세요.</p>}
      {state.error && <p role="alert">{state.error}</p>}
      <div className="row"><button className="btn" disabled={busy || state.loading || (!state.active && !state.publicKey && !state.error)} onClick={() => void change(state.error && !state.publicKey ? false : !state.active)}>{busy ? '설정 확인 중…' : state.active || (state.error && !state.publicKey) ? '이 기기 알림 끄기' : '이 기기 알림 켜기'}</button><button className="btn" disabled={busy} onClick={() => { manualCheck.current = true; setNotice('알림 연결을 확인하고 있습니다.'); setRefresh(n => n + 1); }}>알림 설정 다시 확인</button>{state.active && <button className="btn" disabled={busy} onClick={() => void checkDisplay()}>이 기기 알림 표시 테스트</button>}</div>
      {notice && <p role="status" className="notice mt16">{notice}</p>}
    </>}
  </section>;
}
