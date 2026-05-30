# R2 워커에 Claude 프록시 넣기

음성 세션카드 AI 정리를 **키 노출 없이** 쓰는 가장 안전한 방법.
Anthropic 키가 **Cloudflare 시크릿에만** 저장되고, 브라우저·git 어디에도 안 남습니다.
모든 기기(프로/트레이너 폰·아이패드)가 키 입력 없이 공유합니다.

## 동작
```
앱  ──POST {R2_WORKER_URL}/claude  (헤더: X-API-Key = 기존 R2 키)
                       │
                       ▼
   워커 (env.ANTHROPIC_API_KEY 주입) ──▶ api.anthropic.com
```

## 1단계 — 워커에 키 시크릿 등록 (한 번만)
로컬에서 워커 폴더 들어가서:
```bash
wrangler secret put ANTHROPIC_API_KEY
# 프롬프트 뜨면 sk-ant-... 붙여넣고 엔터
```
> Cloudflare 대시보드로도 가능: Workers & Pages → 해당 워커 → Settings → Variables and Secrets → **Add secret** → 이름 `ANTHROPIC_API_KEY`, 값 `sk-ant-...`

## 2단계 — 워커 코드에 `/claude` 추가
`worker/claude-proxy.js` 의 **A) 블록**을 기존 워커 `fetch` 핸들러 맨 위에 붙이고,
`corsHeaders` 헬퍼(**B**)가 없으면 추가. 그리고 배포:
```bash
wrangler deploy
```
> `env.R2_API_KEY` 는 기존 워커가 X-API-Key 검증에 쓰는 변수명으로 맞추세요.

## 3단계 — 앱 설정 켜기
`config.js`:
```js
AI_VIA_WORKER: true,   // false → true
```
커밋·푸시 (키 아니라서 push 차단 안 됨).

## 4단계 — 확인
배포 후 터미널에서:
```bash
curl -X POST https://golf-pt-storage.ceo-fc9.workers.dev/claude \
  -H "X-API-Key: <기존 R2 키>" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-haiku-4-5","max_tokens":20,"messages":[{"role":"user","content":"핑(퐁이라고만)"}]}'
```
`"text":"퐁"` 나오면 성공. 이제 앱에서 세션 종료 시 자동으로 워커 경유 정리됩니다.

## 폴백 순서 (앱이 자동 처리)
1. `AI_VIA_WORKER=true` → 워커 프록시 (권장)
2. 워커 실패 / 미설정 → 기기에 입력한 localStorage 키 (🤖 AI 정리 설정)
3. 둘 다 없음 → 앱 내장 로컬 엔진 (무료, 항상 동작)

→ 어느 경우에도 앱은 멈추지 않습니다.

## 비용
Claude Haiku 4.5 기준 세션 1회 정리 ≈ **1.4원**. 프로 2명 월 ~500원, 트레이너까지 ~1,100원.
Anthropic 콘솔에서 사용량 알람/한도 걸어두면 안전합니다.
