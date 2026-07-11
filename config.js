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
    // 랜딩(역할 선택) 히어로 배경 사진 — 골프+피트니스.
    // 앱 실행 시 인트로 몬타주로 0.5초마다 한 장씩 페이드로 넘어가고, 마지막 장에서
    // 2초 후 로그인 화면이 페이드 인. 사진이 로드 안 되면 시네마틱 배경이 자동으로 받쳐줌.
    // ※ 현재: AI 생성 캠페인 컷(nano_banana_2, 2026-07). 골프복+골프모자, 브랜드 로고 없음.
    //   순서는 [립트레이너 → 케틀벨 → 골프스윙]. 골프스윙이 마지막(로그인 배경)이라
    //   로그인 화면이 가장 오래 머무는 대표 컷이 되고, 립트레이너 컷은 0.5초만 스쳐 지나감.
    //   립 트레이너 컷은 실제 제품 사진의 포즈(로우 자세 — 바를 허리 높이 수평으로 잡고
    //   한쪽 끝 번지코드가 위쪽 앵커로 팽팽하게 당겨지는 자세)를 반영해 재생성.
    //   대체 후보(같은 무드 B컷):
    //   립트레이너B  https://d8j0ntlcm91z4.cloudfront.net/user_3DclnJIoK5GfFNglNnflZBOE6EU/hf_20260711_114142_1fa0786f-ab6f-4569-a620-f374b7f7760b_min.webp
    //   케틀벨B      https://d8j0ntlcm91z4.cloudfront.net/user_3DclnJIoK5GfFNglNnflZBOE6EU/hf_20260711_095853_8c89527d-4ace-4aed-b1a2-e89050e1eecb_min.webp
    //   골프스윙B    https://d8j0ntlcm91z4.cloudfront.net/user_3DclnJIoK5GfFNglNnflZBOE6EU/hf_20260711_095836_3d3a35f1-092f-473f-b9b4-3847eb99d9e4_min.webp
    heroImages: [
      'https://d8j0ntlcm91z4.cloudfront.net/user_3DclnJIoK5GfFNglNnflZBOE6EU/hf_20260711_114142_fd490190-78a7-4f2a-b0fa-62785b13fbae_min.webp',
      'https://d8j0ntlcm91z4.cloudfront.net/user_3DclnJIoK5GfFNglNnflZBOE6EU/hf_20260711_095853_b80a39e5-faa3-4ed7-ac1c-1bb3bb721715_min.webp',
      'https://d8j0ntlcm91z4.cloudfront.net/user_3DclnJIoK5GfFNglNnflZBOE6EU/hf_20260711_095835_b93abc73-8191-464f-b788-8a2215ee00f9_min.webp'
    ],
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
