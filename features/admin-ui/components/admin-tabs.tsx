"use client";

import { useId, type ReactNode } from "react";

/** Manual tab activation keeps keyboard navigation independent of data fetching. */
export function AdminTabs({ label, items, value, onChange, children }: {
  label: string;
  items: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  children: (value: string) => ReactNode;
}) {
  const id = useId();
  return <div className="admin-workspace-tabs">
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault(); tabs[next]?.focus();
    }}>
      {items.map(item => <button key={item.value} type="button" role="tab" id={`${id}-${item.value}-tab`} aria-controls={`${id}-${item.value}-panel`} aria-selected={value === item.value} tabIndex={value === item.value ? 0 : -1} className={`tab ${value === item.value ? "active" : ""}`} onClick={() => onChange(item.value)}>{item.label}</button>)}
    </div>
    {items.map(item => <section key={item.value} role="tabpanel" id={`${id}-${item.value}-panel`} aria-labelledby={`${id}-${item.value}-tab`} hidden={value !== item.value} tabIndex={0}>{children(item.value)}</section>)}
  </div>;
}
