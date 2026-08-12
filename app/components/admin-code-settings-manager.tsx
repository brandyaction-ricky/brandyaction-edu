"use client";

import { useEffect, useState } from "react";
import { Check, Code2, RefreshCw, Save, Search } from "lucide-react";
import { emptyCodeSettings, type CodeSettings } from "@/lib/code-settings-shared";

export function AdminCodeSettingsManager() {
  const [settings, setSettings] = useState<CodeSettings>(emptyCodeSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetch("/api/admin/code-settings", { cache: "no-store" }).then(async(response)=>{const body=await response.json();if(!response.ok)throw new Error(body.error);setSettings(body.settings||emptyCodeSettings)}).catch((reason)=>setError(reason instanceof Error?reason.message:"설정을 불러오지 못했습니다.")).finally(()=>setLoading(false)); }, []);
  const update = (key: keyof CodeSettings, value: string) => setSettings((current)=>({ ...current, [key]: value }));
  const save = async () => {
    if (saving) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const response=await fetch("/api/admin/code-settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||"저장하지 못했습니다.");
      setSaved(true); window.setTimeout(()=>setSaved(false),2000);
    } catch(reason){setError(reason instanceof Error?reason.message:"저장하지 못했습니다.")} finally{setSaving(false)}
  };
  if(loading)return <section className="admin-panel admin-loading-state"><RefreshCw className="spin"/><strong>검색·코드 설정을 불러오는 중입니다.</strong></section>;
  const fields:Array<{key:keyof CodeSettings;icon:typeof Search;title:string;description:string;placeholder:string}>=[
    {key:"metaCode",icon:Search,title:"메타 코드 (Meta Code)",description:"네이버·Google 웹마스터 도구의 사이트 소유확인용 meta 또는 link 태그를 입력합니다.",placeholder:'<meta name="naver-site-verification" content="..." />'},
    {key:"headerCode",icon:Code2,title:"헤더 코드 (Header Code)",description:"모든 페이지의 <head> 마지막에 삽입할 분석·광고 스크립트를 입력합니다.",placeholder:"<!-- Google Tag Manager, Meta Pixel 등 -->"},
    {key:"bodyCode",icon:Code2,title:"바디 코드 (Body Code)",description:"모든 페이지의 <body> 시작 지점에 삽입할 코드를 입력합니다.",placeholder:"<!-- Google Tag Manager (noscript) 등 -->"},
  ];
  return <div className="code-settings-page"><div className="code-settings-notice"><Code2/><div><strong>전체 사이트 공통 코드</strong><p>저장한 코드는 공개 페이지뿐 아니라 로그인·결제 화면에도 적용됩니다. API 키나 비밀값은 입력하지 마세요.</p></div><button className="admin-primary" onClick={()=>void save()} disabled={saving}><Save/>{saving?"저장 중":"전체 저장"}</button></div>{fields.map(({key,icon:Icon,title,description,placeholder})=><section className="admin-panel code-setting-card" key={key}><div><Icon/><h2>{title}</h2><p>{description}</p></div><label><span>CODE</span><textarea spellCheck={false} value={settings[key]} onChange={(event)=>update(key,event.target.value)} placeholder={placeholder}/><small>{settings[key].length.toLocaleString()} / 100,000자</small></label></section>)}{saved&&<p className="admin-save-success"><Check/>검색·코드 설정이 저장되어 전체 사이트에 반영됩니다.</p>}{error&&<p className="admin-save-error" role="alert">{error}</p>}</div>;
}
