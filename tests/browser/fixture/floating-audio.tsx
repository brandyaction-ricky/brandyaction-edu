import { useState } from 'react';
import { LessonDocumentCanvas } from '../../../app/ui/final/lesson-document-canvas';
import { LessonBlockView } from '../../../app/ui/final/lesson-block-view';
import type { LessonBlock } from '../../../lib/lesson-blocks';

const initial: LessonBlock[] = [
  {id:'intro',type:'text',content:'음성을 들으며 아래 본문을 편집하세요.'},
  {id:'first',type:'audio',url:'https://audio.example.test/first.wav',alt:'첫 번째 음성'},
  {id:'long',type:'text',content:Array.from({length:65},(_,i)=>`${i+1}. 스크롤하면서 편집하는 긴 본문입니다.`).join('\n\n')},
  {id:'second',type:'audio',assetId:'11111111-1111-4111-8111-111111111111',alt:'두 번째 음성'},
  {id:'tail',type:'text',content:Array.from({length:50},()=>`두 번째 음성 아래 본문입니다.`).join('\n\n')},
];
export function FloatingAudioFixture(){
  const [blocks,setBlocks]=useState(initial),[lesson,setLesson]=useState(0);
  const learner=new URLSearchParams(location.search).has('learner');
  return <main className="edu-admin" style={{padding:'70px 16px 20px',maxWidth:900,margin:'auto'}}>
    <header className="adm-topbar" style={{position:'fixed',top:0,left:0,right:0,height:56,zIndex:40,background:'white'}}>편집 검수 <button onClick={()=>{setLesson(x=>x+1);setBlocks(initial);}}>다른 수업 열기</button></header>
    {learner?<LessonBlockView document={{schemaVersion:1,blocks,checklist:[]}} values={{blocks:{},checklist:[]}} onChange={()=>{}} readOnly/>:
    <LessonDocumentCanvas key={lesson} blocks={blocks} onChange={setBlocks} disabled={false} choices={[{type:'audio',label:'음성'}]} onSettings={()=>{}} onError={()=>{}} onImage={()=>{}} create={type=>({id:crypto.randomUUID(),type})}/>}
  </main>;
}
