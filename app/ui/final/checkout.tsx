"use client";
import { money, number as num, text as t, type User } from "@/lib/platform";
import { cohortPeriod } from "@/lib/qa-rules";
import { ArrowLeft, ArrowRight, CreditCard } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { type Data, type WorkflowSend } from "../learning-workflows";
import { Badge, Empty, Heading, courseType } from "./primitives";

export function Checkout({
  data,
  user,
  pending,
  send,
}: {
  data: Data;
  user: User | null;
  pending: boolean;
  send: WorkflowSend;
}) {
  const cohortId = useSearchParams().get("cohort") || "",
    router = useRouter();
  const [processing, setProcessing] = useState(false),
    [error, setError] = useState(""),
    [coupon, setCoupon] = useState("");
  const lock = useRef(false),
    cohort = (data.cohorts || []).find((c) => c.id === cohortId),
    course = (data.courses || []).find((c) => c.id === cohort?.course_id),
    free = !!cohort && num(cohort, "price") === 0;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setProcessing(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const result = await send(
        {
          action: "order",
          cohortId,
          name: f.get("name"),
          phone: f.get("phone"),
          coupon: f.get("coupon"),
          agreed: f.get("agreement") === "on",
        },
        "신청 정보를 확인했습니다.",
      );
      if (result.free) {
        router.push("/applied?order=" + result.orderId);
        return;
      }
      const key = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!key) throw new Error("결제 서비스를 준비하고 있습니다.");
      const { loadTossPayments } = await import(
        "@tosspayments/tosspayments-sdk"
      );
      const toss = await loadTossPayments(key);
      await toss.payment({ customerKey: user!.id }).requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: Number(result.totalAmount) },
        orderId: String(result.orderNumber),
        orderName: String(result.orderName || t(course, "title")),
        customerName: String(f.get("name")),
        customerEmail: user!.email,
        successUrl: location.origin + "/payment/success",
        failUrl: location.origin + "/payment/fail",
      });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      lock.current = false;
      setProcessing(false);
    }
  }
  const summary = (
    <div className="summary-product">
      <div className="summary-thumb">{free ? "FREE" : "CLASS"}</div>
      <div>
        <h3>{t(course, "title")}</h3>
        <p className="meta mt8">
          {[
            t(cohort, "name"),
            t(course, "duration_label") || cohortPeriod(cohort),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </div>
  );
  const applicant = (
    <>
      <div className={free ? "" : "grid2"}>
        <label className="field">
          신청자 이름
          <input
            name="name"
            autoComplete="name"
            defaultValue={user?.full_name || ""}
            required
          />
        </label>
        <label className="field">
          휴대폰 번호
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            pattern="0[0-9 ()-]{8,15}"
            title="예: 010-1234-5678"
            defaultValue={user?.phone || ""}
            placeholder="010-1234-5678"
            required
          />
        </label>
      </div>
      <label className="field">
        이메일
        <input
          type="email"
          autoComplete="email"
          value={user?.email || ""}
          readOnly
        />
        <small>클래스 참여 안내를 받을 이메일입니다.</small>
      </label>
    </>
  );
  const agreement = (
    <div className="check-group">
      <label className="checkline">
        <input type="checkbox" name="agreement" required />
        <span>
          [필수] 상품 정보와{" "}
          <Link href="/policies/terms" target="_blank">
            이용약관
          </Link>
          ·
          <Link href="/policies/privacy" target="_blank">
            개인정보 처리방침
          </Link>
          ·
          <Link href="/policies/refund" target="_blank">
            이용 및 환불 안내
          </Link>
          를 확인하고 {free ? "신청" : "결제 진행"}에 동의합니다.
        </span>
      </label>
    </div>
  );
  const submitButton = (
    <>
      <button
        className="btn primary full large"
        disabled={pending || processing}
      >
        {pending || processing
          ? "처리 중..."
          : free
            ? "무료로 신청 완료하기"
            : "결제하기"}
        <ArrowRight />
      </button>
      {error && (
        <p className="form-error mt16" role="alert">
          {error}
        </p>
      )}
    </>
  );
  if (!user)
    return (
      <div className="wrap">
        <Heading title="클래스 신청" />
        <Empty title="로그인 후 신청할 수 있습니다.">
          <Link
            className="btn primary"
            href={
              "/login?next=" +
              encodeURIComponent("/checkout?cohort=" + cohortId)
            }
          >
            로그인하기
          </Link>
        </Empty>
      </div>
    );
  if (!cohort)
    return (
      <div className="wrap">
        <Heading title="클래스 신청" />
        <Empty title="모집 정보를 확인할 수 없습니다.">
          <Link href="/classes">클래스 목록에서 다시 선택해 주세요.</Link>
        </Empty>
      </div>
    );
  if (free)
    return (
      <div className="form-page">
        <section className="form-card">
          <Link className="link muted" href={"/classes/" + t(course, "slug")}>
            <ArrowLeft />
            클래스 상세
          </Link>
          <h1 className="mt24">무료 클래스 신청</h1>
          <p className="lead">참여 정보를 확인하면 신청이 완료됩니다.</p>
          {summary}
          <form onSubmit={submit}>
            {applicant}
            {agreement}
            {submitButton}
          </form>
          <p className="meta mt16 text-center">
            참가비 0원 · 결제 정보 입력 없음
          </p>
        </section>
      </div>
    );
  return (
    <div className="wrap">
      <Heading
        title="주문·결제"
        description="신청 정보를 확인하고 배움을 시작하세요."
      />
      <form onSubmit={submit}>
        <div className="checkout-layout">
          <div className="stack">
            <section className="panel">
              <div className="panel-head">
                <h2>신청 상품</h2>
                {course && <Badge>{courseType(course)}</Badge>}
              </div>
              <div className="panel-body">
                {summary}
                <dl className="info-lines">
                  <div>
                    <dt>신청 수량</dt>
                    <dd>1</dd>
                  </div>
                  <div>
                    <dt>상품 금액</dt>
                    <dd>{money(num(cohort, "price"))}</dd>
                  </div>
                </dl>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>신청자 정보</h2>
              </div>
              <div className="panel-body">{applicant}</div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>쿠폰 할인</h2>
                <Link className="link" href="/my/coupons">
                  내 쿠폰
                </Link>
              </div>
              <div className="panel-body">
                <label className="field">
                  사용할 쿠폰
                  <select
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                  >
                    <option value="">직접 입력 / 선택하지 않음</option>
                    {(data.customer_coupons || [])
                      .filter((c) => c.status === "available")
                      .map((c) => {
                        const v = c.coupon as
                          | Record<string, unknown>
                          | undefined;
                        return (
                          <option key={c.id} value={String(v?.code || "")}>
                            {String(v?.name || "쿠폰")}
                          </option>
                        );
                      })}
                  </select>
                </label>
                <label className="field">
                  쿠폰 코드
                  <input
                    name="coupon"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    placeholder="보유한 쿠폰 코드를 입력하세요."
                  />
                </label>
                <p className="meta">
                  유효한 쿠폰의 할인은 결제창을 열 때 서버에서 확인하여
                  반영합니다.
                </p>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <h2>결제 수단</h2>
              </div>
              <div className="panel-body">
                <div className="radio-row">
                  <label className="radio-card">
                    <input
                      type="radio"
                      name="payment"
                      value="CARD"
                      defaultChecked
                    />
                    <CreditCard />
                    신용·체크카드
                  </label>
                </div>
              </div>
            </section>
          </div>
          <aside className="product-aside">
            <div className="purchase-card">
              <h2>결제 금액</h2>
              <div className="cost-row">
                <span className="muted">상품 금액</span>
                <span>{money(num(cohort, "price"))}</span>
              </div>
              <div className="cost-row">
                <span className="muted">쿠폰 할인</span>
                <span>{coupon ? "결제창에서 확인" : "적용 안 함"}</span>
              </div>
              <div className="cost-row cost-total">
                <span>{coupon ? "할인 전 금액" : "최종 결제 금액"}</span>
                <strong>{money(num(cohort, "price"))}</strong>
              </div>
              {agreement}
              {submitButton}
              <p className="meta">결제 완료 후 내 클래스에서 확인하세요.</p>
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
}
