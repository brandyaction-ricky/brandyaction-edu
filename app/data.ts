export type Session = { title: string; output: string; date: string; description: string };
export type CurriculumLesson = {
  id: string;
  day: number;
  title: string;
  description: string;
  kind: "VOD" | "자료";
  duration: string;
  contentUrl?: string;
  resourceName?: string;
  resourceUrl?: string;
  resourcePath?: string;
};
export type CurriculumWeek = {
  id: string;
  label: string;
  title: string;
  goal: string;
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
