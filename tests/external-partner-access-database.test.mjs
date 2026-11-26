import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const load = path => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(load('integration/campus/dev-migrations/manifest.json'));
const id = number => 'f04c2026-1126-4000-8000-' + String(number).padStart(12, '0');

test('external partners can privately participate in the assigned campus without gaining student enrollment', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const execute = async path => {
    try { await db.exec(load(path)); } catch (cause) { throw new Error(path + ": " + cause.message); }
  };
  await execute('tests/fixtures/campus-dev-transactional-substrate.sql');
  await db.exec('create publication supabase_realtime');
  const campusMigrations = [
    ...manifest.migrations.map(migration => migration.path),
    ...[
      '20261103012334_edu_campus_office_dispatch_outbox.sql',
      '20261103060120_edu_campus_original_avatar_appearance.sql',
      '20261105013100_campus_personal_bot_office.sql',
      '20261107004756_edu_campus_office_registered_reports.sql',
      '20261107115635_edu_campus_student_office_connections.sql',
      '20261109073438_office_directory_paged_jobs.sql',
      '20261109080655_campus_office_inbox_signals.sql',
      '20261114200000_campus_community_landing_ad_kinds.sql',
      '20261114220000_campus_community_conflict_code.sql',
      '20261115100000_campus_conflict_code_everywhere.sql',
      '20261115130000_campus_space_member_once.sql',
      '20261115140000_campus_space_state_rpc.sql',
      '20261115150000_campus_community_read_once.sql',
    ].map(file => 'supabase/migrations/' + file),
  ].sort();
  for (const path of campusMigrations) await execute(path);

  const [admin, partner, student, other, course, cohort, otherCohort, enrollment, week, early, final, draft] =
    Array.from({ length: 12 }, (_, index) => id(index + 1));
  await db.exec(`
    insert into auth.users(id,email) values ${[admin, partner, student, other].map((user, index) => `('${user}','partner-qa-${index}@example.invalid')`).join(',')};
    insert into public.profiles(id,email,role)
      select id,email,case when id='${admin}' then 'admin' else 'student' end from auth.users
      on conflict (id) do update set role=excluded.role;
    insert into public.courses(id,course_code,slug,title,status) values('${course}','partner-qa','partner-qa','Partner QA','published');
    insert into public.cohorts(id,course_id,cohort_code,name,price,status)
      values('${cohort}','${course}','assigned','Assigned campus',0,'in_progress'),
            ('${otherCohort}','${course}','other','Other campus',0,'in_progress');
    insert into public.enrollments(id,user_id,course_id,cohort_id,status,source)
      values('${enrollment}','${student}','${course}','${cohort}','active','admin_grant');
    insert into public.curriculum_weeks(id,course_id,week_number,title,is_published)
      values('${week}','${course}',1,'Published week',true);
    insert into public.curriculum_lessons(id,week_id,day_number,title,content_type,is_published)
      values('${early}','${week}',1,'First lesson','material',true),
            ('${final}','${week}',2,'Last lesson','material',true),
            ('${draft}','${week}',3,'Unpublished draft','material',false);
  `);

  await execute('supabase/migrations/20261126045547_edu_external_partner_access.sql');
  await execute('supabase/migrations/20261126050010_edu_external_partner_campus.sql');
  const scalar = async (sql, params) => Object.values((await db.query(sql, params)).rows[0] || {})[0];
  const signIn = async user => {
    await db.exec('reset role; set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  };
  const grant = 'select public.edu_set_external_partner_access($1,null,$2,$3,$4,now()+interval \'1 day\')';
  await db.exec('set role service_role');
  assert.equal(await scalar(
    "select id from public.enrollments(jsonb_populate_record(null::edu_campus_business_cases, jsonb_build_object('enrollment_id',$1::uuid)))",
    [enrollment],
  ), enrollment);
  await assert.rejects(db.query(grant, [student, partner, course, cohort]), /PARTNER_ADMIN_REQUIRED/);
  const access = await scalar(grant, [admin, partner, course, cohort]);
  await assert.rejects(db.query(grant, [admin, partner, course, cohort]), /PARTNER_GRANT_EXISTS/);
  assert.equal(await scalar('select id from edu_external_partner_scopes($1)', [partner]), access);
  await assert.rejects(db.query(grant, [admin, partner, id(80), cohort]), /PARTNER_COHORT_UNAVAILABLE/);
  await assert.rejects(db.query(
    "select edu_set_external_partner_access($1,null,$2,$3,$4,now()-interval '1 second')", [admin, partner, course, cohort],
  ), /PARTNER_EXPIRY_INVALID/);

  await signIn(partner);
  assert.equal(await scalar('select count(*)::int from enrollments where user_id=$1', [partner]), 0);
  await assert.rejects(db.query('select * from edu_external_partner_access'), /permission denied/);
  await assert.rejects(db.query('select * from edu_external_partner_scopes($1)', [partner]), /permission denied/);
  assert.equal(await scalar('select id from edu_my_external_partner_scopes($1)', [access]), access);
  assert.equal(await scalar('select edu_campus_space_member($1)', [cohort]), true);
  const session = id(53);
  await db.query(`insert into edu_campus_space_presence(cohort_id,user_id,session_id,nickname,gender,coat,status)
    values($1,$2,$3,'QA partner','female','#abcdef','working')`, [cohort, partner, session]);
  await scalar("select edu_campus_space_claim_seat($1,$2,'desk-1')", [cohort, session]);
  await db.query(`insert into edu_campus_space_chat(id,cohort_id,user_id,session_id,body)
    values($1,$2,$3,$4,'Fictional study room message')`, [id(54), cohort, partner, session]);
  const room = await scalar('select edu_campus_space_state($1)', [cohort]);
  assert.equal(room.own.user_id, partner);
  assert.equal(room.seats[0].seat_id, 'desk-1');
  assert.equal(room.messages[0].nickname, 'QA partner');
  assert.equal(await scalar('select edu_campus_space_member($1)', [otherCohort]), false);
  assert.equal(await scalar('select edu_campus_office_access($1)', [access]), true);
  assert.equal(await scalar('select edu_campus_office_access($1)', [enrollment]), false);
  assert.equal(await scalar('select edu_campus_lesson_version($1,$2) is not null', [access, early]), true);
  assert.equal(await scalar('select edu_campus_lesson_version($1,$2) is not null', [access, final]), true);
  assert.equal(await scalar('select edu_campus_lesson_version($1,$2) is null', [access, draft]), true);
  const office = { requestId: id(50), enrollmentId: access, action: 'create', objective: 'Only a fabricated QA goal', materialUrls: [], outputType: 'plan' };
  const community = { requestId: id(51), enrollmentId: access, action: 'create', kind: 'landing', title: 'Fabricated QA post',
    body: 'QA post body', alias: 'QA only', url: '', imageUrls: [], visibility: 'cohort' };
  await scalar('select edu_campus_office_mutate($1::jsonb)', [JSON.stringify(office)]);
  await scalar('select edu_campus_community_mutate($1::jsonb)', [JSON.stringify(community)]);
  await scalar('select edu_campus_community_mutate($1::jsonb)', [
    JSON.stringify({ ...community, requestId: id(55), visibility: 'private' }),
  ]);
  assert.equal(await scalar('select count(*)::int from edu_campus_posts'), 2);
  assert.equal(await scalar('select count(*)::int from edu_campus_office_jobs'), 1);

  await signIn(student);
  assert.equal(await scalar('select edu_campus_office_access($1)', [enrollment]), true);
  assert.equal(await scalar('select count(*)::int from edu_campus_office_jobs'), 0);
  assert.equal(await scalar('select count(*)::int from edu_campus_posts'), 1);
  assert.equal((await scalar('select edu_campus_space_state($1)', [cohort])).messages.length, 1);
  await signIn(other);
  assert.equal(await scalar('select count(*)::int from edu_my_external_partner_scopes($1)', [access]), 0);
  await assert.rejects(db.query('select edu_campus_space_state($1)', [cohort]), /Membership required/);
  assert.equal(await scalar('select edu_campus_office_access($1)', [access]), false);
  assert.equal(await scalar('select count(*)::int from edu_campus_posts'), 0);

  await db.exec('reset role; set role service_role');
  await scalar('select edu_set_external_partner_access($1,$2,$3,null,null,null)', [admin, access, partner]);
  assert.equal(await scalar('select count(*)::int from edu_external_partner_scopes($1)', [partner]), 0);
  await signIn(partner);
  assert.equal(await scalar('select edu_campus_office_access($1)', [access]), false);
  assert.equal(await scalar('select edu_campus_space_member($1)', [cohort]), false);
  await assert.rejects(db.query('select edu_campus_space_state($1)', [cohort]), /Membership required/);
  assert.equal(await scalar('select edu_campus_lesson_version($1,$2) is null', [access, final]), true);
  assert.equal(await scalar('select count(*)::int from edu_campus_posts'), 0);
  await assert.rejects(db.query('select edu_campus_office_mutate($1::jsonb)', [JSON.stringify({ ...office, requestId: id(52) })]), /scope/);
  await db.exec('reset role');
  assert.equal(await scalar('select count(*)::int from enrollments'), 1);
  assert.equal(await scalar('select count(*)::int from edu_campus_participants where enrollment_id=$1', [enrollment]), 1);
  assert.equal(await scalar('select count(*)::int from edu_campus_office_jobs where owner_id=$1', [partner]), 1);
});
