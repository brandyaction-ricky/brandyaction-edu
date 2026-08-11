# 브랜디액션 에듀

Next.js 16, Supabase, Toss Payments로 구성한 강의 판매·수강 운영 서비스입니다. 공개 클래스부터 주문·결제, 수강권, VOD·자료·진도, 관리자 상품·회원·주문·리뷰 운영까지 하나의 데이터 흐름으로 연결합니다.

## 구현 범위

- 이메일 인증·로그인, Kakao·Google OAuth, 비밀번호 재설정
- DB 기반 상품 목록·상세·기수 선택과 서버 금액 검증
- Toss Payments 카드·계좌이체·가상계좌 결제, 승인·웹훅·환불
- 결제 완료 수강권 자동 발급, 전액 환불 수강권 자동 회수
- 사용자별 VOD·자료 다운로드·라이브·다시보기·진도·후기
- 관리자 상품·이미지 순서·커리큘럼·기수·회원·주문·환불·리뷰·사이트 설정
- `admin`/`staff` 역할과 스태프 업무 범위에 따른 API·RLS 접근 제어
- 공개 파일과 수강생 전용 파일을 분리한 Supabase Storage 정책

기능별 감사와 남은 운영 작업은 `docs/LAUNCH_AUDIT_2026-08-06_KO.md`를 확인하세요.

## 로컬 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

검증 명령:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## 환경변수

값은 저장소에 커밋하지 않습니다. 필요한 이름과 공개 가능 여부는 `.env.example`에 있습니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_TOSS_CLIENT_KEY`
- `TOSS_SECRET_KEY`
- `TOSS_WEBHOOK_TOKEN`

## 데이터베이스

마이그레이션은 시간순으로 적용합니다.

```text
supabase/migrations/202608040001_initial_education_platform.sql
supabase/migrations/202608060001_launch_transactions.sql
```

두 번째 마이그레이션은 주문 좌석 예약, 결제 멱등 처리, 수강권 발급·회수, 스태프 권한 RLS를 포함합니다. 운영 DB 적용 전 백업과 dry-run 검토가 필요합니다.

## 배포

운영(`main`)과 테스트(`develop`)는 Vercel 프로젝트와 Supabase 프로젝트를 각각 분리합니다. 상세 승격 절차와 검수 기준은 `docs/ENVIRONMENT_OPERATION_KO.md`에 있습니다. Toss 웹훅은 다음 형식으로 등록하며 환경별로 서로 다른 긴 토큰을 사용합니다.

```text
https://<운영도메인>/api/payments/toss/webhook?token=<TOSS_WEBHOOK_TOKEN>
```

`develop`은 테스트 서버에만 자동 배포하고, 운영 배포는 검증 후 `main`에 병합된 커밋만 기준으로 수행합니다.
