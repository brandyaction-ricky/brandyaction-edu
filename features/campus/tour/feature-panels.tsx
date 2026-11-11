'use client';
import type {CampusSnapshot} from '../contracts';
import type {CampusAdminSnapshot} from '../admin-metrics';
import {LearnerDashboard,AdminDashboard} from '../ui/dashboard';
import {JournalPanel} from '../ui/workspace';
import {DemoAi} from '../ui/demo-ai';
import {BusinessPanel,type BusinessView} from '../business/panel';
import {CommunityPanel} from '../community/panel';
import {SupportPanel} from '../support/panel';
import {SupportAdminPanel} from '../support/admin-panel';
import {SpaceAdminPanel} from '../space/admin-panel';
import {SpaceHttpMetrics} from '../space/http-metrics-panel';
import {BusinessCasesAdminPanel} from '../business/case-panel';
import {CommunityModerationPanel} from '../community/moderation-panel';
import {PersonalArchive} from '../business/archive-panel';
import {WebinarAdmin} from '../webinar/admin';
import {SpacePanel} from '../space/panel';
import {OfficePanel} from '../office/panel';
import {useMemo,useEffect,useState} from 'react';
import {LiveAiPanel} from '../ui/live-ai-panel';
export {SpacePanel};
export default function FeaturePanel({officeFilter,id,snapshot,adminSnapshot,onOpen,onAsk,onNavigate,handoff,onNotice,active=true,demo=true,onRefresh,onSelect}:{officeFilter?:{id:string;name:string}|null;demo?:boolean;onRefresh?:()=>void;onSelect?:(id:string)=>void;active?:boolean;id:string;snapshot:CampusSnapshot;adminSnapshot?:CampusAdminSnapshot;onOpen:(id:string,missionId?:string)=>void;onAsk:(value:{lessonId:string;context:string})=>void;onNavigate:(id:string)=>void;handoff?:{lessonId:string;context:string}|null;onNotice:(text:string)=>void}){
 const cohort=snapshot.scopes.find(s=>s.enrollmentId===snapshot.selectedEnrollmentId)?.cohortId||'';
 const demoCohorts=useMemo(()=>snapshot.scopes.map(s=>({id:s.cohortId,name:s.cohortName,course_id:s.courseId,courses:{title:s.courseTitle,slug:'moonshot-demo'}})),[snapshot.scopes]);
 if(id==='growth')return <LearnerDashboard snapshot={snapshot} demo={demo} onOpen={onOpen} onRefresh={onRefresh||(()=>onNotice('가상 학습 기록입니다.'))} onSelect={onSelect||(()=>onNotice('예시 기수입니다.'))}/>;
 if(id==='office')return <OfficePanel initialEmployee={officeFilter} snapshot={snapshot} demo={demo} active={active}/>;
 if(id==='ai'&&!demo)return <LiveAiPanel snapshot={snapshot} demo={false} handoff={handoff} active={active}/>;
 if(id==='ai')return <DemoAi snapshot={snapshot} handoff={handoff} active={active}/>;
 if(id==='journal')return <JournalPanel snapshot={snapshot} demo={demo} active onStart={()=>onNavigate('growth')}/>;
 if(id==='feedback'||id.startsWith('community:'))return <CommunityPanel snapshot={snapshot} demo={demo} onOpen={onOpen} initialTab={id==='feedback'?'feedback':id.split(':')[1] as 'mine'|'talent'|'demo_day'}/>;
 if(id.startsWith('business:'))return <BusinessPanel snapshot={snapshot} demo={demo} view={id.slice(9) as BusinessView} onOpenLesson={onOpen} onAsk={onAsk}/>;
 if(id.startsWith('support:'))return <SupportPanel snapshot={snapshot} demo={demo} initialTab={id.slice(8)} focused onOpen={onOpen} onAsk={onAsk}/>;
 if(id==='archive')return <PersonalArchive demo={demo}/>;
 if(id==='legacy-space')return <SpacePanel snapshot={snapshot} demo={demo} initialRenderer="classic" onNavigate={onNavigate} onOpenLesson={onOpen}/>;
 if(id==='admin:dashboard'&&!demo)return <LiveAdminDashboard cohortId={cohort}/>;
 if(id==='admin:dashboard')return adminSnapshot?<AdminDashboard snapshot={adminSnapshot} onRefresh={()=>onNotice('가상 기수 현황입니다.')}/>:<p>기수 현황 예시가 준비되지 않았습니다.</p>;
 if(id==='admin:support')return <SupportAdminPanel cohortId={cohort} demo={demo}/>;
 if(id==='admin:space')return <><SpaceAdminPanel cohortId={cohort} demo={demo}/><SpaceHttpMetrics cohortId={cohort} demo={demo}/></>;
 if(id==='admin:cases')return <BusinessCasesAdminPanel cohortId={cohort} demo={demo}/>;
 if(id==='admin:moderation')return <CommunityModerationPanel cohortId={cohort} demo={demo}/>;
 if(id==='admin:links')return <WebinarAdmin demo={demo} demoCohorts={demoCohorts}/>;
 return null;
}

function LiveAdminDashboard({cohortId}:{cohortId:string}){
 const [snapshot,setSnapshot]=useState<CampusAdminSnapshot|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();void fetch('/api/campus/admin?cohortId='+encodeURIComponent(cohortId),{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'현황을 확인하지 못했습니다.');setSnapshot(d);setError('');}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[cohortId,revision]);
 return error?<p role="alert">{error}</p>:snapshot?<AdminDashboard snapshot={snapshot} onRefresh={()=>setRevision(v=>v+1)}/>:<p role="status">기수 현황을 확인하고 있어요.</p>;
}
