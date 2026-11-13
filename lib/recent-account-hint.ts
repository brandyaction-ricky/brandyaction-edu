const key = 'edu-recent-login-hint-v1';
const retentionMs = 30 * 24 * 60 * 60 * 1000;

// Store only a masked hint, even on shared devices. Storage may be disabled.
export function rememberAccountHint(email: string) {
  const match = /^([^@\s]+)@([^@\s]+)$/.exec(email);
  if (!match) return;
  try {
    localStorage.setItem(key, JSON.stringify({ hint: match[1][0] + '***@' + match[2], expires: Date.now() + retentionMs }));
  } catch { /* Private browsing can disable storage. */ }
}

export function recentAccountHint(): string {
  try {
    const entry = JSON.parse(localStorage.getItem(key) || 'null');
    if (entry && entry.expires > Date.now() && typeof entry.hint === 'string' && /^.\*\*\*@[^@\s]+$/.test(entry.hint)) return entry.hint;
    localStorage.removeItem(key);
  } catch { /* Recovery by order also works without browser storage. */ }
  return '';
}
export function forgetAccountHint() {
  try { localStorage.removeItem(key); } catch { /* Storage unavailable. */ }
}
