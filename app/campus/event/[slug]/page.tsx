import Link from 'next/link';
import type {EventView} from '@/features/campus/event/model';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {eventView} from '@/features/campus/event/server';
import {EventLounge} from '@/features/campus/event/lounge';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 이벤트 라운지',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{invite?:string}>}){
 const {slug}=await params,{invite}=await searchParams;
 let initial:EventView|null=null,signedIn=false;
 try{const user=await getAuthenticatedUser();signedIn=Boolean(user);initial=await eventView(slug,user?.id||null);}catch{}
 if(!initial)return <main style={{maxWidth:640,margin:'80px auto',padding:24}}><h1>이벤트 입장을 확인해 주세요</h1><p>초대받은 링크가 맞는지 확인해 주세요. 잠시 후 다시 접속하거나 운영진에게 문의해 주세요.</p><Link href="/">홈으로 돌아가기</Link></main>;
 return <EventLounge initial={initial} signedIn={signedIn} invite={invite||''}/>;
}
