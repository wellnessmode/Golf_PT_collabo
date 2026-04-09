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
  SUPABASE_URL: '',        // 예: 'https://xxxxxxxxxxxx.supabase.co'
  SUPABASE_ANON_KEY: ''    // 예: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};
