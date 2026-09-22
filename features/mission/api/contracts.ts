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
