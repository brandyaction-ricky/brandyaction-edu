import type { CampusSnapshot } from '../../features/campus/contracts';
export type BridgeState = { status: 'ready'; snapshot: CampusSnapshot } | {status:'loading'|'closed';snapshot:null} | {status:'error';snapshot:null;message:string};
export interface EduBridge {
  load(enrollmentId?: string|null): Promise<CampusSnapshot>;
  openLesson(enrollmentId:string,lessonId:string):Promise<void>;
  openMission(enrollmentId:string,lessonId:string,missionId:string):Promise<void>;
  openQuestions():Promise<void>;
  dispose():void;
}
export function createEduBridge(options?: { fetcher?: typeof fetch; navigate?:(href:string)=>void; onState?:(state:BridgeState)=>void }):EduBridge;
