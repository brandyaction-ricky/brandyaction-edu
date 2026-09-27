import { useState } from 'react';
import { Editor } from '../../../app/ui/platform';
import { Checkout } from '../../../app/ui/final/checkout';
import { sections, type Row } from '../../../lib/platform';
export function CouponsFixture() {
  const [open,setOpen]=useState(false), [saved,setSaved]=useState<Record<string,unknown>|null>(null);
  const id='00000000-0000-4000-8000-000000000001';
  const courses=[{id,title:'합성 유료 상품',category:'paid_class',status:'published'}, {id:'00000000-0000-4000-8000-000000000002',title:'두 번째 합성 상품'}];
  if(location.pathname==='/coupon-checkout-test') return <div className="edu-front"><Checkout data={{courses,cohorts:[{id,course_id:id,name:'합성 1기',price:80000,status:'recruiting'}]}} user={{id,email:'qa@example.invalid',full_name:'QA',phone:'01012345678',role:'admin'}} pending={false} send={async body=>{
    const response=await fetch('/fixture/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const result=await response.json();if(!response.ok)throw Error(result.error);return result;
  }}/></div>;
  return <div className="edu-admin"><button className="btn" onClick={()=>setOpen(true)}>쿠폰 만들기</button><output style={{overflowWrap:"anywhere"}} aria-label="저장된 쿠폰">{saved?JSON.stringify(saved):''}</output>{open&&<Editor section={sections.find(s=>s.key==='coupons')!} data={{courses,coupon_products:((saved?.applicable_course_ids || []) as string[]).map(course_id=>({id:course_id,coupon_id:id,course_id}))}} row={saved?{...saved,id} as Row:undefined} close={()=>setOpen(false)} pending={false} save={async values=>{setSaved(values);setOpen(false);}}/>}</div>;
}
