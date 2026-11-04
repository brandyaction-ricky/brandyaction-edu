import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
import {getSupabasePublicConfig,hasSupabaseEnv} from '@/lib/supabase/config';
/** Fail closed before any campus page, action or API executes. Read the role from the database, never metadata. */
export async function privateCampusResponse(request:NextRequest){
 let response=NextResponse.next({request});
 const closed=(status:number)=>new NextResponse(status===404?'아직 공개되지 않은 공간입니다.':'권한 확인을 다시 시도해 주세요.',{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
 if(!hasSupabaseEnv())return closed(404);
 try{const{publicUrl,publishableKey}=getSupabasePublicConfig();const db=createServerClient(publicUrl,publishableKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll:items=>{items.forEach(c=>request.cookies.set(c.name,c.value));response=NextResponse.next({request});items.forEach(c=>response.cookies.set(c.name,c.value,c.options));}}});
 const{data,error}=await db.auth.getUser();if(error||!data.user)return closed(error&&![400,401,403].includes(error.status||0)?503:404);
 const p=await db.from('profiles').select('role,status').eq('id',data.user.id).maybeSingle();if(p.error)return closed(503);if(p.data?.role!=='admin'||p.data.status!=='active')return closed(404);
 response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');return response;
 }catch{return closed(503);}
}
