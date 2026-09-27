import type { ReactNode } from 'react';

export function AdminTimeline({ label, items }: { label: string; items: { id: string; heading: ReactNode; meta: ReactNode; children: ReactNode }[] }) {
  return <ol className="admin-timeline" aria-label={label}>{items.map(item => <li key={item.id}>
    <h4>{item.heading}</h4><p className="meta">{item.meta}</p><div>{item.children}</div>
  </li>)}</ol>;
}
