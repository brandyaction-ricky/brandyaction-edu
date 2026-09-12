import type { Metadata } from 'next';
import { getEduSettings } from '@/lib/edu-settings';
import { createClient } from '@/lib/supabase/server';
import { Platform } from '@/app/ui/platform';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { notFound } from 'next/navigation';
import { sections } from '@/lib/platform';
export const dynamic = 'force-dynamic';
export default async function Page({params}:{params:Promise<{path?:string[]}>}) {
 const {path=[]} = await params;
 const [root, section] = path;
 const valid = path.length === 0
  || (['login','signup','stories','checkout','apply','applied','order-complete'].includes(root) && path.length === 1)
  || (['classes','articles'].includes(root) && path.length <= 2)
  || (root === 'my' && path.length <= 2 && (!section || ['classes','missions','questions','resources','reviews','orders','coupons','profile'].includes(section)))
  || (root === 'admin' && path.length <= 2 && (!section || ['product-editor','learning-editor'].includes(section) || sections.some(item => item.key === section)))
  || (root === 'learn' && path.length >= 2 && (path.length <= 3 || (path.length === 4 && path[3] === 'mission')))
  || (root === 'payment' && ['success','fail'].includes(section) && path.length === 2)
  || (root === 'policies' && ['terms','privacy','refund'].includes(section) && path.length === 2);
 if (!valid) notFound();
 const user = await getAuthenticatedUser();
 return <Platform key={path.join('/')} path={path} user={user}/>;
}

export async function generateMetadata({params}:{params:Promise<{path?:string[]}>}):Promise<Metadata> {
 const {path=[]}=await params;
 const {seo}=await getEduSettings();
 let title=String(seo.title||'BrandyAction EDU | 배운 것을, 내 일의 성과로.');
 let description=String(seo.description||'AI와 마케팅을 배우고 내 업무에 적용하는 실행 중심 교육.');
 if(['classes','articles'].includes(path[0])&&path[1]) {
  const db=await createClient();
  const isCourse=path[0]==='classes';
  const {data}=await db.from(isCourse?'courses':'articles').select(isCourse?'title,summary,metadata':'title,summary').eq('slug',path[1]).eq('status','published').maybeSingle();
  if(data){
   const row=data as unknown as {title:string;summary?:string;metadata?:Record<string,unknown>};
   const metadata=isCourse&&row.metadata&&typeof row.metadata==='object'?row.metadata:{};
   title=(typeof metadata.seo_title==='string'&&metadata.seo_title.trim()?metadata.seo_title:row.title)+' | BrandyAction EDU';
   description=String(metadata.seo_description||row.summary||description);
  }
 }
 const privatePage=['admin','my','learn','checkout','apply','payment','login','signup','auth'].includes(path[0]);
 return {title,description,openGraph:{title,description},robots:privatePage||process.env.NEXT_PUBLIC_APP_ENV!=='production'?{index:false,follow:false}:undefined,verification:{google:seo.googleVerification?String(seo.googleVerification):undefined,other:seo.naverVerification?{'naver-site-verification':String(seo.naverVerification)}:undefined}};
}
