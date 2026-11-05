import type {CampusContent} from '../content/model';
import type {WelcomeSettings} from '../welcome/content';
import type {CampusResource} from '../webinar/resources';
import type {TourAvatar} from './appearance';
import type {TourRole} from './model';
export type TourLiveConnection={
 publicPresence?:boolean;
 initialRoom?:'welcome';
 libraryResources?:CampusResource[];
 welcomeSettings?:WelcomeSettings; content?:CampusContent;
 role:Exclude<TourRole,'guest'|'expired'>;
 avatar:TourAvatar|null;
 level:number|null;
 saveAvatar:(value:TourAvatar)=>Promise<TourAvatar>;
 onOpen:(lessonId:string,missionId?:string)=>void;
 onRefresh:()=>void;
 onSelect:(enrollmentId:string)=>void;
};
