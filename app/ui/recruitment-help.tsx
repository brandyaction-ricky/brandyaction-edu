import type { ReactNode } from 'react';
import './recruitment-help.css';

export function RecruitmentHelp({ title, children }: { title: string; children: ReactNode }) {
  return <aside className="recruitment-help" aria-label={title}><strong>{title}</strong><div>{children}</div></aside>;
}

export function RecruitmentDetails({ title, children }: { title: string; children: ReactNode }) {
  return <details className="recruitment-details"><summary>{title}</summary><div>{children}</div></details>;
}
