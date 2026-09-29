import { useState } from 'react';
import { CustomerWorkspace } from '../../../app/ui/final/customer-workspace';
export function MemberConversationFixture() {
 const [tab,setTab]=useState('profile'),[other,setOther]=useState(false);
 const member={id:`11111111-1111-4111-8111-00000000000${other?3:2}`,full_name:other?'다른 시험 회원':'대화 시험 회원',email:'member@example.test',status:'active',role:'student'};
 return <main className="edu-admin" style={{padding:16}}><button className="btn" onClick={()=>setOther(value=>!value)}>다른 회원 선택</button><CustomerWorkspace member={member} tab={tab} onTabChange={setTab} blockLearningEnabled={false} conversationEnabled={!location.search.includes('off')}><p>회원 정보</p></CustomerWorkspace></main>;
}
