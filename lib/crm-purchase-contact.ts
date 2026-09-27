export type PurchaseContact = {
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
};

export type MemberContact = {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

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
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderEmail)
    ? orderEmail
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(memberEmail)
      ? memberEmail
      : "";
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
