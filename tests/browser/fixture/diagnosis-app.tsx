import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DiagnosisExperience } from '../../../app/ui/final/diagnosis-experience';
import { DiagnosisManagement } from '../../../app/ui/final/diagnosis-management';
import '../../../features/admin-ui/styles/admin-system.css';
import { DiagnosisEntry } from '../../../app/ui/final/diagnosis-entry';
import '../../../app/ui/final/tokens.css';
const query = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(<StrictMode>{query.has('manage') ? <div className="edu-admin" style={{padding:16}}><DiagnosisManagement/></div> : query.has('entry') ? <DiagnosisEntry courseId={query.get('course') || undefined}/> : <DiagnosisExperience reportsEnabled={query.has('reports')} adminPilot={query.has('admin')} {...(query.has('admin') ? {exitHref:'/admin',exitLabel:'관리자 화면'} : {})}/>}</StrictMode>);
