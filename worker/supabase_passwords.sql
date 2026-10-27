-- ============================================================
--  내셔널짐 피티앤골프 — 로그인 비밀번호를 서버에 저장 (bcrypt 해시)
--  Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 RUN. 한 번만 실행하면 됨(다시 실행해도 안전).
--
--  · 비밀번호는 private 스키마 표에 bcrypt 해시로만 저장 — 공개(anon) 키로는 표를 읽을 수도 쓸 수도 없음.
--  · 앱은 아래 함수 3개(RPC)로만 확인·변경:
--      pw_login(key, pw)                      로그인 확인
--      pw_change(key, old, new)               본인 비밀번호 변경
--      pw_admin_reset(admin_pw, target, new)  관리자가 직원 비밀번호 초기화(다음 로그인 때 변경 요구)
--  · 같은 계정으로 10번 틀리면 10분 잠금(무차별 대입 방지).
--  · 처음 실행 시 지금의 초기 비밀번호로 채우고 '변경 필요' 표시 → 각자 첫 로그인 때 새 비밀번호를 정함.
--    기기에서 이미 바꿔 쓰던 비밀번호는 그 기기로 첫 로그인할 때 앱이 자동으로 서버에 옮김.
--  · 되돌리기(비상): 맨 아래 주석의 drop 문 실행 → 앱은 예전처럼 기기 저장 방식으로 동작.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;          -- API(PostgREST)로 노출되지 않는 스키마
revoke all on schema private from public;

create table if not exists private.app_passwords (
  key          text primary key,               -- 'infodesk' · '관리자' · 지도자 이름(예: '최현승 트레이너')
  hash         text not null,                  -- bcrypt
  must_change  boolean not null default true,  -- 초기값/관리자 초기화 상태 → 다음 로그인 때 변경 요구
  failed       int not null default 0,         -- 연속 실패 횟수
  locked_until timestamptz,                    -- 잠금 해제 시각
  updated_at   timestamptz not null default now()
);
alter table private.app_passwords enable row level security;   -- 정책 없음 = API 직접 접근 전부 차단
revoke all on private.app_passwords from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on private.app_passwords from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on private.app_passwords from authenticated'; end if;
end $$;

-- 초기 비밀번호 (이미 있는 계정은 건드리지 않음 — 재실행해도 바꾼 비밀번호 유지)
insert into private.app_passwords (key, hash, must_change) values
  ('infodesk',        extensions.crypt('ng2026',    extensions.gen_salt('bf', 10)), true),
  ('관리자',           extensions.crypt('admin0000', extensions.gen_salt('bf', 10)), true),
  ('정우진 프로',      extensions.crypt('jung00',    extensions.gen_salt('bf', 10)), true),
  ('홍태양 프로',      extensions.crypt('hong00',    extensions.gen_salt('bf', 10)), true),
  ('최현승 트레이너',  extensions.crypt('choi00',    extensions.gen_salt('bf', 10)), true),
  ('이상렬 트레이너',  extensions.crypt('lee000',    extensions.gen_salt('bf', 10)), true)
on conflict (key) do nothing;

