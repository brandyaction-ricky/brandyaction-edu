import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/server-auth";

export async function POST(request:Request){
  const user=await getAuthenticatedUser(); if(!user)return NextResponse.json({error:"로그인이 필요합니다."},{status:401});
  const body=await request.json().catch(()=>null) as {code?:string;courseId?:string;cohortId?:string}|null;
  const code=String(body?.code||"").trim().toUpperCase(); if(!code||!body?.courseId||!body?.cohortId)return NextResponse.json({error:"쿠폰 코드를 입력해 주세요."},{status:400});
  const admin=createAdminClient();
  const [{data:coupon},{data:cohort}]=await Promise.all([admin.from("coupons").select("id,name,code,usage_limit,product_scope,discount_type,discount_value,starts_at,ends_at,is_active,coupon_products(course_id)").eq("code",code).maybeSingle(),admin.from("cohorts").select("id,course_id,price,status,recruitment_start_at,recruitment_end_at").eq("id",body.cohortId).eq("course_id",body.courseId).maybeSingle()]);
  if(!coupon||!coupon.is_active)return NextResponse.json({error:"사용할 수 없는 쿠폰 코드입니다."},{status:404}); if(!cohort||cohort.status!=="recruiting")return NextResponse.json({error:"현재 신청 가능한 상품이 아닙니다."},{status:409});
  const now=Date.now(); if(coupon.starts_at&&new Date(coupon.starts_at).getTime()>now)return NextResponse.json({error:"아직 사용 기간이 시작되지 않은 쿠폰입니다."},{status:409}); if(coupon.ends_at&&new Date(coupon.ends_at).getTime()<=now)return NextResponse.json({error:"사용 기간이 종료된 쿠폰입니다."},{status:409});
  if(coupon.product_scope==="specific"&&!(coupon.coupon_products||[]).some((item:{course_id:string})=>item.course_id===body.courseId))return NextResponse.json({error:"선택한 상품에는 사용할 수 없는 쿠폰입니다."},{status:409});
  if(coupon.usage_limit){const {data:rows}=await admin.from("coupon_redemptions").select("status,orders(status,expires_at)").eq("coupon_id",coupon.id);const used=(rows||[]).filter(row=>{const order=Array.isArray(row.orders)?row.orders[0]:row.orders;return row.status==="used"||(row.status==="reserved"&&order?.status==="pending"&&(!order.expires_at||new Date(order.expires_at).getTime()>now))}).length;if(used>=coupon.usage_limit)return NextResponse.json({error:"쿠폰 사용 수량이 모두 소진되었습니다."},{status:409})}
  const discount=coupon.discount_type==="fixed"?Math.min(coupon.discount_value,cohort.price):Math.min(Math.floor(cohort.price*coupon.discount_value/100),cohort.price);
  return NextResponse.json({id:coupon.id,name:coupon.name,code:coupon.code,discountAmount:discount,totalAmount:cohort.price-discount});
}
