# 워커 재배포 — 녹음 받아쓰기 품질 필터 반영 (약 3분)

`worker/golf-pt-storage-worker.js` 의 `/stt` 가 바뀌었습니다:
- `response_format` 를 `verbose_json` 으로 → Whisper 조각별 신뢰도 지표를 받음
- 무음·저신뢰·반복(환각) 조각을 자동 폐기하고, 전부 걸러지면 원문으로 폴백

> 이 파일에는 **비밀키가 없습니다**(키는 Cloudflare 시크릿에만 있음). 그대로 복사·배포해도 안전합니다.
> 앱(웹) 쪽 변경은 로그인 시 자동 적용되지만, **이 필터는 워커라서 아래 재배포가 있어야 켜집니다.**

---

## 방법 A. Cloudflare 대시보드로 붙여넣기 (CLI 없이 — 권장)

1. 최신 워커 코드 열기 → 전체 선택(Ctrl+A) → 복사(Ctrl+C):
   ```
   https://raw.githubusercontent.com/wellnessmode/Golf_PT_collabo/main/worker/golf-pt-storage-worker.js
   ```
2. **dash.cloudflare.com** 로그인 → **Workers & Pages** → **golf-pt-storage** 클릭.
3. 우측 상단 **Edit code**(또는 **Quick edit**) → 편집기에서 Ctrl+A 로 기존 코드 전체 선택 → 붙여넣기(Ctrl+V) 로 교체.
4. **Deploy**(배포) 클릭.

---

## 방법 B. wrangler CLI (워커 프로젝트 폴더가 PC에 있을 때)

로컬 워커 프로젝트의 진입 파일을 위 최신 `golf-pt-storage-worker.js` 내용으로 덮어쓴 뒤:
```bash
wrangler deploy
```

---

## 확인

배포 후 아무 터미널에서 (빈 오디오 → 400 = 경로·키 정상):
```bash
curl -X POST https://golf-pt-storage.ceo-fc9.workers.dev/stt -H "X-API-Key: <기존 R2 키>" -H "Content-Type: audio/mp4" --data-binary ""
```
`{"error":"empty audio"}` (HTTP 400) 이 나오면 `/stt` 정상.

**실전 확인:** 정프로가 다음 수업을 녹음하면, 예전처럼 "생명선·포기어져" 같은 헛인식 조각이 크게 줄고, 무음 구간에서 지어낸 문장이 사라집니다. 세션 종료 시 AI 일지 정리도 정상 동작해야 합니다.

> `GROQ_API_KEY` 시크릿은 이미 등록돼 있어(현재 STT가 동작 중) 다시 넣을 필요 없습니다.
