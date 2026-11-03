import { projectWebinar, type Webinar } from '../../features/campus/webinar/domain';
export const config:Webinar={slug:'moonshot-open',title:'AI와 함께, 내 일의 다음 도약',description:'오늘의 아이디어가 내일의 결과물이 되는 곳.\n문샷 오픈 캠퍼스에서 먼저 만나보세요.',status:'published',startsAt:'2026-11-07T10:00:00.000Z',endsAt:'2026-11-07T12:00:00.000Z',cohortId:'00000000-0000-4000-8000-000000000001',detailPath:'/classes/moonshot',kakaoUrl:'https://pf.kakao.com/_moonshot/chat',youtubeId:'',revision:'00000000-0000-4000-8000-000000000002'};
export const event=projectWebinar(config);
