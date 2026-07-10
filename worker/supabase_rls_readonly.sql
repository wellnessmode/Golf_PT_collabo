-- ============================================================
--  Golf PT — 읽기 전용 RLS (보안 조이기)
--  anon(공개 키)은 SELECT 만. 모든 쓰기는 워커 /db (서비스 키) 경유.
--  Supabase 대시보드 → SQL Editor 에 붙여넣고 RUN.
--  ⚠️ 실행 전에 반드시 아래 순서를 지킬 것 (안 그러면 앱 저장이 막힘):
--     1) 워커에 SUPABASE_SERVICE_KEY 시크릿 추가 + /db 배포
--     2) config.js 에 DB_PROXY_URL 추가 + 앱 배포/새로고침
--     3) 에이전트 config.json 에 useDbProxy:true + 재시작
--     4) 저장/삭제가 정상인지 확인
--     5) 그 다음에 이 SQL 실행 (읽기전용 전환)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['members','assessments','sessions','shot_events','active_sessions','bays','reports']
  loop
    execute format('alter table public.%I enable row level security;', t);
    -- 기존 개방 정책 제거(있으면)
    execute format('drop policy if exists %I on public.%I;', t||'_all_anon', t);
    execute format('drop policy if exists %I on public.%I;', t||'_ro_anon', t);
    -- anon 읽기 전용
    execute format('create policy %I on public.%I for select to anon using (true);', t||'_ro_anon', t);
  end loop;
end $$;

-- reports 는 공유 링크용 — 읽기만 유지(이미 위에서 select 허용).
-- 서비스 롤(워커)은 RLS 를 우회하므로 별도 정책 불필요.
