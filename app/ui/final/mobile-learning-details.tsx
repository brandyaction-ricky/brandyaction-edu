'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Keep supplementary progress reachable on mobile and visible on wide screens. */
export function MobileLearningDetails({ children, collapsible }: { children: ReactNode; collapsible: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!collapsible) return <>{children}</>;
  return <div className={'member-learning-details' + (open ? ' is-open' : '')}>
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      주차별 진도·학습 목록 <ChevronDown size={18} aria-hidden="true" />
    </button>
    <div id={id} className="member-learning-details-content">{children}</div>
  </div>;
}
