import Link from 'next/link';
import {useState} from 'react';
import {LessonCurriculumImport} from '../../../app/ui/final/lesson-curriculum-import';
export function LessonImportFixture(){const [saved,setSaved]=useState(0);return <main className="edu-admin" style={{padding:16,maxWidth:900,margin:'auto'}}><LessonCurriculumImport courseId="aaaaaaaa-1111-4111-8111-111111111111" onImported={()=>setSaved(n=>n+1)}/><p>목록 갱신 {saved}회</p><Link href="/other-test">다른 화면으로</Link></main>;}
