'use client';
import { WelcomeConsent } from './welcome-consent';
/** Shown only on safe member pages; completion is stored on the server. */
export function ConsentRewardCard({ memberKey }: { memberKey:string }) { return <WelcomeConsent key={memberKey}/>; }
