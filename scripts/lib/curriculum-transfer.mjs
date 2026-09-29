import { createHash } from 'node:crypto';

// A read-only comparison format, not a database seed or a claim that a renderer
// implements every type. Adapters must preserve all authoring fields in payload.
export const BLOCK_TYPES = Object.freeze([
  'heading', 'subheading', 'text', 'video', 'audio', 'image', 'question',
  'divider', 'link', 'recipe-calculator', 'margin-calculator', 'marketing-funnel',
  'prompt', 'prompt-generator', 'persona-generator', 'quiz', 'landing-planner',
]);
const TRACKS = new Set(['challenge', 'learning', 'ongoing']);
const TYPES = new Set(BLOCK_TYPES);
const sha = value => createHash('sha256').update(value).digest('hex');
const MAX_DOCUMENTS = 500;
const MAX_BLOCKS = 1000;
const MAX_STRING = 2_000_000;

function fail(path, reason) { throw new Error(`Invalid curriculum snapshot: ${path}: ${reason}`); }
function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected object');
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail(path, 'expected plain object');
  return value;
}
function keys(value, allowed, path) {
  object(value, path);
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(path, 'unmapped fields; preserve them explicitly');
}
function string(value, path, nonempty = false) {
  if (typeof value !== 'string' || value.length > MAX_STRING || (nonempty && !value.trim())) fail(path, 'expected bounded string');
}
function id(value, path) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)) fail(path, 'expected stable source identifier');
}
function integer(value, path, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(path, 'out of range');
}

// Object key order does not matter. Array order, whitespace and every authoring
// field do matter: a reordered quiz option or trimmed prompt must be detected.
function canonical(value, path = 'payload', depth = 0, budget = { count: 0 }) {
  if (++budget.count > 100_000 || depth > 30) fail(path, 'too large or too deeply nested');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value === 'string') { string(value, path); return JSON.stringify(value); }
  if (Array.isArray(value)) return '[' + value.map(item => canonical(item, path, depth + 1, budget)).join(',') + ']';
  object(value, path);
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], path, depth + 1, budget)).join(',') + '}';
}
const digest = value => sha(canonical(value));

