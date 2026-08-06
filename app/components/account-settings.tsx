"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, Save, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AccountSettings({ email, initialName, initialPhone }: { email: string; initialName: string; initialPhone: string }) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setMessage("");
    const supabase = createClient();
    const { data: user } = await supabase.auth.getUser();
    const { error } = user.user ? await supabase.from("profiles").update({ full_name: name.trim() || null, phone: phone.replace(/[^0-9]/g, "") || null }).eq("id", user.user.id) : { error: new Error("로그인이 필요합니다.") };
    setMessage(error ? "회원 정보를 저장하지 못했습니다." : "회원 정보가 저장되었습니다."); setPending(false);
  };
  const updatePassword = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    if (password.length < 8 || password !== confirm) { setMessage("8자 이상의 같은 비밀번호를 두 번 입력해 주세요."); return; }
    setPending(true);
    const { error } = await createClient().auth.updateUser({ password });
    setMessage(error ? "비밀번호를 변경하지 못했습니다. 재설정 링크가 만료됐을 수 있습니다." : "비밀번호가 변경되었습니다.");
    if (!error) { setPassword(""); setConfirm(""); }
    setPending(false);
  };
  return <div className="account-settings"><div className="app-page-heading"><div><span>ACCOUNT</span><h1>계정 설정</h1></div></div><form onSubmit={saveProfile}><div className="settings-card-title"><UserRound/><div><h2>회원 정보</h2><p>결제와 수강 안내에 사용하는 정보입니다.</p></div></div><label>이메일<input value={email} disabled/></label><label>이름<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name"/></label><label>휴대폰 번호<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel"/></label><button disabled={pending}><Save/> 회원 정보 저장</button></form><form onSubmit={updatePassword}><div className="settings-card-title"><LockKeyhole/><div><h2>비밀번호 변경</h2><p>이메일 재설정 링크로 들어온 경우 여기서 새 비밀번호를 설정하세요.</p></div></div><label>새 비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password"/></label><label>새 비밀번호 확인<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={8} autoComplete="new-password"/></label><button disabled={pending}><LockKeyhole/> 비밀번호 변경</button></form>{message && <p className="account-message" role="status">{message}</p>}</div>;
}
