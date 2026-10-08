// The focus fixture does not exercise Next routing; keep navigation local.
import type { AnchorHTMLAttributes } from 'react';
import { useRouter } from './navigation';
const careNavigation = new URLSearchParams(window.location.search).has('careNavigationFixture');
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const router = useRouter();
  if (!careNavigation) return <a {...props}/>;
  return <a {...props} onClick={event => {
    props.onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target || !props.href?.startsWith('/')) return;
    event.preventDefault(); router.push(props.href);
  }}/>;
}
export function useLinkStatus() { return { pending: false }; }
