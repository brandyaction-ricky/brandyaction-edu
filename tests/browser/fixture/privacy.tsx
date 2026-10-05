import { useEffect } from 'react';
import { PrivacyPolicy } from '../../../app/ui/privacy-policy';
import { SiteFooter } from '../../../app/ui/final/site-footer';
import { pixel } from '../../../lib/landing-browser';

const config = { pixel_enabled: true, pixel_id: '1234567890' };
export function PrivacyFixture() {
  useEffect(() => { pixel(config, 'PageView'); }, []); // Transport is intercepted by every test.
  return <div className="edu-front">
    <PrivacyPolicy/>
    <button onClick={() => pixel(config, 'Lead')}>합성 클릭 이벤트</button>
    <SiteFooter/>
  </div>;
}
