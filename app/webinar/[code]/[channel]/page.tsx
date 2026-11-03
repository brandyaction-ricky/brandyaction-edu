import { notFound } from 'next/navigation';
import { WebinarRegistration } from '@/app/ui/webinar-registration';
import { SiteFooter } from '@/app/ui/final/site-footer';
export const metadata={title:'무료 웨비나 신청 | BrandyAction EDU',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{code:string;channel:string}>}) {
 const {code,channel}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(code)||!['paid','organic','unknown'].includes(channel)) notFound();
 return <div className="edu-front"><WebinarRegistration key={`${code}:${channel}`} code={code} channel={channel}/><SiteFooter/></div>;
}
