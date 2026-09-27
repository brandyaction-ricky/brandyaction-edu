"use client";

import { defaultPolicies } from "@/lib/legal-policies";
import styles from "./consent-policy.module.css";

/** Keep policy reading separate from acceptance, without leaving the signup. */
export function ConsentPolicy({ kind, checked, onChange }: {
  kind: "terms" | "privacy";
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const title = kind === "terms" ? "이용약관" : "개인정보처리방침";
  return (
    <div className={styles.item}>
      <label className="checkline">
        <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
        <span>[필수] {title} 동의</span>
      </label>
      <details className={styles.details}>
        <summary>{title} 전문 보기</summary>
        <div className={styles.copy} role="region" aria-label={`${title} 전문`} tabIndex={0}>
          {defaultPolicies[kind]}
        </div>
      </details>
    </div>
  );
}
