const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function purchaseEmailConfigured() {
  return process.env.CRM_DELIVERY_ENABLED === "true" &&
    Boolean(process.env.RESEND_API_KEY && process.env.CRM_EMAIL_FROM);
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return local && domain ? `${local[0]}***@${domain}` : "미등록";
}

export async function sendPurchaseEmail(input: {
  email: string;
  name: string;
  purchaseLink: string;
  automationRunId: string;
}, request: typeof fetch = fetch) {
  const email = input.email.trim().toLowerCase();
  if (!emailPattern.test(email)) throw new Error("결제 안내 이메일 주소가 없습니다.");
  if (!purchaseEmailConfigured()) throw new Error("결제 안내 이메일 발송 설정이 꺼져 있습니다.");
  const link = new URL(input.purchaseLink);
  if (link.protocol !== "https:" || !["brandyaction-edu.com", "brandyaction-edu-dev.vercel.app"].includes(link.hostname))
    throw new Error("결제 안내 링크의 사이트 주소를 확인해 주세요.");
  const response = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `edu-purchase-${input.automationRunId}`,
    },
    body: JSON.stringify({
      from: process.env.CRM_EMAIL_FROM,
      to: [email],
      subject: "[브랜디에듀] 결제 후 시작 안내",
      text: `${input.name || "회원"}님, 문샷 챌린지 결제가 완료됐습니다.\n\n신청 내역과 시작 안내를 확인해 주세요.\n${link.toString()}\n\n브랜디에듀`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Resend 이메일 접수 실패 (${response.status})`);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Resend 이메일 접수 ID가 없습니다.");
  return result.id;
}
