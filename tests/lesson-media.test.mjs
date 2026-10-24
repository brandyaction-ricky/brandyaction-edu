import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function compile(name,dependencies={}){const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,name=>dependencies[name]);return out;}
const media=compile('lesson-media',{'./lesson-files':compile('lesson-files')});
test('media categories, size limits, names and HTTPS-independent stable media references are explicit',()=>{
 for(const [name,size,kind] of [['x.svg',8,'image'],['../x.png',8,'image'],['x.png',10485761,'image'],['x.mp4',52428801,'video'],['x.mp3',5,'video'],['x.html',5,'audio'],['x.png',1.1,'image'],['x\n.png',5,'image']])assert.throws(()=>media.lessonMediaSpec(name,size,kind));
 assert.equal(media.lessonMediaSpec('음성.MP3',52428800,'audio').contentType,'audio/mpeg');
 const learner=new URL(media.lessonMediaUrl('asset',{lessonId:'lesson',enrollmentId:'enrollment',revision:'revision'}),'https://example.test');
 assert.equal(learner.searchParams.get('revision'),'revision');assert.equal(learner.searchParams.get('enrollment'),'enrollment');
 const mentor=new URL(media.lessonMediaUrl('asset',undefined,'submission'),'https://example.test');assert.equal(mentor.searchParams.get('submission'),'submission');assert.equal(mentor.searchParams.has('enrollment'),false);
});
test('media containers are validated by bytes, including rejecting renamed HTML and mismatched size',()=>{
 const enc=s=>Array.from(new TextEncoder().encode(s));
 const cases={png:[137,80,78,71,13,10,26,10],mp3:enc('ID3abcdefgh'),wav:enc('RIFF0000WAVE'),ogg:enc('OggS00000000'),m4a:enc('0000ftypM4A 0000'),mp4:enc('0000ftypisom0000'),mov:enc('0000ftypqt  0000'),webm:[26,69,223,163,...enc('000webm00000000')]};
 for(const [extension,values] of Object.entries(cases)){const bytes=Uint8Array.from(values),spec=media.lessonMediaSpec('file.'+extension,bytes.length,media.lessonMediaTypes[extension].kind);assert.equal(media.matchesLessonMedia(bytes,spec),true,extension);assert.equal(media.matchesLessonMedia(bytes,{...spec,size:bytes.length+1}),false);assert.equal(media.matchesLessonMedia(new TextEncoder().encode('<script>alert(1)</script>'),spec),false);}
});
test('download attachments allow supported documents up to 50MB and validate containers without extraction',()=>{
 const enc=s=>new TextEncoder().encode(s);
 const cases={pdf:enc('%PDF-1.7\n'),zip:Uint8Array.from([80,75,5,6]),docx:Uint8Array.from([80,75,3,4]),xlsx:Uint8Array.from([80,75,3,4]),pptx:Uint8Array.from([80,75,3,4]),hwpx:Uint8Array.from([80,75,3,4]),hwp:Uint8Array.from([208,207,17,224,161,177,26,225]),txt:enc('한글 자료'),md:enc('# 안내'),csv:enc('name,value\n가,1')};
 for(const [ext,bytes] of Object.entries(cases)){const spec=media.lessonMediaSpec('자료.'+ext,bytes.length,'file');assert.equal(spec.contentType,'application/octet-stream');assert.equal(media.matchesLessonMedia(bytes,spec),true,ext);assert.equal(media.matchesLessonMedia(bytes,{...spec,size:bytes.length+1}),false);}
 assert.equal(media.lessonMediaSpec('큰 자료.zip',52428800,'file').size,52428800);
 for(const name of ['run.exe','page.html','image.svg','macro.docm','../bad.zip'])assert.throws(()=>media.lessonMediaSpec(name,8,'file'));
 assert.throws(()=>media.lessonMediaSpec('큰 자료.zip',52428801,'file'));
 for(const ext of ['pdf','zip','docx','hwp']){const bytes=enc('<script>bad</script>');assert.equal(media.matchesLessonMedia(bytes,media.lessonMediaSpec('bad.'+ext,bytes.length,'file')),false);}
 const nul=Uint8Array.from([97,0,98]);assert.equal(media.matchesLessonMedia(nul,media.lessonMediaSpec('binary.txt',nul.length,'file')),false);
});
