import { SolapiMessageService } from "solapi";
import { getOperatorUser } from "@/lib/operator-permissions";

const reply = (data: unknown, status = 200) => Response.json(data, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});
const digits = (value: string | undefined) => (value || "").replace(/\D/g, "");

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return reply({ error: "요청 출처를 확인해 주세요." }, 403);
  if (process.env.NEXT_PUBLIC_APP_ENV !== "development")
    return reply({ error: "DEV에서만 시험 발송할 수 있습니다." }, 404);

  const actor = await getOperatorUser("marketing");
  if (!actor || actor.role !== "admin")
    return reply({ error: "관리자만 시험 발송할 수 있습니다." }, 403);

  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  const sender = digits(process.env.SOLAPI_SENDER_PHONE);
  const recipient = digits(process.env.CRM_TEST_RECIPIENT_PHONE);
  if (!key || !secret || !/^0\d{8,10}$/.test(sender) || !/^0\d{8,10}$/.test(recipient))
    return reply({ error: "SOLAPI 키·발신번호·DEV 시험번호 설정을 확인해 주세요." }, 503);

  try {
    const result = await new SolapiMessageService(key, secret).send({
      to: recipient,
      from: sender,
      text: "[브랜디에듀 DEV] SOLAPI 연결 확인 문자입니다.",
      type: "SMS",
      autoTypeDetect: false,
    });
    if (result.failedMessageList.length)
      return reply({ error: "시험 문자를 접수하지 못했습니다. SOLAPI 발송 내역을 확인해 주세요." }, 502);
    return reply({ accepted: true, recipient: `${recipient.slice(0, 3)}****${recipient.slice(-4)}`, groupId: result.groupInfo.groupId });
  } catch {
    return reply({ error: "시험 발송 결과를 확인하지 못했습니다. 중복 발송 전 SOLAPI 내역을 확인해 주세요." }, 502);
  }
}
