import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import sharp from 'sharp';
function load(file,mocks={}){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>mocks[name]);return exports;}
const rules=load('lib/app-install.ts'),branding=load('lib/app-branding.ts'),manifest=await load('app/manifest.ts',{'@/lib/app-branding-server':{getPublicAppBranding:async()=>branding.publicAppBranding(branding.defaultBranding)}}).default();
test('installation instructions distinguish iPhone, desktop-mode iPad, Android and embedded browsers',()=>{
 assert.equal(rules.installDevice('Mozilla iPhone','iPhone',5),'ios');assert.equal(rules.installDevice('Mozilla Macintosh','MacIntel',5),'ios');assert.equal(rules.installDevice('Mozilla Macintosh','MacIntel',0),'desktop');assert.equal(rules.installDevice('Mozilla Android','Linux',5),'android');
 for(const value of ['KAKAOTALK','NAVER','Instagram','FBAN','FBAV','Line/11','Android; wv)'])assert.equal(rules.embeddedBrowser(value),true,value);assert.equal(rules.embeddedBrowser('Chrome Safari'),false);
});
test('dismissal expires after a week and corrupted storage never hides instructions forever',()=>{
 const now=1_000_000;assert.equal(rules.installDismissed(String(now+rules.installDismissMs),now),true);
 for(const value of [null,'','NaN','Infinity','-1',String(now),String(now+rules.installDismissMs+1)])assert.equal(rules.installDismissed(value,now),false);
});
test('manifest preserves installation identity and authenticated launch path with valid same-origin icon files',async()=>{
 assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/my');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');assert.equal(manifest.name,'브랜디에듀');
 for(const icon of manifest.icons){assert.match(icon.src,/^\/icons\/edu-[a-z0-9-]+\.png$/);const {width,height,format}=await sharp(new URL('../public'+icon.src,import.meta.url).pathname).metadata();assert.equal(format,'png');assert.equal(icon.sizes,`${width}x${height}`);}
 assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'&&icon.purpose==='any'));assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
 assert.equal((await sharp(new URL('../public/icons/edu-apple-180.png',import.meta.url).pathname).metadata()).width,180);
});
test('maskable artwork fits the 40 percent safe circle and every app tile is opaque',async()=>{
 const {data,info}=await sharp(new URL('../public/icons/edu-maskable-512.png',import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});let white=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const index=(y*info.width+x)*4;assert.equal(data[index+3],255);if(data[index]>240&&data[index+1]>240&&data[index+2]>240){white++;assert.ok(Math.hypot(x-256,y-256)<512*.4,`mark clipped at ${x},${y}`);}}
 assert.ok(white>10000);const badge=await sharp(new URL('../public/icons/edu-badge-96.png',import.meta.url).pathname).metadata();assert.equal(badge.width,96);assert.equal(badge.hasAlpha,true);
});
