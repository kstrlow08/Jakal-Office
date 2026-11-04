# Jakal Office 무료 AI 설정

Google 로그인(Firebase Authentication)과 기존 원문 비교·선택 적용·되돌리기는 유지합니다. 생성은 Cloudflare Workers AI의 고정 모델 `@cf/google/gemma-4-26b-a4b-it`만 사용합니다. Gemini API·MCP·개인 API 키 입력·복사 붙여넣기는 사용하지 않습니다.

## 계정 소유자가 직접 할 일

1. https://dash.cloudflare.com/sign-up 에서 무료 계정을 만들고 이메일 인증 후 로그인합니다. 새 비밀번호, 인증 코드, 약관 동의는 계정 소유자가 직접 처리합니다. 카드 등록, 도메인 구매, Workers Paid 업그레이드는 하지 않습니다.
2. CLI 배포가 필요하면 준비된 `deploy/cloudflare-ai` 폴더에서 `npx wrangler login`을 실행했을 때 뜨는 Cloudflare 인증 화면을 확인합니다. 배포 도구에 Workers·AI·Durable Objects 권한을 부여하는 단계는 직접 승인합니다. 비밀번호나 API 토큰을 채팅에 보내지 않습니다. 대시보드 편집 경로를 쓰면 CLI 인증은 필요 없습니다.
3. Workers AI 최초 사용에 별도 약관이나 Gemma 이용 조건 확인이 나오면 직접 읽고 동의 여부를 결정합니다. 결제 요구가 나오면 멈춥니다.

기존 Firebase 프로젝트 `jakal-office`의 Google 로그인·App Check·OAuth 반환 주소는 이미 구성되어 있습니다. 새 Google 프로젝트나 Google 결제 계정은 필요하지 않습니다.

## 준비된 서버 배포

```powershell
Set-Location D:\files\github\Jakal_hwpx\deploy\cloudflare-ai
npm ci --no-fund --no-audit
npm test
npm run check
npx wrangler login --scopes account:read workers_scripts:write ai:write
npm run deploy
```

`wrangler.jsonc`에 AI binding `AI`, SQLite Durable Object `LIMITS`와 migration, Firebase 공개 프로젝트 식별자, 허용 사이트 origin이 포함되어 있습니다. 실제 계정이 여러 개면 본인 계정을 선택합니다. 새 유료 상품은 활성화하지 않습니다. Wrangler는 공식 Cloudflare 배포 도구이며 로그인 자격증명은 도구의 사용자 프로필에 저장될 수 있습니다. 사용 후 `npx wrangler logout`으로 해제할 수 있습니다.

배포 결과의 실제 `https://jakal-office-free-ai.<본인-subdomain>.workers.dev` 주소를 사용합니다. 임의 주소를 추측하지 않습니다. 도메인을 구매하거나 Sites 도메인의 DNS를 바꾸지 않습니다.

```powershell
Set-Location D:\files\github\Jakal_hwpx
node web/scripts/configure-cloudflare-ai.mjs --endpoint https://jakal-office-free-ai.ACTUAL-SUBDOMAIN.workers.dev/edit
```

이 명령은 `/health`에서 AI·한도 binding을 확인한 뒤 공개 연결 설정만 갱신합니다. 실제 문서나 인증 토큰은 보내지 않습니다. 이어서 기존 Sites 소스를 패키징하고 동일 공개 사이트에 재배포해야 적용됩니다. Sites 환경 변수만 추가하는 방식은 아닙니다.

## 보안과 무료 한도

- Worker는 Google ID token의 서명·만료·발급자·audience·Google 공급자·확인된 이메일을 검사하고, App Check token의 서명·만료·프로젝트·정확한 웹앱 ID도 검증합니다. 서비스 계정 비밀 키는 필요하지 않습니다. JWT 오프라인 검증이므로 관리자가 개별 계정을 폐기한 경우 기존 ID token은 만료까지 유효할 수 있습니다.
- 본문 한 문단(1~4,000자)과 요청(1~1,200자)만 전송합니다. 문서 전체, 이미지, 파일명, Google ID token은 AI 모델 프롬프트에 넣지 않습니다. Worker는 검증을 위해 ID token과 App Check token을 받습니다.
- Worker의 콘솔·관측 로그는 끕니다. 한도 저장소는 사용자 UID의 SHA-256 해시, 하루 카운터, 짧은 동시 실행 예약만 보관하며 문서 내용은 저장하지 않습니다. App Check는 서명을 확인하지만 이 Worker에서 단일 사용 토큰 소비 API를 호출하지는 않습니다. 이를 대신한다고 주장하지 않으며 사용자별 한도를 함께 적용합니다.
- 앱 자체 제한: 사용자당 하루 20회·분당 3회·동시 1개, 사이트 전체 하루 300회·동시 4개. 실패한 생성도 한도에 포함합니다. 하루는 UTC 기준이며 한국 시간 오전 9시에 초기화됩니다. 이 제한은 Neurons 예산을 보장하는 값이 아니므로 Cloudflare 무료 연산 한도가 먼저 소진될 수 있습니다.
- Workers AI 무료 연산은 계정 전체 하루 10,000 Neurons입니다. 요청 10,000회가 아닙니다. 다른 Worker가 쓰는 양도 포함합니다. Workers Free에서는 한도 초과 시 실패하며 유료 모델로 자동 전환하지 않습니다. Workers·Durable Objects·인증 공급자에도 별도 무료 한도가 있어 먼저 제한될 수 있습니다.
- 결제 수단을 연결하거나 Workers Paid로 바꾸지 않습니다. 향후 운영자가 요금제를 바꾸면 Cloudflare의 과금 조건이 달라집니다. 코드의 모델 고정·요청 횟수 제한만으로 유료 계정의 청구액 0원을 보장할 수는 없습니다.
- Cloudflare는 Workers AI 입력·응답을 기본 학습에 사용하지 않는다고 안내합니다. 표준 무상태 추론의 콘텐츠 보존 제한에는 법적·안전 목적 등의 예외가 있습니다. 무료 서비스의 용량·지연·한국어 교정 품질은 보장하지 않습니다. AI 결과는 원문과 비교하고 선택해서 적용합니다.

## 검증 순서

1. `/health`는 공개 상태 정보만 반환합니다. 실제 생성이 성공했다는 뜻은 아닙니다.
2. 토큰 없는 `/edit`, 다른 origin, 잘못된 App Check, 크기 초과 본문을 거부하는지 확인합니다.
3. 배포 사이트에서 Google 로그인 → 공개 테스트 문단으로 실제 생성 → diff → 일부 선택 적용 → 되돌리기를 확인합니다.
4. 실패·시간 초과·문서 변경·로그아웃 후 늦게 도착한 응답이 문서에 적용되지 않는지 확인합니다. 불완전한 JSON·여러 문단·토큰 제한으로 잘린 응답은 적용하지 않습니다.

공식 자료: [Workers AI 무료 한도](https://developers.cloudflare.com/workers-ai/platform/pricing/) · [무료 지원 모델](https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/) · [데이터 처리](https://developers.cloudflare.com/workers-ai/platform/data-usage/) · [Durable Objects Free](https://developers.cloudflare.com/durable-objects/platform/pricing/) · [Firebase App Check 서버 검증](https://firebase.google.com/docs/app-check/custom-resource-backend)
