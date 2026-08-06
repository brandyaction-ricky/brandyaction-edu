import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";

export async function GET() {
  const operator = await getAdminUser("orders");
  if (!operator) return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const { data, error } = await createAdminClient().from("orders").select("id,order_number,status,total_amount,customer_name,customer_email,customer_phone,created_at,order_items(item_name),payments(provider_payment_key,method,status,approved_amount,cancelled_amount,receipt_url,refunds(amount,status,completed_at))").order("created_at", { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ error: "주문 목록을 불러오지 못했습니다." }, { status: 500 });
  return NextResponse.json({ orders: data || [] });
}
