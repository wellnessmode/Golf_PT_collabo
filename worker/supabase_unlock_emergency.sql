-- ============================================================
--  내셔널짐 피티앤골프 — 비상 잠금 해제 (DB 를 잠금 전처럼 '열림' 으로 되돌림)
--
--  언제: supabase_lock.sql 로 잠근 뒤 앱이 비어 보이거나 저장이 안 될 때, 타석 샷이 안 들어올 때.
--
--  먼저 확인 — DB 를 열면 공개 키만으로 누구나 읽고 쓰게 되니, 아래에 해당하면 이 파일은 실행하지 마세요
--   ① 로그인할 때 '여러 번 틀려서 잠겼어요' 가 나오나요? → DB 문제가 아니라 계정이 잠긴 것(누가 일부러 틀렸을 수 있음).
--        잠긴 계정 보기:  select key, failed, locked_until from private.app_passwords;
--        풀기:            update private.app_passwords set failed = 0, locked_until = null where key = '정우진 프로';
--   ② 영상 올리기·녹음 글 변환·AI 정리만 안 되나요? → 워커 설정 문제일 수 있습니다 (아래 0번만 하고 DB 는 잠가 둠).
--
--  되돌리는 방법
--   0) (워커에 넣었었다면) Cloudflare → Workers & Pages → golf-pt-storage → Settings → Variables 에서
--      LEGACY_KEY_OFF · REC_REQUIRE_AUTH 를 지우고 Deploy.  ← 이 파일은 DB 만 엽니다. 워커 설정은 그대로입니다.
--   1) 옛 버전 앱이 깔린 폰·PC 는 모두 앱을 완전히 닫기(앱 목록에서 위로 밀어 종료).
--      열어 둔 채로 DB 를 열면, 그 기기가 갖고 있던 예전 사본으로 서버의 새 기록(회원 정보·일지)을 덮어쓸 수 있습니다.
--   2) Supabase → SQL Editor → 이 파일 전체 붙여넣기 → RUN
--      → 맨 아래 표: 7개 표마다 '…_open_emergency' 규칙이 '정상 (열림)' 이면 DB 는 열림.
--   3) 그다음 앱을 다시 열기 (새로고침하면 예전처럼 동작)
--  · 로그인 토큰·저장 기록 기능은 그대로 남습니다. 원인을 고친 뒤 supabase_lock.sql 로 다시 잠그면 됩니다.
--  · 주의: 열려 있는 동안에는 공개 키만으로 누구나 읽고 쓸 수 있습니다(잠그기 전과 같은 상태).
--    가능한 빨리 원인을 고치고 다시 잠그세요.
--  · 다시 실행해도 안전합니다.
--  · 'lock timeout' 오류가 나면: 앱이 표를 쓰는 중이라 기다리다 멈춘 것 — 아무것도 바뀌지 않았으니 바로 다시 실행.
-- ============================================================

-- 표를 잠깐 잠그는 작업이 10초 넘게 기다려야 하면 멈춤 (앱이 멈춰 버리지 않게)
select set_config('lock_timeout', '10s', true);

do $$
declare
  v_tables text[] := array['members', 'assessments', 'sessions', 'reports', 'shot_events', 'active_sessions', 'bays'];
  v_t      text;
  v_names  text[];
  v_n      text;
begin
  foreach v_t in array v_tables loop
    if to_regclass('public.' || v_t) is null then
      raise notice '표 public.% 이(가) 없어 건너뜁니다', v_t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', v_t);
    select array_agg(p.policyname::text) into v_names
      from pg_policies p
     where p.schemaname = 'public' and p.tablename = v_t;
    foreach v_n in array coalesce(v_names, '{}'::text[]) loop
      execute format('drop policy %I on public.%I', v_n, v_t);
    end loop;
    execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
                   v_t || '_open_emergency', v_t);
  end loop;
  if to_regclass('private.app_settings') is not null then
    insert into private.app_settings (name, value, updated_at)
         values ('mode', 'open', now())
    on conflict (name) do update set value = 'open', updated_at = now();
    perform set_config('gpt.unlock_mode', 'open', true);
  else
    perform set_config('gpt.unlock_mode', '(토큰 SQL 미실행)', true);
  end if;
  if to_regprocedure('private.gpt_audit_write(text, text, text, text, text, jsonb)') is not null then
    perform private.gpt_audit_write(session_user::text, 'sql', 'settings', 'unlock', 'mode', null);
  end if;
end $$;

-- 확인 표
with t(tbl, ord) as (
  values ('members', 1), ('assessments', 2), ('sessions', 3), ('reports', 4),
         ('shot_events', 5), ('active_sessions', 6), ('bays', 7)
), report as (
  select 1 as grp, t.ord, '규칙' as "구분", p.tablename::text as "표", p.policyname::text as "규칙 이름",
         array_to_string(p.roles, ',') as "누구", p.cmd::text as "명령",
         case when p.policyname = t.tbl || '_open_emergency' then '정상 (열림)' else '⚠️ 예상 밖 규칙 — 다시 실행하세요' end as "판정"
    from pg_policies p join t on t.tbl = p.tablename
   where p.schemaname = 'public'
  union all
  select 2, t.ord, '⚠️', t.tbl, t.tbl || '_open_emergency', '', '', '⚠️ 규칙 없음 — 다시 실행하세요'
    from t
   where to_regclass('public.' || t.tbl) is not null
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = t.tbl and p.policyname = t.tbl || '_open_emergency')
  union all
  select 3, 0, '모드', '', coalesce(current_setting('gpt.unlock_mode', true), '(없음)'),
         '', '', '열림 — DB 만 열었습니다(워커 설정 LEGACY_KEY_OFF·REC_REQUIRE_AUTH 는 그대로). 원인을 고친 뒤 supabase_lock.sql 로 다시 잠그세요'
)
select "구분", "표", "규칙 이름", "누구", "명령", "판정"
  from report
 order by grp, ord, "규칙 이름";
