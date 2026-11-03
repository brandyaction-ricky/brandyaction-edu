import type {TourAvatar} from './appearance';
import type {TourRole} from './model';
export type TourLiveConnection={
 role:Exclude<TourRole,'guest'|'expired'>;
 avatar:TourAvatar|null;
 level:number|null;
 saveAvatar:(value:TourAvatar)=>Promise<TourAvatar>;
 onOpen:(lessonId:string,missionId?:string)=>void;
 onRefresh:()=>void;
 onSelect:(enrollmentId:string)=>void;
};
