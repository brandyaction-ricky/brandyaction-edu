# 개인 AI 사무실 동시 조회 · 로컬 검수

이 도구는 외부 도메인을 입력받지 않는다. 임시 PostgreSQL(127.0.0.1:45889)과 임시 HTTP 포트·Chromium을 사용하고 종료 후 DB를 없앤다. 이미 인증한 수강생의 사무실 **내부**에서 작업함을 여는 상황이다. 캠퍼스 첫 방문, OAuth, 공간 3D 자산 다운로드 및 Vercel·Supabase의 네트워크·서버리스 용량은 측정하지 않는다.

- 서로 다른 수강생 200명, 기 생성 업무 각 201건. 일반 수강생 역할·행 접근 정책과 실제 DEV 업무 조회 함수, API 핸들러, React 작업함을 사용한다. 인증 세션과 HTTP→Postgres 어댑터는 로컬 전용이다. DB 연결 풀 크기는 20이다.
- 196개 HTTP 사용자와 Chromium 4개(PC 폭 2개, 모바일 폭 2개)가 동시에 목록·직원 명단을 연다. 약 15초 간격으로 두 번 갱신한다. 화면 시간은 이미 로드한 작업함 컴포넌트의 열기 동작부터 첫 업무 제목 표시 후 그리기까지이다.
- 10개 직원이 등록·접수·진행·결과를 보내고 결과 이벤트를 같은 ID로 한 번 더 전송한다. DB에서 10개 업무의 소유자·최종 결과 본문·revision 4·정확한 4개 이력을 확인한다. Chromium에서는 자동으로 바뀐 상태를 확인하고 결과를 눌러 자기 직원의 결과 본문을 연다. Telegram이나 외부 AI는 호출하지 않는다.
- 200은 동시 사용자 수다. 모든 HTTP 요청이 같은 순간에 서버에서 실행된다는 뜻은 아니다. peakHttpInFlight는 로컬 서버에서 동시에 처리 중이던 최대 HTTP 요청 수다.

저장소 의존성과 Chromium이 준비된 상태에서, 다른 프로젝트의 node_modules와 연결되지 않은 **새 임시 디렉터리**에 QA 전용 패키지 pg@8.16.3 및 embedded-postgres@18.1.0-beta.16을 설치한다. 해당 플랫폼 바이너리 패키지의 symlink 복원 단계가 필요하다. 저장소에서 다음처럼 실행한다.

    OFFICE_QA_DEPS=/path/to/isolated-qa-deps QA_RESULT_FILE=/tmp/local-office-results.json node tests/office-capacity/local.mjs

외부 검수의 전제: 현재 고정 DEV는 Vercel Pro이며 200명 호스팅 시험을 진행하지 않았다. [Vercel 공식 정책](https://vercel.com/kb/guide/what-s-vercel-s-policy-regarding-load-testing-deployments)에 따라 담당자와 가능 여부·시간·대상·중단 기준을 먼저 협의한다. 협의안은 고정 DEV만, 200개 합성 세션, 첫 작업함 조회와 15초 갱신 2회, 직원 10개의 보고/재전송으로 한정한다. 다른 서비스 및 운영 도메인은 대상에서 제외한다. 로컬 수치를 호스팅 성능으로 쓰지 않는다.
