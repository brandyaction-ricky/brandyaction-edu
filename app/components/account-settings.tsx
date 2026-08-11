"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Save, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isValidPassword, normalizePhone, PASSWORD_REQUIREMENT } from "@/lib/auth-validation";

export function AccountSettings({ email, initialName, initialPhone }: { email: string; initialName: string; initialPhone: string }) {
  const router = useRouter();
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
    const { error } = user.user ? await supabase.from("profiles").update({ full_name: name.trim() || null, phone: normalizePhone(phone) || null }).eq("id", user.user.id) : { error: new Error("로그인이 필요합니다.") };
    setMessage(error ? "회원 정보를 저장하지 못했습니다." : "회원 정보가 저장되었습니다."); setPending(false);
  };
  const updatePassword = async (event: FormEvent) => {
    event.preventDefault(); setMessage("");
    if (!isValidPassword(password)) { setMessage(PASSWORD_REQUIREMENT); return; }
    if (password !== confirm) { setMessage("새 비밀번호가 서로 일치하지 않습니다."); return; }
    setPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage("비밀번호를 변경하지 못했습니다. 재설정 링크가 만료됐을 수 있습니다.");
    } else {
      await supabase.auth.signOut({ scope: "global" });
      router.replace("/login?notice=password_changed");
      router.refresh();
      return;
    }
    setPending(false);
  };
  return <div className="account-settings"><div className="app-page-heading"><div><span>ACCOUNT</span><h1>계정 설정</h1></div></div><form onSubmit={saveProfile}><div className="settings-card-title"><UserRound/><div><h2>회원 정보</h2><p>결제와 수강 안내에 사용하는 정보입니다.</p></div></div><label>이메일<input value={email} disabled/></label><label>이름<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name"/></label><label>휴대폰 번호<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" autoComplete="tel"/></label><button type="submit" disabled={pending}><Save/> 회원 정보 저장</button></form><form onSubmit={updatePassword}><div className="settings-card-title"><LockKeyhole/><div><h2>비밀번호 변경</h2><p>영문과 숫자를 포함한 8자 이상의 비밀번호를 사용해 주세요.</p></div></div><label>새 비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,}" title={PASSWORD_REQUIREMENT} autoComplete="new-password" required/></label><label>새 비밀번호 확인<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} minLength={8} autoComplete="new-password" required/></label><button type="submit" disabled={pending}><LockKeyhole/> 비밀번호 변경</button></form>{message && <p className="account-message" role="status">{message}</p>}</div>;
}
