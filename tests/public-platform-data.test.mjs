import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { buildSync } from 'esbuild';
const catalogModule = { exports: {} };
new Function('module', 'exports', buildSync({ entryPoints: ['lib/course-catalog.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text)(catalogModule, catalogModule.exports);

function harness(fixtures = {}) {
  const calls = [];
  const db = {
    from(table) {
      const call = { table, columns: '', filters: [], limit: null, range: null };
      calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return this; },
        eq(key, value) { call.filters.push([key, value]); return this; },
        neq(key, value) { call.filters.push([key, value]); return this; },
        is(key, value) { call.filters.push([key, value]); return this; },
        in(key, value) { call.filters.push([key, value]); return this; },
        or(value) { call.filters.push(['or', value]); return this; },
        gt(key, value) { call.filters.push([key, value]); return this; },
        ilike(key, value) { call.filters.push([key, value]); return this; },
        order() { return this; },
        limit(value) { call.limit = value; return this; },
        range(start, end) { call.range = [start, end]; return this; },
        then(resolve) { const all = fixtures[table] || []; const data = call.range ? all.slice(call.range[0], call.range[1] + 1) : all; return Promise.resolve({ data, count: all.length, error: null }).then(resolve); },
      };
      return query;
    },
  };
  const source = fs.readFileSync(new URL('../lib/public-platform-data.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => {
    if (name === 'next/cache') return { unstable_cache: (fn, _key, options) => { calls.cache = options; return fn; } };
    if (name === '@supabase/supabase-js') return { createClient: () => db };
    if (name === '@/lib/supabase/admin') return { createAdminClient: () => db };
    if (name === '@/lib/supabase/config') return { getSupabasePublicConfig: () => ({ publicUrl: 'https://db.example', publishableKey: 'public-test' }) };
    if (name === '@/lib/qa-rules') return { imagePreviewUrl: value => value };
    if (name === '@/lib/product-metadata') return { productMetadataFields: ['detail_html', 'cta_url'], productResources: () => [], productDigitalSections: () => [] };
    if (name === '@/lib/public-platform-plan') return { PUBLIC_CACHE_SECONDS: 30, PUBLIC_CACHE_TAG: 'edu-public-content', PUBLIC_PAGE_SIZE: 12 };
    if (name === '@/lib/course-catalog') return catalogModule.exports;
    throw Error(name);
  });
  return { read: exports.readPublicPlatformDataUncached, calls, cache: calls.cache };
}

test('home and customer stories never fetch whole course metadata or personal tables', async () => {
  const home = harness({ courses: [{ id: 'course', title: '수업', thumb: 'site/thumb.png', product_type: 'digital' }] });
  const result = await home.read('home', '', '', 1, '', '');
  assert.deepEqual(home.calls.map(call => call.table), ['site_settings', 'articles', 'courses', 'articles', 'review_videos', 'site_banners', 'cohorts']);
  assert.ok(home.calls[2].columns.includes('metadata->>thumbnailUrl'));
  assert.equal(home.calls[2].columns.includes(',metadata,'), false);
  assert.deepEqual(result.data.courses[0].metadata, { thumbnailUrl: 'site/thumb.png', productType: 'digital' });
  assert.equal(home.cache.revalidate, 30);
  assert.deepEqual(home.cache.tags, ['edu-public-content']);
  const stories = harness({ review_videos: [{ id: 'story' }] });
  await stories.read('stories', '', '', 1, '', '');
  assert.deepEqual(stories.calls.map(call => call.table), ['site_settings', 'articles', 'review_videos', 'courses']);
});

test('public lists are 12-row server pages and omit heavy body fields', async () => {
  const classes = harness();
  const classResult = await classes.read('classes', '', '', 3, '실행', '유료 클래스');
  assert.deepEqual(classes.calls.map(call => call.table), ['site_settings', 'articles', 'courses']);
  assert.deepEqual(classes.calls[2].range, [0, 499]);
  assert.ok(classes.calls[2].filters.some(([key, value]) => key === 'or' && value.includes('metadata->is_listed.neq.false')));
  assert.deepEqual(classResult.pagination, { page: 3, pageSize: 12, total: 0 });
  const articles = harness();
  await articles.read('articles', '', '', 2, '', '');
  assert.deepEqual(articles.calls.map(call => call.table), ['site_settings', 'articles', 'articles', 'article_categories']);
  assert.deepEqual(articles.calls[2].range, [12, 23]);
  assert.equal(articles.calls[2].columns.includes('content_blocks'), false);
});

test('catalog pages rank available courses before expired ones and keep global counts during search', async () => {
  const courses = Array.from({ length: 13 }, (_, index) => ({ id: `c${index}`, title: `수업 ${index}`, list_price: index === 12 ? 0 : 10000 }));
  const cohorts = courses.map((c, index) => ({ id: `g${index}`, course_id: c.id, status: 'recruiting', recruitment_end_at: index === 12 ? '2099-01-01T00:00:00Z' : '2020-01-01T00:00:00Z' }));
  const h = harness({ courses, cohorts });
  const first = await h.read('classes', '', '', 1, '', '');
  assert.equal(first.data.courses.length, 12);
  assert.equal(first.data.courses[0].id, 'c12');
  const last = await h.read('classes', '', '', 2, '', '');
  assert.deepEqual(last.data.courses.map(c => c.id), ['c11']);
  const searched = await h.read('classes', '', '', 1, '수업 12', '무료 클래스');
  assert.equal(searched.pagination.total, 1);
  assert.deepEqual(searched.data.catalog_counts, [{ id: 'catalog', free: 1, paid: 12, digital: 0 }]);
  assert.ok(h.calls.filter(c => c.table === 'cohorts').every(c => c.columns.includes('operation_start_at')));
});

test('home checks only banner target products and keeps unlisted targets out of shared response data', async () => {
  const home = harness({
    courses: [{ id: 'hidden', slug: 'hidden', listed: false }],
    site_banners: [{ id: 'banner', link_url: '/classes/hidden?src=organic' }],
  });
  const result = await home.read('home', '', '', 1, '', '');
  const targetRead = home.calls.find(call => call.table === 'courses' && call.filters.some(([key]) => key === 'slug'));
  assert.deepEqual(targetRead?.filters.find(([key]) => key === 'slug')?.[1], ['hidden']);
  assert.deepEqual(result.unlistedBannerCourses, [{ id: 'hidden', slug: 'hidden', metadata: { is_listed: false } }]);
  assert.equal(JSON.stringify(result.data.site_banners).includes('is_listed'), false);
});

test('class detail reads only selected course and redacts private resource paths before sharing', async () => {
  const detail = harness({ courses: [{ id: 'course', slug: 'one', list_price: 10000, private_token: 'top-secret', metadata: { detail_html: '<p>소개</p>', private_note: 'secret', product_resources: [{ id: 'r', path: 'private/file.pdf' }], digital_content_sections: [{ items: [{ videoUrl: 'https://private.example' }] }] } }] });
  const result = await detail.read('class', 'one', '', 1, '', '');
  assert.deepEqual(detail.calls.map(call => call.table), ['site_settings', 'articles', 'courses', 'cohorts', 'curriculum_weeks', 'reviews']);
  assert.ok(detail.calls[2].filters.some(([key, value]) => key === 'slug' && value === 'one'));
  assert.equal(result.data.courses[0].metadata.detail_html, '<p>소개</p>');
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(JSON.stringify(result).includes('private/file.pdf'), false);
  assert.equal(JSON.stringify(result).includes('https://private.example'), false);
});

test('class detail accepts existing UUID-based product links without requesting unrelated rows', async () => {
  const id = '7bd94b59-7c31-45eb-9b04-1592a608e20d';
  const detail = harness({ courses: [{ id, slug: 'published-product', list_price: 10000, metadata: {} }] });
  await detail.read('class', id, '', 1, '', '');
  assert.ok(detail.calls[2].filters.some(([key, value]) => key === 'id' && value === id));
  assert.equal(detail.calls[2].limit, 1);
});


test('disabled articles are absent from public lists, home and direct article reads', async () => {
 for(const view of ['home','articles','article']){
  const h=harness({site_settings:[{key:'edu_article_banner',value:{enabled:false,articlesEnabled:false,videos:[{url:'https://private.example/video'}]}}],articles:[{id:'article',slug:'one',title:'Hidden'}]});
  const result=await h.read(view,'one','',1,'','');
  assert.deepEqual(result.data.articles,[]);
  assert.equal(result.data.article_banner[0].value.articlesEnabled,false);
  assert.equal(JSON.stringify(result).includes('https://private.example/video'),false);
 }
});

test('all public offer reads exclude archived cohorts before cards, details and checkout',async()=>{
  for(const view of ['home','classes','class','checkout']) {
    const fixture=harness({courses:[{id:'course',slug:'course'}],cohorts:[{id:'cohort',course_id:'course'}]});
    await fixture.read(view,'course','cohort',1,'','');
    const reads=fixture.calls.filter(call=>call.table==='cohorts');
    assert.ok(reads.length>0,view);
    assert.ok(reads.every(call=>call.filters.some(([key,value])=>key==='archived_at'&&value===null)),view);
  }
});

test('home omits broken product banners but retains valid product and external links',async()=>{
 const fixture=harness({courses:[{id:'course',slug:'available'}],site_banners:[{id:'valid',link_url:'/classes/available'},{id:'broken',link_url:'https://brandyaction-edu.com/classes/deleted'},{id:'external',link_url:'https://other.example/classes/external'},{id:'list',link_url:'/classes'}]});
 const result=await fixture.read('home','','',1,'','');
 assert.deepEqual(result.data.site_banners.map(x=>x.id),['valid','external','list']);
 const read=fixture.calls.find(x=>x.table==='courses'&&x.filters.some(([key])=>key==='slug'));
 assert.ok(read.filters.some(([key,value])=>key==='status'&&value==='published'));
 assert.ok(read.filters.some(([key,value])=>key==='archived_at'&&value===null));
});
