# Jakal Office Google 로그인·AI 편집 활성화

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
4. 기본 authDomain은 `PROJECT_ID.firebaseapp.com`을 사용합니다. 직접 OAuth 웹 클라이언트를 구성한 경우 승인된 JavaScript origin은 `https://jakal-office-online.ahnd6474.chatgpt.site`, 리디렉션 URI는 `https://PROJECT_ID.firebaseapp.com/__/auth/handler`입니다. 기본 Firebase Google 공급자 설정은 관련 클라이언트를 자동으로 구성하므로 별도 OAuth 클라이언트 비밀 키를 사이트에 제공할 필요가 없습니다.
5. Google Auth Platform이 테스트 모드라면 먼저 사용할 Google 계정을 Test users에 추가합니다. 일반 공개 로그인 전에는 Audience/Publishing status를 확인합니다. 동의 화면과 필요한 정책 정보는 운영자 계정에서 완료합니다.

## 3. Firebase AI Logic

1. AI Services → AI Logic → Get started에서 Gemini Developer API를 선택하고 콘솔이 안내하는 초기 설정을 완료합니다. 기존 서버용 Gemini 키를 방문자에게 배포하지 않습니다.
2. 모델은 현재 공식 권장 Flash인 `gemini-3.8-flash`를 기본으로 사용합니다. 프로젝트·지역·할당량에서 실제 사용 가능한지 콘솔에서 확인합니다. 모델 이름은 설정 JSON으로 변경할 수 있습니다.
3. AI Logic → Settings → Authenticated-users mode → Enforce authenticated-users mode를 Enforced로 설정합니다. Google만 로그인 공급자로 켜 둡니다. 프론트엔드 버튼을 숨기는 것만으로 서버 요청을 제한할 수는 없습니다.
4. 콘솔에서 요청 한도와 사용량을 확인합니다. 무료 할당량·요금제·reCAPTCHA 제한은 프로젝트 조건에 따라 확인해야 합니다. 유료 요금제를 선택한다면 운영자가 직접 결제와 예산을 설정합니다. 예산 알림 자체는 사용량의 강제 차단 기능이 아닙니다.

## 4. App Check — 공개 서비스 필수

1. Google Cloud reCAPTCHA Enterprise에서 웹사이트용 키를 만듭니다. 도메인에 `jakal-office-online.ahnd6474.chatgpt.site`를 등록하고, App Check 문서에서 안내하는 score-based 웹 통합 설정을 사용합니다. 테스트 도메인은 실제로 사용할 때만 추가합니다.
2. Firebase Console → App Check → Apps에서 위 Firebase 웹앱에 reCAPTCHA Enterprise 공급자를 등록합니다. 이때 제공되는 공개 사이트 키가 `appCheckSiteKey`입니다.
3. App Check → APIs → Firebase AI Logic을 Enforced로 설정합니다. 현재 공식 안내상 2026-11-02부터 AI Logic에 App Check 적용이 필수입니다. 이 코드에는 검사를 우회하는 디버그 토큰을 배포하지 않습니다.
4. 기본 토큰 방식으로 구현했으므로 Replay protection은 Disabled로 둡니다. 제한 사용 토큰을 별도로 구현하지 않은 상태에서 재생 방지만 먼저 활성화하지 않습니다.

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

공식 근거: [Google 로그인](https://firebase.google.com/docs/auth/web/google-signin), [AI Logic 시작](https://firebase.google.com/docs/ai-logic/get-started?platform=web), [인증 사용자만 허용](https://firebase.google.com/docs/ai-logic/auth-mode), [App Check](https://firebase.google.com/docs/ai-logic/app-check), [reCAPTCHA Enterprise](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), [지원 모델](https://firebase.google.com/docs/ai-logic/models).
