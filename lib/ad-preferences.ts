export const AD_OPTOUT_COOKIE = 'edu_noads';
export const AD_OPTOUT_MAX_AGE = 31536000;

// A rejected cookie write must still stop events in the current document.
let rejectedInThisPage = false;

export function adRejectionSaved() {
  try {
    return typeof document !== 'undefined' && document.cookie.split(';').some(part => part.trim() === `${AD_OPTOUT_COOKIE}=1`);
  } catch {
    return false;
  }
}

export function adsRejected() {
  if (rejectedInThisPage || typeof document === 'undefined') return true;
  try {
    return document.cookie.split(';').some(part => part.trim() === `${AD_OPTOUT_COOKIE}=1`);
  } catch {
    return true;
  }
}

export function rejectPersonalizedAds(): { saved: boolean } {
  rejectedInThisPage = true;
  try {
    // Drop our unprocessed events before revoking consent. A late-loading SDK
    // must not replay page/click events that were queued before this choice.
    if (window.fbq?.queue && !window.fbq.callMethod) window.fbq.queue.length = 0;
    window.fbq?.('consent', 'revoke');
  } catch { /* The local guard remains effective even if the SDK fails. */ }
  try {
    document.cookie = `${AD_OPTOUT_COOKIE}=1; Path=/; Max-Age=${AD_OPTOUT_MAX_AGE}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    return { saved: adRejectionSaved() };
  } catch {
    return { saved: false };
  }
}
