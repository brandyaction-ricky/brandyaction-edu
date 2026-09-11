import { dispatchDueCrm } from "@/lib/crm-delivery";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await dispatchDueCrm()) });
  } catch (error) {
    console.error(
      "crm cron",
      error instanceof Error ? error.message : "unexpected",
    );
    return Response.json(
      { error: "CRM 예약 작업을 완료하지 못했습니다." },
      { status: 503 },
    );
  }
}
