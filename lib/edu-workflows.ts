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
  metrics: ['date', 'campaign', 'spend', 'impressions', 'clicks', 'leads', 'revenue', 'livePeak', 'paymentDays', 'memo'],
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
    } else if (key === 'paymentDays') {
      if (!Array.isArray(value) || !value.length || value.length > 31) throw new Error('일차별 결제 건수를 1~31개 행으로 입력해 주세요.');
      const days = value.map(entry => {
        const row = entry as Record<string, unknown>;
        if (!row || typeof row !== 'object' || !Number.isSafeInteger(row.day) || Number(row.day) < 0 || Number(row.day) > 365 || !Number.isSafeInteger(row.count) || Number(row.count) < 0) throw new Error('결제 일차와 건수는 0 이상의 정수로 입력해 주세요.');
        return { day: Number(row.day), count: Number(row.count) };
      });
      if (new Set(days.map(row => row.day)).size !== days.length) throw new Error('같은 결제 일차를 중복 입력할 수 없습니다.');
      result[key] = days.toSorted((a, b) => a.day - b.day);
    } else if (['spend', 'impressions', 'clicks', 'leads', 'revenue', 'livePeak'].includes(key)) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('지표는 0 이상의 정수로 입력해 주세요.');
      result[key] = value;
    } else {
      const text = String(value || '').trim();
      if (text.length > (key === 'memo' ? 1000 : key === 'description' ? 500 : 200)) throw new Error('입력 내용이 너무 깁니다.');
      if (key === 'supportUrl' && text && !/^https:\/\/[^\s]+$/.test(text)) throw new Error('문의 주소는 https://로 입력해 주세요.');
      if (key === 'supportEmail' && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error('이메일을 확인해 주세요.');
      if (key === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || new Date(text).toISOString().slice(0, 10) !== text)) throw new Error('날짜를 확인해 주세요.');
      if (['campaign', 'title'].includes(key) && !text) throw new Error('이름을 입력해 주세요.');
      result[key] = text;
    }
  }
  return result;
}

export function validateMeasurementCode(input: Record<string, unknown>) {
  const name = String(input.name || '').trim();
  const location = String(input.location || 'head');
  const scope = String(input.scope || 'landing');
  const code = String(input.code || '').trim();
  const purpose = String(input.purpose || '').trim();
  if (!name || name.length > 100) throw new Error('코드 이름을 100자 이내로 입력해 주세요.');
  if (!['head', 'body-end'].includes(location)) throw new Error('코드 삽입 위치를 확인해 주세요.');
  if (!['landing', 'public'].includes(scope)) throw new Error('코드 적용 범위를 확인해 주세요.');
  if (!code || code.length > 20000) throw new Error('코드 원문을 20,000자 이내로 입력해 주세요.');
  if (!purpose || purpose.length > 300) throw new Error('등록 목적과 운영 책임자를 300자 이내로 입력해 주세요.');
  if (input.confirmed !== true) throw new Error('중복·개인정보·적용 권한 확인이 필요합니다.');
  return { name, location, scope, code, purpose, status: 'draft' };
}
