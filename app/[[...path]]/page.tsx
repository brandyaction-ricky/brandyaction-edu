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
  || (root === 'admin' && path.length <= 2 && (!section || sections.some(item => item.key === section)))
  || (root === 'learn' && path.length >= 2 && path.length <= 3)
  || (root === 'payment' && ['success','fail'].includes(section) && path.length === 2)
  || (root === 'policies' && ['terms','privacy','refund'].includes(section) && path.length === 2);
 if (!valid) notFound();
 const user = await getAuthenticatedUser();
 return <Platform key={path.join('/')} path={path} user={user}/>;
}
