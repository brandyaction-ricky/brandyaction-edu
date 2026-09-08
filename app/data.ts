export type Session = { title: string; output: string; date: string; description: string };
export type CurriculumLesson = {
  id: string;
  day: number;
  title: string;
  description: string;
  kind: "VOD" | "자료" | "텍스트" | "링크";
  duration: string;
  contentUrl?: string;
  resourceName?: string;
  resourceUrl?: string;
  resourcePath?: string;
  bodyText?: string;
  accessMode?: "enrolled" | "member";
  isPublished?: boolean;
  mission?: {
    title: string;
    instructions: string;
    required: boolean;
    submissionType: "text" | "link" | "mixed" | "quiz";
    isPublished: boolean;
    quiz?: import("@/lib/mission-quiz").QuizDefinition;
  };
};
export type CurriculumWeek = {
  id: string;
  label: string;
  title: string;
  goal: string;
  isPublished?: boolean;
  lessons: CurriculumLesson[];
};
export type ClassItem = {
  slug: string; cohortId?: string; title: string; summary: string; category: string; status: string;
  programType: "free" | "paid";
  statusTone: "red" | "blue" | "gray"; startDate: string; operationPeriod?: string; schedule: string;
  duration: string; price: string; seats: string; instructor: string; accent: string;
  applicationOpen: boolean;
  recruitmentEndAt?: string;
  capacity?: number | null;
  thumbnailUrl?: string;
  sessions: Session[];
  curriculum?: CurriculumWeek[];
};
