# 로그인과 본인 확인

## 로그인
- 카카오·네이버·구글: 서버에서 OAuth를 직접 처리한다 (`src/lib/oauth.ts`, `/api/auth/[provider]`).
  콜백 주소는 `{APP_URL}/api/auth/{provider}/callback`. 키가 없으면 해당 버튼은 "준비 중"으로 안내한다.
- 휴대폰 번호 + 비밀번호: 시연 계정과 기존 가입자를 위해 `/login/phone`에 남겨 둔다.

## 본인 확인 (지금: 휴대폰 문자 인증)
- 화면: `/verify/phone` (온보딩 첫 단계에서 이동)
- 규칙: 6자리, 3분 유효, 5번 틀리면 무효, 30초 뒤 재발송, 한 번호로 1시간에 5번까지
- 발송: 솔라피(`SOLAPI_*`). 키가 없으면 시연 모드로 화면에 인증번호를 보여 준다.
- 인증된 번호만 프로필에 저장된다. 다른 계정이 인증한 번호는 쓸 수 없다.

## 나중에 대체: PASS 본인인증
> ⚠️ 휴대폰 문자 인증은 **임시 단계**다. 사업자 등록 뒤 PortOne 본인인증 채널을 계약하면 PASS 인증으로 바꾼다.

- 코드는 이미 들어 있다: `src/lib/identity.ts`, `src/app/onboarding/pass-button.tsx`, `/verify/complete`
- 켜는 법: Vercel 환경 변수에 `NEXT_PUBLIC_PORTONE_STORE_ID`, `NEXT_PUBLIC_PORTONE_IDV_CHANNEL_KEY`, `PORTONE_API_SECRET`을 넣으면
  온보딩 첫 단계가 자동으로 PASS 인증으로 바뀐다 (`idvEnabled()`).
- 바뀌는 점: 실명·생년월일·성별을 인증값으로 고정하고(폼으로 못 바꿈), CI 해시로 한 사람 한 계정을 막는다. 만 19세 미만은 가입할 수 없다.
