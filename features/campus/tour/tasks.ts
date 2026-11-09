import type {TourRole,TourRoom} from './model';
export type TourTask={id:string;room:TourRoom;group:string;title:string;description:string;admin?:boolean;limited?:boolean};
const task=(id:string,room:TourRoom,group:string,title:string,description:string,admin=false,limited=false):TourTask=>({id,room,group,title,description,admin,limited});
export const tourTasks:TourTask[]=[
 task('library:all','library','무료로 배우기','자료·다시보기','무료 자료와 다시보기를 한 화면에서 선택'),
 task('library:files','library','무료로 배우기','무료 자료','공개 자료 보기와 다운로드'),task('library:replay','library','무료로 배우기','다시보기','공개 유튜브 영상으로 복습하기'),
 task('learning','study','배우고 실행하기','수업·과제','오늘 할 수업과 제출할 과제'),
 task('growth','study','배우고 실행하기','성장·미션 지도','일차별 진행, 이정표와 성장 카드'),
 task('focus','study','배우고 실행하기','집중과 휴식','25분·50분·자유 집중과 짧은 휴식'),
 task('journal','study','배우고 실행하기','실행 수첩','오늘 한 일과 다음 행동 다시 보기'),
 task('ai','study','질문하고 도움받기','AI 조교·멘토','수업 선택, 캡처 첨부와 질문 흐름',false,true),
 task('support:request','study','질문하고 도움받기','도움 요청','시도한 방법과 막힌 부분 정리'),
 task('support:history','study','질문하고 도움받기','내 지원 기록','요청한 도움과 담당자 답변'),
 task('support:sessions','study','질문하고 도움받기','공부 약속·질문 상담','같이 공부할 시간과 상담 예약'),
 task('support:library','study','질문하고 도움받기','수업 자료 찾기','막힌 상황에 맞는 공개 수업 찾기'),
 task('feedback','study','동료와 함께하기','결과물·동료 피드백','파일·사이트 공유, 의견과 수정 비교'),
 task('community:mine','study','동료와 함께하기','내 결과물·로켓','내 작업 모음, 성장 점수와 발사 조건'),
 task('community:talent','study','동료와 함께하기','재능 교환','서로 필요한 도움을 제안하고 완료하기'),
 task('community:demo_day','study','동료와 함께하기','결과물 발표회','발표 일정, 동료 질문과 발표 기록'),
 task('lounge','study','동료와 함께하기','동료와 대화','공부방에 함께 있는 동료를 보고 인사하기'),
 task('sound','study','나에게 맞추기','공간 소리·참여 방식','조명·빗소리·키보드 소리, 조용히 또는 함께'),
 task('legacy-space','study','나에게 맞추기','기존 우주선·기념사진','기존 달·로켓 공간과 사진·발사 연출'),
 task('desk','study','나에게 맞추기','내 자리 설정','개인 책상 메모와 사진 참여 설정'),
 task('support:settings','study','나에게 맞추기','참여 설정·수업 변경','알림 선택과 바뀐 수업 확인'),
 task('office','office','AI 직원과 일하기','업무 관리','요청·결과·검토·작업 기록'),
 task('bots','office','AI 직원과 일하기','내 AI 직원','실제 봇 연결 상태와 남은 준비',false,true),
 ...([
 ['brief','내 사업 계획','상품·고객·말투를 정리해 재사용','사업 준비'],['routine','주간 실행 루틴','본업에 맞는 작은 실행 계획','사업 준비'],['decision','선택의 기록','선택한 이유와 나중에 확인할 결과','사업 준비'],
 ['recipe','나의 작업 순서','요청문·순서·자료를 저장하고 재사용','만들고 점검하기'],['campaign','캠페인 설계','콘텐츠부터 신청까지 연결 확인','만들고 점검하기'],['checklist','공개 전 직접 점검','모바일·링크·신청 동선 점검','만들고 점검하기'],['practice','혼자 해보기','다른 상품에 배운 작업 적용','만들고 점검하기'],['rehearsal','고객과 대화 연습','질문과 실제 들은 답을 구분해 기록','만들고 점검하기'],
 ['experiment','실험 노트','예상·실행·실패·배운 점','성과 돌아보기'],['metric','성과 기록','문의·매출·실행·시간의 본인 기록','성과 돌아보기'],['outcomes','개인 성과 대시보드','학습과 사업 성과를 구분해 비교','성과 돌아보기'],['timeline','실행 과정 돌아보기','계획에서 실행 결과까지 흐름','성과 돌아보기'],['review','고객 테스트 기록','테스트 계획과 관찰한 내용','고객과 검증하기'],['customers','외부 고객 테스트','공유 범위·응답·종료 흐름 체험','고객과 검증하기'],['case','성과 사례 후보','동의한 내용만 사례 검토에 전달','성과 돌아보기'],['routes','업종별 실행 경로','내 업종과 상황에 맞는 사례','사업 준비'],['resources','막힌 곳에서 수업 찾기','필요한 키워드로 수업 돌아가기','사업 준비']
 ] as const).map(([id,title,description,group])=>task('business:'+id,'office',group,title,description)),
 task('archive','office','내 기록 보관','졸업 후 개인 보관함','과거 본인 기록을 이어 쓰는 화면',false,true),
 task('video','welcome','시작 준비','라이브 다시보기','놓친 내용을 큰 화면으로 보기'),task('notices','welcome','시작 준비','공지사항','수업 일정과 준비할 내용'),task('basics','welcome','시작 준비','AI 기초 지식 배우기','쉬운 예시로 하나씩 알아보기'),task('quiz','welcome','시작 준비','OX 퀴즈','안전하게 AI를 쓰는 기본 원칙'),task('level','welcome','시작 준비','AI 수준 확인','내 학습 시작점 확인'),task('checklist','welcome','시작 준비','내 준비 현황','영상·퀴즈·수준 확인 진행'),
 task('live-video','live','문샷 알아보기','문샷 라이브','행사 영상이 재생되는 자리'),task('experience','live','문샷 알아보기','고객 발견 체험','1분 OX 퀴즈로 고객의 마음 알아보기'),task('offer','live','문샷 알아보기','문샷에서 배우는 것','수강 신청·상세 페이지·상담 동선'),
 task('admin:dashboard','study','관리자 전용','기수별 학습 현황','제출·승인·보완과 검토 대기',true),
 task('admin:support','study','관리자 전용','지원·모임·사용량','지원 대기, 반복 막힘, 상담·AI 사용량',true),
 task('admin:moderation','study','관리자 전용','커뮤니티 신고 검토','신고·숨김·복구 처리',true,true),
 task('admin:space','study','관리자 전용','공간 운영·연결 상태','공지·일시 중지·서버 관측',true),
 task('admin:cases','office','관리자 전용','성과 사례 검토','사례 동의·보완·공개 준비',true),
 task('admin:links','live','관리자 전용','입장 링크 관리','웨비나·웰컴·수강생 링크 설정',true),
];
export function roomTasks(room:TourRoom,role:TourRole){return tourTasks.filter(t=>t.room===room&&(!t.admin||role==='admin'));}
export const taskById=(id:string)=>tourTasks.find(t=>t.id===id);
