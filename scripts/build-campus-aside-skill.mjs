// Creates a portable skill bundle, without credentials or an installed background service.
import {mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv[2])throw Error('Provide a new output directory');
const out=resolve(process.argv[2]);await mkdir(out,{mode:0o700});await mkdir(join(out,'scripts'));
await copyFile(join(root,'skills/moonshot-campus-report/SKILL.md'),join(out,'SKILL.md'));
for(const [source,target] of [['campus-student-device.mjs','campus-student-device.mjs'],['campus-skill-report.mjs','report.mjs'],['campus-office-report.mjs','campus-office-report.mjs'],['campus-office-preview-transport.mjs','campus-office-preview-transport.mjs']]) await copyFile(join(root,'scripts',source),join(out,'scripts',target));
const production = process.argv[3] === 'production';
await copyFile(join(root,'scripts',production ? 'student-target.production.mjs' : 'student-target.mjs'),join(out,'scripts/student-target.mjs'));
console.log('Skill bundle built without credentials.');
