# Jakal Office Google 로그인·AI 편집 활성화

> 현재 기본 연결은 **Google 로그인 + Cloudflare Workers AI Free**입니다. 결제 없이 설정하는 최신 절차는 [Cloudflare 무료 AI 안내](cloudflare-ai-setup.md)를 따르세요. 아래 Gemini 연결 설명은 이전 구현 기록이며 현재 사이트의 생성 경로로 사용하지 않습니다.

코드는 Firebase Authentication의 Google 로그인, Firebase AI Logic의 Gemini 호출, App Check(reCAPTCHA Enterprise), 원문 diff와 선택 적용을 사용합니다. 방문자는 API 키를 입력하지 않습니다. AI 사용량은 운영자 Firebase 프로젝트에 귀속되며 개인 Gemini 웹 구독의 사용 한도를 가져오는 연결이 아닙니다.

현재 사이트는 정적 Sites 배포입니다. Python 서버나 MCP는 필요하지 않습니다. Firebase 설정이 없을 때는 로그인·생성을 비활성화하고 설정 안내를 표시합니다. 문서 열기·일반 편집은 그대로 사용할 수 있습니다.

## 1. Firebase 프로젝트와 웹앱

1. [Firebase Console](https://console.firebase.google.com/)에서 운영자 Google 계정으로 프로젝트를 선택하거나 새 프로젝트를 만듭니다. 새 프로젝트의 약관 동의와 요금제 선택은 계정 소유자가 직접 합니다. 유료 요금제로 자동 전환하지 않습니다.
2. 프로젝트 설정 → 일반 → 내 앱 → 웹앱(</>)을 등록합니다. Firebase Hosting 추가는 필요하지 않습니다.
3. SDK 설정에서 firebaseConfig의 `apiKey`, `authDomain`, `projectId`, `appId`를 확보합니다. 아래의 apiKey는 공개 Firebase 웹앱 식별 설정이며 Gemini 제공자 비밀 키가 아닙니다. 서비스 계정 JSON, private_key, OAuth client_secret은 이 사이트에 넣지 않습니다.

## 2. Google 로그인

1. Authentication → Sign-in method → Google을 사용 설정합니다. 프로젝트의 지원 이메일을 선택해 저장합니다.
2. Authentication → Settings → Authorized domains에 다음 호스트를 추가합니다. https://, 경로, 마지막 /는 붙이지 않습니다.

   `jakal-office-online.ahnd6474.chatgpt.site`

3. 로컬 테스트가 필요한 경우에만 `localhost`와 `127.0.0.1`도 추가합니다.
4. 기본 authDomain `PROJECT_ID.firebaseapp.com`은 브라우저의 타사 저장소 차단으로 인증 복귀에 실패할 수 있습니다. 이 사이트에는 공식 Firebase Google 인증 도우미를 `/__/auth/`에 제공하는 같은 도메인 경로를 준비합니다. OAuth 웹 클라이언트의 승인된 리디렉션 URI에 `https://jakal-office-online.ahnd6474.chatgpt.site/__/auth/handler`를 **먼저** 추가한 뒤 공개 설정의 authDomain을 `jakal-office-online.ahnd6474.chatgpt.site`로 변경하고 재배포합니다. 기존 Firebase 반환 URI는 유지합니다. OAuth 클라이언트 비밀 키는 사이트에 제공하지 않습니다.
5. Google Auth Platform이 테스트 모드라면 먼저 사용할 Google 계정을 Test users에 추가합니다. 일반 공개 로그인 전에는 Audience/Publishing status를 확인합니다. 동의 화면과 필요한 정책 정보는 운영자 계정에서 완료합니다.

### 정적 Sites의 인증 도우미 유지 관리

- `.artifacts/sites/jakal-office-online`에서 `node sync-auth-helpers.mjs`를 실행하면 공식 Firebase 도우미 7개를 갱신하고 출처·해시를 기록합니다. `__/firebase/init.json`은 기존 공개 웹앱 설정에서 생성합니다. 이 프로젝트에는 Firebase Hosting 배포가 없어 원격 init.json은 제공되지 않습니다.
- Google 로그인에만 사용합니다. Apple·SAML은 이 정적 도우미 경로의 지원 대상이 아닙니다. Firebase 인증 업데이트 때 공식 도우미도 다시 동기화하고 배포합니다.
- 같은 도메인을 활성화하면 팝업 대신 전체 페이지 로그인으로 이동하며, 돌아온 뒤 기존 문서를 열고 AI 패널을 복원합니다. 복귀 표식에는 시각만 저장하며 10분 후 만료됩니다. 토큰·문서 내용은 표식에 저장하지 않습니다.
- 정적 호스팅에서 `/__/auth/handler`와 `/__/auth/iframe`이 리디렉션 없이 HTML로 제공되는지 검증한 뒤 활성화합니다. [공식 타사 저장소 대응 안내](https://firebase.google.com/docs/auth/web/redirect-best-practices)를 참고하세요.

## 3. Firebase AI Logic

운영 중인 `jakal-office` 프로젝트는 2026-11-04 실제 호출에서 Google의 `The Gemini API free tier is not available for this project` 응답(HTTP 403)을 반환했습니다. 로그인·App Check 통과만으로 무료 AI 사용이 보장되지는 않습니다. 이 상태는 API 키나 보안 검사 우회로 해결할 수 없으며, Google이 요구하는 결제 연결·유료 등급 전환을 운영자가 먼저 결정해야 합니다. 현재 결제는 연결하지 않았습니다. 선결제 계정은 최소 크레딧 구매를 요구할 수 있으므로 [공식 결제 안내](https://aistudio.google.com/docs/billing)를 확인하고 결제·선결제는 계정 소유자가 직접 진행합니다.

1. AI Services → AI Logic → Get started에서 Gemini Developer API를 선택하고 콘솔이 안내하는 초기 설정을 완료합니다. 기존 서버용 Gemini 키를 방문자에게 배포하지 않습니다.
2. 모델은 현재 공식 권장 Flash인 `gemini-3.8-flash`를 기본으로 사용합니다. 프로젝트·지역·할당량에서 실제 사용 가능한지 콘솔에서 확인합니다. 모델 이름은 설정 JSON으로 변경할 수 있습니다.
3. AI Logic → Settings → Authenticated-users mode → Enforce authenticated-users mode를 Enforced로 설정합니다. Google만 로그인 공급자로 켜 둡니다. 프론트엔드 버튼을 숨기는 것만으로 서버 요청을 제한할 수는 없습니다.
4. 콘솔에서 요청 한도와 사용량을 확인합니다. 무료 할당량·요금제·reCAPTCHA 제한은 프로젝트 조건에 따라 확인해야 합니다. 유료 요금제를 선택한다면 운영자가 직접 결제와 예산을 설정합니다. 예산 알림 자체는 사용량의 강제 차단 기능이 아닙니다.

## 4. App Check — 공개 서비스 필수

1. Google Cloud reCAPTCHA Enterprise에서 웹사이트용 키를 만듭니다. 또는 공식 [reCAPTCHA 관리 콘솔](https://www.google.com/recaptcha/admin)에서 기존 Firebase 프로젝트를 선택하고 점수 기반(v3) 키를 등록할 수 있습니다. 도메인에 `jakal-office-online.ahnd6474.chatgpt.site`를 등록하고, App Check 문서에서 안내하는 score-based 웹 통합 설정을 사용합니다. 운영용 키에 localhost를 추가하지 않습니다.
2. Firebase Console → App Check → Apps에서 위 Firebase 웹앱에 reCAPTCHA Enterprise 공급자를 등록합니다. 이때 제공되는 공개 사이트 키가 `appCheckSiteKey`입니다.
3. App Check → APIs → Firebase AI Logic을 Enforced로 설정합니다. 현재 공식 안내상 2026-11-02부터 AI Logic에 App Check 적용이 필수입니다. 이 코드에는 검사를 우회하는 디버그 토큰을 배포하지 않습니다.
4. 모델 요청마다 SDK의 `useLimitedUseAppCheckTokens: true`로 제한 사용 토큰을 발급합니다. 현재 프로젝트는 재생 보호를 ‘모니터링만’으로 두고 기본 App Check 검사는 적용합니다. 모니터링 모드에서도 일반 세션 토큰은 AI 프로젝트 활성 판정에서 검증된 요청으로 인정되지 않아 403이 지속될 수 있으므로 세션 토큰으로 되돌리지 않습니다. [공식 403 안내](https://firebase.google.com/docs/ai-logic/error-codes)를 참고하세요. 재생 보호의 강제 적용은 별도 검토 후 설정합니다.

## 5. 코드에 전달할 공개 설정

계정 소유자가 다음 값만 전달하면 나머지 파일 반영·검증·재배포를 진행할 수 있습니다. 로그인 비밀번호·서비스 계정·Gemini 비밀 키·OAuth client_secret은 보내지 않습니다.

```json
{
  "firebase": {
    "apiKey": "AIza...Firebase 웹앱 공개 설정...",
    "authDomain": "PROJECT_ID.firebaseapp.com",
    "projectId": "PROJECT_ID",
    "appId": "1:숫자:web:영숫자"
  },
  "appCheckSiteKey": "reCAPTCHA Enterprise 공개 사이트 키",
  "model": "gemini-3.8-flash"
}
```

이 예시 문자열은 실행할 수 있는 실제 키가 아닙니다. JSON 파일로 확보했다면 저장소 루트에서 다음 명령을 실행합니다.

```powershell
node web/scripts/configure-google-ai.mjs --config C:/path/to/public-config.json
```

검증을 통과하면 `.artifacts/sites/jakal-office-online/dist/google-ai-config.json`에 공개 설정과 `enabled:true`를 기록합니다. 그런 다음 Sites 워크플로로 버전 생성·재배포합니다. 이 사이트는 정적 파일이므로 Sites 환경 변수에 값을 넣기만 해서는 브라우저 설정에 반영되지 않습니다. 원본 JSON 파일은 공개 값만 담아도 충분하며, 비밀 키가 섞이지 않도록 전달 전에 확인합니다.

SDK 재번들링(코드 변경 시만): `node web/scripts/build-google-ai.mjs`. 브라우저 SDK는 firebase@12.19.0을 고정해 Node 22 빌드 환경과 호환되게 합니다.

## 6. 활성화 후 검증

1. 사이트 새로고침 → 문서 열기 → AI 편집 → Google로 로그인 → 본인 Google 계정 선택.
2. 문단을 선택하고 요청을 입력한 뒤 수정안 만들기를 누릅니다. 별도 Gemini 사이트로 이동하거나 응답을 붙여넣지 않습니다.
3. 원문/수정안 diff 확인 → 일부 변경 제외 → 적용 → 되돌리기를 확인합니다.
4. 로그아웃하면 미적용 수정안이 지워지고 새 AI 요청이 차단되는지 확인합니다. Google 계정 로그인과 일반 문서 편집 권한은 별개입니다.
5. 팝업 차단은 이 사이트 팝업 허용 후 재시도합니다. `unauthorized-domain`은 Auth 승인 도메인, App Check 오류는 공급자·사이트 키·등록 도메인을 확인합니다. 키 값을 포함한 원본 오류는 방문자에게 노출하지 않습니다.

세션은 이 브라우저 탭 세션에 보관합니다. 문서는 기존처럼 방문자의 브라우저에 저장하며, 생성 요청 시 선택한 문단과 수정 지시만 Firebase AI Logic에 보냅니다. 요청 취소는 브라우저 HTTP 요청과 응답 대기를 취소하며 이미 시작한 서버 처리나 과금을 소급 취소하지 않습니다.

## 7. 운영자가 확인할 리스크

- **무료 AI의 데이터 처리:** 무료 Gemini API에서는 입력·응답이 Google 제품 개선과 사람 검토에 사용될 수 있습니다. 개인정보·민감정보·기밀 문서를 전송하지 않습니다. 사이트의 AI 창에도 이 조건을 안내합니다. AI Monitoring을 꺼도 제공자 자체의 데이터 처리 조건은 바뀌지 않습니다.
- **이용 대상·지역:** Gemini API 약관은 운영자 18세 이상, 18세 미만 대상 또는 접근 가능성이 높은 서비스의 제한을 규정합니다. EEA·스위스·영국에 API 클라이언트를 제공할 때는 유료 서비스만 허용합니다. Google 로그인이나 App Check는 연령·지역 확인을 대신하지 않습니다.
- **비용·할당량:** 결제 계정이 없는 Spark는 무료 할당량을 사용하며, 초과하면 AI 호출이 제한될 수 있습니다. 나중에 Cloud Billing을 연결하면 Gemini API 사용은 종량제로 바뀝니다. 방문자의 Gemini 구독과 무관하게 운영자 프로젝트가 사용량을 부담합니다. App Check 증명 제공자의 한도·비용도 따로 확인합니다.
- **남용:** Google 로그인과 App Check는 남용을 줄이지만 완전히 차단하지는 않습니다. 프로젝트와 사용자별 서버 할당량을 제한합니다. 브라우저의 글자 수 제한·중복 요청 차단은 보안 경계가 아닙니다. Firebase AI Logic의 기본 사용자별 제한은 100 RPM이므로 문서 교정 용도에 맞게 낮추는 것이 좋습니다.
- **학교·조직 계정:** 조직에 생성한 프로젝트에는 조직 관리자의 정책과 계정 수명 주기가 적용됩니다. 졸업·계정 중지·조직 정책 변경으로 운영 권한이나 서비스 지속성이 영향을 받을 수 있습니다. 로그인 동의 화면의 지원 이메일은 이용자에게 표시될 수 있습니다.
- **수정 결과·문서 보관:** AI가 의미·수치·고유명사를 잘못 바꿀 수 있으므로 diff를 검토한 뒤 적용합니다. 브라우저 저장소 삭제·기기 변경은 문서 손실로 이어질 수 있어 완성 문서는 내려받아 별도 보관합니다.

대한민국 Google Cloud 최초 이용 화면은 약관 동의와 별도로 현재 또는 향후 상업적 사용 계획의 확인을 요구할 수 있습니다. 실제 용도와 다른 선언을 하지 않으며, 이 확인을 무료 체험·결제 계정 신청과 혼동하지 않습니다.

관련 근거: [Gemini API 약관·데이터 처리](https://ai.google.dev/gemini-api/terms), [AI Logic 요금](https://firebase.google.com/docs/ai-logic/pricing), [서버 할당량](https://firebase.google.com/docs/ai-logic/quotas).

공식 근거: [Google 로그인](https://firebase.google.com/docs/auth/web/google-signin), [AI Logic 시작](https://firebase.google.com/docs/ai-logic/get-started?platform=web), [인증 사용자만 허용](https://firebase.google.com/docs/ai-logic/auth-mode), [App Check](https://firebase.google.com/docs/ai-logic/app-check), [reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [지원 모델](https://firebase.google.com/docs/ai-logic/models).
