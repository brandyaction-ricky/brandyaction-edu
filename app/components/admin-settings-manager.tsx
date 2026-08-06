"use client";
import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { Check, Eye, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { BannerData, loadAdminBanner, saveAdminBanner } from "@/lib/admin-content";
import { defaultSiteSettings, loadSiteSettings, saveSiteSetting, SiteSettingsBundle } from "@/lib/site-settings";

type SettingTab = "basic" | "banner" | "navigation" | "commerce" | "policies" | "operators";

const tabs: Array<{ id: SettingTab; label: string }> = [
  { id: "basic", label: "기본 정보" },
  { id: "banner", label: "메인 배너" },
  { id: "navigation", label: "메뉴·페이지" },
  { id: "commerce", label: "결제·환불" },
  { id: "policies", label: "약관·정책" },
  { id: "operators", label: "운영자 권한" },
];

export function AdminSettingsManager() {
  const [tab, setTab] = useState<SettingTab>("basic");
  const [settings, setSettings] = useState<SiteSettingsBundle>(defaultSiteSettings);
  const [banner, setBanner] = useState<BannerData>({ eyebrow: "BRANDYACTION EDU · LIVE", title: "감이 아닌 데이터로\n매출 구조를 만드세요.", copy: "4주 실전 클래스", link: "/classes" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([loadSiteSettings(), loadAdminBanner()]).then(([siteSettings, bannerData]) => {
      if (!active) return;
      setSettings(siteSettings);
      setBanner(bannerData);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "사이트 설정을 불러오지 못했습니다."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const markSaved = () => {
    setSaved(true);
    window.dispatchEvent(new Event("brandyaction:settings-updated"));
    window.setTimeout(() => setSaved(false), 1800);
  };
  const saveCurrent = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (tab === "banner") {
        await saveAdminBanner(banner);
        setBanner(await loadAdminBanner());
      } else if (tab === "basic") await saveSiteSetting("site_basic", settings.basic, true);
      else if (tab === "navigation") await saveSiteSetting("site_navigation", settings.navigation, true);
      else if (tab === "commerce") await saveSiteSetting("payment_refund", settings.commerce, false);
      else if (tab === "policies") await saveSiteSetting("site_policies", settings.policies, true);
      else await saveSiteSetting("operator_preferences", settings.operators, false);
      markSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };
  const uploadBanner = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) { setError("배너 이미지는 5MB 이하만 등록할 수 있습니다."); return; }
    setBanner((value) => ({ ...value, image: URL.createObjectURL(file), imageFile: file }));
    event.target.value = "";
  };

  if (loading) return <section className="admin-panel admin-loading-state"><strong>사이트 설정을 불러오는 중입니다.</strong></section>;

  return <div className="settings-layout functional-settings"><aside>{tabs.map((item) => <button key={item.id} onClick={() => { setTab(item.id); setError(""); }} className={tab === item.id ? "active" : ""}>{item.label}</button>)}</aside><div className="settings-workspace">
    {tab === "basic" && <section className="admin-panel settings-form"><div className="form-card-head"><div><h2>사이트 기본 정보</h2><p>저장한 사이트 정보는 고객 헤더와 공통 푸터에 반영됩니다.</p></div><span className="completion-chip"><Check/> 공개 설정</span></div><label>사이트명<input value={settings.basic.siteName} onChange={(event) => setSettings({ ...settings, basic: { ...settings.basic, siteName: event.target.value } })}/></label><label>사이트 설명<textarea value={settings.basic.description} onChange={(event) => setSettings({ ...settings, basic: { ...settings.basic, description: event.target.value } })}/></label><div className="form-two"><label>대표 이메일<input type="email" value={settings.basic.supportEmail} onChange={(event) => setSettings({ ...settings, basic: { ...settings.basic, supportEmail: event.target.value } })}/></label><label>고객센터 연락처<input value={settings.basic.supportPhone} onChange={(event) => setSettings({ ...settings, basic: { ...settings.basic, supportPhone: event.target.value } })}/></label></div><div className="form-two"><label>헤더 CTA 문구<input value={settings.basic.ctaLabel} onChange={(event) => setSettings({ ...settings, basic: { ...settings.basic, ctaLabel: event.target.value } })}/></label><label>헤더 CTA 링크<input value={settings.basic.ctaHref} onChange={(event) => setSettings({ ...settings, basic: { ...settings.basic, ctaHref: event.target.value } })}/></label></div><div className="settings-section-divider"><strong>푸터 사업자 정보</strong><span>전자상거래 화면에 노출할 법인 정보를 관리합니다.</span></div><div className="form-two"><label>상호<input value={settings.basic.companyName} onChange={(event) => setSettings({ ...settings, basic: { ...settings.basic, companyName: event.target.value } })}/></label><label>대표자<input value={settings.basic.representatives} onChange={(event) => setSettings({ ...settings, basic: { ...settings.basic, representatives: event.target.value } })}/></label></div><div className="form-two"><label>사업자등록번호<input value={settings.basic.businessNumber} onChange={(event) => setSettings({ ...settings, basic: { ...settings.basic, businessNumber: event.target.value } })}/></label><label>통신판매업 신고번호<input value={settings.basic.mailOrderNumber} onChange={(event) => setSettings({ ...settings, basic: { ...settings.basic, mailOrderNumber: event.target.value } })} placeholder="신고 후 입력"/></label></div><label>사업장 주소<input value={settings.basic.businessAddress} onChange={(event) => setSettings({ ...settings, basic: { ...settings.basic, businessAddress: event.target.value } })}/></label></section>}

    {tab === "banner" && <section className="admin-panel banner-editor"><div className="form-card-head"><div><h2>메인 랜딩 배너</h2><p>홈 첫 화면 배너 이미지와 연결 문구를 수정합니다.</p></div><span className="status-label success">DB 연결</span></div><div className={`banner-admin-preview ${banner.image ? "has-upload" : ""}`} style={banner.image ? { backgroundImage: `linear-gradient(90deg,rgba(17,17,17,.88),rgba(17,17,17,.15)),url(${banner.image})` } : undefined}><div><span>{banner.eyebrow}</span><strong>{banner.title}</strong><small>{banner.copy}</small></div>{!banner.image && <b>01</b>}</div><div className="banner-form-grid"><label className="banner-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadBanner}/><Upload/><strong>{banner.image ? "배너 이미지 변경" : "배너 이미지 업로드"}</strong><span>JPG, PNG, WEBP · 5MB 이하</span></label><div className="admin-field-grid"><label>상단 문구<input value={banner.eyebrow} onChange={(event) => setBanner({ ...banner, eyebrow: event.target.value })}/></label><label>보조 문구<input value={banner.copy} onChange={(event) => setBanner({ ...banner, copy: event.target.value })}/></label><label className="field-full">메인 문구<textarea value={banner.title} onChange={(event) => setBanner({ ...banner, title: event.target.value })}/></label><label className="field-full">연결 URL<input value={banner.link} onChange={(event) => setBanner({ ...banner, link: event.target.value })}/></label></div></div><div className="banner-actions">{banner.image && <button className="admin-outline" onClick={() => setBanner({ ...banner, image: undefined, imageFile: undefined })}><X/> 이미지 삭제</button>}<Link className="admin-outline" href="/"><Eye/> 고객 화면 보기</Link></div></section>}

    {tab === "navigation" && <section className="admin-panel settings-form"><div className="form-card-head"><div><h2>헤더 메뉴·페이지</h2><p>활성화한 메뉴만 고객 사이트의 PC·모바일 헤더에 노출됩니다.</p></div><button className="admin-outline" onClick={() => setSettings({ ...settings, navigation: [...settings.navigation, { id: `menu-${Date.now()}`, label: "새 메뉴", href: "/", enabled: true }] })}><Plus/> 메뉴 추가</button></div><div className="site-menu-editor"><div className="site-menu-head"><span>노출</span><span>메뉴명</span><span>연결 경로</span><span/></div>{settings.navigation.map((item, index) => <div className="site-menu-row" key={item.id}><label className="setting-switch"><input type="checkbox" checked={item.enabled} onChange={(event) => setSettings({ ...settings, navigation: settings.navigation.map((menu) => menu.id === item.id ? { ...menu, enabled: event.target.checked } : menu) })}/><span/></label><input value={item.label} onChange={(event) => setSettings({ ...settings, navigation: settings.navigation.map((menu) => menu.id === item.id ? { ...menu, label: event.target.value } : menu) })}/><input value={item.href} onChange={(event) => setSettings({ ...settings, navigation: settings.navigation.map((menu) => menu.id === item.id ? { ...menu, href: event.target.value } : menu) })}/><button onClick={() => setSettings({ ...settings, navigation: settings.navigation.filter((_, itemIndex) => itemIndex !== index) })}><Trash2/></button></div>)}</div></section>}

    {tab === "commerce" && <section className="admin-panel settings-form"><div className="form-card-head"><div><h2>결제·환불 운영 정보</h2><p>PG사와 환불 접수·무통장 입금 안내에 사용할 정보를 관리합니다.</p></div><span className="completion-chip"><Check/> 관리자 전용</span></div><div className="form-two"><label>결제 대행사<input value={settings.commerce.provider} onChange={(event) => setSettings({ ...settings, commerce: { ...settings.commerce, provider: event.target.value } })}/></label><label>환불 접수 이메일<input type="email" value={settings.commerce.refundContact} onChange={(event) => setSettings({ ...settings, commerce: { ...settings.commerce, refundContact: event.target.value } })}/></label></div><label>기본 환불 안내<input value={settings.commerce.refundWindow} onChange={(event) => setSettings({ ...settings, commerce: { ...settings.commerce, refundWindow: event.target.value } })}/></label><div className="form-three"><label>은행명<input value={settings.commerce.bankName} onChange={(event) => setSettings({ ...settings, commerce: { ...settings.commerce, bankName: event.target.value } })}/></label><label>계좌번호<input value={settings.commerce.accountNumber} onChange={(event) => setSettings({ ...settings, commerce: { ...settings.commerce, accountNumber: event.target.value } })}/></label><label>예금주<input value={settings.commerce.accountHolder} onChange={(event) => setSettings({ ...settings, commerce: { ...settings.commerce, accountHolder: event.target.value } })}/></label></div></section>}

    {tab === "policies" && <section className="admin-panel settings-form policy-settings"><div className="form-card-head"><div><h2>약관·정책 원문</h2><p>고객 결제 화면과 푸터 정책 페이지에서 사용하는 문서입니다.</p></div><span className="completion-chip"><Check/> 공개 설정</span></div><p className="settings-notice">국내 온라인 강의 판매 기준의 초안을 넣었습니다. 실제 PG 계약, 통신판매업 신고번호, 개인정보 국외 이전 내역이 확정되면 최종 검토해 주세요.</p><label>이용약관<textarea value={settings.policies.terms} onChange={(event) => setSettings({ ...settings, policies: { ...settings.policies, terms: event.target.value } })} placeholder="이용약관 전문을 입력하세요."/></label><label>개인정보처리방침<textarea value={settings.policies.privacy} onChange={(event) => setSettings({ ...settings, policies: { ...settings.policies, privacy: event.target.value } })} placeholder="개인정보처리방침 전문을 입력하세요."/></label><label>환불정책<textarea value={settings.policies.refund} onChange={(event) => setSettings({ ...settings, policies: { ...settings.policies, refund: event.target.value } })} placeholder="상품 환불정책 전문을 입력하세요."/></label></section>}

    {tab === "operators" && <section className="admin-panel settings-form"><div className="form-card-head"><div><h2>스태프 운영 범위</h2><p>스태프 화면에 적용할 운영 범위와 알림 수신처를 저장합니다.</p></div><span className="completion-chip"><Check/> 관리자 전용</span></div><div className="operator-permission-list"><label><input type="checkbox" checked={settings.operators.staffCanManageProducts} onChange={(event) => setSettings({ ...settings, operators: { ...settings.operators, staffCanManageProducts: event.target.checked } })}/><span><strong>상품·커리큘럼 관리</strong><small>상품 기본정보, 이미지 상세페이지, 강의 콘텐츠 수정</small></span></label><label><input type="checkbox" checked={settings.operators.staffCanManageOrders} onChange={(event) => setSettings({ ...settings, operators: { ...settings.operators, staffCanManageOrders: event.target.checked } })}/><span><strong>주문·환불 관리</strong><small>주문 조회와 환불 접수 처리</small></span></label><label><input type="checkbox" checked={settings.operators.staffCanManageMembers} onChange={(event) => setSettings({ ...settings, operators: { ...settings.operators, staffCanManageMembers: event.target.checked } })}/><span><strong>회원 관리</strong><small>회원 정보와 수강권 조회</small></span></label></div><div className="form-two"><label>신규 주문 알림 이메일<input type="email" value={settings.operators.notifyOrderEmail} onChange={(event) => setSettings({ ...settings, operators: { ...settings.operators, notifyOrderEmail: event.target.value } })}/></label><label>환불 요청 알림 이메일<input type="email" value={settings.operators.notifyRefundEmail} onChange={(event) => setSettings({ ...settings, operators: { ...settings.operators, notifyRefundEmail: event.target.value } })}/></label></div><p className="settings-notice">계정의 admin·staff 역할 자체는 회원 관리에서 부여하며, 이 화면은 역할별 운영 범위를 설정합니다.</p></section>}

    <div className="settings-savebar"><span>{tabs.find((item) => item.id === tab)?.label} 변경사항을 저장합니다.</span><button className="admin-primary" onClick={saveCurrent} disabled={saving}><Save/> {saving ? "저장 중..." : "설정 저장"}</button></div>
    {error && <p className="admin-save-error" role="alert">{error}</p>}
    <div className={`admin-toast ${saved ? "show" : ""}`}><Check/> 사이트 설정이 저장되었습니다.</div>
  </div></div>;
}
