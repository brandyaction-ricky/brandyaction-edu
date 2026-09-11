import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, ExternalLink, Mail, ReceiptText } from "lucide-react";
import { LearnerShell } from "../../components/learner-shell";
import { AccountSettings } from "../../components/account-settings";
import { WithdrawAccount } from "../../components/withdraw-account";
import { AccountLibrary } from "../../components/account-library";
import { safeExternalUrl } from "@/lib/safe-url";
import { createClient } from "@/lib/supabase/server";
import { getPublicSupport } from "@/lib/education-data";

export const dynamic = "force-dynamic";
function date(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function money(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}
const labels: Record<string, string> = {
  pending: "입금·승인 대기",
  paid: "결제 완료",
  payment_failed: "결제 실패",
  cancelled: "주문 취소",
  partially_refunded: "부분 환불",
  refunded: "환불 완료",
};
type PaymentPayload = { virtualAccount?: { accountNumber?: string; bankCode?: string; dueDate?: string } | null };

export default async function MySectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ enrollment?: string }>;
}) {
  const { section } = await params;
  if (["missions","resources","reviews","coupons","questions"].includes(section)) {
    const { enrollment } = await searchParams;
    return <AccountLibrary section={section} enrollmentId={enrollment}/>;
  }
  if (!["orders", "settings"].includes(section)) redirect("/my");
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect(`/login?next=/my/${section}`);
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,phone")
    .eq("id", userData.user.id)
    .maybeSingle();
  const name =
    profile?.full_name || userData.user.email?.split("@")[0] || "회원";
  if (section === "settings")
    return (
      <LearnerShell active="settings" userName={name}>
        <AccountSettings
          email={userData.user.email || ""}
          initialName={profile?.full_name || ""}
          initialPhone={profile?.phone || ""}
        />
        <WithdrawAccount />
      </LearnerShell>
    );

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id,order_number,status,total_amount,created_at,order_items(item_name),payments(method,status,receipt_url,cancelled_amount,provider_payload,refunds(amount,status,completed_at))",
    )
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false });
  const { refundEmail } = await getPublicSupport();
  return (
    <LearnerShell active="orders" userName={name}>
      <div className="app-page-heading">
        <div>
          <span>ORDERS</span>
          <h1>구매 내역</h1>
        </div>
      </div>
      {orders?.length ? (
        <div className="my-order-list">
          {orders.map((order) => {
            const item = Array.isArray(order.order_items)
              ? order.order_items[0]
              : order.order_items;
            const payment = Array.isArray(order.payments)
              ? order.payments[0]
              : order.payments;
            const receiptUrl = safeExternalUrl(payment?.receipt_url);
            const payload = payment?.provider_payload && typeof payment.provider_payload === "object" ? payment.provider_payload as PaymentPayload : null;
            const virtualAccount = payload?.virtualAccount || null;
            return (
              <article key={order.id}>
                <div>
                  <span>{date(order.created_at)}</span>
                  <strong>{item?.item_name || "클래스 주문"}</strong>
                  <small>주문번호 {order.order_number}</small>
                </div>
                <div>
                  <strong>{money(order.total_amount)}</strong>
                  <span className={`order-state state-${order.status}`}>
                    {labels[order.status] || order.status}
                  </span>
                  {payment?.method && <small>{payment.method}</small>}
                </div>
                <div className="my-order-actions">
                  {order.status === "pending" && virtualAccount?.accountNumber && <span className="virtual-account-summary"><strong>입금 계좌</strong>{virtualAccount.bankCode && <small>은행 코드 {virtualAccount.bankCode}</small>}<b>{virtualAccount.accountNumber}</b>{virtualAccount.dueDate && <small>{date(virtualAccount.dueDate)}까지</small>}</span>}
                  {receiptUrl ? (
                    <a href={receiptUrl} target="_blank" rel="noreferrer">
                      <ReceiptText /> 영수증 <ExternalLink />
                    </a>
                  ) : (
                    <span className="receipt-wait">
                      <CreditCard /> 영수증 준비 중
                    </span>
                  )}
                  {["paid", "partially_refunded"].includes(order.status) && <a href={`mailto:${refundEmail}?subject=${encodeURIComponent(`[환불 문의] ${order.order_number}`)}`}><Mail/> 환불 문의</a>}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="catalog-note my-empty-state">
          <strong>구매 내역이 없습니다.</strong>
          <p>
            결제를 시작하면 주문 상태와 영수증을 이곳에서 확인할 수 있습니다.
          </p>
          <Link className="button button-dark" href="/classes">
            클래스 둘러보기
          </Link>
        </section>
      )}
    </LearnerShell>
  );
}
