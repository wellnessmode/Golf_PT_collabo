# AI 전용 워커 분리 배포 — "워커 403: Request not allowed" 해결 (약 5분)

## 무슨 문제인가

2026-09-15 정우진 프로 기기에서 일지 AI 정리가 하루 종일 실패:

```
⚠️ AI 정리 실패 — 사유: 워커 403: Request not allowed
```

이 메시지는 **Anthropic 서버가 돌려준 것**입니다(우리 워커 코드에는 없는 문구). Anthropic 은 지원하지 않는
지역(홍콩 등)에서 온 요청을 403 "Request not allowed" 로 거절합니다.
우리 워커는 사용자와 가장 가까운 Cloudflare 엣지에서 실행되는데, 통신사·경로에 따라 그 엣지가
한국(ICN)이 아니라 홍콩(HKG) 등이 될 수 있습니다. 그래서 **같은 앱인데 특정 사람·특정 날에만** 실패합니다.

## 해결 — Claude 호출만 하는 워커를 따로 만들고 "스마트 배치"를 켠다

스마트 배치(Smart Placement)를 켜면 Cloudflare 가 워커를 **호출 대상(Anthropic, 미국) 가까이**에서
실행합니다. 지역 차단이 사라집니다. 기존 R2 워커에 켜면 영상 재생까지 미국을 거쳐 느려지므로
**AI 전용 워커를 분리**합니다.

앱(v9.88+)은 `AI_WORKER_URL` 을 먼저 시도하고 실패하면 기존 R2 워커로 자동 폴백하므로,
아래 배포 전에도 지금과 똑같이 동작하고, 배포 후엔 새 워커가 우선됩니다.

## 배포 절차 (Cloudflare 대시보드, CLI 불필요)

1. Cloudflare 대시보드 → **Workers & Pages → Create → Create Worker**
2. 이름을 정확히 **`golf-pt-ai`** 로 입력 → Deploy (기본 코드로 일단 생성)
   - 주소가 `https://golf-pt-ai.ceo-fc9.workers.dev` 가 되어야 합니다 (앱 config.js 에 이 주소가 들어 있음).
     계정 서브도메인이 다르면 config.js 의 `AI_WORKER_URL` 을 실제 주소로 고쳐주세요.
3. **Edit code** → 저장소의 `worker/golf-pt-ai-worker.js` 내용을 전부 붙여넣기 → **Deploy**
4. **Settings → Variables and Secrets → Add** (Type: Secret) 두 개
   - `APP_API_KEY` = 앱 config.js 의 `R2_API_KEY` 값과 **동일하게**
   - `ANTHROPIC_API_KEY` = 기존 R2 워커에 등록된 것과 같은 `sk-ant-...`
5. ⭐ **Settings → (Compute 또는 General) → Placement → Smart** 로 변경 → 저장
   - 이 단계가 핵심입니다. 안 켜면 워커를 분리한 의미가 없습니다.
6. 확인: 브라우저로 `https://golf-pt-ai.ceo-fc9.workers.dev/health` 열기 →
   `{"ok":true,"worker":"golf-pt-ai","colo":"...","anthropicKey":true,"appKey":true}`
   - `colo` 가 처음엔 ICN/HKG 등 가까운 곳으로 나올 수 있습니다. 스마트 배치는 요청이 몇 번 쌓인 뒤
     자동으로 위치를 옮깁니다(수 분~수십 분). 이후 `colo` 가 미국 코드(SJC/LAX/IAD 등)로 바뀌면 적용된 것.

## 확인 방법 (앱)

- 프로 기기에서 세션 종료 → 일지 AI 정리가 정상 동작하면 끝.
- 실패 시 앱 문구가 "AI 서버 지역 차단(워커 403)" 이면 아직 스마트 배치가 적용되기 전(또는 5번 누락)입니다.
  잠시 뒤 자동 재시도되며, 계속되면 5번 설정과 `/health` 의 `colo` 를 확인하세요.

## 참고

- 기존 R2 워커의 `/claude` 는 그대로 둡니다(폴백용).
- 스마트 배치는 무료 플랜에서도 켤 수 있습니다.
- 이 워커에는 비밀키가 코드에 없습니다(시크릿에만). 저장소에 그대로 두어도 안전합니다.
