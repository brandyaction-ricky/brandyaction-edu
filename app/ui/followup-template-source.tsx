'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RecruitmentHelp } from './recruitment-help';
import { AdminButton } from '@/features/admin-ui';
import type { Row } from '@/lib/platform';

export function FollowupTemplateSource({ blocked, onApply }: { blocked: boolean; onApply: (value: Row) => void }) {
  const query=useSearchParams(),code=query.get('followup'),revision=Number(query.get('revision'));
  if(!code)return null;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)||!Number.isSafeInteger(revision)||revision<1)return <p role="alert">초안 연결 주소를 확인해 주세요.</p>;
  return <Source key={code+':'+revision} source={{code,revision}} blocked={blocked} onApply={onApply}/>;
}
function Source({source,blocked,onApply}:{source:{code:string;revision:number};blocked:boolean;onApply:(value:Row)=>void}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const blockedNow=useRef(blocked),active=useRef(true);
  useEffect(()=>{blockedNow.current=blocked;},[blocked]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const apply=async()=>{
    if(!source||blocked||busy)return;setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/conversion/followup?code='+encodeURIComponent(source.code),{cache:'no-store'});
      const report=await response.json();if(!response.ok)throw Error(report.error||'초안을 확인하지 못했습니다.');
      const draft=report.drafts?.find((item:{channel:string})=>item.channel==='direct');
      if(!draft||draft.revision!==source.revision)throw Error('원본 초안이 변경되었거나 접근할 수 없습니다. 모집 운영에서 최신 초안을 다시 확인하세요.');
      if(!active.current)return;
      if(blockedNow.current)throw Error('입력 중인 내용을 보존했습니다. 새로 등록으로 입력란을 비운 뒤 다시 불러오세요.');
      onApply({id:'',name:`${draft.purpose==='encore'?'앵콜 라이브':'유료 교육'} 안내 · 모집 초안 v${source.revision}`,content:draft.body,channel:'lms',purpose:'marketing',is_active:false,_followupVersion:source.revision,_followupKey:source.code+':'+source.revision});
      setMessage('저장된 초안을 아래 입력란에 불러왔습니다. 채널과 내용을 확인한 뒤 저장하세요.');
    }catch(e){if(active.current)setMessage((e as Error).message);}finally{if(active.current)setBusy(false);}
  };
  return <RecruitmentHelp title="모집 후속 안내로 템플릿 준비">
    <p>저장된 개별 안내 초안을 새 템플릿 입력란으로 가져옵니다. 템플릿은 마케팅 목적·사용 중지 상태로 준비됩니다.</p>
    <p>발송 대상과 예약은 가져오지 않습니다. 모집의 검토 후보와 기존 캠페인의 대상 태그는 별개입니다.</p>
    {source&&<p>원본 초안 버전 {source.revision}</p>}
    {<AdminButton disabled={blocked||busy} onClick={()=>void apply()}>{busy?'원본 확인 중':'저장된 개별 초안 불러오기'}</AdminButton>}
    {blocked&&<p>입력 중인 내용이 있습니다. 먼저 저장하거나 새로 등록으로 입력란을 비워 주세요.</p>}
    {message&&<p role="status">{message}</p>}
  </RecruitmentHelp>;
}
