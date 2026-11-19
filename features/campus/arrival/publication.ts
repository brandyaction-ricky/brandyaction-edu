import {fail, slugPattern, uuid} from '../webinar/domain';

export type ArrivalPublicationStatus = {
  slug: string;
  sourceRevision: string;
  revision: string;
  publishedAt: string;
};

export function readArrivalPublicationRequest(body: Record<string, unknown>) {
  const {slug, sourceRevision, expectedPublicationRevision} = body;
  if (
    Object.keys(body).length !== 3 ||
    typeof slug !== 'string' ||
    !slugPattern.test(slug) ||
    !uuid(sourceRevision) ||
    (expectedPublicationRevision !== null && !uuid(expectedPublicationRevision))
  ) {
    fail('공개할 모집 체험을 확인해 주세요.');
  }
  return {slug, sourceRevision, expectedPublicationRevision};
}
