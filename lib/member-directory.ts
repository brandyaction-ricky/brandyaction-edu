export type MemberDirectoryScope = { query: string; status: string; course: string };
export type MemberPaymentContact = { orderId: string; orderNumber: string; name: string|null; email: string|null; phone: string|null; status: string };
export function memberDirectoryScope(params: Pick<URLSearchParams, 'get'>): MemberDirectoryScope {
 return { query: params.get('memberQuery') || '', status: params.get('memberStatus') || '', course: params.get('memberCourse') || '' };
}
