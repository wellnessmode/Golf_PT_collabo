# Golf PT — TrackMan Bay Agent

베이 PC에서 트랙맨 샷 데이터(.ftmf)를 읽어 우리 앱으로 자동 동기화하는 백그라운드 프로그램.

## 동작 원칙 (TPS 무간섭 · 무흔적 · 조용)
- TPS가 자동 생성하는 `Data\*.ftmf` 폴더를 **읽기 전용으로 감시만** 한다.
- TPS 파일을 삭제·이동·수정하지 않는다 (복사·파싱만).
- 콘솔창·트레이·바탕화면 아이콘 없이 백그라운드 실행. 화면에 아무것도 안 띄움.
- 로그·상태파일은 에이전트 자기 폴더에만 기록 (TPS 폴더엔 흔적 0).
- 프로세스명은 평범하게(`golfpt-sync`). 트랙맨 사칭 안 함.
- → 트랙맨코리아가 원격 점검해도 TPS는 평소와 100% 동일하게 보임.

## 데이터 흐름
```
샷 1발 → TPS가 ftmf 생성 (Data\번호_MeasurementId.ftmf)
  → 에이전트 감지(5초 주기)
  → ftmf(ZIP) 안의 Fusion JSON 파싱 → 트랙맨 메트릭 추출
  → (옵션) scene.mkv 영상 → R2 업로드
  → Supabase shot_events 에 insert (source=agent, member 비움)
  → 앱이 같은 베이 활성세션 회원에게 자동 귀속 (활성세션 없으면 숨김)
```

## 추출되는 데이터 (실측 검증 완료)
clubSpeed, ballSpeed, smash, attack, clubPath, faceAngle, faceToPath,
dynamicLoft, impactOffset/Height, launch, launchDir, spin, spinAxis,
maxHeight, hangTime, landAngle, carry, total, side, curve, club(자동감지),
measurementId(영상연결키), trackingUnit(베이매핑)
단위: 거리 m · 속도 m/s · 각도° · 스핀 rpm (앱에서 yd/mph 자동 변환)

## 설치 (베이 PC 1대 기준, 약 5분)

### 1) Node.js 설치 (한 번만)
https://nodejs.org → LTS 버전 → 기본 설치

### 2) 에이전트 폴더 배치
이 `agent` 폴더를 베이 PC의 눈에 안 띄는 곳에 복사. 예:
```
C:\golfpt-sync\
  ├ agent.js
  ├ ftmf-parser.js
  └ config.json   ← 아래에서 생성
```

### 3) config.json 작성
`config.sample.json`을 복사해 `config.json`으로 만들고 값 채우기:
- `SUPABASE_ANON_KEY`, `R2_API_KEY` → 앱 config.js의 값과 동일
- `watchDirs` → 그 PC의 실제 Data 폴더 (보통 아래 그대로)
  `C:\ProgramData\TrackMan\TrackMan Performance Studio\Data`
- `bayMap` → 그 PC 트랙맨의 TrackingUnit(시리얼) → bay_id
  - 3번룸 PC = `"24240089": "bay3"` (확인됨)
  - 1·2번타석은 각 PC About 화면의 시리얼로 매핑
  - 모르면 `defaultBay` 에 그 PC의 bay 지정해도 됨

### 4) 자동시작 설치 (한 번만, 더블클릭)
**`설치_자동시작.bat` 더블클릭.**
- Node.js·config.json 자동 점검
- Windows 시작프로그램에 등록 → **PC 켤 때마다 창 없이 자동 실행**
- node 가 멈춰도 4초 뒤 스스로 재시작 (크래시 자동복구)
- 끝에 "지금 실행" 물어봄 → 바로 백그라운드 가동

이후로는 **PC 만 켜지면 끝.** 프로/직원이 터미널 만질 일 없음.

## 실전 운영 흐름 (프로 입장)
```
PC 부팅(자동) → 에이전트 백그라운드 자동 실행 (안 보임, 손 안 댐)
프로: 폰 앱 열기 → 회원 베이 배정(활성세션 시작) → 고객 샷 → 자동 표시
```
PC 에서 할 일 **없음**. 폰만.

## 관리용 스크립트 (창 숨김이라 확인/제어용)
| 파일 | 용도 |
|---|---|
| `설치_자동시작.bat` | 자동시작 등록 + 지금 실행 |
| `상태확인.bat` | 실행 중인지 + PC시계 + 최근 로그 18줄 (시계 정확/어긋남 확인) |
| `중지.bat` | 지금 실행 중인 에이전트 중지 (자동시작은 유지) |
| `자동시작_해제.bat` | 자동시작 해제 + 지금 것도 중지 |

## 확인
- `상태확인.bat` 실행 → `[실행 중]` + 로그에 `✓ PC 시계 정확` 보이면 정상.
- 베이에서 샷 1발 → 앱 라이브 세션(그 베이 활성세션)에 5~10초 내 자동 표시되면 성공.
- 처리이력 초기화(재전송) 필요 시 `.agent-state.json` 삭제.

## PC 시계 (중요)
에이전트는 시작할 때 Google·Cloudflare 시각과 **교차검증**해 PC 시계 오차를 로그에 남김.
샷 시각이 이상하면 PC 시계가 어긋난 것 — Windows 설정 > 시간 및 언어 >
"지금 동기화", 또는 관리자 cmd `w32tm /resync`. (앱 매칭은 시계 무관하게 동작하지만,
로그·리포트 시각 정확도를 위해 맞춰두는 게 좋음.)
