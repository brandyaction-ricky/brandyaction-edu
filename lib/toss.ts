import "server-only";

const TOSS_API = "https://api.tosspayments.com/v1";

export type TossPayment = {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: string;
  totalAmount: number;
  balanceAmount: number;
  method: string | null;
  approvedAt: string | null;
  receipt?: { url?: string | null } | null;
  virtualAccount?: {
    accountNumber?: string | null;
    bankCode?: string | null;
    customerName?: string | null;
    dueDate?: string | null;
    expired?: boolean;
    settlementStatus?: string;
  } | null;
  cancels?: Array<{
    transactionKey?: string;
    cancelAmount?: number;
    cancelReason?: string;
    canceledAt?: string;
  }> | null;
  [key: string]: unknown;
};

export class TossApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

function secretKey() {
  const key = process.env.TOSS_SECRET_KEY || process.env.PG_SECRET_KEY;
  if (!key) throw new Error("토스페이먼츠 시크릿 키가 설정되지 않았습니다.");
  return key;
}

async function tossRequest(path: string, init?: RequestInit): Promise<TossPayment> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${TOSS_API}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey()}:`).toString("base64")}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload as { code?: string; message?: string };
      throw new TossApiError(error.code || "TOSS_API_ERROR", error.message || "결제사 요청에 실패했습니다.", response.status);
    }
    return payload as TossPayment;
  } finally {
    clearTimeout(timeout);
  }
}

export function confirmTossPayment(paymentKey: string, orderId: string, amount: number) {
  return tossRequest("/payments/confirm", {
    method: "POST",
    headers: { "Idempotency-Key": `confirm-${orderId}` },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
}

export function getTossPayment(paymentKey: string) {
  return tossRequest(`/payments/${encodeURIComponent(paymentKey)}`);
}

export function cancelTossPayment(
  paymentKey: string,
  orderId: string,
  reason: string,
  amount?: number,
  refundReceiveAccount?: { bank: string; accountNumber: string; holderName: string },
  requestId?: string,
) {
  return tossRequest(`/payments/${encodeURIComponent(paymentKey)}/cancel`, {
    method: "POST",
    headers: { "Idempotency-Key": `cancel-${orderId}-${requestId || "manual"}` },
    body: JSON.stringify({ cancelReason: reason, ...(amount ? { cancelAmount: amount } : {}), ...(refundReceiveAccount ? { refundReceiveAccount } : {}) }),
  });
}

export function tossClientConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || process.env.NEXT_PUBLIC_PG_CLIENT_KEY);
}
