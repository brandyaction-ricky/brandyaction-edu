import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CampusFrame, LearnerDashboard, AdminDashboard } from '../../features/campus/ui/dashboard';
import { LearnerLive, AdminLive } from '../../features/campus/ui/live';
import { student,admin } from './data';
function App(){const [mode,setMode]=useState('student');const [notice,setNotice]=useState('');
if(location.search.includes('live=student'))return <LearnerLive/>;
if(location.search.includes('live=admin'))return <AdminLive/>;
return <CampusFrame demo admin={mode==='admin'}><nav aria-label="미리보기 화면" style={{display:'flex',gap:10,marginBottom:25}}>{[['student','수강생 성장보드'],['admin','관리자 기수 현황']].map(([id,label])=><button key={id} onClick={()=>{setMode(id);setNotice('');}} aria-pressed={mode===id} style={{border:'1px solid #d6e2f1',borderRadius:9,padding:'10px 16px',background:mode===id?'#225bdb':'white',color:mode===id?'white':'#234',fontSize:13}}>{label}</button>)}</nav>{notice&&<p role="status" style={{padding:14,background:'#e9f2ff',marginBottom:18,borderRadius:10}}>{notice}</p>}{mode==='student'?<LearnerDashboard snapshot={student} demo onSelect={()=>{}} onRefresh={()=>setNotice('가상 학습 기록을 다시 확인했습니다.')} onOpen={(lessonId,missionId)=>setNotice(`${student.lessons.find(l=>l.id===lessonId)?.title} · ${missionId?'과제 제출·피드백':'수업'} 화면으로 연결하는 동작입니다. 이 미리보기에서는 실제 수업을 열지 않습니다.`)}/>:<AdminDashboard snapshot={admin} onRefresh={()=>setNotice('가상 기수 기록을 다시 확인했습니다.')}/>}</CampusFrame>}
createRoot(document.getElementById('root')!).render(<App/>);
