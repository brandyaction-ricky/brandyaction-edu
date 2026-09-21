'use client';

import { useEffect, useRef, useState } from 'react';
import { AdminButton } from './final/admin-system';
import type { BroadcastReport } from '@/lib/broadcast-entry';
import './recruitment-help.css';

type Destination = 'settings' | 'broadcast' | 'followup';
type Check = { title: string; state: string; detail: string; destination?: Destination };
type Campaign = { id: string; enabled: boolean; paidCohort: string | null };
type Followup = { drafts: { channel: string; body: string }[]; audienceState: string };

// A read-only snapshot of saved settings, never a publication or delivery gate.
export function RecruitmentReadiness({ period, onNavigate }: { period: string; onNavigate: (view: Destination) => void }) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState('');
  const reading = useRef<AbortController | null>(null);
  useEffect(() => () => reading.current?.abort(), [period]);

  const inspect = async () => {
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    setPending(true); setChecks(null); setError(''); setCheckedAt('');
    const get = async <T,>(path: string): Promise<T> => {
      const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403
        ? '현재 권한으로 준비 상태를 조회할 수 없습니다.' : '일부 설정을 읽지 못했습니다. 다시 점검해 주세요.');
      return response.json();
    };
    try {
      const query = `?period=${encodeURIComponent(period)}`;
      const [rooms, links, webinar] = await Promise.all([
        get<{ draft: { version: number } | null }>('/api/conversion/rooms' + query),
        get<{ link: { enabled: boolean; room_version: number } | null }>('/api/conversion/links' + query),
        get<{ campaign: Campaign | null }>('/api/conversion/webinar' + query),
      ]);
      if (!('draft' in rooms) || !('link' in links) || !('campaign' in webinar)) throw new Error('설정 응답을 확인하지 못했습니다. 다시 점검해 주세요.');
      const campaign = webinar.campaign;
      const [broadcast, followup] = campaign ? await Promise.all([
        get<BroadcastReport>(`/api/conversion/broadcast?code=${encodeURIComponent(campaign.id)}`),
        get<Followup>(`/api/conversion/followup?code=${encodeURIComponent(campaign.id)}`),
      ]) : [null, null];
      if (campaign && (!Array.isArray(broadcast?.sessions) || typeof broadcast?.offerReady !== 'boolean' || !Array.isArray(followup?.drafts))) throw new Error('설정 응답을 확인하지 못했습니다. 다시 점검해 주세요.');
      const currentRooms = Boolean(rooms.draft && links.link?.room_version === rooms.draft.version);
      const next: Check[] = [
        { title: '카톡방 모집 링크', state: links.link?.enabled && currentRooms ? '활성 · 최신 방 설정' : '확인 필요', detail: !rooms.draft ? '상단에서 방 설정을 먼저 저장하세요.' : !links.link?.enabled ? '상단의 광고·오가닉 모집 링크를 활성화해야 합니다.' : !currentRooms ? '링크가 이전 방 설정을 사용합니다. 상단에서 저장된 방으로 다시 활성화하세요.' : '광고·오가닉 링크가 현재 저장된 방 설정을 사용합니다. 실제 방 입장 가능 여부는 직접 확인하세요.' },
        { title: '무료 웨비나 신청', state: campaign?.enabled ? '신청 링크 활성' : '확인 필요', detail: campaign?.enabled ? '저장된 신청 링크가 활성 상태입니다. 상세페이지 버튼과 카톡방 공지에 올바른 링크를 넣었는지 확인하세요.' : '무료 상품을 연결하고 신청 링크를 활성화하세요.', destination: 'settings' },
        { title: '유료 교육 상품', state: broadcast?.offerReady ? '공개 상품 연결됨' : '확인 필요', detail: !campaign?.paidCohort ? '구매를 확인할 유료 기수를 연결하세요.' : broadcast?.offerReady ? '연결 기수의 유료 상품이 공개 상태입니다. 가격·모집 기간·결제 가능 여부는 상품 관리에서 별도 확인하세요.' : '연결한 기수의 유료 상품이 공개 상태인지 상품 관리에서 확인하세요.', destination: 'settings' },
      ];
      for (const phase of ['first', 'encore'] as const) {
        const session = broadcast?.sessions.find(item => item.phase === phase);
        const live = Boolean(campaign?.enabled && session?.enabled && session?.url);
        const offer = Boolean(campaign?.enabled && broadcast?.offerReady && session?.offerEnabled);
        next.push({ title: phase === 'first' ? '첫 웨비나 링크' : '앵콜 라이브 링크', state: live && offer ? '방송·교육 링크 활성' : '확인 필요', detail: `방송 이동 ${live ? '활성' : '준비 필요'} · 유료 교육 안내 ${offer ? '활성' : '준비 필요'}. YouTube 방송 일정과 공개 범위는 직접 확인하세요.`, destination: 'broadcast' });
      }
      for (const channel of ['room', 'direct']) {
        const forbidden = channel === 'direct' && followup?.audienceState === 'forbidden';
        const saved = followup?.drafts.some(draft => draft.channel === channel && draft.body.trim());
        next.push({ title: channel === 'room' ? '카톡방 공지 문구' : '문자·알림톡 안내 문구', state: forbidden ? '권한 확인 필요' : saved ? '초안 저장됨 · 검수 필요' : '초안 준비 필요', detail: forbidden ? '개별 안내 조회에는 회원·주문 권한이 추가로 필요합니다.' : '저장 여부만 확인합니다. 실제 일정·링크·문구 검수와 게시·발송은 별도입니다.', destination: 'followup' });
      }
      if (!controller.signal.aborted) { setChecks(next); setCheckedAt(new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })); }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '준비 상태를 확인하지 못했습니다.');
    } finally { if (!controller.signal.aborted) setPending(false); }
  };

  return <section className="recruitment-readiness" aria-label="모집 준비 점검">
    <div className="recruitment-readiness-heading"><div><h3>모집 준비 점검</h3><p>저장된 설정을 한곳에서 확인합니다. 작성 중인 내용은 먼저 저장해 주세요.</p></div><AdminButton disabled={pending} onClick={() => void inspect()}>{pending ? '준비 상태 확인 중…' : checks ? '준비 상태 다시 점검' : '저장된 준비 상태 확인'}</AdminButton></div>
    {error && <p role="alert">{error}</p>}
    {pending && <p role="status">최신 저장 상태를 확인하고 있습니다.</p>}
    {checks && <>
      <p role="status">조회 시각 {checkedAt} KST · 설정을 바꾼 뒤에는 다시 점검하세요.</p>
      <ul className="recruitment-readiness-list">{checks.map(check => <li key={check.title}><div><strong>{check.title}</strong><span className="recruitment-readiness-state">{check.state}</span><p>{check.detail}</p></div>{check.destination && <AdminButton size="sm" onClick={() => onNavigate(check.destination!)} aria-label={`${check.title} 설정으로 이동`}>설정 보기</AdminButton>}</li>)}</ul>
      <p className="recruitment-readiness-note">일정 확정, 상세페이지 내용·버튼, 카톡방 공지 게시, SOLAPI 연결·기존 자동화·대기 작업, 실제 결제·전달 성공은 이 점검으로 확인하지 않습니다. 초안이 있어도 발송 준비 완료로 판단하지 않습니다.</p>
    </>}
  </section>;
}
