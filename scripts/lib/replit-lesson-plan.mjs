import { createHash } from 'node:crypto';
import { normalizeReplitCurriculum } from './replit-curriculum.mjs';
import { inspectCurriculumSnapshot } from './curriculum-transfer.mjs';
import { lessonImportContract } from './lesson-import-contract.mjs';
import { convertLearningHtml } from './replit-lesson-html.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const stableId = (kind, ...parts) => kind + '-' + sha(JSON.stringify(parts)).slice(0, 48);
const mimeExtensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
function secureUrl(raw) {
  try { const url = new URL(raw); if (url.protocol === 'https:' && !url.username && !url.password) return raw; } catch { /* No network normalization or guessing. */ }
  return null;
}

export async function prepareReplitLessonPlan(source) {
  const snapshot = normalizeReplitCurriculum(source), inspected = inspectCurriculumSnapshot(snapshot);
  const contract = await lessonImportContract();
  const files = new Map(), assets = new Map(), issues = [];
  const issue = (code, document, block) => { const item = { code, ...(document ? { document } : {}), ...(block ? { block } : {}) }; issues.push(item); return item; };
  function media(raw, kind, document, sourceBlock, targetBlock, digestInfo) {
    const assetId = stableId('asset', kind, raw);
    if (!assets.has(assetId)) {
      const row = { id: assetId, kind, sourceValueSha256: sha(raw), sha256: digestInfo?.sha256 || null, bytes: digestInfo?.bytes ?? null, mimeType: digestInfo?.mimeType || `${kind}/unknown`, path: null, sourceUrl: null, uses: [] };
      if (raw.startsWith('data:')) {
        const match = /^data:([^;]+);base64,(.*)$/.exec(raw);
        if (!match || !mimeExtensions[match[1]] || !row.sha256) throw new Error('Invalid lesson plan: embedded media was not verified');
        const bytes = Buffer.from(match[2], 'base64');
        if (sha(bytes) !== row.sha256 || bytes.length !== row.bytes) throw new Error('Invalid lesson plan: embedded media checksum differs');
        row.path = `assets/${row.sha256}.${mimeExtensions[match[1]]}`; files.set(row.path, bytes);
      } else row.sourceUrl = raw; // Private package only. Never put this URL in a report.
      assets.set(assetId, row);
    }
    assets.get(assetId).uses.push({ document, sourceBlock, targetBlock });
    const direct = secureUrl(raw);
    if (direct) { issue('EXTERNAL_MEDIA_UNVERIFIED', document, sourceBlock); return { url: direct }; }
    issue(raw.startsWith('data:') ? 'MEDIA_UPLOAD_PENDING' : 'MEDIA_LOCATION_REVIEW', document, sourceBlock);
    return { pendingAssetId: assetId }; // Deliberately invalid for the live lesson API until a verified binding is supplied.
  }
  const lessons = snapshot.documents.map((sourceDoc, sourceIndex) => {
    const key = `${sourceDoc.track}:${sourceDoc.sourceId}`, start = issues.length;
    const mapping = [], blocks = [], questionIds = new Set();
    const add = (block, from, more = {}) => { blocks.push(block); mapping.push({ sourceBlock: from, targetBlock: block.id, ...more }); };
    if (!sourceDoc.title.trim() || sourceDoc.title.trim() === '-') issue('TITLE_REVIEW_PENDING', key);
    if (sourceDoc.track !== 'ongoing' && (sourceDoc.day < 1 || sourceDoc.day > 30)) issue('DAY_RANGE_REVIEW', key);
    if (sourceDoc.track === 'learning' && sourceDoc.metadata.intro) add({ id: stableId('meta', key, 'intro'), type: 'text', content: sourceDoc.metadata.intro }, 'metadata.intro');
    // Raw order stays in source.json. DayPage renders stable numeric order, not
    // array order; ties keep the source array index as ECMAScript sort does.
    const ordered = sourceDoc.blocks.map((block, i) => ({ ...block, index: i })).sort((a, b) => sourceDoc.track === 'learning' ? a.index - b.index : a.payload.order - b.payload.order || a.index - b.index);
    for (const block of ordered) {
      const p = block.payload, id = stableId('block', key, block.sourceId), type = block.type;
      let out = { id, type }, extra = { sourceArrayIndex: block.index, sourceOrder: p.order ?? null, sourcePayloadSha256: sha(JSON.stringify(p)) };
      if (['heading', 'subheading', 'text', 'prompt', 'divider'].includes(type)) {
        if (p.content !== undefined) out.content = p.content;
        if (sourceDoc.track === 'learning' && type === 'text') {
          const converted = convertLearningHtml(p.content, contract);
          for (const code of converted.issues) issue(code, key, block.sourceId);
          if (converted.content !== null) out.content = converted.content;
          else { out = { ...out, pendingHtml: true }; delete out.content; }
        }
      } else if (['image', 'audio', 'video'].includes(type)) out = { ...out, ...media(p.content || '', type, key, block.sourceId, id, block.assets[0]) };
      else if (type === 'link') {
        const raw = p.content || '', normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        if (raw && secureUrl(normalized)) out.url = normalized;
        else { out.pendingLink = true; issue('LINK_REVIEW_PENDING', key, block.sourceId); }
      } else if (type === 'question') {
        out.question = { label: p.questionLabel, kind: p.questionType, required: false };
        extra.answerSourceId = p.questionId;
        if (questionIds.has(p.questionId)) issue('SHARED_ANSWER_REVIEW', key, block.sourceId);
        questionIds.add(p.questionId);
      } else if (type === 'prompt-generator') {
        out.content = p.content || '';
        out.fields = (p.promptQuestions || []).map((label, i) => ({ id: stableId('field', key, block.sourceId, i), label, variable: label, placeholder: p.promptExamples?.[i]?.trim() ? `예시) ${p.promptExamples[i]}` : `${label} 입력`, required: false, sensitive: false }));
        extra.promptFields = out.fields.map((field, i) => ({ targetField: field.id, sourceIndex: i }));
        if ((p.promptExamples?.length || 0) > out.fields.length) issue('PROMPT_EXAMPLES_REVIEW', key, block.sourceId);
      } else if (['persona-generator', 'landing-planner'].includes(type)) out = contract.newGuidedBlock(type, id);
      else if (['recipe-calculator', 'margin-calculator', 'marketing-funnel'].includes(type)) out = contract.newCalculatorBlock(type, id);
      else if (type === 'quiz') {
        if (sourceDoc.track === 'learning' && sourceDoc.metadata.tip) add({ id: stableId('meta', key, 'tip'), type: 'text', content: sourceDoc.metadata.tip }, 'metadata.tip');
        let questions;
        if (sourceDoc.track === 'learning') questions = p.quiz.map((q, i) => ({ id: stableId('question', key, block.sourceId, i), prompt: q.q, options: q.opts, correctIndex: q.ans }));
        else {
          let parsed; try { parsed = JSON.parse(p.content); } catch { /* Missing questions are an explicit blocker below. */ }
          if (!parsed || Object.keys(parsed).some(k => k !== 'questions') || !Array.isArray(parsed.questions)) issue('QUIZ_FORMAT_REVIEW', key, block.sourceId);
          else if (parsed.questions.some(q => !q || typeof q !== 'object' || Object.keys(q).some(k => !['id','text','options','correctIndex'].includes(k)) || typeof q.id !== 'string')) issue('QUIZ_FORMAT_REVIEW', key, block.sourceId);
          else {
            questions = parsed.questions.map(q => ({ id: stableId('question', key, block.sourceId, q.id), prompt: q.text, options: q.options, correctIndex: q.correctIndex }));
            extra.quizQuestions = parsed.questions.map((q, i) => ({ sourceQuestion: q.id, targetQuestion: questions[i].id }));
          }
        }
        if (questions?.length) out.quiz = { questions, passPercent: 100 };
        else if (questions && sourceDoc.track === 'learning') { mapping.push({ sourceBlock: block.sourceId, targetBlock: null, reason: 'SOURCE_EMPTY_QUIZ', ...extra }); continue; }
        else { out.pendingQuiz = true; issue('QUIZ_FORMAT_REVIEW', key, block.sourceId); }
      } else { out.pendingType = true; issue('BLOCK_TYPE_REVIEW', key, block.sourceId); }
      add(out, block.sourceId, extra);
    }
    const plannedDocument = { schemaVersion: 1, blocks, checklist: sourceDoc.checklist.map(c => ({ id: stableId('check', key, c.sourceId), label: c.text, required: c.required })), completion: sourceDoc.track === 'ongoing' ? { mode: 'self', requireAnswers: false, requireQuizPass: false } : sourceDoc.track === 'learning' ? { mode: 'self', requireAnswers: false, requireQuizPass: true } : { mode: 'mentor', requireAnswers: false, requireQuizPass: false }, ...(sourceDoc.track !== 'ongoing' ? { progression: { track: sourceDoc.track === 'challenge' ? 'daily' : 'learning', dayNumber: sourceDoc.day } } : {}) };
    if (sourceDoc.track === 'learning') plannedDocument.presentation = { tag: sourceDoc.metadata.tag, tagLabel: sourceDoc.metadata.tag_label };
    let document = null;
    if (!blocks.some(b => Object.keys(b).some(k => k.startsWith('pending')))) {
      try { document = contract.validateLessonBlocks(plannedDocument); }
      catch { issue('RUNTIME_VALIDATION_REVIEW', key); }
    }
    return { key, sourceIndex, ...(sourceDoc.track === 'ongoing' ? { ongoing: sourceDoc.metadata.type } : {}), title: sourceDoc.title, week: sourceDoc.week, day: sourceDoc.day, track: sourceDoc.track, metadata: structuredClone(sourceDoc.metadata), mapping, checklistMapping: sourceDoc.checklist.map((c,i) => ({ sourceCheck: c.sourceId, targetCheck: plannedDocument.checklist[i].id })), plannedDocument, document, ready: document !== null && issues.length === start, issues: issues.slice(start) };
  });
  // Never equate a valid plan made from an old file with verified live content.
  const plan = { formatVersion: 1, sourceCapturedAt: snapshot.capturedAt, sourceDigest: inspected.digest, currentLiveContentVerified: false, configuration: structuredClone(snapshot.configuration), lessons, assets: [...assets.values()], issues, readyForImport: false };
  return { plan, files };
}

export function lessonPlanReport(plan) {
  return { sourceCapturedAt: plan.sourceCapturedAt, sourceDigest: plan.sourceDigest, currentLiveContentVerified: false, readyForImport: false,
    counts: { lessons: plan.lessons.length, sourceBlocks: plan.lessons.reduce((n,l)=>n+l.mapping.filter(m=>!m.sourceBlock.startsWith('metadata.')).length,0), targetBlocks: plan.lessons.reduce((n,l)=>n+l.plannedDocument.blocks.length,0), validDocuments: plan.lessons.filter(l=>l.document).length, readyLessons: plan.lessons.filter(l=>l.ready).length, assets: plan.assets.length, embeddedAssets: plan.assets.filter(a=>a.path).length, externalAssets: plan.assets.filter(a=>!a.path).length },
    issues: plan.issues };
}
