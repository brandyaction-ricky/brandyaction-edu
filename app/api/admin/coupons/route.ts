import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/server-auth";

type CouponInput = { id?: string; name?: string; description?: string; code?: string; usageLimit?: number | null; productScope?: "all"|"specific"; courseIds?: string[]; discountType?: "fixed"|"percentage"; discountValue?: number; startsAt?: string|null; endsAt?: string|null; isActive?: boolean };
const codePattern=/^[A-Z0-9_-]{3,30}$/;

export async function GET(){
  const operator=await getAdminUser("orders");
  if(!operator||operator.role!=="admin")return NextResponse.json({error:"쿠폰 관리 권한이 필요합니다."},{status:403});
  const admin=createAdminClient();
  const [{data:coupons,error},{data:courses},{data:redemptions}]=await Promise.all([
    admin.from("coupons").select("id,name,description,code,usage_limit,product_scope,discount_type,discount_value,starts_at,ends_at,is_active,created_at,coupon_products(course_id)").order("created_at",{ascending:false}),
    admin.from("courses").select("id,title,status").order("created_at",{ascending:false}),
    admin.from("coupon_redemptions").select("coupon_id,status,orders(status,expires_at)"),
  ]);
  if(error)return NextResponse.json({error:error.message},{status:500});
  const now=Date.now();
  const usage=new Map<string,number>();
  for(const row of redemptions||[]){const order=Array.isArray(row.orders)?row.orders[0]:row.orders;const counted=row.status==="used"||(row.status==="reserved"&&order?.status==="pending"&&(!order.expires_at||new Date(order.expires_at).getTime()>now));if(counted)usage.set(row.coupon_id,(usage.get(row.coupon_id)||0)+1)}
  return NextResponse.json({coupons:(coupons||[]).map(row=>({...row,courseIds:(row.coupon_products||[]).map((item:{course_id:string})=>item.course_id),usedCount:usage.get(row.id)||0})),courses:courses||[]});
}

export async function POST(request:Request){
  const operator=await getAdminUser("orders");
  if(!operator||operator.role!=="admin")return NextResponse.json({error:"쿠폰 관리 권한이 필요합니다."},{status:403});
  const body=await request.json().catch(()=>null) as CouponInput|null;
  const code=String(body?.code||"").trim().toUpperCase(); const name=String(body?.name||"").trim(); const value=Number(body?.discountValue||0);
  if(!name||!codePattern.test(code))return NextResponse.json({error:"쿠폰명과 영문 대문자·숫자 3~30자의 코드를 입력해 주세요."},{status:400});
  if(!["fixed","percentage"].includes(String(body?.discountType))||!Number.isInteger(value)||value<=0||(body?.discountType==="percentage"&&value>100))return NextResponse.json({error:"할인 값을 확인해 주세요."},{status:400});
  if(body?.productScope==="specific"&&!(body.courseIds||[]).length)return NextResponse.json({error:"적용할 특정 상품을 선택해 주세요."},{status:400});
  if(body?.startsAt&&body?.endsAt&&new Date(body.endsAt)<=new Date(body.startsAt))return NextResponse.json({error:"사용 종료일은 시작일 이후여야 합니다."},{status:400});
  const admin=createAdminClient();
  const payload={name,description:String(body?.description||"").trim()||null,code,usage_limit:body?.usageLimit?Number(body.usageLimit):null,product_scope:body?.productScope||"all",discount_type:body?.discountType,discount_value:value,starts_at:body?.startsAt||null,ends_at:body?.endsAt||null,is_active:body?.isActive!==false,created_by:operator.id};
  const saved=body?.id?await admin.from("coupons").update(payload).eq("id",body.id).select("id").single():await admin.from("coupons").insert(payload).select("id").single();
  if(saved.error)return NextResponse.json({error:saved.error.code==="23505"?"이미 사용 중인 쿠폰 코드입니다.":saved.error.message},{status:409});
  const id=saved.data.id; await admin.from("coupon_products").delete().eq("coupon_id",id);
  if(payload.product_scope==="specific"){const {error}=await admin.from("coupon_products").insert((body?.courseIds||[]).map(course_id=>({coupon_id:id,course_id})));if(error)return NextResponse.json({error:error.message},{status:500})}
  await admin.from("audit_logs").insert({actor_user_id:operator.id,action:body?.id?"coupon.updated":"coupon.created",entity_type:"coupon",entity_id:id,after_data:payload});
  return NextResponse.json({ok:true,id});
}

export async function DELETE(request:Request){
  const operator=await getAdminUser("orders");
  if(!operator||operator.role!=="admin")return NextResponse.json({error:"쿠폰 관리 권한이 필요합니다."},{status:403});
  const {id}=await request.json().catch(()=>({})) as {id?:string}; if(!id)return NextResponse.json({error:"쿠폰을 선택해 주세요."},{status:400});
  const admin=createAdminClient(); const {count}=await admin.from("coupon_redemptions").select("id",{count:"exact",head:true}).eq("coupon_id",id);
  const result=count?await admin.from("coupons").update({is_active:false}).eq("id",id):await admin.from("coupons").delete().eq("id",id);
  if(result.error)return NextResponse.json({error:result.error.message},{status:500});
  await admin.from("audit_logs").insert({actor_user_id:operator.id,action:count?"coupon.deactivated":"coupon.deleted",entity_type:"coupon",entity_id:id});
  return NextResponse.json({ok:true});
}

export async function PATCH(request:Request){
  const operator=await getAdminUser("orders");
  if(!operator||operator.role!=="admin")return NextResponse.json({error:"쿠폰 관리 권한이 필요합니다."},{status:403});
  const body=await request.json().catch(()=>null) as {id?:string;isActive?:boolean}|null;
  if(!body?.id||typeof body.isActive!=="boolean")return NextResponse.json({error:"변경할 쿠폰 상태를 확인해 주세요."},{status:400});
  const admin=createAdminClient();const {error}=await admin.from("coupons").update({is_active:body.isActive}).eq("id",body.id);
  if(error)return NextResponse.json({error:error.message},{status:500});
  await admin.from("audit_logs").insert({actor_user_id:operator.id,action:body.isActive?"coupon.activated":"coupon.deactivated",entity_type:"coupon",entity_id:body.id});
  return NextResponse.json({ok:true});
}
