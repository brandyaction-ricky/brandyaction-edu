import { createRoot } from 'react-dom/client';
import { AdControlSettings } from '../../../app/ui/ad-control-settings';
import '../../../app/ui/final/frontend.css';
import '../../../app/ui/final/tokens.css';
import '../../../app/ui/final/admin.css';
import '../../../app/ui/final/integration.css';
import '../../../features/admin-ui/styles/admin-system.css';
createRoot(document.getElementById('root')!).render(<main className="adm edu-admin" style={{maxWidth:1000,margin:'0 auto',padding:20,minHeight:'100vh'}}><p className="eyebrow">BRANDYACTION EDU · 합성 화면 검수</p><h1>기수·차수 관리</h1><AdControlSettings cohorts={[{id:'11111111-1111-4111-8111-111111111111',name:'AI 문샷 챌린지 · 5기'}]}/></main>);
