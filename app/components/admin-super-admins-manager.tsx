"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react";

type SuperAdmin = { id: string; email: string; full_name: string | null; phone: string | null; status: string; created_at: string };

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({})) as { error?: string; admins?: SuperAdmin[]; currentUserId?: string };
  if (!response.ok) throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body;
}

export function AdminSuperAdminsManager() {
  const [admins, setAdmins] = useState<SuperAdmin[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = async () => {
    setError("");
    const data = await request("/api/admin/super-admins", { cache: "no-store" });
    setAdmins(data.admins || []);
    setCurrentUserId(data.currentUserId || "");
    setLoading(false);
  };
  useEffect(() => { void Promise.resolve().then(load).catch((reason) => { setError(reason instanceof Error ? reason.message : "목록을 불러오지 못했습니다."); setLoading(false); }); }, []);
  const add = async () => {
    if (saving || !email.trim()) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await request("/api/admin/super-admins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      setEmail(""); setMessage("최고 관리자를 등록했습니다."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "등록하지 못했습니다."); } finally { setSaving(false); }
  };
  const remove = async (admin: SuperAdmin) => {
    if (!window.confirm(`${admin.full_name || admin.email}님의 최고 관리자 권한을 해제하고 스태프로 변경할까요?`)) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await request(`/api/admin/super-admins?userId=${encodeURIComponent(admin.id)}`, { method: "DELETE" });
      setMessage("최고 관리자 권한을 해제했습니다."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "권한을 해제하지 못했습니다."); } finally { setSaving(false); }
  };
  if (loading) return <section className="admin-panel admin-loading-state"><RefreshCw className="spin"/><strong>최고 관리자 목록을 불러오는 중입니다.</strong></section>;
  return <div className="super-admin-management">
    <section className="admin-panel super-admin-register"><div><span><UserPlus/></span><div><h2>최고 관리자 등록</h2><p>먼저 사이트에 가입한 회원의 이메일을 입력하세요. 등록 즉시 모든 운영 권한이 부여됩니다.</p></div></div><div><input type="email" value={email} onChange={(event)=>setEmail(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter")void add()}} placeholder="member@example.com"/><button className="admin-primary" onClick={()=>void add()} disabled={saving||!email.trim()}><ShieldCheck/>{saving?"처리 중":"최고 관리자 등록"}</button></div></section>
    <section className="admin-panel super-admin-list"><header><div><h2>등록된 최고 관리자</h2><p>최고 관리자는 상품·회원·결제·사이트 설정 전체에 접근할 수 있습니다.</p></div><strong>{admins.length}명</strong></header>{admins.map((admin)=><article key={admin.id}><span className="super-admin-avatar">{(admin.full_name||admin.email)[0]}</span><div><strong>{admin.full_name||"이름 미입력"}{admin.id===currentUserId&&<em>현재 계정</em>}</strong><small>{admin.email}</small><small>{admin.phone||"휴대폰 미입력"}</small></div><span className={admin.status==="active"?"status-label success":"status-label"}>{admin.status==="active"?"활성":"비활성"}</span><time>{new Intl.DateTimeFormat("ko-KR").format(new Date(admin.created_at))} 가입</time><button className="admin-outline danger" onClick={()=>void remove(admin)} disabled={saving||admin.id===currentUserId}><Trash2/>{admin.id===currentUserId?"본인 해제 불가":"권한 해제"}</button></article>)}</section>
    {message&&<p className="admin-save-success"><Check/>{message}</p>}{error&&<p className="admin-save-error" role="alert">{error}</p>}
  </div>;
}
