import {EventLounge} from '../../features/campus/event/lounge';
import {EventAdmin} from '../../features/campus/event/admin';
import type {EventView} from '../../features/campus/event/model';
export const eventViewFixture:EventView={slug:'moonshot-winners-1108',title:'당첨을 축하합니다!',description:'라이브에 함께해 주셔서 감사합니다.\n내 사업에 바로 활용할 자료와 특별한 수강 혜택을 준비했어요.',claimed:false,claimEndsAt:'2026-11-09T14:59:00Z',couponEndsAt:'2026-11-12T14:59:00Z',liveEndsAt:'2026-11-12T14:59:00Z',liveOwned:false,liveAvailable:true,resources:[],quote:null,detailPath:'/classes/moonshot'};
export function EventFixture(){if(location.pathname==='/event-admin-preview')return <EventAdmin/>;const signedIn=new URLSearchParams(location.search).has('member');return <EventLounge initial={eventViewFixture} signedIn={signedIn} invite={new URLSearchParams(location.search).get('invite')||''}/>;}
