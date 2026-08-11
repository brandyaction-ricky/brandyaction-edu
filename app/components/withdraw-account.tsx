"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function WithdrawAccount() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const withdraw = async () => {
    if (confirmation !== "회원탈퇴") { setMessage("확인란에 회원탈퇴를 정확히 입력해 주세요."); return; }
    if (!window.confirm("수강권이 즉시 회수되며 되돌릴 수 없습니다. 정말 탈퇴할까요?")) return;
    setPending(true); setMessage("");
    const response = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
    const result = await response.json() as { error?: string };
    if (!response.ok && response.status !== 202) { setMessage(result.error || "회원 탈퇴를 처리하지 못했습니다."); setPending(false); return; }
    await createClient().auth.signOut({ scope: "global" });
    router.replace("/login?notice=withdrawn"); router.refresh();
  };
  return <section className="account-danger-zone"><div className="settings-card-title"><Trash2/><div><h2>회원 탈퇴</h2><p>로그인과 수강 접근이 즉시 차단됩니다. 법정 보존 대상이 아닌 회원정보는 삭제 또는 익명화됩니다.</p></div></div><label>확인을 위해 회원탈퇴 입력<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off"/></label><button type="button" onClick={withdraw} disabled={pending || confirmation !== "회원탈퇴"}><Trash2/> {pending ? "처리 중..." : "회원 탈퇴"}</button>{message && <p role="alert">{message}</p>}</section>;
}
