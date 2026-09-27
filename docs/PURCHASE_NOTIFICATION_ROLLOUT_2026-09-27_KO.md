# 결제 후 자동 안내 문자·이메일 대체 발송 적용

현재 CRM에는 `purchase_completed` 자동화와 SOLAPI 발송이 있다. 이 변경은 자동화가 회원 프로필보다 해당 결제 주문서의 이름·전화번호·이메일을 우선 사용하게 한다. 문자 접수가 실패하거나 유효한 휴대전화번호가 없을 때만 Resend 이메일로 대체한다. SOLAPI 접수 성공은 실제 휴대전화 수신을 보장하지 않는다.

## 통합·설정 순서

1. 리키님의 최종 통합본에 이 변경을 포함하고, DB의 기존 `crm_automation_engine` migration이 적용됐는지 확인한다. 이 변경 자체에는 새 migration이 없다.
2. DEV Vercel의 SOLAPI 발송 설정과 `CRON_SECRET`, `CRM_DELIVERY_ENABLED`, `RESEND_API_KEY`, `CRM_EMAIL_FROM`을 확인한다. DEV·운영의 Resend 키는 각각 `mail.brandyaction-edu.com` 도메인 발송 권한만 있는 별도 키다. `CRM_SITE_URL`은 DEV에서 `https://brandyaction-edu-dev.vercel.app`, 운영에서 `https://brandyaction-edu.com`으로 설정한다. 환경 변수 변경 뒤에는 해당 버전을 재배포해야 한다. 발송 스위치를 켜기 전에 기존 활성 자동화·예약 캠페인을 검토한다. 현재 DEV에는 별도의 `무료 클래스 신청 안내` 자동화가 활성 상태로 보인다.
3. 관리자 **메시지 템플릿**에서 `transactional` 목적의 LMS 템플릿을 만든다. 링크를 포함하면 SMS 길이 제한을 넘을 수 있다. 예: `[브랜디에듀] 문샷 챌린지 결제가 완료됐습니다. 시작 안내: {{purchase_link}}`. 판매·홍보 문구와 텔레그램 초대 링크는 넣지 않는다.
4. 관리자 **자동 메시지**에서 실행 조건 `결제 완료`, 대상 상품 `문샷 챌린지`, 위 템플릿, 지연 0분을 선택한다. DEV 시험 결제 준비가 끝날 때까지 비활성으로 두고, 시험 직전에 활성화한다.
5. `CRM_PURCHASE_GUIDE_ENABLED=false`인 동안 링크는 `/my/orders`로 연결된다. #210 안내 화면, DB, 운영 설정이 통합되고 검수된 뒤에만 `true`로 바꿔 주문별 `/purchase-onboarding?order=...` 링크를 사용한다.
6. **메시지 템플릿** 상단에서 등록된 SOLAPI 발신번호, 광고 발신자명, 등록된 080 무료수신거부 번호를 확인한다. 임의 번호 입력은 막고, 추가 번호는 운영자가 SOLAPI 등록을 확인한 뒤 `SOLAPI_ALLOWED_SENDER_PHONES` 또는 `SOLAPI_ALLOWED_OPTOUT_PHONES`에 지정해야 선택할 수 있다. 결제·이용 안내 문자만 먼저 켜고 광고 문자는 꺼 둔다.
7. DEV에서 양수 테스트 결제 1건을 완료하고, 주문서 전화번호가 회원 프로필과 다른 계정으로 문자 1건만 접수·수신되는지 확인한다. 자동화 실행 기록과 `crm_message_logs`를 함께 확인한다. 전화번호 없는 테스트 결제 1건에서는 이메일만 접수·수신되는지 확인한다. 취소되거나 결제가 완료되지 않은 주문에는 발송하지 않는다.
8. 같은 코드와 설정을 운영에 적용한 뒤 직원 테스트 주문으로 확인한다. 운영 발신 전에는 운영 `CRM_SITE_URL`을 `https://brandyaction-edu.com`으로 설정한다. 실제 고객 발송은 성공 검수 뒤 자동화를 활성화한다.

Resend에는 이름, 이메일, 사이트 안내 링크만 전달한다. 카드정보·결제금액·휴대전화번호는 보내지 않는다. 이메일 내용은 서버가 고정한 거래 안내 문구이며 관리자 문자 템플릿을 이메일에 그대로 전송하지 않는다. Resend API 요청에는 자동화 실행 ID를 중복 방지 키로 사용한다. 두 채널 모두 실패하면 자동화 실행은 실패로 기록된다.

광고 SMS/LMS는 마케팅 수신동의 회원에게만 보내고 서버가 `(광고) 발신자명`과 `무료수신거부 080번호`를 붙인다. 별도 야간 동의 데이터가 없으므로 한국 시간 21:00~08:00에는 광고 발송을 미루고 다음 08:00에 재시도한다. 정보성 결제 안내에는 광고 문구를 붙이지 않는다. 광고 발송 스위치는 기본 꺼짐이다. 법적 근거: [정보통신망법 제50조](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1030434421), [KISA 스팸 신고 처리절차 안내](https://spam.kisa.or.kr/spam/cm/cntnts/cntntsView.do?cntntsId=1086&mi=1061).
