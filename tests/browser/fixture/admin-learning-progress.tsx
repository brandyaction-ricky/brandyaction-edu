import { useState } from 'react';
import { AdminLearningProgress } from '../../../app/ui/final/admin-learning-progress';
import { CustomerWorkspace } from '../../../app/ui/final/customer-workspace';
export function AdminLearningProgressFixture() {
  const [tab, setTab] = useState('progress');
  const member = { id: '11111111-1111-4111-8111-111111111111', full_name: '합성 회원', email: 'qa@example.test' };
  return <main className="edu-admin" style={{ padding: 16 }}>{new URLSearchParams(location.search).has('member')
    ? <CustomerWorkspace member={member} tab={tab} onTabChange={setTab} blockLearningEnabled><p>합성 프로필</p></CustomerWorkspace>
    : <AdminLearningProgress/>}</main>;
}
