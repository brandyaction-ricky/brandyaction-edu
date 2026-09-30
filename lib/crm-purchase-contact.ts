export type PurchaseContact = {
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
};

export type MemberContact = {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_email?: string | null;
};

/** A delivery preference only; never changes the authentication identity. */
export function contactEmail(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('안내받을 이메일을 확인해 주세요.');
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) {
    throw new Error('안내받을 이메일 주소를 올바르게 입력해 주세요.');
  }
  return email;
}

export const phoneDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

export function purchaseContact(order: PurchaseContact, member: MemberContact) {
  const orderPhone = phoneDigits(order.customer_phone);
  const memberPhone = phoneDigits(member.phone);
  const phone = /^0\d{8,10}$/.test(orderPhone)
    ? orderPhone
    : /^0\d{8,10}$/.test(memberPhone)
      ? memberPhone
      : "";
  const orderEmail = String(order.customer_email || "").trim().toLowerCase();
  const memberEmail = String(member.email || "").trim().toLowerCase();
  let preferredEmail: string | null = null;
  try { preferredEmail = contactEmail(member.contact_email ?? null); } catch { /* Preserve legacy delivery when a preference is invalid. */ }
  const email = preferredEmail || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderEmail)
    ? orderEmail
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail)
      ? memberEmail
      : "");
  return {
    phone,
    email,
    full_name: String(order.customer_name || member.full_name || "").trim(),
  };
}

export function purchaseGuideLink(orderId: string, options: { siteUrl?: string; guideEnabled?: boolean } = {}) {
  const siteUrl = options.siteUrl || "https://brandyaction-edu.com";
  const path = options.guideEnabled
    ? `/purchase-onboarding?order=${encodeURIComponent(orderId)}`
    : "/my/orders";
  return new URL(path, siteUrl).toString();
}
