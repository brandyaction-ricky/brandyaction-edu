"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { BookOpen, ChartNoAxesColumn, CheckSquare2, Code2, CreditCard, FileText, GraduationCap, LayoutDashboard, LogOut, Menu, Search, Settings, Target, Users, X } from "lucide-react";

export type AdminNavGroup = { label:string; items:Array<{id:string;label:string;href:string}> };
const icons:Record<string, typeof Users> = { dashboard:LayoutDashboard, members:Users, groups:Users, participants:ChartNoAxesColumn, products:BookOpen, "digital-products":FileText, content:BookOpen, cohorts:GraduationCap, missions:Target, quizzes:CheckSquare2, submissions:CheckSquare2, orders:CreditCard, analytics:ChartNoAxesColumn, journey:ChartNoAxesColumn, settings:Settings, "code-settings":Code2, seo:Search };

export function AdminNavigation({groups,active}:{groups:AdminNavGroup[];active:string}) {
  const [query,setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const filtered = groups.map(group=>({...group,items:group.items.filter(item=>`${group.label} ${item.label}`.includes(query.trim()))})).filter(group=>group.items.length);
  const close = () => dialog.current?.close();
  const navigation = <><Link href="/admin" className="ba-wordmark ba-admin-wordmark"><b>b</b>brandyaction <small>EDU</small></Link><div className="ba-admin-workspace">교육 운영 워크스페이스</div><label className="ba-admin-search"><Search aria-hidden="true"/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} aria-label="관리자 메뉴 검색" placeholder="메뉴 찾기"/></label><nav aria-label="관리자 메뉴">{filtered.map(group=><section key={group.label} className="admin-nav-group"><span>{group.label}</span>{group.items.map(item=>{const Icon=icons[item.id]||FileText;return <Link key={item.id} href={item.href} prefetch={false} className={item.id===active?"active":""} aria-current={item.id===active?"page":undefined}><Icon aria-hidden="true"/>{item.label}</Link>})}</section>)}{!filtered.length && <p className="ba-admin-nav-empty" role="status">일치하는 메뉴가 없습니다.</p>}</nav><Link className="view-site" href="/"><LogOut aria-hidden="true"/>고객 사이트 보기</Link></>;
  return <><aside className="admin-sidebar">{navigation}</aside><button className="ba-admin-menu-trigger" type="button" onClick={()=>dialog.current?.showModal()} aria-label="관리자 메뉴 열기"><Menu/></button><dialog className="ba-admin-menu" ref={dialog} aria-label="관리자 메뉴"><header><strong>메뉴</strong><button onClick={close} aria-label="관리자 메뉴 닫기"><X/></button></header><div onClick={event=>{if(event.target instanceof Element && event.target.closest("a")) close();}}>{navigation}</div></dialog></>;
}
