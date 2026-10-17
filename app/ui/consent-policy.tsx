"use client";

import { defaultPolicies } from "@/lib/legal-policies";
import styles from "./consent-policy.module.css";

/** Keep policy reading separate from acceptance, without leaving the signup. */
export function RequiredConsent({ checked, onChange, disabled = false }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.item}>
      <label className="checkline">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
        <span>[필수] 이용약관 및 개인정보처리방침 동의</span>
      </label>
      {(["terms", "privacy"] as const).map(kind => {
        const title = kind === "terms" ? "이용약관" : "개인정보처리방침";
        return <details key={kind} className={styles.details}>
          <summary>{title} 전문 보기</summary>
          <div className={styles.copy} role="region" aria-label={`${title} 전문`} tabIndex={0}>
            {defaultPolicies[kind]}
          </div>
        </details>;
      })}
    </div>
  );
}
