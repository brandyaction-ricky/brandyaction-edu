import { useState } from 'react';
import { AdminWorkflows } from '../../../app/ui/admin-workflows';
import { AdminCatalog } from '../../../app/ui/final/admin-catalog';
import { ProductEditor } from '../../../app/ui/final/admin-editors';
import { sections, type Row } from '../../../lib/platform';
import { emptyOrderListScope, type OrderListScope } from '../../../lib/admin-order-list';

const productSection = sections.find(section => section.key === 'products')!;
const productSeed = [
  { id: 'pilot-product-a', title: '파일럿 무료 클래스', category: 'free', status: 'published', list_price: 0, metadata: {} },
  { id: 'pilot-product-b', title: '파일럿 디지털 자료', category: 'digital', status: 'draft', list_price: 12000, metadata: {} },
];
const orderSeed = [
  { id: 'pilot-order-failed', order_number: 'PILOT-FAIL', customer_name: '결제실패 회원', customer_email: 'failed@example.test', status: 'payment_failed', created_at: '2026-09-24T10:00:00+09:00', subtotal: 12000, total_amount: 12000 },
  { id: 'pilot-order-refund', order_number: 'PILOT-REFUND', customer_name: '환불확인 회원', customer_email: 'refund@example.test', status: 'paid', created_at: '2026-09-24T11:00:00+09:00', subtotal: 12000, total_amount: 12000 },
  { id: 'pilot-order-access', order_number: 'PILOT-ACCESS', customer_name: '수강권확인 회원', customer_email: 'access@example.test', status: 'paid', created_at: '2026-09-24T12:00:00+09:00', subtotal: 12000, total_amount: 12000 },
];

export function AdminPilotFixture({ screen }: { screen: 'orders' | 'products' | 'editor' }) {
  const [products, setProducts] = useState<Row[]>(productSeed);
  const [editing, setEditing] = useState<Row | null | undefined>(screen === 'editor' ? productSeed[1] : null);
  const [page, setPage] = useState(1);
  const [orderScope, setOrderScope] = useState<OrderListScope>(emptyOrderListScope);
  const [notice, setNotice] = useState('');
  const send = async (body: Record<string, unknown>) => {
    if (body.action === 'restore-products' && Array.isArray(body.ids)) {
      const ids = new Set(body.ids.map(String));
      setProducts(current => current.map(product => ids.has(product.id) ? { ...product, archived_at: null } : product));
    }
    if (body.action === 'save' && body.section === 'products') setNotice('합성 상품 저장 완료');
    return {};
  };
  const orderData = {
    courses: productSeed,
    orders: orderSeed,
    order_items: orderSeed.map(order => ({ id: `${order.id}-item`, order_id: order.id, course_id: productSeed[1].id, item_name: productSeed[1].title })),
    payments: [{ id: 'pilot-payment-refund', order_id: 'pilot-order-refund', approved_amount: 12000, cancelled_amount: 0 }, { id: 'pilot-payment-access', order_id: 'pilot-order-access', approved_amount: 12000, cancelled_amount: 0 }],
    edu_refund_requests: [{ id: 'pilot-refund', payment_id: 'pilot-payment-refund', status: 'processing' }],
    enrollments: [],
  };
  // The standalone layout fixture supplies the server-filtered result contract.
  // Full API query construction and 100-row navigation have separate coverage.
  const scopedOrders = orderSeed.filter(order =>
    (!orderScope.status || order.status === orderScope.status) &&
    (!orderScope.course || orderScope.course === productSeed[1].id) &&
    (!orderScope.q || [order.order_number, order.customer_name, order.customer_email, productSeed[1].title].join(' ').toLowerCase().includes(orderScope.q.toLowerCase())) &&
    (!orderScope.from || Date.parse(order.created_at) >= Date.parse(orderScope.from + 'T00:00:00+09:00')) &&
    (!orderScope.to || Date.parse(order.created_at) < Date.parse(orderScope.to + 'T00:00:00+09:00') + 86400000));
  const quickResults = {
    all: scopedOrders,
    failed: scopedOrders.filter(order => order.status === 'payment_failed'),
    refund: scopedOrders.filter(order => order.id === 'pilot-order-refund'),
    access: scopedOrders.filter(order => order.status === 'paid'),
  };
  const visibleOrders = quickResults[orderScope.quick as keyof typeof quickResults];
  const filteredOrderData = { ...orderData, orders: visibleOrders, order_filter_counts: [{ id: 'pilot-counts', ...Object.fromEntries(Object.entries(quickResults).map(([key, values]) => [key, values.length])) }] };
  return <div className="edu-admin admin-pilot-fixture" style={{ padding: 24, minHeight: '100vh' }}>
    <h1>{screen === 'orders' ? '주문 결제' : '상품 관리'}</h1>
    <p>합성 데이터 · 외부 인증/DB/결제 연결 없음</p>
    {notice && <p role="status">{notice}</p>}
    {screen === 'orders' ? <AdminWorkflows section="orders" data={filteredOrderData} orderScope={orderScope} onOrderScopeChange={setOrderScope} pending={false} loading={false} send={send} pagination={{ page, pageSize: 100, total: visibleOrders.length }} setPage={setPage} /> : editing !== null ? <ProductEditor data={{ courses: products, cohorts: [] }} row={editing} pending={false} send={send} back={() => setEditing(null)} /> : <AdminCatalog section={productSection} data={{ courses: products, cohorts: [], product_summary: [{ id: 'pilot-summary', total: 2, published: 1, draft: 1, upcoming: 0 }] }} selection={[]} setSelection={() => {}} edit={(_, row) => setEditing(row)} archive={(_, ids) => setProducts(current => current.map(product => ids.includes(product.id) ? { ...product, archived_at: '2026-09-27T00:00:00Z' } : product))} pending={false} loading={false} pagination={{ page: 1, pageSize: 20, total: products.length }} setPage={() => {}} exportCsv={() => {}} send={send} />}
  </div>;
}
