import { createHash } from 'node:crypto';
import { lessonImportContract } from './lesson-import-contract.mjs';
const fail = () => { throw new Error('Invalid import placement: review selected lessons, destination weeks, IDs and unresolved source issues'); };
const uuid = value => typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function stableId(...parts) { const h=createHash('sha256').update(JSON.stringify(parts)).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; }
// A caller must verify source+binding again before invoking this compiler.
// No current-content verification is invented by this offline conversion.
export async function prepareReplitImport(bound, placement) {
  if (!placement || Object.keys(placement).some(k=>!['courseId','requestId','lessonKeys','weeks'].includes(k)) || placement.courseId!==bound.courseId || !uuid(placement.requestId)
    || !Array.isArray(placement.lessonKeys) || !placement.lessonKeys.length || new Set(placement.lessonKeys).size!==placement.lessonKeys.length || !Array.isArray(placement.weeks)) fail();
  const selected=placement.lessonKeys.map(key=>bound.lessons.find(l=>l.key===key));
  if (selected.some(l=>!l || !l.structureReady || l.issues.length || (!l.document?.progression && !['daily','weekly','monthly'].includes(l.ongoing)) || !l.title.trim() || l.title.trim()==='-')) fail();
  const targets=new Map();
  for(const w of placement.weeks) {
    if(!w || Object.keys(w).some(k=>!['sourceWeek','id','number','title','goal','existing','startOrder'].includes(k)) || targets.has(w.sourceWeek) || !Number.isInteger(w.sourceWeek) || w.sourceWeek<0 || !Number.isInteger(w.startOrder) || w.startOrder<1) fail();
    targets.set(w.sourceWeek,w);
  }
  if (selected.some(l=>!targets.has(l.week)) || placement.weeks.some(w=>!selected.some(l=>l.week===w.sourceWeek))) fail();
  const positions=new Map();
  // Order within each destination week is explicit, stable and unique. The
  // original day number remains in document.progression for each track.
  const lessons=selected.map(l=>{
    const w=targets.get(l.week),order=positions.get(w.id)??w.startOrder;positions.set(w.id,order+1);
    return {id:stableId(placement.courseId,placement.requestId,l.key,'lesson'),revision:stableId(placement.courseId,placement.requestId,l.key,'revision'),sourceKey:l.key,weekId:w.id,order,title:l.title,description:l.ongoing && typeof l.metadata.description==='string'?l.metadata.description:'',...(l.ongoing?{ongoing:l.ongoing}:{}),durationLabel:typeof l.metadata.time==='string'?l.metadata.time:'',
      provenance:{sourceWeek:l.week,sourceDay:l.day,metadata:structuredClone(l.metadata),mapping:structuredClone(l.mapping),checklistMapping:structuredClone(l.checklistMapping)},document:structuredClone(l.document)};
  });
  const used=new Set(lessons.flatMap(l=>l.document.blocks.flatMap(b=>b.assetId?[b.assetId]:[]))),seen=new Set();
  const media=bound.bindings.filter(b=>used.has(b.assetId)&&!seen.has(b.assetId)&&seen.add(b.assetId)).map(b=>({assetId:b.assetId,kind:b.kind,sha256:b.sha256,bytes:b.bytes,mimeType:b.mimeType}));
  const contract=await lessonImportContract();let batch;
  try { batch=contract.validateLessonImportBatch({formatVersion:1,courseId:placement.courseId,sourceDigest:bound.sourceDigest,sourceCapturedAt:bound.sourceCapturedAt,weeks:placement.weeks.map(w=>({id:w.id,number:w.number,title:w.title,goal:w.goal,existing:w.existing})),lessons,media}); } catch { fail(); }
  return {requestId:placement.requestId,batch};
}
