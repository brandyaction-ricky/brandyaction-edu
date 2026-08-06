# 브랜디액션 에듀 Supabase 연결

## 현재 완료된 상태

- 강의 플랫폼용 테이블·RLS·Storage 생성
- 공개 클래스·기수·회차 조회 코드 연결
- 이메일 회원가입·로그인과 카카오·Google 로그인 코드 연결
- `/my` 로그인 보호와 개인 수강권 조회
- `/admin` 관리자 역할 보호
- 연결 상태 확인 API: `/api/health`

## Vercel에 먼저 등록할 값

Supabase 프로젝트 상단 `Connect`에서 아래 두 공개 연결값을 확인한다.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Vercel의 `brandyaction-edu` 프로젝트에서 `Settings → Environment Variables`로 이동해 같은 이름으로 등록하고 Production, Preview, Development에 적용한다.

`service_role` 키, 데이터베이스 비밀번호, PG 비밀키는 채팅·스크린샷·브라우저 코드에 남기지 않는다. 서버 주문·결제 구현 전까지 `SUPABASE_SERVICE_ROLE_KEY`는 등록하지 않아도 된다.

## 연결 확인

환경변수를 등록한 뒤 다시 배포하고 아래 주소를 연다.

```text
https://<배포 도메인>/api/health
```

정상이면 다음과 비슷한 결과가 나온다.

```json
{"ok":true,"service":"supabase","publishedCourses":1}
```

## 첫 관리자 계정

1. 사이트에서 대표 계정으로 회원가입한다.
2. Supabase `Table Editor → profiles`에서 해당 이메일 행을 찾는다.
3. `role`을 `student`에서 `admin`으로 변경한다.
4. 다시 로그인해 `/admin`에 접속한다.

관리자 권한은 이메일이 아니라 `profiles.role`로 판단한다.
