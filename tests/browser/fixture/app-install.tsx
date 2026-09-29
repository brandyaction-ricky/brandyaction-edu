import { useState } from 'react';
import { AppInstallProvider } from '../../../app/ui/final/app-install';
import { MemberViews } from '../../../app/ui/final/member-views';
export function AppInstallFixture() {
  const [section,setSection] = useState('');
  return <AppInstallProvider enabled={!location.search.includes('off')}><main className="edu-front"><nav style={{padding:16}}><button onClick={()=>setSection('')}>시험 마이페이지</button><button onClick={()=>setSection('profile')}>시험 회원 정보</button><button onClick={()=>setSection('classes')}>시험 내 클래스</button></nav>
    <MemberViews section={section} user={{id:'11111111-1111-4111-8111-000000000001',email:'learner@example.test',full_name:'학습 시험 회원',role:'student',phone:null}} data={{enrollments:[]}} pending={false} send={async()=>({})} logout={async()=>{}} blockLearningEnabled={false}/>
  </main></AppInstallProvider>;
}
