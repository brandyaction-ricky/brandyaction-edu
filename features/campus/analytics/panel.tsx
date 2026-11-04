'use client';
import {useEffect,useState} from 'react';
import {roomLabels,actionLabels,type AnalyticsRoom,type CampusAction} from './domain';
import styles from './panel.module.css';
type Report={sessions:number;activeSeconds:number;trackingEnabled:boolean;rooms:{room:AnalyticsRoom;visitors:number;entries:number;clicks:number;avg_active_seconds:number;intent_sessions:number}[];actions:{action:CampusAction;count:number;sessions:number}[];resources:{target:string;action:CampusAction;count:number;sessions:number}[];scopes:{scope:string;sessions:number}[]};
const duration=(n:number)=>`${Math.floor(Math.round(n)/60)}분 ${Math.round(n)%60}초`;
export function CampusAnalyticsPanel(){
 const [days,setDays]=useState('30'),[scope,setScope]=useState(''),[version,setVersion]=useState(0),[report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{const controller=new AbortController();queueMicrotask(()=>{if(!controller.signal.aborted){setLoading(true);setError('');}});const to=new Date(),from=new Date(to.getTime()-Number(days)*86400000);void fetch('/api/admin/campus/analytics?'+new URLSearchParams({from:from.toISOString(),to:to.toISOString(),...(scope?{scope}:{})}),{signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'활동 분석을 불러오지 못했어요.');setReport(data);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[days,scope,version]);
 const action=(key:CampusAction)=>report?.actions.find(a=>a.action===key)?.sessions||0;
 return <section className={styles.panel} aria-label="문샷 캠퍼스 행동 분석"><header><div><small>공간에서 관심이 생기는 순간을 확인하세요</small><h2>문샷 캠퍼스 분석</h2></div><button onClick={()=>setVersion(v=>v+1)} disabled={loading}>새로고침</button></header>
 <div className={styles.filters}><label>기간<select value={days} onChange={e=>setDays(e.target.value)}><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option></select></label><label>행사 또는 수강 공간<input value={scope} maxLength={60} onChange={e=>setScope(e.target.value)} placeholder="전체 · 행사 주소 또는 member"/></label></div>
 {loading?<p role="status">공간별 활동을 집계하고 있어요…</p>:error?<p role="alert">{error}</p>:report&&<>
 {!report.trackingEnabled&&<p role="status">현재 사이트의 활동 기록 설정이 꺼져 있습니다. 기존 기록만 조회됩니다.</p>}
 <div className={styles.summary}>{[['방문 세션',report.sessions.toLocaleString()],['활동 시간',duration(report.activeSeconds)],['상세페이지 이동',action('detail')+' 세션'],['상담 이동',action('consult')+' 세션']].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
 <h3>공간별 관심과 다음 행동</h3><div className={styles.scroll}><table><thead><tr><th>공간</th><th>방문 세션</th><th>입장 횟수</th><th>행동 횟수</th><th>평균 활동 시간</th><th>상담·상세·신청 이동</th><th>이동 비율</th></tr></thead><tbody>{Object.entries(roomLabels).map(([id,label])=>{const r=report.rooms.find(v=>v.room===id);return <tr key={id}><th>{label}</th><td>{r?.visitors||0}</td><td>{r?.entries||0}</td><td>{r?.clicks||0}</td><td>{duration(r?.avg_active_seconds||0)}</td><td>{r?.intent_sessions||0}</td><td>{r?.visitors?((r.intent_sessions/r.visitors)*100).toFixed(1):'0'}%</td></tr>;})}</tbody></table></div>
 <h3>행동별 참여</h3><div className={styles.actions}>{Object.entries(actionLabels).map(([key,label])=>{const a=report.actions.find(v=>v.action===key);return <div key={key}><span>{label}</span><strong>{a?.count||0}회</strong><small>{a?.sessions||0}세션</small></div>;})}</div>
 {!!report.resources.length&&<><h3>자료·다시보기별 반응</h3><div className={styles.scroll}><table><thead><tr><th>자료 ID</th><th>행동</th><th>횟수</th><th>세션</th></tr></thead><tbody>{report.resources.map((r,i)=><tr key={i}><th>{r.target||'미지정'}</th><td>{actionLabels[r.action]}</td><td>{r.count}</td><td>{r.sessions}</td></tr>)}</tbody></table></div></>}
 {!report.sessions&&<p>선택한 기간에 수집된 캠퍼스 활동이 없습니다.</p>}
 </>}
 <details><summary>지표 정의·수집 범위</summary><ul><li>세션은 같은 탭의 방문 묶음입니다. 사람 수와 다르며, 개인별 순위를 만들지 않습니다.</li><li>활동 시간은 화면이 보이고 최근 60초 안에 조작한 시간입니다. 숨긴 탭·자리 비움은 제외하며, 30초 단위로 전달하므로 종료·통신 실패 시 일부 누락될 수 있습니다.</li><li>이동 비율 = 해당 공간에서 상세·상담·신청으로 이동한 세션 ÷ 공간 방문 세션. 각 행동은 중복 세션이 있을 수 있습니다.</li><li>다시보기 열기는 시청 완료가 아니며, 다운로드 요청은 기기 저장 완료를 뜻하지 않습니다.</li><li>결제 완료는 주문 기록을 기준으로 별도 조회합니다. 이 화면은 구매 기여 매출을 추정하지 않습니다.</li><li>원시 활동 기록은 90일간 보관한 뒤 순차 삭제합니다. 질문 내용·채팅·봇 메시지·개인 이름은 수집하지 않습니다. DEV 미리보기는 운영 집계와 분리됩니다.</li></ul></details>
 </section>;
}
