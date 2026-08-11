import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { tossClientConfigured } from "@/lib/toss";
import { isValidPhone, normalizePhone } from "@/lib/auth-validation";
import { POLICY_VERSION } from "@/lib/legal-policies";

function messageFor(code: string) {
  if (code.includes("ALREADY_ENROLLED")) return "이미 수강 중인 기수입니다.";
  if (code.includes("PAYMENT_ALREADY_PENDING")) return "이미 발급된 가상계좌가 있습니다. 구매 내역에서 입금 정보를 확인해 주세요.";
  if (code.includes("COHORT_CAPACITY_EXCEEDED")) return "신청 가능한 정원이 마감되었습니다.";
  if (code.includes("COHORT_NOT_RECRUITING") || code.includes("RECRUITMENT_CLOSED") || code.includes("COHORT_OPERATION_ENDED")) return "현재 신청할 수 없는 기수입니다.";
  if (code.includes("USER_NOT_ACTIVE")) return "이용이 제한된 계정입니다. 고객센터에 문의해 주세요.";
  if (code.includes("INVALID_SALE_PRICE")) return "판매 가격 설정을 확인해 주세요.";
  return "주문을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    cohortId?: string;
    name?: string;
    email?: string;
    phone?: string;
    agreements?: { terms?: boolean; privacy?: boolean; refund?: boolean };
  } | null;
  if (!body?.cohortId || !body.name?.trim() || !body.email?.trim()) {
    return NextResponse.json({ error: "신청자와 상품 정보를 확인해 주세요." }, { status: 400 });
  }
  if (!body.phone || !isValidPhone(body.phone)) {
    return NextResponse.json({ error: "휴대폰 번호를 10~11자리 숫자로 입력해 주세요." }, { status: 400 });
  }
  if (!body.agreements?.terms || !body.agreements.privacy || !body.agreements.refund) {
    return NextResponse.json({ error: "필수 약관에 모두 동의해 주세요." }, { status: 400 });
  }
  if (body.email.trim().toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "결제 이메일은 로그인한 계정 이메일과 같아야 합니다." }, { status: 400 });
  }
  if (!tossClientConfigured()) {
    return NextResponse.json({ error: "결제 설정이 아직 완료되지 않았습니다. 운영자에게 문의해 주세요." }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_checkout_order", {
    p_user_id: user.id,
    p_cohort_id: body.cohortId,
    p_customer_name: body.name.trim(),
    p_customer_email: body.email.trim().toLowerCase(),
    p_customer_phone: normalizePhone(body.phone),
    p_terms_version: POLICY_VERSION,
    p_privacy_version: POLICY_VERSION,
    p_refund_policy_version: POLICY_VERSION,
  });
  if (error || !data) {
    return NextResponse.json({ error: messageFor(error?.message || "") }, { status: 409 });
  }

  await admin.from("profiles").update({
    full_name: body.name.trim(),
    phone: normalizePhone(body.phone),
  }).eq("id", user.id);

  return NextResponse.json(data, { status: 201 });
}
