import { useState } from 'react';
import { AdminCatalog } from '../../../app/ui/final/admin-catalog';
import { CustomerWorkspace } from '../../../app/ui/final/customer-workspace';
import { MvpEditor } from '../../../app/ui/final/member-mvp';
import { sections, type Row } from '../../../lib/platform';
import Link from 'next/link';
const members: Row[] = [{ id: '11111111-1111-4111-8111-000000000010', full_name: '시험 수강생', email: 'synthetic@example.test', status: 'active', role: 'member' }, { id: '11111111-1111-4111-8111-000000000011', full_name: '다른 수강생', email: 'synthetic2@example.test', status: 'active', role: 'member' }];
export function MemberMvpFixture() {
  const [member, setMember] = useState(members[0]), [tab, setTab] = useState('profile');
  return <main className="edu-admin" style={{padding:20}}><Link href="/other">다른 화면</Link>
    <AdminCatalog section={sections.find(section => section.key === 'customers')!} data={{profiles:members}} selection={[]} setSelection={()=>{}} edit={(_section,row)=>{if(row)setMember(row);}} archive={()=>{}} pending={false} loading={false} pagination={null} setPage={()=>{}} exportCsv={()=>{}} blockLearningEnabled/>
    <CustomerWorkspace key={member.id} member={member} tab={tab} onTabChange={setTab} blockLearningEnabled><p>기존 회원 정보</p></CustomerWorkspace>
    <MvpEditor name="기본 미리보기"/>
  </main>;
}
