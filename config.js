// Golf PT Collaboration — Supabase 설정
// ---------------------------------------------------------------
// 아래 두 값이 비어 있으면 앱은 localStorage 기반 "로컬 모드"로만 동작합니다.
// (즉, file:// 로 index.html 을 열어도 그대로 동작)
//
// 정P(골프 프로)와 최T(PT 트레이너)가 동일 회원 데이터를 공유하려면:
//   1. https://supabase.com 에서 새 프로젝트 생성
//   2. Project Settings → API 에서 "Project URL" 과 "anon public" key 복사
//   3. 아래 SUPABASE_URL, SUPABASE_ANON_KEY 값 채워넣기
//   4. 같은 폴더의 supabase_schema.sql 을 Supabase SQL Editor 에 붙여넣고 실행
//
// anon key 는 공개돼도 되는 키지만, Row Level Security 정책은
// supabase_schema.sql 에서 기본값으로 설정되어 있습니다. 필요 시 조정하세요.
// ---------------------------------------------------------------

window.APP_CONFIG = {
  SUPABASE_URL: 'https://cacytkmijttyeasmhvhq.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhY3l0a21panR0eWVhc21odmhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MjAyMjUsImV4cCI6MjA5MTQ5NjIyNX0.ovjMFi4WSB18KeTm7MNd4jmvKEmMamObyclMjgXomNg',
  R2_WORKER_URL: 'https://golf-pt-storage.ceo-fc9.workers.dev',
  R2_API_KEY: 'national_gym-golf-pt-qwpiefjwofjwioefhlkjd',
  // (선택) Claude API — 음성 세션카드 자동 정리.
  // 권장: AI_VIA_WORKER=true 로 R2 워커 프록시 사용 (키는 Cloudflare 시크릿에만, 브라우저·깃에 노출 0).
  //   → worker/README.md 참고해서 워커에 /claude 추가 + `wrangler secret put ANTHROPIC_API_KEY` 후 true 로.
  // 대안: 키를 각 기기 앱에서 "🤖 AI 정리 설정"으로 입력(localStorage). 이 경우 아래는 비워둠.
  AI_VIA_WORKER: true,
  AI_WORKER_URL: '',   // Claude 프록시 워커 주소. 비우면 R2_WORKER_URL 사용. (예: https://ng-claude.ceo-5ef.workers.dev)
  AI_WORKER_KEY: '',   // 워커 인증용 키(시크릿 아님, 게이트용). 비우면 R2_API_KEY 사용.
  ANTHROPIC_API_KEY: '',
  ANTHROPIC_MODEL: 'claude-haiku-4-5',

  // ---------------------------------------------------------------
  // B2B 화이트라벨 설정 — 이 블록(+위의 키들)만 바꾸면 다른 센터에
  // 같은 앱을 그대로 배포할 수 있습니다. (센터별 Supabase/R2 분리 권장)
  // ---------------------------------------------------------------
  BRAND: {
    name: 'NATIONAL GYM',                       // 영문 브랜드 (헤더·리포트 상단)
    nameKo: '내셔널짐',                          // 한글 브랜드 (문구·푸터)
    sub: 'GOLF & PT',                           // 브랜드 서브 타이틀
    tagline: 'COLLABORATIVE COACHING PLATFORM', // 로그인 화면 태그라인
    reportSub: 'GOLF PT · PERFORMANCE',         // 성과 리포트 헤더 서브
    measuredBy: 'TRACKMAN iO',                  // 측정 장비 표기 (리포트 신뢰도 라인)
    // 랜딩(역할 선택) 히어로 배경 사진 — 골프+피트니스 스튜디오 실제 사진 권장.
    // 넣으면 나이키 앱처럼 풀블리드 사진 배경(여러 장이면 5초마다 크로스페이드).
    // 비우면 프리미엄 시네마틱 배경(골프 탄도 모티프)으로 자동 표시.
    // 예: ['assets/hero-golf.jpg', 'assets/hero-fitness.jpg']
    heroImages: [],
    // 랜딩 히어로 하단 카피(한 줄). 비우면 기본 문구.
    heroCopy: '골프와 피트니스가 만나는 곳 · 데이터로 증명하는 코칭'
  },
  // 지도자 명단 — null 이면 기본값(내셔널짐 4인). 센터 배포 시 여기만 교체.
  // 예: [{name:'홍길동 프로', role:'pro'}, {name:'김코치 트레이너', role:'trainer'}]
  INSTRUCTORS: null,
  // 베이(타석) 구성 — null 이면 기본값(1·2번타석 연습겸용 + 3번룸 레슨전용).
  // type: 'practice'(자동 저장) | 'lesson_only'(선별 저장)
  // 예: [{id:'bay1', name:'1번룸', color:'bay-green', type:'lesson_only'}]
  BAYS: null,
  // 초기 비밀번호 오버라이드 — null 이면 기본값. 배포 후 앱 내 '비밀번호 변경' 권장.
  // INSTRUCTORS 를 교체하고 여기를 비워두면 새 지도자는 초기 비밀번호 '0000' 으로 시작.
  // 예: { 'infodesk':'****', '홍길동 프로':'****', '관리자':'****' }
  PASSWORDS: null
};
