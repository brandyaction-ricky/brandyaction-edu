import type { MissionIdentity } from '../api/contracts';

export type MissionAccess = Pick<MissionIdentity, 'userId' | 'courseId'> & {
  enrollmentId: string;
  active: boolean;
};

export interface MissionAccessRepository {
  findActiveEnrollment(userId: string, enrollmentId: string): Promise<MissionAccess | null>;
  lessonBelongsToCourse(lessonId: string, courseId: string): Promise<boolean>;
}
