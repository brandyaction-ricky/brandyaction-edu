'use client';

import { useRouter } from 'next/navigation';
import { AdminSelect } from '@/features/admin-ui/components/admin-system';

export function LessonPicker({cohort, selected, lessons}: {cohort:string; selected:string; lessons:{id:string;label:string}[]}) {
  const router = useRouter();
  return <AdminSelect label="미리볼 수업" value={selected} onChange={event =>
    router.push('/admin/campus/study?' + new URLSearchParams({cohort, lesson:event.target.value}), {scroll:false})}>
    {lessons.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
  </AdminSelect>;
}