export function inspectCurriculumSnapshot(snapshot) {
  keys(snapshot, ['formatVersion', 'origin', 'capturedAt', 'configuration', 'documents'], 'snapshot');
  if (snapshot.formatVersion !== 1) fail('formatVersion', 'unsupported version');
  if (!['replit', 'edu', 'synthetic'].includes(snapshot.origin)) fail('origin', 'unsupported origin');
  if (typeof snapshot.capturedAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(snapshot.capturedAt) || !Number.isFinite(Date.parse(snapshot.capturedAt))) fail('capturedAt', 'expected ISO date');
  if (!Array.isArray(snapshot.documents) || !snapshot.documents.length || snapshot.documents.length > MAX_DOCUMENTS) fail('documents', 'expected nonempty bounded array');
  const seen = new Set(), slots = new Set();
  const configuration = snapshot.configuration ?? {};
  object(configuration, 'configuration');
  const counts = { documents: 0, challenge: 0, learning: 0, ongoing: 0, blocks: 0, checklist: 0, assets: 0, blockTypes: {} };
  const issues = [];
  const documents = snapshot.documents.map((doc, index) => {
    const at = `documents[${index}]`;
    keys(doc, ['track', 'sourceId', 'week', 'day', 'title', 'metadata', 'blocks', 'checklist'], at);
    if (!TRACKS.has(doc.track)) fail(at + '.track', 'unknown track');
    id(doc.sourceId, at + '.sourceId');
    integer(doc.week, at + '.week', 0, 1000);
    integer(doc.day, at + '.day', 0, 10000);
    string(doc.title, at + '.title');
    object(doc.metadata, at + '.metadata');
    const key = `${doc.track}:${doc.sourceId}`, slot = `${doc.track}:${doc.metadata.cohort_id ?? ''}:${doc.week}:${doc.day}`;
    if (seen.has(key) || slots.has(slot)) fail(at, 'duplicate document identifier or curriculum position');
    seen.add(key); slots.add(slot);
    if (!doc.title.trim() || doc.title.trim() === '-') issues.push({ code: 'TITLE_PLACEHOLDER', document: key });
    if (!Array.isArray(doc.blocks) || doc.blocks.length > MAX_BLOCKS) fail(at + '.blocks', 'expected bounded array');
    if (!Array.isArray(doc.checklist) || doc.checklist.length > MAX_BLOCKS) fail(at + '.checklist', 'expected bounded array');
    const blockIds = new Set();
    const blocks = doc.blocks.map((block, blockIndex) => {
      const bp = `${at}.blocks[${blockIndex}]`;
      keys(block, ['sourceId', 'type', 'payload', 'assets'], bp);
      id(block.sourceId, bp + '.sourceId');
      if (blockIds.has(block.sourceId)) fail(bp, 'duplicate block identifier');
      blockIds.add(block.sourceId);
      if (typeof block.type !== 'string' || !TYPES.has(block.type)) fail(bp + '.type', 'unsupported block; do not silently omit it');
      object(block.payload, bp + '.payload');
      if (!Array.isArray(block.assets) || block.assets.length > 100) fail(bp + '.assets', 'expected bounded array');
      const assetIds = new Set();
      const assets = block.assets.map((asset, assetIndex) => {
        const ap = `${bp}.assets[${assetIndex}]`;
        keys(asset, ['sourceId', 'sha256', 'bytes', 'mimeType'], ap);
        id(asset.sourceId, ap + '.sourceId');
        if (assetIds.has(asset.sourceId)) fail(ap, 'duplicate asset identifier');
        assetIds.add(asset.sourceId);
        if (asset.sha256 !== null && (typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256))) fail(ap + '.sha256', 'expected checksum or null');
        if (asset.bytes !== null) integer(asset.bytes, ap + '.bytes', 0, Number.MAX_SAFE_INTEGER);
        string(asset.mimeType, ap + '.mimeType', true);
        if (asset.sha256 === null || asset.bytes === null) issues.push({ code: 'ASSET_UNVERIFIED', document: key, block: block.sourceId, asset: asset.sourceId });
        return { ...asset };
      });
      counts.blocks++; counts.assets += assets.length;
      counts.blockTypes[block.type] = (counts.blockTypes[block.type] || 0) + 1;
      return { sourceId: block.sourceId, type: block.type, payloadDigest: digest(block.payload), assets, digest: digest(block) };
    });
    const checklistIds = new Set();
    for (const [ci, item] of doc.checklist.entries()) {
      keys(item, ['sourceId', 'text', 'required'], `${at}.checklist[${ci}]`);
      id(item.sourceId, `${at}.checklist[${ci}].sourceId`);
      if (checklistIds.has(item.sourceId)) fail(at + '.checklist', 'duplicate checklist identifier');
      checklistIds.add(item.sourceId);
      string(item.text, `${at}.checklist[${ci}].text`);
      if (typeof item.required !== 'boolean') fail(at + '.checklist.required', 'expected boolean');
    }
    counts.documents++; counts[doc.track]++; counts.checklist += doc.checklist.length;
    return {
      key, week: doc.week, day: doc.day,
      titleDigest: digest(doc.title), metadataDigest: digest(doc.metadata),
      checklistDigest: digest(doc.checklist), blocks, digest: digest(doc),
    };
  });
  // Only hashes, source identifiers and counts are returned. Never print lesson
  // text, correct answers, URLs with credentials, or student data in a report.
  return { origin: snapshot.origin, capturedAt: snapshot.capturedAt, configurationDigest: digest(configuration), digest: digest({ configuration, documents: snapshot.documents }), counts, documents, issues };
}

