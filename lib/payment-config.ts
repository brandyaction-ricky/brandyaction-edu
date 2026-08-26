import "server-only";

export type TossKeyMode = "test" | "live" | "unknown" | "missing";

function clientKey() {
  return process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || process.env.NEXT_PUBLIC_PG_CLIENT_KEY || "";
}

function secretKey() {
  return process.env.TOSS_SECRET_KEY || process.env.PG_SECRET_KEY || "";
}

function keyMode(key: string, kind: "client" | "secret"): TossKeyMode {
  if (!key) return "missing";
  const testPrefix = kind === "client" ? "test_ck_" : "test_sk_";
  const livePrefix = kind === "client" ? "live_ck_" : "live_sk_";
  if (key.startsWith(testPrefix)) return "test";
  if (key.startsWith(livePrefix)) return "live";
  return "unknown";
}

export function getTossPaymentConfig() {
  const client = clientKey();
  const secret = secretKey();
  const clientMode = keyMode(client, "client");
  const secretMode = keyMode(secret, "secret");
  const modesMatch = clientMode === "unknown" || secretMode === "unknown" || clientMode === secretMode;
  const ready = Boolean(client && secret && modesMatch);

  return {
    clientKey: client,
    clientMode,
    secretMode,
    ready,
    error: !client
      ? "결제 클라이언트 키가 설정되지 않았습니다."
      : !secret
        ? "결제 승인용 시크릿 키가 설정되지 않았습니다."
        : !modesMatch
          ? "토스페이먼츠 클라이언트 키와 시크릿 키의 테스트·운영 모드가 서로 다릅니다."
          : "",
  };
}
