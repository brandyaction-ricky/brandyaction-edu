export type ConversationKind = 'message' | 'question' | 'answer';
export type ConversationCursor = { at: string; kind: ConversationKind; id: string };
export type ConversationItem = { canDelete?: boolean; id: string; kind: ConversationKind; at: string; title: string; content: string; author: string; direction: 'incoming' | 'outgoing'; readAt: string | null; question: string | null; archived: boolean };
export type MemberConversationResult = { rows: ConversationItem[]; nextCursor: ConversationCursor | null };
export function parseConversationCursor(value: string | null): ConversationCursor | null {
  if (value === null) return null;
  try {
    if (value.length > 180) throw Error();
    const row = JSON.parse(value);
    if (!row || Array.isArray(row) || Object.keys(row).sort().join(',') !== 'at,id,kind' ||
      !['message', 'question', 'answer'].includes(row.kind) || typeof row.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) ||
      typeof row.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(row.at) || !Number.isFinite(Date.parse(row.at))) throw Error();
    return row;
  } catch { throw Error('기록 조회 위치를 확인해 주세요.'); }
}
