"use client";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Users } from "lucide-react";
import { AdminDetailPanel } from "./admin-detail-panel";
import { useAdminUnsavedChanges } from "./use-admin-unsaved-changes";
type Group = { id: string; name: string; description: string; count: number };
type Member = { id: string; full_name: string | null; email: string };
const blank: Group = { id: "", name: "", description: "", count: 0 };
async function request(path = "", init?: RequestInit) { const response = await fetch(`/api/admin/groups${path}`, { cache: "no-store", ...init }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "그룹을 불러오지 못했습니다."); return result; }
export function AdminGroupsManager() {
  const [groups, setGroups] = useState<Group[]>([]); const [draft, setDraft] = useState<Group | null>(null);
  const [query, setQuery] = useState(""); const [memberQuery, setMemberQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([]); const [candidates, setCandidates] = useState<Member[]>([]);
  const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const changed = Boolean(draft && (!draft.id || groups.some((group) => group.id === draft.id && (group.name !== draft.name || group.description !== draft.description))));
  useAdminUnsavedChanges(changed);
  const load = async () => { try { const result = await request(); setGroups(result.groups); } catch (reason) { setError(reason instanceof Error ? reason.message : "그룹을 불러오지 못했습니다."); } finally { setLoading(false); } };
  useEffect(() => { void Promise.resolve().then(load); }, []);
  const groupId = draft?.id;
  useEffect(() => {
    let active = true;
    if (!groupId) return;
    request(`?group=${groupId}&page=${page}`).then((result) => { if (active) { setMembers(result.members); setTotal(result.total); } }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [groupId, page, refresh]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => { request(`?search=${encodeURIComponent(memberQuery)}`).then((result) => { if (active) setCandidates(result.members); }).catch((reason) => { if (active) setError(reason.message); }); }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [memberQuery]);
  const save = async () => {
    if (!draft || busy) return; setBusy(true); setError("");
    try { const result = await request("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }); await load(); setDraft({ ...draft, id: result.id }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); } finally { setBusy(false); }
  };
  const memberAction = async (id: string, action: "add" | "remove") => {
    if (!draft?.id || busy) return; setBusy(true); setError("");
    try { await request("", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId: draft.id, action, memberIds: [id] }) }); setRefresh((value) => value + 1); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "변경하지 못했습니다."); } finally { setBusy(false); }
  };
  const open = (group: Group) => { setDraft({ ...group }); setMembers([]); setCandidates([]); setMemberQuery(""); setPage(1); setTotal(0); setError(""); };
  const close = () => { if (!busy && (!changed || window.confirm("저장하지 않은 그룹 정보를 닫을까요?"))) setDraft(null); };
  const remove = async () => { if (!draft?.id || !window.confirm("이 그룹을 삭제할까요? 회원 계정과 수강 기록은 유지됩니다.")) return; setBusy(true); try { await request(`?id=${draft.id}`, { method: "DELETE" }); setDraft(null); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "삭제하지 못했습니다."); } finally { setBusy(false); } };
  const visible = groups.filter((group) => `${group.name} ${group.description}`.toLowerCase().includes(query.toLowerCase()));
  return <div><div className="workspace-filters"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="그룹 이름·설명 검색" aria-label="그룹 검색"/><span>{groups.length}개 그룹</span><button className="admin-primary" onClick={() => open(blank)}><Plus/>그룹 추가</button><button className="admin-outline" onClick={() => void load()} aria-label="그룹 새로고침"><RefreshCw/></button></div><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>회원 그룹</th><th>분류 목적</th><th>회원 수</th><th>관리</th></tr></thead><tbody>{visible.map((group) => <tr key={group.id}><td><strong>{group.name}</strong></td><td>{group.description || "—"}</td><td>{group.count}명</td><td><button className="admin-outline" onClick={() => open(group)}>상세·회원 관리</button></td></tr>)}{!visible.length && <tr><td colSpan={4} className="mission-empty">{loading ? "그룹을 불러오는 중입니다." : "등록된 그룹이 없습니다. 교육 운영 목적에 맞는 그룹을 만들어 보세요."}</td></tr>}</tbody></table></div>{error && !draft && <p className="admin-save-error" role="alert">{error}</p>}
    {draft && <AdminDetailPanel title={draft.id ? "회원 그룹 관리" : "회원 그룹 추가"} busy={busy} onClose={close}><section><label>그룹 이름<input value={draft.name} maxLength={80} disabled={busy} onChange={(e) => setDraft({ ...draft, name: e.target.value })}/></label><label>분류 목적<textarea value={draft.description} maxLength={1000} disabled={busy} onChange={(e) => setDraft({ ...draft, description: e.target.value })}/></label><button className="admin-primary" onClick={() => void save()} disabled={busy || !draft.name.trim()}>{busy ? "저장 중…" : "그룹 정보 저장"}</button></section>{draft.id && <><section><h3>회원 추가</h3><label>회원 이름·이메일<input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="2자 이상 입력"/></label>{candidates.map((member) => <div className="group-member-row" key={member.id}><span><strong>{member.full_name || "이름 미입력"}</strong><small>{member.email}</small></span><button className="admin-outline" disabled={busy || members.some((item) => item.id === member.id)} onClick={() => void memberAction(member.id, "add")}>{members.some((item) => item.id === member.id) ? "추가됨" : "추가"}</button></div>)}</section><section><h3><Users/> 그룹 회원 {total}명</h3>{members.map((member) => <div className="group-member-row" key={member.id}><span><strong>{member.full_name || "이름 미입력"}</strong><small>{member.email}</small></span><button className="admin-outline" disabled={busy} onClick={() => void memberAction(member.id, "remove")}>그룹에서 제외</button></div>)}{!total && <p className="studio-help">위 검색으로 기존 회원을 추가해 주세요.</p>}<div className="workspace-pagination"><span>{page} 페이지</span><div><button className="admin-outline" disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>이전</button><button className="admin-outline" disabled={busy || page * 50 >= total} onClick={() => setPage(page + 1)}>다음</button></div></div></section><button className="admin-outline" disabled={busy} onClick={() => void remove()}>그룹 삭제</button></>}{error && <p className="admin-save-error" role="alert">{error}</p>}</AdminDetailPanel>}
  </div>;
}
