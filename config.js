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
  // (선택) Claude API — 음성 세션카드 자동 정리에 사용. 비워두면 앱 내장 로컬 엔진으로 폴백.
  // 키 보안: 브라우저 노출 위험이 있어 *내부 운영 PWA 한정* 권장. 외부 공개시엔 Worker 프록시 사용.
  ANTHROPIC_API_KEY: '',
  ANTHROPIC_MODEL: 'claude-haiku-4-5'
};
