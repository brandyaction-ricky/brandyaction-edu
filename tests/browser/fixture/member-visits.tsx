import { useState } from 'react';
import { AdminCatalog } from '../../../app/ui/final/admin-catalog';
import { CustomerWorkspace } from '../../../app/ui/final/customer-workspace';
import { MemberVisitRecorder } from '../../../app/ui/final/member-visit-recorder';
import { sections } from '../../../lib/platform';
const member = { id: '11111111-1111-4111-8111-000000000002', full_name: '방문 시험 회원', email: 'visitor@example.test', role: 'student', status: 'active' };
export function MemberVisitsFixture() {
 const [tab,setTab]=useState('history'),[show,setShow]=useState(true),[account,setAccount]=useState(member.id),[generation,setGeneration]=useState(0);
 if(location.search.includes('recorder'))return <main style={{padding:20}}><h1>학습 화면</h1>{show&&<MemberVisitRecorder key={generation} member={account} enabled={!location.search.includes('off')}/>}<button onClick={()=>setGeneration(value=>value+1)}>다른 학습 페이지</button><button onClick={()=>setShow(value=>!value)}>로그인 상태 변경</button><button onClick={()=>setAccount('11111111-1111-4111-8111-000000000003')}>다른 회원</button><textarea aria-label="학습 답변"/></main>;
 return <main className="edu-admin" style={{padding:16}}><AdminCatalog section={sections.find(section=>section.key==='customers')!} data={{profiles:[member]}} selection={[]} setSelection={()=>{}} edit={()=>{}} archive={()=>{}} pending={false} loading={false} pagination={null} setPage={()=>{}} exportCsv={()=>{}} blockLearningEnabled/>
 <CustomerWorkspace member={member} tab={tab} onTabChange={setTab} blockLearningEnabled><p>회원 정보</p></CustomerWorkspace></main>;
}