export function compareCurriculumSnapshots(source, target, options = {}) {
  const before = inspectCurriculumSnapshot(source), after = inspectCurriculumSnapshot(target);
  const supported = options.supportedBlockTypes ?? [];
  if (!Array.isArray(supported) || supported.some(type => !TYPES.has(type))) fail('supportedBlockTypes', 'unknown capability');
  const issues = [
    ...before.issues.map(issue => ({ ...issue, side: 'source' })),
    ...after.issues.map(issue => ({ ...issue, side: 'target' })),
  ];
  const mismatches = [];
  if (before.configurationDigest !== after.configurationDigest) mismatches.push({ code: 'CONFIGURATION_CHANGED' });
  if (options.expectedSourceDigest && options.expectedSourceDigest !== before.digest) mismatches.push({ code: 'SOURCE_CHANGED' });
  const expected = options.expectedDocumentCounts;
  if (expected) for (const track of TRACKS) {
    const count = expected[track] ?? (track === 'ongoing' ? 0 : undefined);
    integer(count, `expectedDocumentCounts.${track}`, 0, MAX_DOCUMENTS);
    if (before.counts[track] !== count) mismatches.push({ code: 'SOURCE_TRACK_COUNT', track, expected: count, actual: before.counts[track] });
  }
  const targetDocs = new Map(after.documents.map(doc => [doc.key, doc]));
  const sourceKeys = new Set(before.documents.map(doc => doc.key));
  for (const doc of before.documents) {
    const migrated = targetDocs.get(doc.key);
    if (!migrated) { mismatches.push({ code: 'DOCUMENT_MISSING', document: doc.key }); continue; }
    for (const [field, code] of [['titleDigest', 'TITLE_CHANGED'], ['metadataDigest', 'METADATA_CHANGED'], ['checklistDigest', 'CHECKLIST_CHANGED']]) {
      if (doc[field] !== migrated[field]) mismatches.push({ code, document: doc.key });
    }
    if (doc.day !== migrated.day || doc.week !== migrated.week) mismatches.push({ code: 'POSITION_CHANGED', document: doc.key });
    if (canonical(doc.blocks.map(b => b.sourceId)) !== canonical(migrated.blocks.map(b => b.sourceId))) mismatches.push({ code: 'BLOCK_ORDER_OR_MEMBERSHIP_CHANGED', document: doc.key });
    const targetBlocks = new Map(migrated.blocks.map(block => [block.sourceId, block]));
    for (const block of doc.blocks) {
      if (!supported.includes(block.type)) issues.push({ code: 'RENDERER_UNVERIFIED', document: doc.key, block: block.sourceId, type: block.type });
      const copy = targetBlocks.get(block.sourceId);
      if (!copy) continue; // The membership mismatch above already identifies the omission.
      if (block.type !== copy.type || block.payloadDigest !== copy.payloadDigest) mismatches.push({ code: 'BLOCK_CONTENT_CHANGED', document: doc.key, block: block.sourceId });
      if (canonical(block.assets) !== canonical(copy.assets)) mismatches.push({ code: 'ASSET_CHANGED', document: doc.key, block: block.sourceId });
    }
  }
  for (const doc of after.documents) if (!sourceKeys.has(doc.key)) mismatches.push({ code: 'UNEXPECTED_DOCUMENT', document: doc.key });
  if (canonical(before.documents.map(d => d.key)) !== canonical(after.documents.map(d => d.key))) mismatches.push({ code: 'DOCUMENT_ORDER_OR_MEMBERSHIP_CHANGED' });
  return {
    formatVersion: 1,
    contentMatches: mismatches.length === 0,
    // This is only a content-transfer gate; never a deployment/functional-QA approval.
    contentTransferReady: mismatches.length === 0 && !issues.some(issue => ['ASSET_UNVERIFIED', 'RENDERER_UNVERIFIED'].includes(issue.code)),
    sourceDigest: before.digest, targetDigest: after.digest,
    sourceCounts: before.counts, targetCounts: after.counts, mismatches, issues,
  };
}
