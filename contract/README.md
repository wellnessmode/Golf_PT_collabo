# 내셔널짐 전자계약서 시스템

PT · 골프 회원 **재계약 시 약관 변경 고지 누락** 및 서명 누락 문제 해결을 위한
정적 웹 + Supabase 기반 시스템입니다.
1 · 2 · 3호점에서 동일하게 사용할 수 있고, 카카오톡으로 발송된 링크 한 번에 약관 확인 → 동의 → 손글씨 서명까지 완료됩니다.

> 본 디렉터리는 같은 레포의 다른 코드와 **완전히 분리**되어 동작합니다.
> 호스팅 시 `/contract/` 경로만 별도로 노출하면 됩니다.

## 구성

| 영역 | 사용 기술 |
|---|---|
| 프론트엔드 | 정적 HTML / CSS / JS (CDN) |
| 백엔드 | Supabase (PostgreSQL + Auth + RPC) |
| 서명 | signature_pad (캔버스 손글씨) |
| PDF | jsPDF + html2canvas (클라이언트 생성) |
| 발송 | (MVP) 카카오톡 수동 복붙 → (다음 단계) 알림톡 자동화 |

## 페이지

| 경로 | 용도 | 인증 |
|---|---|---|
| `index.html` | 진입 안내 | - |
| `admin.html` | 계약서 발송 | 관리자 (Supabase Auth) |
| `list.html` | 계약 목록 조회 | 관리자 |
| `sign.html?t=TOKEN` | 회원 약관 확인 + 서명 | 토큰 |
| `view.html?id=ID&t=TOKEN` | 서명 완료본 조회 / PDF 저장 | 토큰 또는 관리자 |

## ⚠️ 중요: Supabase 프로젝트 분리

본 전자계약서 시스템은 **반드시 전용 신규 Supabase 프로젝트**에 적용해야 합니다.

- ❌ 기존 골프PT콜라보(`members / assessments / sessions / reports`) 프로젝트에 절대 합치지 마세요
- ❌ 다른 운영 중인 프로젝트에도 합치지 마세요
- ✅ 본 시스템 전용으로 신규 프로젝트를 하나 더 만드세요 (무료 티어로 충분)

`supabase_schema.sql` 에는 안전 가드가 들어 있어 기존 `members` 테이블이 있는 프로젝트에 잘못 실행하면 즉시 중단됩니다.

## 초기 셋업

### 1. 신규 Supabase 프로젝트 생성
1. https://supabase.com → **New project** (이름 예: `nationalgym-contract`)
   - **기존 프로젝트와 별개로 새로 생성**
2. **Project Settings → API** 에서 `Project URL` 과 `anon public key` 메모
3. **SQL Editor** 에서 [`supabase_schema.sql`](./supabase_schema.sql) 전체를 복사하여 실행
   - 실행 시 약관 시드(`combo` 2026-04-28 / `pt` 2025-07-25 / `golf` 2026-04-28) 자동 입력
   - 만약 `이 프로젝트에는 골프PT콜라보 데이터가 이미 존재합니다` 오류가 나면 → 잘못된 프로젝트입니다. 신규 프로젝트를 다시 만들어 주세요.
4. **Authentication → Users → Add user** 로 관리자 계정 추가 (이메일 / 비밀번호)

### 2. 설정 파일 작성

```bash
cp config.example.js config.js
```

`config.js` 를 열어 다음 값을 채워 주세요.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `BUSINESS.owner` (사업주 성함), `BUSINESS.registration_no` (사업자등록번호), 주소, 대표 연락처
- `BRANCHES`: `['1호점','2호점','3호점']`
- `SIGN_BASE_URL`: 배포된 sign.html 의 절대 URL
  - 예: `https://your-domain.com/contract/sign.html`
  - GitHub Pages 사용 시: `https://wellnessmode.github.io/Golf_PT_collabo/contract/sign.html`

> `config.js` 는 `.gitignore` 에 등록되어 있어 git 에 올라가지 않습니다.
> 안전하게 별도 보관하세요.

### 3. 호스팅

- **GitHub Pages**: Repo Settings → Pages → Branch / `main` / Folder `/`
  접속 URL: `https://wellnessmode.github.io/Golf_PT_collabo/contract/`
- **Vercel / Netlify**: 정적 사이트로 폴더 단위 배포
- **로컬 테스트**: `python3 -m http.server 8080` → http://localhost:8080/contract/

## 운영 플로우 (MVP)

