import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DiagnosisExperience } from '../../../app/ui/final/diagnosis-experience';
import { DiagnosisManagement } from '../../../app/ui/final/diagnosis-management';
import { Platform } from '../../../app/ui/platform';
import '../../../app/ui/final/frontend.css';
import '../../../app/ui/final/admin.css';
import '../../../app/ui/final/integration.css';
import '../../../features/admin-ui/styles/admin-system.css';
import { DiagnosisEntry } from '../../../app/ui/final/diagnosis-entry';
import '../../../app/ui/final/tokens.css';
const query = new URLSearchParams(location.search);
function DiagnosisFixture(){
 const [member,setMember]=useState(query.get('member')??undefined);
 return query.has('manage') ? <>{query.has('switch-member')&&<button style={{position:'fixed',right:16,bottom:16,zIndex:2000}} onClick={()=>setMember('00000000-0000-4000-8000-000000000001')}>합성 회원 바로가기</button>}<Platform path={['admin','diagnosis','manage']} user={{id:'00000000-0000-4000-8000-000000000099',email:'admin@example.test',phone:null,full_name:'합성 관리자',role:'admin'}} adminContent={<DiagnosisManagement member={member}/>}/></> : query.has('entry') ? <DiagnosisEntry courseId={query.get('course') || undefined}/> : <DiagnosisExperience userId="00000000-0000-4000-8000-000000000099" readyPushEnabled={query.has('push')} reportsEnabled={query.has('reports')} adminPilot={query.has('admin')} {...(query.has('admin') ? {exitHref:'/admin',exitLabel:'관리자 화면'} : {})}/>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><DiagnosisFixture/></StrictMode>);