-- 실패 1회 기록(10회째에 10분 잠금 후 횟수 초기화). 내부용 — API 로 호출 불가.
create or replace function private.pw_fail(p_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.app_passwords
     set failed       = case when failed + 1 >= 10 then 0 else failed + 1 end,
         locked_until = case when failed + 1 >= 10 then now() + interval '10 minutes' else locked_until end
   where key = p_key;
$$;
revoke all on function private.pw_fail(text) from public;

-- 로그인 확인 → {ok, must_change} / {ok:false, locked, retry_after} / {ok:false, unknown}
create or replace function public.pw_login(p_key text, p_pw text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare r private.app_passwords%rowtype;
begin
  if p_key is null or p_pw is null or length(p_key) > 64 or length(p_pw) > 128 then
    return json_build_object('ok', false);
  end if;
  select * into r from private.app_passwords where key = p_key for update;
  if not found then
    return json_build_object('ok', false, 'unknown', true);
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    return json_build_object('ok', false, 'locked', true,
                             'retry_after', ceil(extract(epoch from (r.locked_until - now())))::int);
  end if;
  if r.hash = extensions.crypt(p_pw, r.hash) then
    update private.app_passwords set failed = 0, locked_until = null where key = p_key;
    return json_build_object('ok', true, 'must_change', r.must_change);
  end if;
  perform private.pw_fail(p_key);
  return json_build_object('ok', false);
end;
$$;

-- 본인 비밀번호 변경 → {ok} / {ok:false, weak|locked|unknown}
create or replace function public.pw_change(p_key text, p_old text, p_new text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare r private.app_passwords%rowtype;
begin
  if p_key is null or p_old is null or length(p_key) > 64 or length(p_old) > 128 then
    return json_build_object('ok', false);
  end if;
  if p_new is null or length(p_new) < 4 or length(p_new) > 64 then
    return json_build_object('ok', false, 'weak', true);
  end if;
  select * into r from private.app_passwords where key = p_key for update;
  if not found then
    return json_build_object('ok', false, 'unknown', true);
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    return json_build_object('ok', false, 'locked', true,
                             'retry_after', ceil(extract(epoch from (r.locked_until - now())))::int);
  end if;
  if r.hash <> extensions.crypt(p_old, r.hash) then
    perform private.pw_fail(p_key);
    return json_build_object('ok', false);
  end if;
  update private.app_passwords
     set hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)),
         must_change = false, failed = 0, locked_until = null, updated_at = now()
   where key = p_key;
  return json_build_object('ok', true);
end;
$$;

-- 관리자가 직원 비밀번호 초기화(없는 계정이면 새로 만듦) → 대상은 다음 로그인 때 변경 요구
create or replace function public.pw_admin_reset(p_admin_pw text, p_target text, p_new text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare a private.app_passwords%rowtype;
begin
  if p_admin_pw is null or length(p_admin_pw) > 128 then
    return json_build_object('ok', false);
  end if;
  if p_target is null or length(btrim(p_target)) < 1 or length(p_target) > 64 then
    return json_build_object('ok', false, 'bad_target', true);
  end if;
  if p_new is null or length(p_new) < 4 or length(p_new) > 64 then
    return json_build_object('ok', false, 'weak', true);
  end if;
  select * into a from private.app_passwords where key = '관리자' for update;
  if not found then
    return json_build_object('ok', false, 'unknown', true);
  end if;
  if a.locked_until is not null and a.locked_until > now() then
    return json_build_object('ok', false, 'locked', true,
                             'retry_after', ceil(extract(epoch from (a.locked_until - now())))::int);
  end if;
  if a.hash <> extensions.crypt(p_admin_pw, a.hash) then
    perform private.pw_fail('관리자');
    return json_build_object('ok', false);
  end if;
  update private.app_passwords set failed = 0, locked_until = null where key = '관리자';
  insert into private.app_passwords as t (key, hash, must_change)
       values (p_target, extensions.crypt(p_new, extensions.gen_salt('bf', 10)), true)
  on conflict (key) do update
       set hash = excluded.hash, must_change = true, failed = 0, locked_until = null, updated_at = now();
  return json_build_object('ok', true);
end;
$$;

-- 공개 키(anon)로는 위 함수 3개만 호출 가능
revoke all on function public.pw_login(text, text)             from public;
revoke all on function public.pw_change(text, text, text)      from public;
revoke all on function public.pw_admin_reset(text, text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.pw_login(text, text) to anon';
    execute 'grant execute on function public.pw_change(text, text, text) to anon';
    execute 'grant execute on function public.pw_admin_reset(text, text, text) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.pw_login(text, text) to authenticated';
    execute 'grant execute on function public.pw_change(text, text, text) to authenticated';
    execute 'grant execute on function public.pw_admin_reset(text, text, text) to authenticated';
  end if;
end $$;

-- API 가 새 함수를 바로 인식하도록
notify pgrst, 'reload schema';

-- ---------- 되돌리기(비상시에만, 필요할 때 주석 풀고 실행) ----------
-- drop function if exists public.pw_admin_reset(text, text, text);
-- drop function if exists public.pw_change(text, text, text);
-- drop function if exists public.pw_login(text, text);
-- drop function if exists private.pw_fail(text);
-- drop table if exists private.app_passwords;
