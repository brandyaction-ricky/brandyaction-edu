import { getAuthenticatedUser } from "@/lib/server-auth";
import {
  CouponApplicationError,
  createCouponService,
} from "../application/coupon-service";
import { createCouponRepository } from "../infrastructure/coupon-repository";

const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

function applicationError(cause: unknown, fallback: string) {
  if (cause instanceof CouponApplicationError) return reply({ error: cause.message }, cause.status);
  return reply({ error: fallback }, 503);
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: "로그인이 필요합니다." }, 401);
    const params = new URL(request.url).searchParams;
    if (!params.has("history")) {
      return reply({ error: "쿠폰 목록은 제공하지 않습니다. 보유한 쿠폰 코드를 등록해 주세요." }, 405);
    }
    const service = createCouponService(createCouponRepository());
    return reply(await service.getHistory(user, params.get("history"), params.get("page")));
  } catch (cause) {
    return applicationError(cause, "쿠폰 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
  }
}

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return reply({ error: "허용되지 않은 요청입니다." }, 403);
    }
    const user = await getAuthenticatedUser();
    if (!user) return reply({ error: "로그인이 필요합니다." }, 401);
    const body = (await request.json()) as unknown;
    const service = createCouponService(createCouponRepository());
    if (body && typeof body === "object" && (body as Record<string, unknown>).action === "cancel-zero") {
      return reply(await service.cancelZeroOrder(user, (body as Record<string, unknown>).orderId));
    }
    return reply(await service.register(user, body));
  } catch (cause) {
    return applicationError(cause, "쿠폰을 확인하지 못했습니다. 다시 시도해 주세요.");
  }
}
