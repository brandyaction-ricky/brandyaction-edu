# Vercel 배포 안내

## 먼저 확인할 점

첨부 화면의 `Clone Template` 영역은 ZIP 파일을 올리는 곳이 아니라 Vercel의 예제 템플릿을 선택하는 영역입니다. 이 프로젝트 ZIP은 아래 두 방법 중 하나로 배포할 수 있습니다.

## 방법 1 — Vercel CLI로 직접 배포

GitHub 없이 배포할 수 있는 방식입니다.

1. ZIP 압축을 풉니다.
2. 터미널에서 압축을 푼 폴더로 이동합니다.
3. `npm install`을 실행합니다.
4. `npx vercel`을 실행하고 Vercel 계정으로 로그인합니다.
5. 기존 프로젝트에 연결할 때는 기존 프로젝트를 선택합니다.
6. 최종 운영 배포는 `npx vercel --prod`를 실행합니다.

## 방법 2 — Git 저장소를 연결해 배포

1. 압축을 푼 파일 전체를 GitHub 저장소에 올립니다.
2. Vercel에서 `Add New → Project`를 선택합니다.
3. 저장소를 선택하고 `Import`를 누릅니다.
4. Framework Preset은 `Next.js`, Root Directory는 프로젝트 최상위 폴더로 둡니다.
5. Build Command와 Output Directory는 기본값을 사용합니다.
6. `Deploy`를 누릅니다.

## 환경변수

현재 UI만 확인할 때는 환경변수가 필요하지 않습니다. Supabase와 PG를 연결할 때는 `.env.example`의 항목을 Vercel `Settings → Environment Variables`에 등록하고, 비밀키는 파일이나 채팅에 남기지 마세요.

## 확인 주소

- 고객 메인: `/`
- 클래스 상세: `/classes/local-marketing`
- 관리자: `/admin`
- 결제 조회: `/admin/orders`
- 리뷰 관리: `/admin/reviews`
- 기수 관리: `/admin/cohorts`
- 내 클래스: `/my`
