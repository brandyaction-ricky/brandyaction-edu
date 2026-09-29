import { createHash } from 'node:crypto';
import { inspectCurriculumSnapshot } from './curriculum-transfer.mjs';

// Offline adapter for the curriculum-only export. It never executes source
// scripts, contacts media URLs, seeds a database, or imports learner records.
const TYPES = Object.freeze({
  heading: 'heading', subheading: 'subheading', text: 'text', video: 'video',
  audio: 'audio', image: 'image', question: 'question', divider: 'divider', link: 'link',
  calculator: 'recipe-calculator', margin_calculator: 'margin-calculator',
  funnel_builder: 'marketing-funnel', prompt: 'prompt',
  prompt_generator: 'prompt-generator', persona_generator: 'persona-generator',
  quiz: 'quiz', landing_funnel: 'landing-planner',
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (path, why) => { throw new Error(`Invalid Replit export: ${path}: ${why}`); };
function record(value, fields, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected object');
  if (Object.keys(value).some(key => !fields.includes(key))) fail(path, 'unmapped fields; review before import');
}
function list(value, path, max = 1000) {
  if (!Array.isArray(value) || value.length > max) fail(path, 'expected bounded array');
  return value;
}
function text(value, path) {
  if (typeof value !== 'string' || value.length > 2_000_000) fail(path, 'expected bounded text');
}
function number(value, path, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail(path, 'expected integer');
}
function bool(value, path) { if (typeof value !== 'boolean') fail(path, 'expected boolean'); }
function identifier(value, path) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)) fail(path, 'invalid identifier');
}
function date(value, path) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) fail(path, 'expected ISO date');
}
function uniqueRows(rows, path) {
  const ids = new Set();
  for (const row of rows) {
    number(row?.id, path + '.id', 1);
    if (ids.has(row.id)) fail(path, 'duplicate row identifier');
    ids.add(row.id);
  }
}

function mediaAsset(content, type, path) {
  if (!content) return [];
  if (!content.startsWith('data:')) return [{ sourceId: 'content', sha256: null, bytes: null, mimeType: type + '/unknown' }];
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(content);
  if (!match || !match[2] || match[2].length % 4 !== 0) fail(path, 'invalid embedded image');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.toString('base64') !== match[2]) fail(path, 'invalid base64 encoding');
  const valid = {
    'image/png': bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'image/jpeg': bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')),
    'image/gif': ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()),
    'image/webp': bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP',
  };
  if (!valid[match[1]]) fail(path, 'image type does not match bytes');
  return [{ sourceId: 'content', sha256: sha(bytes), bytes: bytes.length, mimeType: match[1] }];
}

function blocksOf(value, path) {
  return list(value, path).map((block, i) => {
    const at = `${path}[${i}]`;
    record(block, ['id', 'type', 'order', 'content', 'questionId', 'questionLabel', 'questionType', 'promptQuestions', 'promptExamples'], at);
    identifier(block.id, at + '.id');
    number(block.order, at + '.order');
    if (!Object.hasOwn(TYPES, block.type)) fail(at + '.type', 'unmapped block type');
    if (block.content !== undefined) text(block.content, at + '.content');
    if (block.type === 'question') {
      identifier(block.questionId, at + '.questionId');
      text(block.questionLabel, at + '.questionLabel');
      if (!['text', 'image'].includes(block.questionType)) fail(at + '.questionType', 'unmapped answer type');
    }
    for (const key of ['promptQuestions', 'promptExamples']) if (block[key] !== undefined) {
      list(block[key], at + '.' + key, 100).forEach(item => text(item, at + '.' + key));
    }
    return {
      sourceId: block.id, type: TYPES[block.type],
      // Keep the original JSON, including order and template whitespace. Do not
      // silently apply .sort(), .trim(), default titles or positional IDs.
      payload: structuredClone(block),
      assets: ['image', 'video', 'audio'].includes(block.type) ? mediaAsset(block.content ?? '', block.type, at + '.content') : [],
    };
  });
}

function checklistOf(value, path) {
  return list(value, path).map((item, i) => {
    const at = `${path}[${i}]`;
    record(item, ['id', 'label', 'required'], at);
    identifier(item.id, at + '.id'); text(item.label, at + '.label'); bool(item.required, at + '.required');
    return { sourceId: item.id, text: item.label, required: item.required };
  });
}

