"use client";

import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { defaultPolicies, POLICY_VERSION } from "@/lib/legal-policies";
import { safePublicHref } from "@/lib/safe-url";

export type SiteMenuItem = { id: string; label: string; href: string; enabled: boolean };
export type SiteBasicSettings = {
  siteName: string;
  description: string;
  supportEmail: string;
  supportPhone: string;
  ctaLabel: string;
  ctaHref: string;
  companyName: string;
  representatives: string;
  businessNumber: string;
  mailOrderNumber: string;
  businessAddress: string;
};
export type CommerceSettings = { provider: string; refundContact: string; refundWindow: string; bankName: string; accountNumber: string; accountHolder: string };
export type PolicySettings = { version?: string; terms: string; privacy: string; refund: string };
export type OperatorSettings = { staffCanManageProducts: boolean; staffCanManageOrders: boolean; staffCanManageMembers: boolean; notifyOrderEmail: string; notifyRefundEmail: string };
export type SiteSettingsBundle = { basic: SiteBasicSettings; navigation: SiteMenuItem[]; commerce: CommerceSettings; policies: PolicySettings; operators: OperatorSettings };

export const defaultSiteSettings: SiteSettingsBundle = {
  basic: {
    siteName: "브랜디액션 에듀",
    description: "사람과 사업의 가능성을 실행으로 바꾸는 실전 교육 플랫폼",
    supportEmail: "edu@brandyaction.co.kr",
    supportPhone: "070-7736-3744",
    ctaLabel: "클래스 신청하기",
    ctaHref: "/classes",
    companyName: "주식회사 브랜디액션",
    representatives: "전태헌, 안정호",
    businessNumber: "677-87-02769",
    mailOrderNumber: "",
    businessAddress: "충청남도 천안시 서북구 천안천4길 32 506호",
  },
  navigation: [
    { id: "classes", label: "클래스", href: "/classes", enabled: true },
    { id: "articles", label: "아티클", href: "/articles", enabled: true },
    { id: "philosophy", label: "교육 철학", href: "/#philosophy", enabled: true },
    { id: "reviews", label: "후기", href: "/#reviews", enabled: true },
  ],
  commerce: {
    provider: "토스페이먼츠",
    refundContact: "edu@brandyaction.co.kr",
    refundWindow: "전체 교육상품 이용률 50% 미만 시 불만족 전액 환불",
    bankName: "",
    accountNumber: "",
    accountHolder: "",
  },
  policies: { version: POLICY_VERSION, ...defaultPolicies },
  operators: {
    staffCanManageProducts: true,
    staffCanManageOrders: true,
    staffCanManageMembers: false,
    notifyOrderEmail: "edu@brandyaction.co.kr",
    notifyRefundEmail: "edu@brandyaction.co.kr",
  },
};

function objectValue<T>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...fallback, ...(value as Partial<T>) } : fallback;
}

function menuValue(value: unknown) {
  if (!Array.isArray(value)) return defaultSiteSettings.navigation;
  return value.filter((item): item is SiteMenuItem => Boolean(item && typeof item === "object" && "label" in item && "href" in item)).map((item, index) => ({
    id: String(item.id || `menu-${index}`),
    label: String(item.label || "메뉴"),
    href: safePublicHref(item.href),
    enabled: item.enabled !== false,
  }));
}

function policyValue(value: unknown): PolicySettings {
  const candidate = objectValue(value, defaultSiteSettings.policies);
  if (candidate.version !== POLICY_VERSION) return defaultSiteSettings.policies;
  return {
    terms: candidate.terms.trim() || defaultPolicies.terms,
    privacy: candidate.privacy.trim() || defaultPolicies.privacy,
    refund: candidate.refund.trim() || defaultPolicies.refund,
  };
}

export async function loadSiteSettings(): Promise<SiteSettingsBundle> {
  if (!hasSupabaseEnv()) return defaultSiteSettings;
  const supabase = createClient();
  const { data, error } = await supabase.from("site_settings").select("key,value").in("key", ["site_basic", "site_navigation", "payment_refund", "site_policies", "operator_preferences", "site_name", "support_email"]);
  if (error) throw new Error(error.message || "사이트 설정을 불러오지 못했습니다.");
  const values = new Map((data || []).map((row) => [row.key, row.value]));
  const basic = objectValue(values.get("site_basic"), defaultSiteSettings.basic);
  if (!values.has("site_basic")) {
    if (typeof values.get("site_name") === "string") basic.siteName = String(values.get("site_name"));
    if (typeof values.get("support_email") === "string") basic.supportEmail = String(values.get("support_email"));
  }
  return {
    basic,
    navigation: menuValue(values.get("site_navigation")),
    commerce: objectValue(values.get("payment_refund"), defaultSiteSettings.commerce),
    policies: policyValue(values.get("site_policies")),
    operators: objectValue(values.get("operator_preferences"), defaultSiteSettings.operators),
  };
}

export async function saveSiteSetting(key: "site_basic" | "site_navigation" | "payment_refund" | "site_policies" | "operator_preferences", value: unknown, isPublic: boolean) {
  const supabase = createClient();
  const safeValue = key === "site_navigation" ? menuValue(value) : key === "site_basic" ? { ...(value as SiteBasicSettings), ctaHref: safePublicHref((value as SiteBasicSettings).ctaHref, "/classes") } : key === "site_policies" ? { ...(value as PolicySettings), version: POLICY_VERSION } : value;
  const { error } = await supabase.from("site_settings").upsert({ key, value: safeValue, is_public: isPublic }, { onConflict: "key" });
  if (error) throw new Error(error.message || "사이트 설정을 저장하지 못했습니다.");
  if (key === "site_basic") {
    const basic = safeValue as SiteBasicSettings;
    const { error: legacyError } = await supabase.from("site_settings").upsert([
      { key: "site_name", value: basic.siteName, is_public: true },
      { key: "support_email", value: basic.supportEmail, is_public: true },
    ], { onConflict: "key" });
    if (legacyError) throw new Error(legacyError.message || "기본 설정 호환값을 저장하지 못했습니다.");
  }
}

export async function loadPublicHeaderSettings() {
  const settings = await loadSiteSettings();
  return { basic: { ...settings.basic, ctaHref: safePublicHref(settings.basic.ctaHref, "/classes") }, navigation: settings.navigation.filter((item) => item.enabled).map((item) => ({ ...item, href: safePublicHref(item.href) })) };
}
