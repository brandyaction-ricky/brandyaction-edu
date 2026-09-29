import { lessonImportContract } from './lesson-import-contract.mjs';

const fail = message => { throw new Error('Invalid media binding: ' + message); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('unexpected fields');
}
const fingerprint = value => [value.kind, value.sha256, value.bytes, value.mimeType].join(':');

// Call only with a regenerated package (readLessonPackage). This is an offline
// byte/provenance comparison, not authentication of a JSON receipt's origin.
// The destination must recheck live server receipts before an import writes.
export async function bindReplitMedia(plan, ledger) {
  record(ledger, ['formatVersion', 'sourceDigest', 'courseId', 'receipts']);
  if (ledger.formatVersion !== 1 || !hash(ledger.sourceDigest) || ledger.sourceDigest !== plan.sourceDigest || !uuid(ledger.courseId) || !Array.isArray(ledger.receipts) || ledger.receipts.length > 10000) fail('source or destination does not match');
  const embedded = plan.assets.filter(asset => asset.path), byFingerprint = new Map(embedded.map(asset => [fingerprint(asset), asset]));
  const receipts = new Map(), ids = new Set();
  for (const receipt of ledger.receipts) {
    record(receipt, ['formatVersion', 'assetId', 'courseId', 'kind', 'sha256', 'bytes', 'mimeType', 'readyAt']);
    if (receipt.formatVersion !== 1 || !uuid(receipt.assetId) || receipt.courseId !== ledger.courseId || !['image', 'audio', 'video'].includes(receipt.kind) || !hash(receipt.sha256) || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 1 || receipt.bytes > 50 * 1024 * 1024 || typeof receipt.mimeType !== 'string' || typeof receipt.readyAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(receipt.readyAt) || !Number.isFinite(Date.parse(receipt.readyAt))) fail('invalid or incomplete receipt');
    const key = fingerprint(receipt);
    if (!byFingerprint.has(key)) fail('receipt does not match original asset bytes and type');
    if (ids.has(receipt.assetId) || receipts.has(key)) fail('duplicate or ambiguous receipt');
    ids.add(receipt.assetId); receipts.set(key, receipt);
  }
  const bindings = new Map();
  for (const asset of embedded) {
    const receipt = receipts.get(fingerprint(asset));
    if (receipt) bindings.set(asset.id, { sourceAssetId: asset.id, sourcePath: asset.path, sourceValueSha256: asset.sourceValueSha256, ...structuredClone(receipt) });
  }
  const contract = await lessonImportContract();
  const lessons = plan.lessons.map(lesson => {
    const document = structuredClone(lesson.plannedDocument), resolved = new Set(), applied = [];
    for (const block of document.blocks) {
      if (!block.pendingAssetId) continue;
      const binding = bindings.get(block.pendingAssetId);
      if (!binding) continue;
      const original = plan.assets.find(asset => asset.id === block.pendingAssetId);
      const use = original.uses.find(use => use.document === lesson.key && use.targetBlock === block.id);
      if (!use || binding.kind !== block.type) fail('asset use is not present in original mapping');
      block.assetId = binding.assetId; delete block.pendingAssetId;
      resolved.add(use.sourceBlock); applied.push({ sourceAssetId: original.id, sourceBlock: use.sourceBlock, targetBlock: block.id, assetId: binding.assetId, sha256: binding.sha256 });
    }
    const issues = lesson.issues.filter(issue => !(issue.code === 'MEDIA_UPLOAD_PENDING' && resolved.has(issue.block)));
    let validated = null;
    if (!document.blocks.some(block => Object.keys(block).some(key => key.startsWith('pending')))) {
      try { validated = contract.validateLessonBlocks(document); }
      catch { if (!issues.some(issue => issue.code === 'RUNTIME_VALIDATION_REVIEW')) issues.push({ code: 'RUNTIME_VALIDATION_REVIEW', document: lesson.key }); }
    }
    return { ...structuredClone(lesson), plannedDocument: document, document: validated, appliedMedia: applied, issues, ready: false, structureReady: Boolean(validated) && issues.length === 0 };
  });
  return { formatVersion: 1, sourceDigest: plan.sourceDigest, sourceFileSha256: plan.sourceFileSha256, sourceCapturedAt: plan.sourceCapturedAt,
    courseId: ledger.courseId, bindings: [...bindings.values()], lessons, configuration: structuredClone(plan.configuration),
    issues: lessons.flatMap(lesson => lesson.issues), currentLiveContentVerified: false, serverReceiptsRechecked: false, readyForImport: false };
}
export function mediaBindingReport(result) {
  return { sourceDigest: result.sourceDigest, sourceCapturedAt: result.sourceCapturedAt,
    counts: { lessons: result.lessons.length, matchedAssets: result.bindings.length, matchedUses: result.lessons.reduce((total, lesson) => total + lesson.appliedMedia.length, 0), structureReady: result.lessons.filter(lesson => lesson.structureReady).length },
    issues: result.issues, currentLiveContentVerified: false, serverReceiptsRechecked: false, readyForImport: false };
}
