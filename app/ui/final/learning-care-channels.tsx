'use client';
import { useEffect, useState } from 'react';
import { CARE_SMS_BODY, careChannelLabels, careChannelRoutes, careDeliveryStatus, type CareChannel, type CareChannelConfig, type CareDeliveryMode, type CareDeliveryReceipt, type CareDeliverySelection, type CareReach } from '@/lib/learning-care-channels';
const channels = Object.keys(careChannelLabels) as CareChannel[];
export function CareChannels({ members, names, disabled, onChange }: {members:string[];names:string[];disabled:boolean;onChange:(value:CareDeliverySelection|null|undefined)=>void}) {
  const [snapshot,setSnapshot]=useState<{config:CareChannelConfig;reach:CareReach[]}|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [mode,setMode]=useState<CareDeliveryMode>('push_first'),[selected,setSelected]=useState<CareChannel[]>(channels);
  const memberKey=[...members].sort().join(',');
  useEffect(()=>{
    const abort=new AbortController();
    fetch('/api/admin/learning-care/channels?members='+encodeURIComponent(memberKey),{cache:'no-store',signal:abort.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error);return body;}).then(body=>{if(!abort.signal.aborted){setSnapshot(body);setError('');}}).catch(e=>{if(!abort.signal.aborted)setError(e.message || '연락 수단을 다시 확인해 주세요.');});
    return ()=>abort.abort();
  },[memberKey,revision]);
  useEffect(()=>{
    if(error || !snapshot){onChange(null);return;}
    if(!snapshot.config.enabled){onChange(undefined);return;}
    const active=selected.filter(c=>snapshot.config[c]);
    onChange({mode,channels:active,routes:careChannelRoutes(snapshot.reach,snapshot.config,active,mode)});
  },[snapshot,error,selected,mode,onChange]);
  function refresh(){onChange(null);setSnapshot(null);setError('');setRevision(n=>n+1);}
  if(error)return <div role="alert" className="care-error">{error}<button className="btn" disabled={disabled} onClick={refresh}>다시 확인</button></div>;
  if(!snapshot)return <p role="status">연락 수단을 확인하고 있습니다.</p>;
  if(!snapshot.config.enabled)return <section className="care-channel-unavailable" aria-label="학습 안내 발송 상태">
    <strong>지금은 사이트 메시지함에만 저장돼요</strong>
    <p>수강생이 브랜디에듀에 로그인한 뒤 메시지함에서 확인할 수 있습니다.</p>
    <ul className="care-channel-statuses">{channels.map(channel=><li key={channel}><span>{careChannelLabels[channel]}</span><small>발송 꺼짐</small></li>)}</ul>
    <p>아래에 안내를 작성해 저장해도 휴대전화나 이메일로 알림이 가지 않습니다. 외부 발송이 활성화되면 여기서 채널과 받는 사람을 확인할 수 있습니다.</p>
  </section>;
  const routes=careChannelRoutes(snapshot.reach,snapshot.config,selected,mode),inboxOnly=routes.filter(r=>!r.channels.length).length;
  return <fieldset disabled={disabled} className="care-channel-picker"><legend>어떻게 안내할까요?</legend><button type="button" className="btn" onClick={refresh}>연락 수단 다시 확인</button>
    <label>발송 방식<select value={mode} onChange={e=>setMode(e.target.value as CareDeliveryMode)}><option value="push_first">푸시 우선 · 이메일·알림톡·문자</option><option value="all">선택한 모든 채널로 보내기</option></select></label>
    <div className="care-channel-options">{channels.map(channel=><label key={channel}><input type="checkbox" checked={selected.includes(channel)&&snapshot.config[channel]} disabled={!snapshot.config[channel]} onChange={e=>setSelected(current=>e.target.checked?[...current,channel]:current.filter(c=>c!==channel))}/><b>{careChannelLabels[channel]}</b><span>{snapshot.config[channel]?`${routes.filter(r=>r.channels.includes(channel)).length}명${channel==='sms'?' · 유료':''}`:'설정 필요'}</span></label>)}</div>
    <p className="care-note">{mode==='push_first'?'선택한 채널 중 푸시를 우선합니다. 푸시를 받을 수 없는 분은 나머지 선택한 채널로 안내하며, 알림톡과 문자를 함께 선택하면 알림톡을 우선합니다.':'선택한 채널로 안내합니다. 여러 채널을 선택하면 한 분에게 여러 알림이 갈 수 있습니다.'} 메시지함에도 모두 저장됩니다.</p>
    {inboxOnly>0&&<p className="care-channel-warning" role="status">{inboxOnly}명은 외부 알림을 받을 수 없어 메시지함에만 저장됩니다.</p>}
    <details><summary>수강생별 발송 채널 확인</summary><p className="care-note">푸시는 기기에서 알림 허용·등록이 필요합니다. 등록 정보가 있어도 실제 도착을 보장하지는 않습니다.</p>
    {selected.includes('alimtalk')&&snapshot.config.alimtalk&&<p className="care-note">알림톡은 승인된 고정 문구로 ‘학습 안내 도착’을 알립니다. 작성한 상세 내용은 메시지함에서 확인합니다. 알림톡 발송 후 문자로 자동 재발송하지 않습니다.</p>}
    {selected.includes('sms')&&snapshot.config.sms&&<><p className="care-note">문자는 아래 짧은 안내로 보내며 발송 비용이 발생합니다. 상세 내용은 메시지함에서 확인합니다.</p><pre className="care-sms-preview">{CARE_SMS_BODY}</pre></>}
    <ul className="care-channel-members">{snapshot.reach.map(r=><li key={r.memberId}><span>{names[members.indexOf(r.memberId)] || '수강생'}<small>{r.emailMasked || r.phoneMasked || '연락처 미등록'}</small></span><b>{routes.find(x=>x.memberId===r.memberId)?.channels.map(c=>careChannelLabels[c]).join(' · ') || '메시지함만'}</b></li>)}</ul></details>
  </fieldset>;
}
export function CareDeliveryResults({ initial, names }: {initial:CareDeliveryReceipt;names:Record<string,string>}) {
  const [receipt,setReceipt]=useState(initial),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  async function refresh(){setLoading(true);try{const r=await fetch('/api/admin/learning-care/channels?request='+initial.requestId,{cache:'no-store'});const body=await r.json();if(!r.ok)throw new Error(body.error);setReceipt(body);setError('');}catch(e){setError(e instanceof Error?e.message:'결과를 다시 확인해 주세요.');}finally{setLoading(false);}}
  return <section className="care-delivery-results" aria-label="채널별 발송 결과"><div className="care-list-caption"><h3>학습 안내 발송 결과</h3><button className="btn" disabled={loading} onClick={()=>void refresh()}>{loading?'확인 중…':'발송 결과 새로고침'}</button></div><p>{receipt.count}명의 메시지함에 저장했습니다. 외부 알림은 차례로 처리됩니다.</p><p className="care-note">‘접수’는 발송사가 요청을 받은 상태이며, 수강생이 읽었다는 뜻은 아닙니다. ‘결과 확인 필요’는 중복 발송을 막기 위해 자동 재발송하지 않습니다. 발송이 실패해도 다른 채널로 자동 재발송하지 않습니다.</p>{error&&<p role="alert">{error}</p>}
    {receipt.deliveries.length?<details open><summary>채널별 결과 {receipt.deliveries.length}건</summary><ul className="care-channel-members">{receipt.deliveries.map(d=><li key={d.memberId+d.channel}><span>{names[d.memberId] || '수강생'} · {careChannelLabels[d.channel]}</span><b>{careDeliveryStatus[d.status] || '확인 필요'}</b>{d.code&&['failed','unknown','skipped'].includes(d.status)&&<small>{d.code==='RECIPIENT_CHANGED'?'연락처·수강 상태가 변경됨':d.code==='EXPIRED_OR_DISABLED'?'발송 기한 만료 또는 설정 해제':d.code==='TEMPLATE_UNAVAILABLE'?'알림톡 설정 확인 필요':'발송사 처리 결과를 확인해 주세요.'}</small>}</li>)}</ul></details>:<p>선택한 대상은 메시지함에만 저장했습니다.</p>}
  </section>;
}
