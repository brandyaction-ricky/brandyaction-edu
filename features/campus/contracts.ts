export type CampusMission = {
  id: string;
  title: string;
  version: string;
  required: boolean;
  status: 'not_started' | 'submitted' | 'approved' | 'changes_requested' | 'rejected' | 'unknown';
  href: string;
};
export type CampusScope = {
  enrollmentId: string;
  courseId: string;
  cohortId: string;
  courseTitle: string;
  cohortName: string;
};
export type CampusSnapshot = {
  schemaVersion: 1;
  fetchedAt: string;
  viewer: { id: string; displayName: string };
  scopes: CampusScope[];
  selectedEnrollmentId: string | null;
  lessons: {
    id: string;
    title: string;
    day: number;
    version: string;
    completed: boolean;
    href: string;
    missions: CampusMission[];
  }[];
  links: { classes: string; questions: string };
  // Peer feedback / launch eligibility needs a separate server rule, not fake XP.
  launchEligibility: null;
};
