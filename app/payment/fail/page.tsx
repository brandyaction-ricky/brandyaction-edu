import Link from "next/link";
import { CircleX } from "lucide-react";

export default async function PaymentFailPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; message?: string; orderId?: string }>;
}) {
  const query = await searchParams;
  const canceled = query.code === "PAY_PROCESS_CANCELED";
  return (
    <main className="payment-result-page">
      <section>
        <CircleX />
        <h1>
          {canceled ? "결제가 취소되었습니다" : "결제를 완료하지 못했습니다"}
        </h1>
        <p>
          {canceled
            ? "결제는 발생하지 않았습니다."
            : query.message || "결제 정보를 확인한 뒤 다시 시도해 주세요."}
        </p>
        {query.orderId && <small>주문번호 {query.orderId}</small>}
        <Link className="button button-dark" href="/classes">
          클래스로 돌아가기
        </Link>
      </section>
    </main>
  );
}
