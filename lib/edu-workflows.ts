import type { Row } from './platform';

export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const latestSubmissions = (rows: Row[]) => [...rows.reduce((map, row) => {
  const key = `${row.enrollment_id}:${row.mission_id}`;
  if (!map.has(key) || Number(map.get(key)!.attempt_number) < Number(row.attempt_number)) map.set(key, row);
  return map;
}, new Map<string, Row>()).values()];

export function achievement(enrollmentId: string, missions: Row[], submissions: Row[]) {
  const required = new Set(missions.filter(m => m.is_required && m.is_published).map(m => m.id));
  const approved = latestSubmissions(submissions).filter(s => s.enrollment_id === enrollmentId && required.has(String(s.mission_id)) && s.status === 'approved').length;
  const percent = required.size ? Math.floor(approved * 100 / required.size) : null;
  return { approved, total: required.size, percent, level: percent === null ? null : percent === 100 ? 5 : percent >= 75 ? 4 : percent >= 50 ? 3 : percent >= 25 ? 2 : 1 };
}

export const settingFields = {
  seo: ['title', 'description', 'googleVerification', 'naverVerification'],
  settings: ['supportEmail', 'supportUrl', 'trackingEnabled'],
  metrics: ['date', 'campaign', 'spend', 'impressions', 'clicks', 'leads', 'revenue'],
} as const;

export function validateSetting(kind: string, input: Record<string, unknown>) {
  if (!(kind in settingFields)) throw new Error('설정 종류를 확인해 주세요.');
  const keys = settingFields[kind as keyof typeof settingFields];
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const value = input[key];
    if (key === 'trackingEnabled') {
      if (typeof value !== 'boolean') throw new Error('트래킹 설정을 확인해 주세요.');
      result[key] = value;
    } else if (['spend', 'impressions', 'clicks', 'leads', 'revenue'].includes(key)) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('지표는 0 이상의 정수로 입력해 주세요.');
      result[key] = value;
    } else {
      const text = String(value || '').trim();
      if (text.length > (key === 'description' ? 500 : 200)) throw new Error('입력 내용이 너무 깁니다.');
      if (key === 'supportUrl' && text && !/^https:\/\/[^\s]+$/.test(text)) throw new Error('문의 주소는 https://로 입력해 주세요.');
      if (key === 'supportEmail' && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error('이메일을 확인해 주세요.');
      if (key === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || new Date(text).toISOString().slice(0, 10) !== text)) throw new Error('날짜를 확인해 주세요.');
      if (['campaign', 'title'].includes(key) && !text) throw new Error('이름을 입력해 주세요.');
      result[key] = text;
    }
  }
  return result;
}
