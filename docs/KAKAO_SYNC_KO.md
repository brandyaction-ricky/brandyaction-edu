# 카카오싱크 · 가입 / 무료강의 동선

## 적용 범위

- 기존 Supabase 카카오·Google 로그인 유지. 별도 카카오 앱이나 사용자 계정을 만들지 않습니다.
- 카카오 가입 시 카카오 동의 화면에서 **선택 동의한 사용자만** 대표 채널 추가. 미동의로 가입을 차단하지 않습니다.
- 무료강의 CTA는 로그인·회원가입을 거치지 않고 설정된 `https://open.kakao.com/o/...`로 직접 이동합니다. 비로그인 방문자를 자동 채널 친구로 만들지 않습니다.
- 카카오 채널과 오픈채팅방은 별개입니다. 방 입장 완료는 카카오 앱에서 사용자가 진행하며 웹에서 강제로 입장시킬 수 없습니다.
- 카카오에서 검증한 필수 약관 두 항목과 동의 날짜를 저장한 경우만 사이트의 중복 약관 화면을 생략합니다. 검증/저장 오류는 기존 사이트 동의 화면으로 복귀합니다.
- 채널 관계 조회는 선택 기능입니다. 로그인 시 `ADDED/BLOCKED/NONE/UNKNOWN`을 저장하며 실시간 친구 상태는 아닙니다.
- 채널 동의와 이메일·문자 마케팅은 별개입니다. 기존 `profiles.marketing_consent` 및 철회 기록, 회원 권한, 수강 권한은 바꾸지 않습니다.

## DEV 활성화 준비 (현재 기본값: 꺼짐)

1. [Kakao Developers](https://developers.kakao.com/console/app)에서 **기존 로그인 앱**을 사용합니다. 새 앱으로 바꾸면 기존 사용자 식별자가 달라질 수 있습니다.
2. 비즈 앱·비즈니스 채널 연결, 대표 채널 지정, 간편가입을 설정합니다. 채널 추가 동의는 선택 항목으로 노출합니다. 심사·승인이 필요한 항목은 카카오에서 완료합니다.
3. 사이트의 이용약관/개인정보 수집·이용 내용과 동일한 필수 약관을 등록합니다. 현재 코드의 `POLICY_VERSION`은 `2026-08-11`입니다. 새 정책은 새 태그로 등록해야 과거 동의를 재사용하지 않습니다.
4. [DEV 관리자 운영·트래킹 설정](https://brandyaction-edu-dev.vercel.app/admin/settings) 하단에 앱 ID(숫자), 대표 채널 공개 ID(`_...`), 두 약관 태그를 입력합니다. 앱 ID는 REST API 키/시크릿이 아닙니다. `plusfriends` 관계 조회 동의항목 설정을 완료한 경우만 조회 옵션을 켭니다.
5. 설정 확인 체크 후 활성화합니다. 실제 카카오 동의 화면은 카카오의 앱 설정에 따라 표시됩니다. 이 관리 화면이 외부 카카오 설정을 대신 변경하지 않습니다.
6. 랜딩 관리에서 **별도로** 실제 오픈채팅방 주소를 입력하고 발행합니다. 카카오 채널 주소(`pf.kakao.com`)를 방 주소에 넣지 마세요.

## 운영 확인

- 새 카카오 회원: 선택 채널 추가 동의 포함/미포함 모두 가입 가능, 필수 약관 검증.
- 기존 카카오 회원/Google 회원: 기존 계정·권한 유지, 기존 로그인 실패 여부 확인.
- 비로그인/모바일 인앱 브라우저: 무료강의 CTA 즉시 오픈채팅 연결.
- 카카오 API 권한 부족/타임아웃/DB 오류: 동의 수동 확인 가능, 채널 추가 완료 허위 표시 없음.
- 잘못된 앱 ID: 토큰 앱 ID와 불일치 시 동의 저장 안 함.
- 서버 전용 `kakao_sync_members`, `kakao_sync_consent_history`에 최소한의 약관/관계 기록만 저장. provider token은 이 테이블이나 로그에 저장하지 않습니다. Supabase SDK 기본 세션 처리는 유지합니다.
- 설정은 최고 관리자만 수정 가능, 동일 출처 검사·수정 버전 충돌 방지. 모든 새 테이블/RPC는 일반 브라우저 접근 차단.
- 카카오 비즈 앱 승인, 채널 연결, 실제 동의 화면 및 모바일 실계정 검증은 코드만으로 완료할 수 없습니다. 외부 설정 확인 후 마지막 검수가 필요합니다.

## 검증 명령

`npm test`, `npm run lint`, `npm run build`.
DEV SQL 검증은 `tests/kakao-sync-database.sql`을 반드시 `BEGIN; ... ROLLBACK;`으로 실행합니다.

## 공식 문서

- [카카오싱크 사전 설정](https://developers.kakao.com/docs/ko/kakaosync/prerequisite)
- [카카오싱크 개발 가이드](https://developers.kakao.com/docs/ko/kakaosync/dev-guide)
- [카카오 로그인 REST API · 토큰/약관 조회](https://developers.kakao.com/docs/ko/kakaologin/rest-api)
- [카카오톡 채널 관계 조회 API v2](https://developers.kakao.com/docs/ko/kakaotalk-channel/rest-api)
