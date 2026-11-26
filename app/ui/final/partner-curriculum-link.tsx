'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { externalPartnerUrl } from '@/lib/external-partner-url';

export function PartnerCurriculumLink({ userId }: { userId: string }) {
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/platform/partner-access', { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok && (await response.json()).active === true)
      .then(active => { if (!controller.signal.aborted) setAuthorized(active); })
      .catch(() => {});
    return () => controller.abort();
  }, [userId]);
  return authorized ? <section className="panel pad mt16">
    <h2>협력자 커리큘럼</h2>
    <p className="meta mt8">공개 수업 전체와 연결된 캠퍼스를 이용할 수 있습니다.</p>
    <Link className="btn mt16" href={externalPartnerUrl()}>협력자 커리큘럼 열기</Link>
  </section> : null;
}
