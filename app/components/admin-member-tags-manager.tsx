"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, Edit3, Plus, RefreshCw, Save, Tag, Trash2, Users, X } from "lucide-react";

type CustomerTag = { id:string; name:string; color:string; description:string|null; created_at:string };
type MemberTag = { member_id:string; tag_id:string };
type Data = { tags:CustomerTag[]; memberTags:MemberTag[]; totalMembers:number };
const empty:Data={tags:[],memberTags:[],totalMembers:0};
const blank={id:"",name:"",color:"#A10D12",description:""};

async function request(body?:Record<string,unknown>){const response=await fetch("/api/admin/member-tags",body?{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"});const result=await response.json().catch(()=>({})) as Data&{error?:string};if(!response.ok)throw new Error(result.error||"고객 태그 요청을 처리하지 못했습니다.");return result;}

export function AdminMemberTagsManager(){
  const [data,setData]=useState<Data>(empty);const [draft,setDraft]=useState({...blank});const [modalOpen,setModalOpen]=useState(false);const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [error,setError]=useState("");const [message,setMessage]=useState("");
  const load=async()=>{setError("");try{setData(await request());}catch(reason){setError(reason instanceof Error?reason.message:"고객 태그를 불러오지 못했습니다.");}finally{setLoading(false);}};
  useEffect(()=>{void Promise.resolve().then(load);},[]);
  const assignedMembers=useMemo(()=>new Set(data.memberTags.map((row)=>row.member_id)).size,[data.memberTags]);
  const closeModal=()=>{if(saving)return;setModalOpen(false);setDraft({...blank});};
  const openCreate=()=>{setDraft({...blank});setModalOpen(true);};
  const openEdit=(tag:CustomerTag)=>{setDraft({id:tag.id,name:tag.name,color:tag.color,description:tag.description||""});setModalOpen(true);};
  const save=async()=>{if(!draft.name.trim())return;setSaving(true);setError("");setMessage("");try{await request({action:"save",tagId:draft.id||undefined,name:draft.name,color:draft.color,description:draft.description});setMessage(draft.id?"고객 태그를 수정했습니다.":"고객 태그를 등록했습니다.");setModalOpen(false);setDraft({...blank});await load();}catch(reason){setError(reason instanceof Error?reason.message:"고객 태그를 저장하지 못했습니다.");}finally{setSaving(false);}};
  const remove=async(tag:CustomerTag)=>{if(!window.confirm(`‘${tag.name}’ 태그를 삭제할까요? 회원에게 지정된 태그도 함께 해제됩니다.`))return;setSaving(true);setError("");try{await request({action:"delete",tagId:tag.id});setMessage("고객 태그를 삭제했습니다.");if(draft.id===tag.id)setDraft({...blank});await load();}catch(reason){setError(reason instanceof Error?reason.message:"고객 태그를 삭제하지 못했습니다.");}finally{setSaving(false);}};
  if(loading)return <section className="admin-panel admin-loading-state"><RefreshCw className="spin"/><strong>고객 태그를 불러오는 중입니다.</strong></section>;
  return <div className="member-tags-page">
    <section className="member-tag-kpis"><article><Tag/><span>등록 태그<strong>{data.tags.length}개</strong><small>분류 기준</small></span></article><article><Users/><span>태그 분류 회원<strong>{assignedMembers}명</strong><small>전체 {data.totalMembers}명</small></span></article><article><Users/><span>미분류 회원<strong>{Math.max(0,data.totalMembers-assignedMembers)}명</strong><small>태그 지정 필요</small></span></article></section>
    <div className="member-tags-layout"><section className="admin-panel member-tag-catalog"><header><div><h2>태그 목록</h2><p>사용 인원을 확인하고 회원 목록으로 바로 이동합니다.</p></div><button className="admin-primary" onClick={openCreate}><Plus/>새 태그</button></header><div className="member-tag-catalog-head"><span>태그</span><span>분류 기준</span><span>사용 회원</span><span>관리</span></div>{data.tags.map((tag)=>{const count=data.memberTags.filter((row)=>row.tag_id===tag.id).length;return <article key={tag.id}><div><i style={{background:tag.color}}/><strong>{tag.name}</strong></div><p>{tag.description||"분류 기준 미입력"}</p><Link href={`/admin/members?tag=${tag.id}`}>{count}명 보기</Link><div><button onClick={()=>openEdit(tag)} aria-label={`${tag.name} 수정`}><Edit3/></button><button className="danger" onClick={()=>void remove(tag)} aria-label={`${tag.name} 삭제`}><Trash2/></button></div></article>;})}{!data.tags.length&&<div className="member-tag-empty"><Tag/><span><strong>등록된 태그가 없습니다.</strong><small>첫 태그를 등록하면 회원 관리와 CRM에서 사용할 수 있습니다.</small></span></div>}</section></div>
    {modalOpen&&<div className="member-tag-modal-backdrop" onMouseDown={closeModal}><section className="admin-panel member-tag-create member-tag-modal" role="dialog" aria-modal="true" aria-labelledby="member-tag-modal-title" onMouseDown={(event)=>event.stopPropagation()}><header><button className="member-tag-modal-close" onClick={closeModal} aria-label="닫기"><X/></button><span>{draft.id?"태그 수정":"새 태그 등록"}</span><strong id="member-tag-modal-title">분류 기준을 명확하게 기록하세요.</strong><p>누가 이 태그에 포함되는지 운영자가 같은 기준으로 판단할 수 있어야 합니다.</p></header><label>태그 색상<input type="color" value={draft.color} onChange={(event)=>setDraft({...draft,color:event.target.value})}/></label><label>태그 이름<input autoFocus value={draft.name} onChange={(event)=>setDraft({...draft,name:event.target.value})} placeholder="예: 무료강의 참여" maxLength={40}/></label><label>분류 기준·활용 목적<textarea value={draft.description} onChange={(event)=>setDraft({...draft,description:event.target.value})} placeholder="예: 무료강의 2강 이상 시청한 회원 · 후속 유료 클래스 안내에 사용" maxLength={200}/></label><div><button className="admin-outline" onClick={closeModal} disabled={saving}>취소</button><button className="admin-primary" onClick={()=>void save()} disabled={saving||!draft.name.trim()}><Save/>{draft.id?"수정 저장":"태그 등록"}</button></div></section></div>}
    {message&&<p className="admin-save-success"><Check/>{message}</p>}{error&&<p className="admin-save-error" role="alert">{error}</p>}
  </div>;
}
