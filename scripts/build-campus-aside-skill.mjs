// Creates a portable skill bundle, without credentials or an installed background service.
import {mkdir,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv[2])throw Error('Provide a new output directory');
const out=resolve(process.argv[2]);await mkdir(out,{mode:0o700});await mkdir(join(out,'scripts'));
await copyFile(join(root,'skills/moonshot-campus-report/SKILL.md'),join(out,'SKILL.md'));
for(const [source,target] of [['campus-skill-report.mjs','report.mjs'],['campus-office-report.mjs','campus-office-report.mjs'],['campus-office-preview-transport.mjs','campus-office-preview-transport.mjs']]) await copyFile(join(root,'scripts',source),join(out,'scripts',target));
console.log('Skill bundle built without credentials.');
