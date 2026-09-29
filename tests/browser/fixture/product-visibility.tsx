import { useState } from 'react';
import { ProductEditor } from '../../../app/ui/final/admin-editors';
import { AdminCatalog } from '../../../app/ui/final/admin-catalog';
import { sections, type Row } from '../../../lib/platform';

const initial: Row = { id: 'visibility-product', title: '합성 링크 전용 상품', slug: 'visibility-hidden', status: 'draft', category: 'free', list_price: 0, metadata: {} };
export function ProductVisibilityFixture() {
  const [course, setCourse] = useState(initial);
  const [editing, setEditing] = useState(true);
  const [saved, setSaved] = useState('미저장');
  const data = { courses: [course] };
  return <div className="edu-admin" style={{ padding: 20 }}><output aria-label="목록 노출 저장값">{saved}</output>{editing
    ? <ProductEditor row={course} data={data} pending={false} back={() => setEditing(false)} send={async body => {
      const values = body.values as Record<string, unknown>;
      setSaved(String(values.is_listed));
      setCourse({ ...course, metadata: { is_listed: values.is_listed } });
      return {};
    }} />
    : <AdminCatalog section={sections.find(item => item.key === 'products')!} data={data} selection={[]} setSelection={() => {}} edit={() => setEditing(true)} archive={() => {}} pending={false} loading={false} pagination={null} setPage={() => {}} exportCsv={() => {}} />}</div>;
}
