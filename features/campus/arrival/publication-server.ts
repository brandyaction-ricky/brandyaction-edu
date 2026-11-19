import {createAdminClient} from '@/lib/supabase/admin';
import {fail, slugPattern, uuid} from '../webinar/domain';
import {readWebinar} from '../webinar/server';
import {validateArrivalConfig, type ArrivalConfig} from './config';
import {type ArrivalPublicationStatus, type readArrivalPublicationRequest} from './publication';

const publicationKey = 'edu_campus_moonshot_arrival_publication_v1';
type ArrivalPublication = ArrivalPublicationStatus & {config: ArrivalConfig};

export function arrivalPublicationStatus(publication: ArrivalPublicationStatus | null) {
  if (!publication) return null;
  const {slug, sourceRevision, revision, publishedAt} = publication;
  return {slug, sourceRevision, revision, publishedAt};
}

export async function readPublishedArrival(): Promise<ArrivalPublication | null> {
  const {data, error} = await createAdminClient().from('site_settings').select('value')
    .eq('key', publicationKey).eq('is_public', false)
    .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const {slug, sourceRevision, revision, publishedAt, config} = data.value ?? {};
  if (typeof slug !== 'string' || !slugPattern.test(slug) || !uuid(sourceRevision) || !uuid(revision)
    || typeof publishedAt !== 'string' || !Number.isFinite(Date.parse(publishedAt))) {
    throw new Error('Invalid Moonshot arrival publication');
  }
  return {slug, sourceRevision, revision, publishedAt, config: validateArrivalConfig(config)};
}

export async function publishArrival(input: ReturnType<typeof readArrivalPublicationRequest>, operatorId: string) {
  const {slug, sourceRevision, expectedPublicationRevision} = input;
  const [draft, current] = await Promise.all([readWebinar(slug), readPublishedArrival()]);
  if (!draft?.arrival) fail('먼저 모집 설정을 저장해 주세요.', 404);
  if (draft.revision !== sourceRevision) fail('저장된 설정이 바뀌었어요. 최신 설정을 미리 본 뒤 다시 공개해 주세요.', 409);
  if (current?.slug === slug && current.sourceRevision === sourceRevision) return arrivalPublicationStatus(current);
  if ((current?.revision ?? null) !== expectedPublicationRevision) {
    fail('다른 운영자가 먼저 공개했어요. 현재 공개 상태를 확인한 뒤 다시 시도해 주세요.', 409);
  }

  const publication: ArrivalPublication = {
    slug,
    sourceRevision,
    revision: crypto.randomUUID(),
    publishedAt: new Date().toISOString(),
    config: draft.arrival,
  };
  const settings = createAdminClient().from('site_settings');
  const row = {value: publication, is_public: false, updated_by: operatorId, updated_at: publication.publishedAt};
  const write = expectedPublicationRevision === null
    ? settings.insert({key: publicationKey, ...row})
    : settings.update(row).eq('key', publicationKey).eq('is_public', false)
      .eq('value->>revision', expectedPublicationRevision);
  const {data, error} = await write.select('key').abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if (error && error.code !== '23505') throw error;
  if (!data) fail('공개 상태가 바뀌었어요. 목록을 새로고침한 뒤 다시 시도해 주세요.', 409);
  return arrivalPublicationStatus(publication);
}
