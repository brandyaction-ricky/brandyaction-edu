import { mkdirSync, writeFileSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readLessonPackage, readPackageFile, parsePackageJson } from './lib/replit-lesson-package.mjs';
import { bindReplitMedia } from './lib/replit-media-binding.mjs';
import { prepareReplitImport } from './lib/replit-import-placement.mjs';
try {
  const args=process.argv.slice(2);
  if(args.length!==4)throw new Error('Usage: node scripts/prepare-replit-import.mjs package binding-directory placement.json NEW-private-directory');
  const {plan}=await readLessonPackage(args[0]),binding=resolve(args[1]);
  if(!lstatSync(binding).isDirectory()||lstatSync(binding).isSymbolicLink())throw new Error('Invalid import placement: expected binding directory');
  const bound=await bindReplitMedia(plan,parsePackageJson(readPackageFile(join(binding,'receipts.json'),8*1024*1024)));
  if(JSON.stringify(bound)!==JSON.stringify(parsePackageJson(readPackageFile(join(binding,'bound-plan.json')))))throw new Error('Invalid import placement: binding changed');
  const result=await prepareReplitImport(bound,parsePackageJson(readPackageFile(args[2],1000000))),directory=resolve(args[3]);
  mkdirSync(directory,{mode:0o700});writeFileSync(join(directory,'import.json'),JSON.stringify(result),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({prepared:true,sourceCapturedAt:bound.sourceCapturedAt,lessons:result.batch.lessons.length,weeks:result.batch.weeks.length,unselectedLessons:bound.lessons.length-result.batch.lessons.length,currentLiveContentVerified:false,serverMediaRecheckRequired:true,externalMediaChecksPending:result.batch.lessons.reduce((n,l)=>n+(l.provenance.review?.externalMedia?.length||0),0),published:false}));
} catch(error) { console.error(error instanceof Error && /^(Usage:|Invalid import placement:|Invalid media binding:|Invalid lesson package:)/.test(error.message)?error.message:'Unable to prepare import; existing files are not overwritten');process.exitCode=2; }
