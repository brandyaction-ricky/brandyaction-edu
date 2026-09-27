import { createAdminClient } from "@/lib/supabase/admin";

export const SMS_SETTINGS_KEY = "edu_crm_sms_settings";
const digits = (value: unknown) => String(value || "").replace(/\D/g, "");

function allowed(raw: string | undefined, first: string | undefined, prefix: string) {
  return [...new Set([first, ...(raw || "").split(",")].map(digits)
    .filter((number) => number.startsWith(prefix) && number.length >= 9 && number.length <= 12))];
}

export function registeredSmsNumbers() {
  return {
    senders: allowed(process.env.SOLAPI_ALLOWED_SENDER_PHONES, process.env.SOLAPI_SENDER_PHONE, "0"),
    optouts: allowed(process.env.SOLAPI_ALLOWED_OPTOUT_PHONES, process.env.SOLAPI_OPTOUT_PHONE, "080"),
  };
}

export type SmsSettings = {
  senderPhone: string;
  optoutPhone: string;
  senderName: string;
  transactionalEnabled: boolean;
  marketingEnabled: boolean;
};

export function validateSmsSettings(value: unknown): SmsSettings {
  const config = value as Partial<SmsSettings> | null;
  const options = registeredSmsNumbers();
  const senderPhone = digits(config?.senderPhone);
  const optoutPhone = digits(config?.optoutPhone);
  const senderName = String(config?.senderName || "").trim();
  if (!options.senders.includes(senderPhone)) throw new Error("SOLAPI에 등록된 발신번호만 선택할 수 있습니다.");
  if (optoutPhone && !options.optouts.includes(optoutPhone)) throw new Error("등록된 080 무료수신거부 번호만 선택할 수 있습니다.");
  if (!senderName || senderName.length > 40 || /[\r\n<>]/.test(senderName))
    throw new Error("발신자명을 40자 이내 한 줄로 입력해 주세요.");
  if (typeof config?.transactionalEnabled !== "boolean" || typeof config?.marketingEnabled !== "boolean")
    throw new Error("문자 발송 스위치를 확인해 주세요.");
  if (config.marketingEnabled && !optoutPhone)
    throw new Error("광고 문자를 켜려면 등록된 080 무료수신거부 번호가 필요합니다.");
  return { senderPhone, optoutPhone, senderName,
    transactionalEnabled: config.transactionalEnabled, marketingEnabled: config.marketingEnabled };
}

export async function loadSmsSettings(): Promise<SmsSettings> {
  const options = registeredSmsNumbers();
  const fallback: SmsSettings = {
    senderPhone: options.senders[0] || "",
    optoutPhone: options.optouts[0] || "",
    senderName: "브랜디액션",
    transactionalEnabled: true,
    marketingEnabled: false,
  };
  const result = await createAdminClient().from("site_settings")
    .select("value").eq("key", SMS_SETTINGS_KEY).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return fallback;
  try { return validateSmsSettings(result.data.value); }
  catch { return { ...fallback, transactionalEnabled: false, marketingEnabled: false }; }
}

export function marketingAllowedNow(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23",
  }).format(date));
  return hour >= 8 && hour < 21;
}

export function nextMarketingWindow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const [year, month, day] = [part("year"), part("month"), part("day")];
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23",
  }).format(date));
  const next = new Date(Date.UTC(year, month - 1, hour < 8 ? day - 1 : day, 23));
  return next.toISOString();
}

export function marketingText(content: string, senderName: string, optoutPhone: string) {
  if (!/^080\d{7,9}$/.test(optoutPhone)) throw new Error("등록된 080 무료수신거부 번호가 필요합니다.");
  return `(광고) ${senderName}\n${content}\n무료수신거부 ${optoutPhone}`;
}
