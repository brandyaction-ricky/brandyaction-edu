// The focus fixture does not exercise Next routing; keep navigation local.
import type { AnchorHTMLAttributes } from 'react';
export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props}/>; }
