-- ============================================================
--  내셔널짐 피티앤골프 — 긴급 수정 SQL (일지 '시간' 칸 + 녹음 원문 지킴이)
--
--  언제: 아무 때나 한 번. 다른 SQL 파일과 순서 상관없음. 다시 실행해도 안전합니다.
--  방법: Supabase → SQL Editor → 이 파일 전체 붙여넣기 → RUN
--        → 맨 아래 결과 표 2줄이 모두 '정상' 이면 끝.
--
--  하는 일
--   1) 일지(sessions) 표에 '시간'(time) 칸을 만듭니다.
--      → 일지를 저장할 때마다 생기던 '실패 1번 + 재전송 1번' 이 없어집니다.
--   2) 녹음 원문 지킴이: 직원 폰이 일지를 다시 저장하면서 원문(supplement)을 빈칸으로 보내도
--      서버에 있던 원문을 그대로 둡니다. (원문이 조용히 지워지던 문제 차단)
--
--  · 표의 '누구나 쓰기' 규칙(정책)은 건드리지 않습니다.
--  · 원문을 일부러 지워야 할 때만(보관기간 정리 등) 같은 실행 안에서 먼저 아래 줄을 넣은 뒤 지웁니다:
--      select set_config('gpt.allow_tx_clear', 'on', true);
--  · 되돌리기(비상시에만): 맨 아래 주석의 drop 2줄 실행. ('시간' 칸은 남겨 둬도 됩니다)
--  · supabase_schema.sql 전체를 다시 실행하지 마세요 — '누구나 쓰기' 규칙이 다시 생깁니다.
--  · 'lock timeout' 오류가 나면: 앱이 표를 쓰는 중이라 기다리다 멈춘 것 — 아무것도 바뀌지 않았으니 1분 뒤 다시 실행.
-- ============================================================

-- 표를 잠깐 잠그는 작업이 10초 넘게 기다려야 하면 멈춤 (앱이 멈춰 버리지 않게)
select set_config('lock_timeout', '10s', true);

-- 1) 일지 '시간' 칸 (레슨 시각 'HH:MM')
alter table public.sessions add column if not exists time text;

-- 2) 녹음 원문 지킴이 — 함수는 API(PostgREST)로 노출되지 않는 private 스키마에 둡니다
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.gpt_keep_supplement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 새 값이 빈칸이고 기존 원문이 있으면 → 기존 원문 유지 (일부러 지우는 실행만 예외)
  if coalesce(new.supplement, '') = ''
     and coalesce(old.supplement, '') <> ''
     and coalesce(current_setting('gpt.allow_tx_clear', true), '') <> 'on' then
    new.supplement := old.supplement;
  end if;
  return new;
end;
$$;
revoke all on function private.gpt_keep_supplement() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function private.gpt_keep_supplement() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function private.gpt_keep_supplement() from authenticated';
  end if;
end $$;

-- 수정(UPDATE)과 앱의 '덮어쓰기 저장'(INSERT … ON CONFLICT DO UPDATE) 둘 다 이 트리거를 거칩니다
drop trigger if exists gpt_keep_supplement on public.sessions;
create trigger gpt_keep_supplement
  before update on public.sessions
  for each row execute function private.gpt_keep_supplement();

-- API 가 새 '시간' 칸을 바로 인식하도록
notify pgrst, 'reload schema';

-- 확인 표 (2줄 모두 '정상' 이어야 함)
select '일지 시간 칸' as "항목",
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'sessions' and column_name = 'time')
            then '정상' else '⚠️ 없음' end as "결과"
union all
select '녹음 원문 지킴이',
       case when exists (select 1 from pg_trigger
                          where tgrelid = 'public.sessions'::regclass and tgname = 'gpt_keep_supplement'
                            and tgenabled <> 'D' and not tgisinternal)
            then '정상' else '⚠️ 없음' end;

-- ---------- 되돌리기(비상시에만, 필요할 때 주석 풀고 실행) ----------
-- drop trigger if exists gpt_keep_supplement on public.sessions;
-- drop function if exists private.gpt_keep_supplement();