export function normalizeReplitCurriculum(input) {
  record(input, ['export_type', 'source_project', 'exported_at', 'cohorts', 'days', 'learning_lessons', 'ongoing_challenges', 'admin_settings'], 'export');
  if (input.export_type !== 'curriculum_only') fail('export_type', 'only curriculum-only exports are accepted');
  text(input.source_project, 'source_project'); date(input.exported_at, 'exported_at');
  for (const key of ['cohorts', 'days', 'learning_lessons', 'ongoing_challenges', 'admin_settings']) {
    list(input[key], key, 500); uniqueRows(input[key], key);
  }
  for (const c of input.cohorts) {
    record(c, ['id', 'name', 'is_active', 'description', 'created_at'], 'cohorts');
    text(c.name, 'cohorts.name'); text(c.description, 'cohorts.description'); bool(c.is_active, 'cohorts.is_active'); date(c.created_at, 'cohorts.created_at');
  }
  const cohortIds = new Set(input.cohorts.map(c => c.id));
  for (const s of input.admin_settings) {
    // Explicitly exclude VAPID private keys even if a future export adds them.
    record(s, ['id', 'updatedAt', 'noticeBanner', 'activeCohortId', 'mvpBorderColor', 'autoApproveThroughWeek'], 'admin_settings');
    date(s.updatedAt, 'admin_settings.updatedAt'); text(s.mvpBorderColor, 'admin_settings.mvpBorderColor'); number(s.autoApproveThroughWeek, 'admin_settings.autoApproveThroughWeek');
    if (s.activeCohortId !== null && !cohortIds.has(s.activeCohortId)) fail('admin_settings.activeCohortId', 'missing cohort');
    if (s.noticeBanner !== null) text(s.noticeBanner, 'admin_settings.noticeBanner');
  }

  const documents = input.days.map(row => {
    record(row, ['id', 'title', 'blocks', 'icon_url', 'cohort_id', 'created_at', 'day_number', 'updated_at', 'mission_checks'], 'days');
    const { id, title, blocks, day_number: day, mission_checks, ...metadata } = row;
    text(title, 'days.title'); number(day, 'days.day_number', 1);
    if (!cohortIds.has(row.cohort_id)) fail('days.cohort_id', 'missing cohort');
    if (row.icon_url !== null) text(row.icon_url, 'days.icon_url');
    date(row.created_at, 'days.created_at'); date(row.updated_at, 'days.updated_at');
    return { track: 'challenge', sourceId: `cohort-${row.cohort_id}:day-${id}`, week: Math.ceil(day / 5), day, title, metadata: structuredClone(metadata), blocks: blocksOf(blocks, 'days.blocks'), checklist: checklistOf(mission_checks, 'days.mission_checks') };
  });

  for (const row of input.learning_lessons) {
    record(row, ['id', 'tag', 'tip', 'quiz', 'time', 'week', 'intro', 'title', 'content', 'is_active', 'tag_label', 'created_at', 'day_number', 'updated_at'], 'learning_lessons');
    const { id, title, content, quiz, week, day_number: day, ...metadata } = row;
    for (const key of ['title', 'content', 'tag', 'tip', 'time', 'intro', 'tag_label']) text(row[key], 'learning_lessons.' + key);
    number(day, 'learning_lessons.day_number', 1); number(week, 'learning_lessons.week', 1); bool(row.is_active, 'learning_lessons.is_active');
    date(row.created_at, 'learning_lessons.created_at'); date(row.updated_at, 'learning_lessons.updated_at');
    for (const q of list(quiz, 'learning_lessons.quiz', 100)) {
      record(q, ['q', 'opts', 'ans'], 'learning_lessons.quiz'); text(q.q, 'learning_lessons.quiz.q');
      list(q.opts, 'learning_lessons.quiz.opts', 20).forEach(option => text(option, 'learning_lessons.quiz.opts'));
      number(q.ans, 'learning_lessons.quiz.ans');
      if (q.opts.length < 2 || q.ans >= q.opts.length) fail('learning_lessons.quiz.ans', 'answer is outside choices');
    }
    documents.push({ track: 'learning', sourceId: `lesson-${id}`, week, day, title, metadata: structuredClone(metadata), blocks: [
      { sourceId: 'body', type: 'text', payload: { content }, assets: [] },
      { sourceId: 'quiz', type: 'quiz', payload: { quiz: structuredClone(quiz) }, assets: [] },
    ], checklist: [] });
  }

  for (const [index, row] of input.ongoing_challenges.entries()) {
    record(row, ['id', 'type', 'title', 'blocks', 'is_active', 'created_at', 'updated_at', 'description', 'mission_checks'], 'ongoing_challenges');
    const { id, title, blocks, mission_checks, ...metadata } = row;
    if (!['daily', 'weekly', 'monthly'].includes(row.type)) fail('ongoing_challenges.type', 'unmapped recurrence');
    text(title, 'ongoing_challenges.title'); text(row.description, 'ongoing_challenges.description'); bool(row.is_active, 'ongoing_challenges.is_active');
    date(row.created_at, 'ongoing_challenges.created_at'); date(row.updated_at, 'ongoing_challenges.updated_at');
    documents.push({ track: 'ongoing', sourceId: `ongoing-${id}`, week: 0, day: index + 1, title, metadata: structuredClone(metadata), blocks: blocksOf(blocks, 'ongoing_challenges.blocks'), checklist: checklistOf(mission_checks, 'ongoing_challenges.mission_checks') });
  }
  const snapshot = { formatVersion: 1, origin: 'replit', capturedAt: input.exported_at, configuration: { cohorts: structuredClone(input.cohorts), adminSettings: structuredClone(input.admin_settings) }, documents };
  inspectCurriculumSnapshot(snapshot);
  return snapshot;
}
