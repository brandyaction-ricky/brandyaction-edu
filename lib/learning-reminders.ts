import { retentionDays } from './crm-retention';
import { uuid } from './edu-workflows';

export const defaultLearningReminderDays = 3;
export type LearningReminderKind = 'member_inactive' | 'learning_stalled';
export type LearningReminderChoice = {
  kind: LearningReminderKind;
  eligible: boolean;
  request: {
    id: string;
    days: number;
    requestedAt: string;
    dueAt: string;
    status: 'pending' | 'cancelled' | 'activity' | 'elapsed';
  } | null;
};
export type LearningReminders = {
  maskedPhone: string | null;
  courses: { enrollmentId: string; courseTitle: string; cohortName: string; choices: LearningReminderChoice[] }[];
};

export type LearningReminderAction =
  | { action: 'request'; requestId: string; enrollmentId: string; kind: LearningReminderKind; days: number }
  | { action: 'cancel'; requestId: string };

export function learningReminderAction(body: unknown): LearningReminderAction | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const data = body as Record<string, unknown>;
  if (!uuid(data.requestId)) return null;
  if (data.action === 'cancel' && Object.keys(data).length === 2) return { action: data.action, requestId: data.requestId };
  if (data.action !== 'request' || Object.keys(data).length !== 5 || !uuid(data.enrollmentId)
    || (data.kind !== 'member_inactive' && data.kind !== 'learning_stalled')
    || typeof data.days !== 'number' || !retentionDays(data.days)) return null;
  return { action: data.action, requestId: data.requestId, enrollmentId: data.enrollmentId, kind: data.kind, days: data.days };
}
