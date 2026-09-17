import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = 'supabase/migrations/20260917012048_include_meta_dimensions_in_dashboard_filter_options.sql';
const sql = fs.readFileSync(path, 'utf8');

test('dashboard filter options union web and current Meta dimensions', () => {
  assert.match(sql, /meta_source as materialized/i);
  assert.match(sql, /m\.meta_campaign_id=any\(c\.meta_campaign_ids\)/i);
  assert.match(sql, /join selected c on c\.uses_ads=true/i);
  assert.match(sql, /select campaign value from sessions[\s\S]+union select value from meta_campaign_options/i);
  assert.match(sql, /select ad_type value from sessions[\s\S]+union select ad_type from meta_source/i);
  assert.match(sql, /select adset value from sessions[\s\S]+union select value from meta_adset_options/i);
  assert.match(sql, /select creative value from sessions[\s\S]+union select value from meta_creative_options/i);
});

test('Meta aliases resolve once per stable id while web-only options stay web-only', () => {
  assert.match(sql, /distinct on\(meta_campaign_id\)/i);
  assert.match(sql, /distinct on\(meta_adset_id\)/i);
  assert.match(sql, /distinct on\(meta_ad_id\)/i);
  assert.match(sql, /'devices'[\s\S]+select distinct device value from sessions/i);
  assert.match(sql, /'layouts'[\s\S]+select distinct layout_ver value from sessions/i);
  assert.doesNotMatch(sql, /select .*device.* from meta_source/i);
});

test('dashboard function remains service-role only and security invoker', () => {
  assert.match(sql, /security invoker/i);
  assert.match(sql, /revoke all on function public\.edu_marketing_dashboard[\s\S]+from public,anon,authenticated/i);
  assert.match(sql, /grant execute on function public\.edu_marketing_dashboard[\s\S]+to service_role/i);
  assert.doesNotMatch(sql, /drop table|truncate|delete from/i);
});
