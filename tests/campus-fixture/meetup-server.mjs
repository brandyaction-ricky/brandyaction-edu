import {createCampusHub} from '../../services/campus-realtime/hub.mjs';
/** Synthetic private-LAN adapter ONLY. Caller-supplied roles are never production authorization. */
export function createPreviewMeetup(options={}){
 return createCampusHub({path:'/api/campus/preview-meetup',...options,authenticateJoin:async(_req,data)=>({role:['student','admin','waiting','guest'].includes(data.role)?data.role:'guest'})});
}
