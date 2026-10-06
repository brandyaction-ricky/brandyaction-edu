import type { MemberPaymentContact } from '@/lib/member-directory';
export function MemberPaymentIdentity({ contacts }: { contacts?: MemberPaymentContact[] }) {
 if (!contacts?.length) return null;
 return <details className="member-payment-identity" style={{fontWeight:400,overflowWrap:'anywhere',whiteSpace:'normal',maxWidth:360}}>
  <summary>결제자: {[...new Set(contacts.map(contact => contact.name || '미입력'))].join(', ')} ({contacts.length}건)</summary>
  <p className="meta">결제할 때 입력한 정보입니다. 가입 정보와 다를 수 있습니다.</p>
  {contacts.map(contact=><div key={contact.orderId} style={{marginBlock:12}}>
   <div><b>결제자</b> {contact.name || '미입력'}</div>
   {contact.email&&<div>결제 이메일: {contact.email}</div>}
   {contact.phone&&<div>결제 연락처: {contact.phone}</div>}
   <small>{contact.orderNumber} · {contact.status==='refunded'?'환불 완료':'결제 완료'}</small>
  </div>)}
 </details>;
}
