import { dispatchDueCrm } from "@/lib/crm-delivery";

import { dispatchPurchaseBuyerDelivery, purchaseBuyerDeliveryEnabled } from "@/lib/purchase-buyer-delivery-server";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const crmEnabled = process.env.CRM_CRON_ENABLED !== "false";
  const purchaseEnabled = purchaseBuyerDeliveryEnabled();
  const paused = { disabled: true, campaigns: 0, automations: 0, sent: 0, failed: 0 };
  if (!crmEnabled && !purchaseEnabled)
    return Response.json(
      { ok: true, ...paused },
      { headers: { "Cache-Control": "no-store" } },
    );
  try {
    const [crm, purchase, retention] = await Promise.allSettled([
      crmEnabled ? dispatchDueCrm() : paused,
      purchaseEnabled ? dispatchPurchaseBuyerDelivery() : undefined,
      crmEnabled && process.env.CRM_RETENTION_ENABLED === 'true'
        ? import('@/lib/crm-retention-server').then(module=>module.dispatchRetentionCrm()) : undefined,
    ]);
    if (purchase.status === "rejected") console.error("purchase buyer delivery queue failed");
    if (retention.status === 'rejected') console.error('retention delivery queue failed');
    if (crm.status === "rejected") throw crm.reason;
    return Response.json({ ok: true, ...crm.value, purchaseQueueOk: purchase.status === "fulfilled", ...(process.env.CRM_RETENTION_ENABLED === 'true' ? {retentionQueueOk:retention.status==='fulfilled'} : {}) });
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
