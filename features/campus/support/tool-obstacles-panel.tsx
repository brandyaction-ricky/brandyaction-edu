'use client';
import {useState} from 'react';
import type {SupportAnalytics} from './analytics';
import {toolKinds} from './tool-dimensions';
import s from './panel.module.css';

export function ToolObstaclesPanel({rows}:{rows:SupportAnalytics['toolObstacles']|undefined}){
 const [kind,setKind]=useState('all');
 const visible=(rows??[]).filter(r=>kind==='all'||r.kind===kind);
 return <section className={s.card}><h3>도구별 반복 막힘</h3><p className={s.muted}>수강생이 직접 선택한 도구 종류·이름으로 묶습니다. 요청자의 질문 본문에서 도구를 추측하지 않습니다. 같은 사람의 여러 요청은 요청 건수에 포함하되 요청자는 한 명으로 셉니다.</p>
 <div className={s.form}><label>확인할 도구 종류<select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">전체 도구</option>{Object.entries(toolKinds).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label></div>
 {!rows?<p className={s.empty}>도구별 집계가 아직 제공되지 않았습니다. 운영 화면을 새로고침해 주세요.</p>:!visible.length?<p className={s.empty}>최근 14일에 해당 도구로 접수된 요청이 없습니다.</p>:<div className={s.tableWrap}><table aria-label="도구별 반복 막힘"><thead><tr><th>종류·도구</th><th>관련 수업</th><th>이번 요청자</th><th>이번 / 이전 7일</th></tr></thead><tbody>{visible.map(r=><tr key={r.key}><td><strong>{r.name||'미선택'}</strong><br/><small>{toolKinds[r.kind]}</small></td><td>{r.lessons.join(' · ')}</td><td>{r.learners}명</td><td>{r.current} / {r.previous}건</td></tr>)}</tbody></table></div>}
 <p className={s.muted}>예전 요청·도구 미선택 요청은 따로 표시합니다. 제품 자체의 장애율이나 전체 사용자의 오류율을 뜻하지 않습니다.</p></section>;
}
