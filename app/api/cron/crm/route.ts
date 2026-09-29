import { dispatchDueCrm } from "@/lib/crm-delivery";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Pause only the scheduled CRM queue; direct purchase/test sends keep their
  // existing controls. Other cron jobs can share CRON_SECRET safely.
  if (process.env.CRM_CRON_ENABLED === "false")
    return Response.json(
      { ok: true, disabled: true, campaigns: 0, automations: 0, sent: 0, failed: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
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
