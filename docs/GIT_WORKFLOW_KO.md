# Git 버전 관리 규칙

## 기준 브랜치

- `main`: 검증이 끝난 운영 배포 기준 소스만 유지합니다. 직접 수정하거나 테스트 용도로 사용하지 않습니다.
- `develop`: 테스트 서버 배포 기준입니다. 기능 브랜치의 변경을 먼저 이곳에 병합해 통합 검수합니다.
- 기능 개발: `develop`에서 `feature/기능명` 브랜치를 만들어 작업합니다.
- 긴급 수정: `fix/문제명` 브랜치를 만들어 작업합니다.

## 권장 작업 순서

```bash
git switch develop
git pull
git switch -c feature/product-payment

# 개발 및 검증 후
git add .
git commit -m "feat: 상품별 결제 화면 연결"
git push -u origin feature/product-payment
```

기능 브랜치는 먼저 `develop`에 병합합니다. 테스트 서버에서 기능·모바일·권한·결제 회귀 검수를 완료한 뒤 `develop → main` 승격 PR을 만들고, 승인된 PR만 병합합니다. Vercel 운영 배포는 `main`만 기준으로 진행합니다.

## 배포 승격 규칙

1. `feature/*` 또는 `fix/*`에서 수정합니다.
2. PR로 `develop`에 병합하면 테스트 서버가 갱신됩니다.
3. 테스트 체크리스트를 모두 통과하면 `develop → main` PR을 만듭니다.
4. CI와 사람 검수가 모두 통과한 PR만 `main`에 병합합니다.
5. `main` 병합 후 운영 서버를 확인하고 해당 커밋에 릴리스 태그를 붙입니다.

운영 장애의 긴급 수정도 테스트 서버 검증을 원칙으로 합니다. 운영 데이터를 테스트하거나 운영 DB에 임시 데이터를 넣지 않습니다.

## 커밋 메시지

- `feat:` 기능 추가
- `fix:` 오류 수정
- `docs:` 문서 수정
- `style:` 화면 스타일 수정
- `refactor:` 동작을 유지한 코드 구조 개선
- `chore:` 설정·도구·의존성 작업

한 커밋에는 하나의 목적만 담고, 관리자·결제·학습 화면처럼 범위가 다른 작업은 커밋을 분리합니다.

## 커밋 금지 파일

- `.env.local` 등 실제 환경변수 파일
- Supabase 서비스 역할 키
- PG 비밀키와 웹훅 비밀값
- `.vercel/`, `.next/`, `node_modules/`

공유가 필요한 환경변수 이름만 `.env.example`에 값 없이 기록합니다.

## 배포 버전 표시

운영 배포가 확정된 커밋에는 태그를 붙입니다.

```bash
git tag -a release-2026-08-06 -m "관리자 v4 운영 배포"
git push origin release-2026-08-06
```

태그는 실제 운영 배포가 끝난 커밋에만 사용합니다.
