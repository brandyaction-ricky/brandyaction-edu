import { Platform } from '../../../app/ui/platform';
import { usePathname } from 'next/navigation';
export function MemberDirectoryFixture() {
 const path = usePathname().split('/').filter(Boolean);
 return <Platform path={path} user={{id:'00000000-0000-4000-8000-000000000099',role:'admin',full_name:'합성 관리자',email:'admin@example.test',phone:null}}/>;
}