```
[관리자]                                            [회원]
  1. admin.html 로그인
  2. 약관 종류 + 지점 선택
  3. 회원 정보 / 계약 항목 / 금액 입력
  4. "서명 링크 생성" 클릭
        └ DB 저장 + 토큰 발급 + 상태='sent'
  5. 자동 생성된 카카오톡 메시지 복사
  6. 카카오 비즈니스 채널 / 1:1 채팅으로
     메시지 붙여넣기 발송         ─────►  7. 링크 클릭
                                          8. 약관 확인
                                          9. 동의 항목 체크
                                         10. 손글씨 서명
                                         11. 제출
 12. list.html 에서 '서명완료' 확인  ◄────  (자동 갱신)
 13. view.html 에서 PDF 저장
```

## 약관 버전 관리

약관 변경 시:
1. `contract_templates` 테이블에 새 version 행 INSERT
2. 기존 동일 contract_type 의 행은 `is_active=false` 로 변경

```sql
update public.contract_templates set is_active=false where contract_type='pt';
insert into public.contract_templates (contract_type, version, title, body_html, agreements_json)
values ('pt', '2026-06-01', '내셔널짐 PT 이용 계약서', $$<h3>...</h3>...$$, '[...]'::jsonb);
```

발송된 계약서는 발송 시점의 `template_id` 를 참조 → 이후 약관이 바뀌어도 추적 가능.
서명된 계약은 `contract_html_snapshot` 에 약관 전문이 박제되어 이중 안전장치.

## 카카오 알림톡 자동화 (다음 단계)

현재 MVP 는 관리자가 메시지를 직접 복붙하여 카카오톡 비즈니스 채널 / 개인톡으로 보냅니다.
이후 알림톡 솔루션 API 키 확보 시:

1. Supabase **Edge Function** `send-alimtalk` 추가
2. 알림톡 템플릿 등록 (사전 승인 필요)
3. `admin.js` 의 링크 생성 직후 Edge Function 호출
4. 회신값 기반으로 `contracts.status` 갱신

지원 가능한 솔루션 예: 알리고, NHN 비즈메시지, 솔라피, 카카오 i 커넥트.

## 만료 처리 자동화

```sql
-- Supabase Cron 에 등록 (대시보드 → Database → Cron Jobs)
-- 매시간 실행
select public.expire_old_contracts();
```

## 법적 고려 사항

- **전자서명법**: 손글씨 서명은 일반전자서명에 해당. 서명자 User-Agent · 시간 · 약관 스냅샷을 보관.
- **개인정보보호법**: 수집 항목 · 이용 목적 · 보유 기간을 약관 본문에 명시. 마케팅은 별도 [선택] 동의.
- **방문판매법 / 할부거래법**: 환불 규정 · 청약철회 안내를 약관 본문에 포함.
- **개인사업자 표시**: 계약서에 상호 · 대표자명 · 사업자등록번호 표기 (config 의 BUSINESS 정보로 자동 반영).

> 본 시스템은 1차 검토용 MVP 입니다. 실제 운영 전 사내 법무 또는 변호사 검토를 권장합니다.

## 디렉터리 구조

```
contract/
├── README.md                  ─ 본 문서
├── supabase_schema.sql        ─ DB 스키마 + RPC + 시드 약관
├── config.example.js          ─ 환경 설정 샘플
├── .gitignore                 ─ config.js 제외
├── index.html                 ─ 진입 안내
├── admin.html                 ─ 관리자 발송
├── list.html                  ─ 관리자 목록
├── sign.html                  ─ 회원 서명
├── view.html                  ─ 완료 조회 / PDF
├── css/
│   └── style.css
└── js/
    ├── supabase.js            ─ 공통 클라이언트
    ├── admin.js
    ├── list.js
    ├── sign.js
    └── view.js
```

## 알려진 제한

- **서명자 IP 미수집**: 클라이언트 자바스크립트만으로는 IP 를 알 수 없음. 필요 시 Supabase Edge Function 으로 RPC 를 감싸 IP 를 채워 넣을 것.
- **PDF 한글 폰트**: html2canvas 로 캡처 후 PNG 를 PDF 에 임베드하므로 한글이 그대로 유지됨. 단 멀티 페이지 분할은 페이지 사이가 잘릴 수 있어 1~2장 분량으로 약관 길이를 관리.
- **알림톡**: MVP 는 수동. 자동화는 외부 솔루션 가입 필요.
- **서명자 본인확인**: 본인인증(휴대폰 PASS 등)은 미적용. 분쟁 시 서명자 본인 여부는 카카오톡 발송 이력 + 휴대폰 일치 + 서명 필체로 판정.
