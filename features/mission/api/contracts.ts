import type { Row } from '@/lib/platform';

export type MissionData = Record<string, Row[]>;
export type MissionSend = (body: Record<string, unknown>, success?: string) => Promise<Record<string, unknown>>;

export type MissionIdentity = {
  userId: string;
  courseId: string;
  lessonId: string;
  missionId: string;
};

export type MissionSubmissionCommand = Pick<MissionIdentity, 'lessonId' | 'missionId'> & {
  enrollmentId: string;
  missionVersion: string;
  draft: boolean;
  content: string;
  url: string;
  formAnswers: Record<string, string>;
  checklist: string[];
};
