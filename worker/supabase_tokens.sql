-- ============================================================
--  내셔널짐 피티앤골프 — 로그인 토큰 + 저장 기록 (보안 1단계 S1a)
--
--  순서
--   1) worker/supabase_passwords.sql 을 먼저 실행합니다. (안 했으면 이 파일은 멈추고 아무것도 바뀌지 않음)
--   2) 이 파일 전체를 Supabase → SQL Editor 에 붙여넣고 RUN
--   3) 맨 아래 결과 표가 모두 '정상' 인지 확인
--  · 다시 실행해도 안전합니다. 토큰 서명용 비밀값은 처음 한 번만 만들고 다시 만들지 않습니다.
--  · 이 파일은 표의 규칙(정책)을 바꾸지 않습니다 → DB 는 지금처럼 열려 있고 아무것도 멈추지 않습니다.
--    (잠금은 맨 마지막 단계 supabase_lock.sql)
--  · supabase_passwords.sql 을 나중에 다시 실행했다면 이 파일도 꼭 바로 다시 실행하세요.
--    (안 하면 로그인해도 토큰이 안 나와서, 잠근 뒤에는 앱이 데이터를 못 읽습니다)
--  · 'lock timeout' 오류가 나면: 앱이 표를 쓰는 중이라 기다리다 멈춘 것 — 아무것도 바뀌지 않았으니 1분 뒤 다시 실행.
--
--  하는 일
--   1) 로그인(pw_login)·비밀번호 변경(pw_change) 성공 시 '토큰'을 함께 돌려줍니다.
--      직원 30일 / 초기·임시 비밀번호로 로그인하면 15분(그 사이 새 비밀번호를 정하면 30일짜리로 바뀜)
--      토큰이 살아 있으면 gpt_refresh 로 비밀번호 없이 새 30일 토큰을 받습니다(비밀번호 로그인 후 90일까지).
--   2) 비밀번호를 바꾸거나 관리자가 초기화하면 그 계정의 예전 토큰은 모두 바로 무효가 됩니다.
--   3) 공개된 초기 비밀번호(ng2026 · jung00 · hong00 · choi00 · lee000 · admin0000)와 지금 비밀번호는
--      새 비밀번호·임시 비밀번호로 쓸 수 없습니다(거절됨).
--   4) 타석 PC 용 토큰을 관리자가 SQL Editor 에서 발급합니다(아래 '운영 중').
--   5) 누가·언제·무엇을 저장·수정·삭제했는지 비공개 기록(private.audit_log)에 남깁니다.
--      비밀번호 자체는 어디에도 기록하지 않습니다.
--
--  ---------- 운영 중 필요할 때 (SQL Editor 에서) ----------
--  타석 PC 토큰 발급:   select private.issue_agent_token('bay3');
--      → 나온 글자 전체를 복사 → 그 PC 의 C:\golfpt-sync\config.json 을 메모장으로 열고,
--        첫 줄 { 바로 다음 줄에 아래 한 줄을 끝의 쉼표까지 그대로 넣고 저장 → 상태확인.bat 으로 '실행 중' 확인
--          "AGENT_TOKEN": "복사한 글자",
--  타석 PC 토큰 바꾸기(PC 교체·유출) — 두 줄을 함께 RUN 해도 됩니다. 나온 새 토큰을 위처럼 넣기:
--      select private.revoke_tokens('agent:bay3');
--      select private.issue_agent_token('bay3');
--  폰 분실 → 그 사람의 기존 토큰 모두 무효:   select private.revoke_tokens('정우진 프로');
--      그다음 그 직원이 새 폰에서 로그인해 비밀번호를 바꾸게 하기 (바꾸면 다른 기기의 토큰도 자동 무효)
--  퇴사·안 쓰는 계정 막기:   select private.disable_account('홍태양 프로');
--      ⚠️ private.app_passwords 에서 행을 지우지 마세요 — 비밀번호 SQL 을 다시 돌리면 공개 초기 비밀번호로 되살아납니다.
--      다시 쓰게 하려면: 앱 관리자 화면 [직원 비밀번호 초기화]로 임시 비밀번호를 정해 직접 알려 주기
--  모든 토큰 무효(비상, 전원 다시 로그인):   select private.revoke_tokens('*');
--  누가 일부러 틀려서 잠긴 계정 풀기:   update private.app_passwords set failed = 0, locked_until = null where key = '정우진 프로';
--  계정 이름은 띄어쓰기까지 똑같이 — 틀리면 아무것도 안 바뀌고 있는 이름 목록을 알려 줍니다.
--  최근 기록 보기:      select * from private.audit_log order by id desc limit 100;
--  2년 지난 기록 정리:  delete from private.audit_log where at < now() - interval '2 years';
-- ============================================================

-- 표를 잠깐 잠그는 작업(트리거 연결)이 10초 넘게 기다려야 하면 멈춤 (앱이 멈춰 버리지 않게)
select set_config('lock_timeout', '10s', true);

-- 0) 먼저 비밀번호 SQL 이 실행됐는지 확인 (아니면 여기서 멈춤 → 아무것도 바뀌지 않음)
do $$ begin
  if to_regclass('private.app_passwords') is null
     or to_regprocedure('public.pw_login(text, text)') is null
     or to_regprocedure('public.pw_change(text, text, text)') is null
     or to_regprocedure('private.pw_fail(text)') is null then
    raise exception '먼저 worker/supabase_passwords.sql 을 실행하세요. 이 파일(supabase_tokens.sql)은 그 다음 순서입니다 — 지금은 아무것도 바뀌지 않았습니다.';
  end if;
  if to_regprocedure('extensions.hmac(bytea, bytea, text)') is null
     or to_regprocedure('extensions.gen_random_bytes(integer)') is null then
    raise exception 'pgcrypto 가 extensions 스키마에 없습니다 — Supabase 대시보드 Database → Extensions 에서 pgcrypto 를 켠 뒤 다시 실행하세요';
  end if;
end $$;

-- 1) 비공개 표 (private 스키마 = API 로 노출되지 않음, 정책 없음 = 공개 키로 접근 불가)
create table if not exists private.app_secrets (
  name        text primary key,
  value       bytea not null,
  created_at  timestamptz not null default now()
);
create table if not exists private.token_revocations (
  u               text primary key,          -- 계정 키('정우진 프로', 'agent:bay3') 또는 '*'(전체)
  revoked_before  timestamptz not null       -- 이 시각 전에 발급된 토큰은 무효
);
create table if not exists private.app_settings (
  name        text primary key,              -- 'mode' = 'open' | 'locked'
  value       text not null,
  updated_at  timestamptz not null default now()
);
create table if not exists private.audit_log (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  u       text,                              -- 누가 (토큰의 계정 / 'anon' = 토큰 없음)
  r       text,                              -- 역할 admin·infodesk·staff·agent·anon
  tbl     text,                              -- 어느 표 / 'auth'(로그인) / 'token' / 'settings'
  op      text,                              -- insert·update·delete·login·pw_change …
  row_id  text,                              -- 어느 행
  info    jsonb                              -- 회원 id·바뀐 칸 이름·접속 IP (값 자체는 남기지 않음)
);
create index if not exists audit_log_at_idx     on private.audit_log (at);
create index if not exists audit_log_tbl_at_idx on private.audit_log (tbl, at);
create table if not exists private.token_seen (   -- 토큰별 마지막 저장 시각 (잠금 전 점검용)
  u        text primary key,
  r        text,
  last_at  timestamptz not null
);

do $$
declare v_t text;
begin
  -- private 스키마 자체도 공개 키 역할에서 막음 (혹시 예전에 열어 둔 적이 있어도)
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema private from authenticated';
  end if;
  foreach v_t in array array['app_secrets', 'token_revocations', 'app_settings', 'audit_log', 'token_seen'] loop
    execute format('alter table private.%I enable row level security', v_t);
    execute format('revoke all on private.%I from public', v_t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on private.%I from anon', v_t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on private.%I from authenticated', v_t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('revoke all on private.%I from service_role', v_t);
    end if;
  end loop;
  execute 'revoke all on sequence private.audit_log_id_seq from public';
end $$;

-- 토큰 서명용 비밀값(32바이트 난수) — 이미 있으면 그대로 (다시 만들면 모든 토큰이 무효가 되므로)
insert into private.app_secrets (name, value)
     values ('token_hmac', extensions.gen_random_bytes(32))
on conflict (name) do nothing;
-- 잠금 상태 — 처음엔 'open'. 이미 있으면 그대로 (잠근 뒤 이 파일을 다시 실행해도 열리지 않음)
insert into private.app_settings (name, value)
     values ('mode', 'open')
on conflict (name) do nothing;

-- 2) 토큰 만들기·확인 (내부용 — API 로 호출 불가)
-- 토큰 = 'gpt1.' + B64URL(내용 JSON) + '.' + B64URL(HMAC-SHA256(비밀값, 'gpt1.' + B64URL(내용 JSON)))
create or replace function private.gpt_b64url(p bytea)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.translate(pg_catalog.encode(p, 'base64'), E'+/=\n', '-_');
$$;

create or replace function private.gpt_b64url_decode(p text)
returns bytea
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.decode(pg_catalog.rpad(pg_catalog.translate(p, '-_', '+/'),
                                           ((pg_catalog.length(p) + 3) / 4) * 4, '='), 'base64');
$$;

create or replace function private.gpt_sign_raw(p_payload text, p_key bytea)
returns text
language sql
stable
strict
set search_path = ''
as $$
  select x.h || '.' || private.gpt_b64url(extensions.hmac(pg_catalog.convert_to(x.h, 'UTF8'), p_key, 'sha256'))
    from (select 'gpt1.' || private.gpt_b64url(pg_catalog.convert_to(p_payload, 'UTF8')) as h) as x;
$$;

create or replace function private.gpt_sign(p_payload jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_key bytea;
begin
  select s.value into v_key from private.app_secrets s where s.name = 'token_hmac';
  if v_key is null then
    raise exception '토큰 비밀값(private.app_secrets)이 없습니다 — supabase_tokens.sql 을 다시 실행하세요';
  end if;
  return private.gpt_sign_raw(p_payload::text, v_key);
end;
$$;

-- 계정 키 → 역할
create or replace function private.gpt_role_of(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_key = '관리자' then 'admin' when p_key = 'infodesk' then 'infodesk' else 'staff' end;
$$;

-- 공개 저장소(supabase_passwords.sql · js/app_core.js)에 이미 적혀 있는 초기 비밀번호 — 비밀번호로 쓰면 안 되는 값
create or replace function private.gpt_public_pws()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['ng2026', 'jung00', 'hong00', 'choi00', 'lee000', 'admin0000']::text[];
$$;

-- 저장된 bcrypt 해시가 위 공개 비밀번호 중 하나인지 (해시가 이상하면 false)
create or replace function private.gpt_hash_is_public(p_hash text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare v text;
begin
  if p_hash is null or p_hash = '' then
    return false;
  end if;
  foreach v in array private.gpt_public_pws() loop
    if extensions.crypt(v, p_hash) = p_hash then
      return true;
    end if;
  end loop;
  return false;
exception when others then
  return false;
end;
$$;

-- 그 계정(또는 '*')의 지금까지 토큰을 무효로: 이 실행 시각(초 단위 올림) 전에 발급된 토큰은 모두 무효.
-- 같은 초 안에 이미 무효 처리가 있었으면(그 직후 발급된 토큰은 발급 시각이 그 무효 시각으로 맞춰져 있음)
-- 1초 더 뒤로 → 이번 무효 처리 전에 나간 토큰은 예외 없이 모두 무효
create or replace function private.gpt_revoke_now(p_u text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t timestamptz := date_trunc('second', now()) + interval '1 second';
  v_b timestamptz;
begin
  select max(v.revoked_before) into v_b
    from private.token_revocations v
   where (p_u = '*' or v.u in (p_u, '*'))
     and v.revoked_before >= v_t and v.revoked_before <= now() + interval '1 minute';
  v_t := greatest(v_t, v_b + interval '1 second');
  insert into private.token_revocations as v (u, revoked_before)
       values (p_u, v_t)
  on conflict (u) do update
       set revoked_before = greatest(v.revoked_before, excluded.revoked_before);
  return v_t;
end;
$$;

-- 토큰 발급 → {token, exp(초), n}
-- 발급 시각(iat)은 그 계정·'*' 을 방금(같은 실행 안에서) 무효로 한 시각보다 앞서지 않게 맞춤 →
-- '무효 처리 → 새로 발급' 을 한 번에 해도 새 토큰은 살아 있음 (비밀번호 변경, 타석 토큰 교체).
-- 1분 넘게 먼 미래로 정해 둔 무효 시각(직접 SQL)은 그대로 지켜짐. p_at = 마지막 비밀번호 로그인 시각(갱신 토큰만)
create or replace function private.gpt_issue_x(p_u text, p_r text, p_b text, p_secs integer, p_at bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_iat bigint := floor(extract(epoch from now()))::bigint;
  v_cut bigint;
  v_exp bigint;
  v_n   text   := encode(extensions.gen_random_bytes(8), 'hex');
begin
  if coalesce(p_u, '') = '' or length(p_u) > 64 or p_r is null
     or p_r not in ('admin', 'infodesk', 'staff', 'agent')
     or (p_r = 'agent' and coalesce(p_b, '') = '')
     or p_secs is null or p_secs < 60 then
    raise exception 'gpt_issue: 잘못된 값';
  end if;
  select max(ceil(extract(epoch from v.revoked_before)))::bigint into v_cut
    from private.token_revocations v
   where v.u in (p_u, '*') and v.revoked_before <= now() + interval '1 minute';
  if v_cut is not null and v_cut > v_iat then
    v_iat := v_cut;
  end if;
  v_exp := v_iat + p_secs;
  return jsonb_build_object(
    'token', private.gpt_sign(jsonb_strip_nulls(jsonb_build_object(
               'u', p_u, 'r', p_r, 'b', p_b, 'iat', v_iat, 'exp', v_exp, 'n', v_n, 'at', p_at))),
    'exp', v_exp,
    'n', v_n);
end;
$$;

create or replace function private.gpt_issue(p_u text, p_r text, p_b text, p_secs integer)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.gpt_issue_x(p_u, p_r, p_b, p_secs, null);
$$;

-- 토큰 확인 → 내용(jsonb) / 틀리거나 만료·무효면 null
create or replace function private.gpt_verify(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_key   bytea;
  v_sig   text;
  v_p     jsonb;
begin
  if p_token is null or length(p_token) < 10 or length(p_token) > 2048 then
    return null;
  end if;
  v_parts := string_to_array(p_token, '.');
  if cardinality(v_parts) <> 3 or v_parts[1] <> 'gpt1'
     or v_parts[2] !~ '^[A-Za-z0-9_-]+$' or v_parts[3] !~ '^[A-Za-z0-9_-]+$' then
    return null;
  end if;
  select s.value into v_key from private.app_secrets s where s.name = 'token_hmac';
  if v_key is null then
    return null;
  end if;
  v_sig := private.gpt_b64url(extensions.hmac(convert_to(v_parts[1] || '.' || v_parts[2], 'UTF8'), v_key, 'sha256'));
  -- 서명 비교: 두 값을 한 번 더 HMAC 한 뒤 비교 (비교 시간으로 서명이 새지 않게)
  if extensions.hmac(convert_to(v_sig, 'UTF8'), v_key, 'sha256')
     <> extensions.hmac(convert_to(v_parts[3], 'UTF8'), v_key, 'sha256') then
    return null;
  end if;
  v_p := convert_from(private.gpt_b64url_decode(v_parts[2]), 'UTF8')::jsonb;
  if jsonb_typeof(v_p) is distinct from 'object'
     or jsonb_typeof(v_p -> 'exp') is distinct from 'number'
     or jsonb_typeof(v_p -> 'iat') is distinct from 'number'
     or jsonb_typeof(v_p -> 'u') is distinct from 'string'
     or coalesce(v_p ->> 'u', '') = ''
     or coalesce(v_p ->> 'r', '') not in ('admin', 'infodesk', 'staff', 'agent') then
    return null;
  end if;
  if (v_p ->> 'exp')::numeric <= extract(epoch from now()) then
    return null;                                              -- 만료
  end if;
  if v_p ->> 'r' = 'agent'
     and (jsonb_typeof(v_p -> 'b') is distinct from 'string' or coalesce(v_p ->> 'b', '') = '') then
    return null;
  end if;
  if exists (select 1 from private.token_revocations v
              where v.u in (v_p ->> 'u', '*')
                and (v_p ->> 'iat')::numeric < ceil(extract(epoch from v.revoked_before))) then
    return null;                                              -- 무효 처리됨
  end if;
  return v_p;
exception when others then
  return null;
end;
$$;

-- 3) 앱·정책이 쓰는 함수 (API 로 호출 가능)
-- 지금 요청의 토큰 내용 (헤더 x-staff-token). 없거나 틀리면 null
create or replace function public.gpt_claims()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_h text;
begin
  v_h := nullif(current_setting('request.headers', true), '');
  if v_h is null then
    return null;
  end if;
  return private.gpt_verify((v_h::json) ->> 'x-staff-token');
exception when others then
  return null;
end;
$$;

create or replace function public.gpt_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((public.gpt_claims() ->> 'r') in ('admin', 'infodesk', 'staff'), false);
$$;

create or replace function public.gpt_is_agent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((public.gpt_claims() ->> 'r') = 'agent', false);
$$;

create or replace function public.gpt_agent_bay()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_c jsonb := public.gpt_claims();   -- 토큰 확인은 한 번만
begin
  return case when v_c ->> 'r' = 'agent' then v_c ->> 'b' end;
end;
$$;

-- 앱이 켜질 때 확인: {ok, u, r, b, exp, mode}  (mode = 'locked' 이면 토큰 없이는 아무것도 안 보임)
create or replace function public.gpt_whoami()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c jsonb := public.gpt_claims();
  v_m text;
begin
  select s.value into v_m from private.app_settings s where s.name = 'mode';
  return jsonb_build_object(
    'ok',   v_c is not null,
    'u',    v_c -> 'u',
    'r',    v_c -> 'r',
    'b',    v_c -> 'b',
    'exp',  v_c -> 'exp',
    'mode', case when v_m = 'locked' then 'locked' else 'open' end);
end;
$$;

-- 저장 워커 전용 (서비스 키로만 호출 가능): 토큰 비밀값(base64), 무효 목록
create or replace function public.gpt_worker_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select replace(encode(s.value, 'base64'), E'\n', '') from private.app_secrets s where s.name = 'token_hmac';
$$;

create or replace function public.gpt_worker_revocations()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(json_agg(json_build_object('u', v.u,
                                             'before_epoch', ceil(extract(epoch from v.revoked_before))::bigint)
                           order by v.u), '[]'::json)
    from private.token_revocations v;
$$;

-- 4) 저장 기록(감사) — 기록이 실패해도 저장·수정·삭제·로그인은 절대 막지 않음
-- 지금 요청이 누구인지 → {u, r, ip, db}
create or replace function private.gpt_who()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_c  jsonb;
  v_db text;
  v_h  json;
  v_ip text;
begin
  v_c  := public.gpt_claims();
  v_db := coalesce(nullif(current_setting('role', true), 'none'), session_user::text);
  begin
    v_h  := nullif(current_setting('request.headers', true), '')::json;
    v_ip := nullif(btrim(coalesce(v_h ->> 'cf-connecting-ip', v_h ->> 'x-real-ip',
                                  split_part(v_h ->> 'x-forwarded-for', ',', 1))), '');
  exception when others then
    v_ip := null;
  end;
  return jsonb_build_object(
    'u',  coalesce(v_c ->> 'u', case when v_db in ('anon', 'authenticated') then 'anon' else v_db end),
    'r',  coalesce(v_c ->> 'r', case when v_db in ('anon', 'authenticated') then 'anon' else v_db end),
    'ip', left(v_ip, 64),
    'db', case when v_db in ('anon', 'authenticated') then null else v_db end);
exception when others then
  return jsonb_build_object('u', 'anon', 'r', 'anon');
end;
$$;

create or replace function private.gpt_audit_write(p_u text, p_r text, p_tbl text, p_op text, p_row_id text, p_info jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into private.audit_log (u, r, tbl, op, row_id, info)
  values (left(p_u, 64), left(p_r, 16), p_tbl, p_op, left(p_row_id, 200), p_info);
exception when others then
  null;
end;
$$;

-- 로그인·비밀번호 변경·토큰 갱신 기록. 무차별 시도로 DB 가 차지 않게 1시간마다
--   계정마다 실패 120건·성공 300건, 없는 계정·잘못된 입력은 모두 합쳐 300건까지만 한 줄씩 남기고,
--   넘친 것은 1시간에 1줄('suppressed', info.n = 생략한 건수)로만 셈.
--   비밀번호 변경 성공은 절대 생략하지 않음 (계정을 누가 가져갔는지 확인하는 유일한 근거)
create or replace function private.gpt_audit_auth(p_key text, p_op text, p_why text, p_extra jsonb default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ok  boolean := (p_why = 'ok');
  v_any boolean := p_why in ('unknown', 'bad_input');      -- 계정과 무관한 값(누구나 아무 이름이나 보낼 수 있음)
  v_key text    := left(coalesce(p_key, ''), 64);
  v_cap integer;
  v_n   integer;
  v_bkt text;
  v_who jsonb;
begin
  if not (v_ok and p_op = 'pw_change') then
    if v_any then
      v_cap := 300;
      select count(*) into v_n
        from (select 1 from private.audit_log a
               where a.tbl = 'auth' and a.at > now() - interval '1 hour'
                 and a.info ->> 'why' in ('unknown', 'bad_input')
               limit 300) as x;
    else
      v_cap := case when v_ok then 300 else 120 end;
      select count(*) into v_n
        from (select 1 from private.audit_log a
               where a.tbl = 'auth' and a.at > now() - interval '1 hour'
                 and a.u = v_key and a.op in ('login', 'pw_change', 'refresh')
                 and coalesce((a.info ->> 'ok')::boolean, false) = v_ok
               limit 300) as x;
    end if;
    if v_n >= v_cap then
      v_bkt := case when v_any then '(없는 계정·잘못된 입력)' else v_key end
               || ' · ' || case when v_ok then '성공' else '실패' end;
      update private.audit_log a
         set info = jsonb_set(a.info, '{n}', to_jsonb(coalesce((a.info ->> 'n')::integer, 0) + 1))
       where a.tbl = 'auth' and a.op = 'suppressed' and a.row_id = v_bkt
         and a.at >= date_trunc('hour', now());
      if not found then
        insert into private.audit_log (u, r, tbl, op, row_id, info)
        values (case when v_any then 'anon' else v_key end, 'anon', 'auth', 'suppressed', v_bkt,
                jsonb_build_object('n', 1, 'ok', v_ok, 'why', 'suppressed'));
      end if;
      return;
    end if;
  end if;
  v_who := private.gpt_who();
  insert into private.audit_log (u, r, tbl, op, row_id, info)
  values (v_key,
          case when v_ok then private.gpt_role_of(p_key) else 'anon' end,
          'auth', p_op, null,
          jsonb_strip_nulls(jsonb_build_object('ok', v_ok, 'why', p_why, 'ip', v_who ->> 'ip', 'db', v_who ->> 'db'))
            || coalesce(p_extra, '{}'::jsonb));
exception when others then
  null;
end;
$$;

-- 표 저장·수정·삭제 기록 (회원·일지·평가·리포트) — 값은 남기지 않고 '바뀐 칸 이름'만
create or replace function private.gpt_audit_row()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old   jsonb;
  v_new   jsonb;
  v_row   jsonb;
  v_cols  text[];
  v_dkeys text[];
  v_who   jsonb;
  v_id    text;
begin
  begin
    if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
    v_row := coalesce(v_new, v_old);
    if tg_op = 'UPDATE' then
      select array_agg(k order by k) into v_cols
        from jsonb_object_keys(v_new) as k
       where (v_new -> k) is distinct from (v_old -> k);
      if v_cols is null then
        return null;                                          -- 바뀐 값 없음(같은 내용 다시 저장) → 기록 안 함
      end if;
      if 'data' = any (v_cols)
         and jsonb_typeof(v_new -> 'data') = 'object' and jsonb_typeof(v_old -> 'data') = 'object' then
        select (array_agg(s.k order by s.k))[1:30] into v_dkeys
          from (select jsonb_object_keys(v_new -> 'data') union select jsonb_object_keys(v_old -> 'data')) as s(k)
         where (v_new -> 'data' -> s.k) is distinct from (v_old -> 'data' -> s.k);
      end if;
    end if;
    v_id := case when tg_table_name = 'assessments'
                 then (v_row ->> 'member_id') || '/' || (v_row ->> 'item_key')
                 else v_row ->> 'id' end;
    v_who := private.gpt_who();
    insert into private.audit_log (u, r, tbl, op, row_id, info)
    values (left(v_who ->> 'u', 64), left(v_who ->> 'r', 16), tg_table_name, lower(tg_op), left(v_id, 200),
            jsonb_strip_nulls(jsonb_build_object(
              'member_id', case when tg_table_name <> 'members' then v_row ->> 'member_id' end,
              'cols',      to_jsonb(v_cols),
              'data_keys', to_jsonb(v_dkeys),
              'ip',        v_who ->> 'ip',
              'db',        v_who ->> 'db')));
  exception when others then
    null;                                                     -- 기록 실패 → 저장은 그대로 진행
  end;
  return null;
end;
$$;

-- 샷 삭제 기록 (한 번에 수백 개를 지워도 토큰 확인은 1번)
create or replace function private.gpt_audit_del_stmt()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_who jsonb;
begin
  begin
    v_who := private.gpt_who();
    insert into private.audit_log (u, r, tbl, op, row_id, info)
    select left(v_who ->> 'u', 64), left(v_who ->> 'r', 16), tg_table_name, 'delete',
           left(to_jsonb(o) ->> 'id', 200),
           jsonb_strip_nulls(jsonb_build_object('member_id', to_jsonb(o) ->> 'member_id',
                                                'bay_id',    to_jsonb(o) ->> 'bay_id',
                                                'ip',        v_who ->> 'ip',
                                                'db',        v_who ->> 'db'))
      from gpt_old_rows as o;
  exception when others then
    null;
  end;
  return null;
end;
$$;

-- 토큰별 마지막 저장 시각 (잠금 SQL 이 '새 앱·새 에이전트가 토큰을 쓰는지' 점검할 때 사용)
create or replace function private.gpt_seen_stmt()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_c jsonb;
begin
  begin
    v_c := public.gpt_claims();
    -- 1분에 한 번만 기록 (매 저장마다 같은 행을 잠그지 않게 먼저 읽어 봄)
    if v_c is not null
       and not exists (select 1 from private.token_seen s
                        where s.u = v_c ->> 'u' and s.last_at > now() - interval '1 minute') then
      insert into private.token_seen as s (u, r, last_at)
           values (v_c ->> 'u', v_c ->> 'r', now())
      on conflict (u) do update
         set r = excluded.r, last_at = excluded.last_at;
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

-- 비밀번호 표(private.app_passwords)를 지켜보는 트리거 — 앱·관리자 초기화·SQL 직접 수정, 어떤 경로든 적용
--   ① 공개된 초기 비밀번호로 정하는 것은 거절 (관리자 임시 비밀번호·지운 계정 되살리기 포함)
--   ② 비밀번호가 바뀌거나, 계정이 새로 생기거나 지워지면 → 그 계정의 예전 토큰은 모두 무효
--   ③ 관리자 초기화·새 계정·계정 삭제는 기록 (pw_admin_reset 함수 자체는 그대로 두고 표에서 감지)
create or replace function private.gpt_audit_pw()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_who jsonb;
  v_key text := case when tg_op = 'DELETE' then old.key else new.key end;
begin
  if tg_op <> 'DELETE'
     and coalesce(current_setting('gpt.pw_plain_ok', true), '') <> 'on'   -- pw_change·disable_account 는 이미 확인함
     and private.gpt_hash_is_public(new.hash) then
    raise exception '공개된 초기 비밀번호(ng2026 · jung00 · hong00 · choi00 · lee000 · admin0000)는 비밀번호로 쓸 수 없습니다 — 계정 %: 다른 값으로 정하세요. 지운 계정을 supabase_passwords.sql 로 다시 만들려던 거라면 앱 관리자 화면 [직원 비밀번호 초기화]로 임시 비밀번호를 정하세요. (아무것도 바뀌지 않았습니다)', v_key;
  end if;
  if tg_op <> 'UPDATE' or new.hash is distinct from old.hash then
    begin
      perform private.gpt_revoke_now(v_key);
    exception when others then
      null;
    end;
  end if;
  begin
    if tg_op = 'DELETE' or new.must_change then
      v_who := private.gpt_who();
      insert into private.audit_log (u, r, tbl, op, row_id, info)
      values (left(v_who ->> 'u', 64), left(v_who ->> 'r', 16), 'auth',
              case when tg_op = 'DELETE' then 'account_delete' else 'pw_reset' end, left(v_key, 64),
              jsonb_strip_nulls(jsonb_build_object(
                'ok', true,
                'why', case when tg_op = 'DELETE' then 'deleted' when tg_op = 'INSERT' then 'new_account' else 'reset' end,
                'ip', v_who ->> 'ip', 'db', v_who ->> 'db')));
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

-- 관리자 토큰으로만 최근 기록 조회 (그 외에는 빈 결과)
create or replace function public.gpt_audit_recent(p_limit integer default 100)
returns table (id bigint, at timestamptz, u text, r text, tbl text, op text, row_id text, info jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.gpt_claims() ->> 'r', '') <> 'admin' then
    return;
  end if;
  return query
    select a.id, a.at, a.u, a.r, a.tbl, a.op, a.row_id, a.info
      from private.audit_log a
     order by a.id desc
     limit least(greatest(coalesce(p_limit, 100), 1), 1000);
end;
$$;

-- 5) 관리자용 (SQL Editor 에서만 — API 로 호출 불가)
-- 계정 이름 찾기: 똑같은 이름 → 앞뒤 빈칸 뺀 이름 → 한글 조합 방식만 다른 이름 (없으면 null)
create or replace function private.gpt_account_key(p_key text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v text;
begin
  if p_key is null then
    return null;
  end if;
  select a.key into v from private.app_passwords a where a.key = p_key;
  if v is null then
    select a.key into v from private.app_passwords a where a.key = btrim(p_key);
  end if;
  if v is null then
    begin
      select a.key into v from private.app_passwords a
       where normalize(a.key, NFC) = normalize(btrim(p_key), NFC)
       order by a.key limit 1;
    exception when others then
      v := null;
    end;
  end if;
  return v;
end;
$$;

-- 타석 PC 토큰 발급: select private.issue_agent_token('bay3');   (기본 400일)
create or replace function private.issue_agent_token(p_bay text, p_days integer default 400)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  -- 저장 워커가 받는 타석 이름과 같은 모양만: 'bay' + 영문·숫자·_·- 1~29자 (다른 모양은 워커가 토큰을 거부함)
  if p_bay is null or p_bay !~ '^bay[A-Za-z0-9_-]{1,29}$' then
    raise exception '타석 이름이 올바르지 않습니다: % (bay 로 시작하는 영문·숫자, 예: bay3)', coalesce(p_bay, '(비어 있음)');
  end if;
  if to_regclass('public.bays') is not null then
    if not exists (select 1 from public.bays b where b.id = p_bay) then
      raise exception '타석 % 이(가) bays 표에 없습니다 — 이름을 확인하세요 (예: bay1, bay2, bay3)', p_bay;
    end if;
  end if;
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception '유효 기간(일)은 1~3650 사이로 넣으세요: %', p_days;
  end if;
  v := private.gpt_issue('agent:' || p_bay, 'agent', p_bay, p_days * 86400);
  perform private.gpt_audit_write(session_user::text, 'sql', 'token', 'issue_agent', 'agent:' || p_bay,
                                  jsonb_build_object('exp', v -> 'exp', 'n', v -> 'n', 'days', p_days));
  return v ->> 'token';
end;
$$;

-- 토큰 무효: select private.revoke_tokens('정우진 프로');  /  'agent:bay3'  /  '*'(전체)
-- 이 실행 시각(초 단위 올림) 전에 발급된 그 계정의 토큰은 모두 무효. 다시 로그인하면 새 토큰이 나옴
-- (퇴사자는 비밀번호를 알고 있으니 revoke 가 아니라 disable_account). 없는 이름이면 아무것도 안 바꾸고 목록을 보여 줌.
create or replace function private.revoke_tokens(p_u text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_in    text := btrim(coalesce(p_u, ''));
  v_u     text;
  v_bay   text;
  v_ok    boolean := false;
  v_t     timestamptz;
  v_names text;
  v_bays  text;
begin
  if v_in = '' or length(p_u) > 64 then
    raise exception '무효로 할 계정 이름을 넣으세요 (예: ''정우진 프로'', ''agent:bay3'', 전체는 ''*'')';
  end if;
  if v_in = '*' then
    v_u := '*';
  elsif v_in like 'agent:%' then
    v_bay := substr(v_in, 7);
    if v_bay ~ '^bay[A-Za-z0-9_-]{1,29}$' then
      if to_regclass('public.bays') is not null then
        select exists (select 1 from public.bays b where b.id = v_bay) into v_ok;
      end if;
      v_ok := v_ok
           or exists (select 1 from private.token_seen s where s.u = 'agent:' || v_bay)
           or exists (select 1 from private.audit_log a
                       where a.tbl = 'token' and a.op = 'issue_agent' and a.row_id = 'agent:' || v_bay);
      if v_ok then
        v_u := 'agent:' || v_bay;
      end if;
    end if;
  else
    v_u := private.gpt_account_key(p_u);
    if v_u is null
       and (exists (select 1 from private.token_seen s where s.u = v_in)
            or exists (select 1 from private.audit_log a
                        where a.tbl = 'auth' and a.u = v_in and a.op in ('login', 'pw_change', 'refresh')
                          and a.info ->> 'why' = 'ok')) then
      v_u := v_in;                                            -- 지워진 계정이라도 토큰을 받은 적이 있으면
    end if;
  end if;
  if v_u is null then
    select string_agg('''' || a.key || '''', ', ' order by a.key) into v_names from private.app_passwords a;
    if to_regclass('public.bays') is not null then
      select string_agg('''agent:' || b.id || '''', ', ' order by b.id) into v_bays from public.bays b;
    end if;
    raise exception '"%" 은(는) 없는 이름입니다 — 아무것도 바뀌지 않았습니다. 띄어쓰기까지 똑같이 넣으세요. 직원: %  /  타석 PC: %  /  전체: ''*''',
      p_u, coalesce(v_names, '(없음)'), coalesce(v_bays, '''agent:bay3'' 모양');
  end if;
  v_t := private.gpt_revoke_now(v_u);
  perform private.gpt_audit_write(session_user::text, 'sql', 'token', 'revoke', v_u,
                                  jsonb_build_object('before', v_t));
  return case when v_u = '*'
              then '모든 토큰을 무효로 했습니다 — 직원은 다시 로그인, 타석 PC 는 새 토큰이 필요합니다 (이어서 바로 발급해도 됩니다)'
              else v_u || ' 의 기존 토큰을 모두 무효로 했습니다' end;
end;
$$;

-- 퇴사·안 쓰는 계정 막기: select private.disable_account('홍태양 프로');
--   비밀번호를 아무도 모르는 무작위 값으로 바꾸고(→ 어떤 비밀번호로도 로그인 불가) 기존 토큰을 모두 무효로.
--   행을 지우지 않으므로 비밀번호 SQL 을 다시 돌려도 공개 초기 비밀번호로 되살아나지 않음.
create or replace function private.disable_account(p_key text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key   text := private.gpt_account_key(p_key);
  v_t     timestamptz;
  v_names text;
begin
  if v_key is null then
    select string_agg('''' || a.key || '''', ', ' order by a.key) into v_names
      from private.app_passwords a where a.key <> '관리자';
    raise exception '"%" 계정이 없습니다 — 아무것도 바뀌지 않았습니다. 띄어쓰기까지 똑같이 넣으세요. 있는 계정: %',
      coalesce(p_key, '(비어 있음)'), coalesce(v_names, '(없음)');
  end if;
  if v_key = '관리자' then
    raise exception '관리자 계정은 막을 수 없습니다(막으면 직원 비밀번호 초기화도 못 함) — 관리자 비밀번호를 바꾸려면 supabase_passwords.sql 맨 아래 안내 참고 (아무것도 바뀌지 않았습니다)';
  end if;
  perform set_config('gpt.pw_plain_ok', 'on', true);
  update private.app_passwords
     set hash = extensions.crypt(encode(extensions.gen_random_bytes(24), 'base64'), extensions.gen_salt('bf', 10)),
         must_change = false, failed = 0, locked_until = null, updated_at = now()
   where key = v_key;
  perform set_config('gpt.pw_plain_ok', '', true);
  v_t := private.gpt_revoke_now(v_key);
  perform private.gpt_audit_write(session_user::text, 'sql', 'auth', 'disable', v_key,
                                  jsonb_build_object('ok', true, 'why', 'disabled', 'before', v_t));
  return v_key || ' 계정을 막았습니다 — 기존 토큰 모두 무효, 어떤 비밀번호로도 로그인 안 됨. 다시 쓰게 하려면 앱 관리자 화면 [직원 비밀번호 초기화]로 임시 비밀번호를 정해 직접 알려 주세요.';
end;
$$;

-- 6) 로그인·비밀번호 변경 — 기존 동작·응답은 그대로, 성공하면 token·exp(초)를 덧붙임
create or replace function public.pw_login(p_key text, p_pw text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r private.app_passwords%rowtype;
  t jsonb;
begin
  if p_key is null or p_pw is null or length(p_key) > 64 or length(p_pw) > 128 then
    perform private.gpt_audit_auth(left(p_key, 64), 'login', 'bad_input');
    return json_build_object('ok', false);
  end if;
  begin
    select * into r from private.app_passwords where key = p_key for update nowait;
  exception when lock_not_available then
    perform private.gpt_audit_auth(p_key, 'login', 'busy');
    return json_build_object('ok', false, 'busy', true);   -- 같은 계정에 동시 요청이 몰림(bcrypt 직렬화 방지)
  end;
  if r.key is null then
    perform private.gpt_audit_auth(p_key, 'login', 'unknown');
    return json_build_object('ok', false, 'unknown', true);
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    perform private.gpt_audit_auth(p_key, 'login', 'locked');
    return json_build_object('ok', false, 'locked', true,
                             'retry_after', ceil(extract(epoch from (r.locked_until - now())))::int);
  end if;
  if r.must_change and r.updated_at < now() - interval '14 days' then
    perform private.gpt_audit_auth(p_key, 'login', 'expired');
    return json_build_object('ok', false, 'expired', true);   -- 초기·임시 비밀번호는 14일만 유효
  end if;
  if r.hash = extensions.crypt(p_pw, r.hash) then
    update private.app_passwords set failed = 0, locked_until = null where key = p_key;
    begin
      -- 초기·임시 비밀번호면 15분(새 비밀번호 정할 동안), 아니면 30일
      t := private.gpt_issue(p_key, private.gpt_role_of(p_key), null,
                             case when r.must_change then 900 else 2592000 end);
    exception when others then
      t := null;                                   -- 토큰 발급이 실패해도 로그인은 예전처럼 성공
    end;
    perform private.gpt_audit_auth(p_key, 'login', 'ok',
                                   jsonb_build_object('must_change', r.must_change, 'n', t ->> 'n'));
    return json_build_object('ok', true, 'must_change', r.must_change,
                             'token', t ->> 'token', 'exp', (t ->> 'exp')::bigint);
  end if;
  perform private.pw_fail(p_key);
  perform private.gpt_audit_auth(p_key, 'login', 'fail');
  return json_build_object('ok', false);
end;
$$;

-- 새 비밀번호가 공개된 초기 비밀번호이거나 지금 비밀번호와 같으면 {ok:false, weak:true, reuse:true} (변경 안 함)
-- 성공하면 그 계정의 예전 토큰(다른 기기·15분 토큰 포함)은 모두 무효, 새 30일 토큰만 살아 있음
create or replace function public.pw_change(p_key text, p_old text, p_new text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  r      private.app_passwords%rowtype;
  t      jsonb;
  v_from boolean;
begin
  if p_key is null or p_old is null or length(p_key) > 64 or length(p_old) > 128 then
    perform private.gpt_audit_auth(left(p_key, 64), 'pw_change', 'bad_input');
    return json_build_object('ok', false);
  end if;
  if p_new is null or length(p_new) < (case when p_key = '관리자' then 8 else 6 end) or length(p_new) > 64 then
    perform private.gpt_audit_auth(p_key, 'pw_change', 'weak');
    return json_build_object('ok', false, 'weak', true);
  end if;
  if p_new = any (private.gpt_public_pws()) then
    perform private.gpt_audit_auth(p_key, 'pw_change', 'public_pw');
    return json_build_object('ok', false, 'weak', true, 'reuse', true);
  end if;
  begin
    select * into r from private.app_passwords where key = p_key for update nowait;
  exception when lock_not_available then
    perform private.gpt_audit_auth(p_key, 'pw_change', 'busy');
    return json_build_object('ok', false, 'busy', true);
  end;
  if r.key is null then
    perform private.gpt_audit_auth(p_key, 'pw_change', 'unknown');
    return json_build_object('ok', false, 'unknown', true);
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    perform private.gpt_audit_auth(p_key, 'pw_change', 'locked');
    return json_build_object('ok', false, 'locked', true,
                             'retry_after', ceil(extract(epoch from (r.locked_until - now())))::int);
  end if;
  if r.must_change and r.updated_at < now() - interval '14 days' then
    perform private.gpt_audit_auth(p_key, 'pw_change', 'expired');
    return json_build_object('ok', false, 'expired', true);
  end if;
  if r.hash <> extensions.crypt(p_old, r.hash) then
    perform private.pw_fail(p_key);
    perform private.gpt_audit_auth(p_key, 'pw_change', 'fail');
    return json_build_object('ok', false);
  end if;
  if p_new = p_old or r.hash = extensions.crypt(p_new, r.hash) then
    perform private.gpt_audit_auth(p_key, 'pw_change', 'same_pw');
    return json_build_object('ok', false, 'weak', true, 'reuse', true);
  end if;
  v_from := p_old = any (private.gpt_public_pws());         -- 공개 초기 비밀번호에서 바꿈 → 잠금 전 본인 확인 대상
  perform set_config('gpt.pw_plain_ok', 'on', true);
  update private.app_passwords
     set hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)),
         must_change = false, failed = 0, locked_until = null, updated_at = now()
   where key = p_key;
  perform set_config('gpt.pw_plain_ok', '', true);
  begin
    perform private.gpt_revoke_now(p_key);                   -- 예전 토큰 모두 무효 (트리거도 같은 일을 함)
  exception when others then
    null;
  end;
  begin
    t := private.gpt_issue(p_key, private.gpt_role_of(p_key), null, 2592000);   -- 새 30일 토큰 (방금 무효 시각 이후로 발급)
  exception when others then
    t := null;
  end;
  perform private.gpt_audit_auth(p_key, 'pw_change', 'ok',
                                 jsonb_strip_nulls(jsonb_build_object('n', t ->> 'n',
                                                                      'from_initial', case when v_from then true end)));
  return json_build_object('ok', true, 'token', t ->> 'token', 'exp', (t ->> 'exp')::bigint);
end;
$$;

-- 토큰 갱신: 살아 있는 직원 토큰(헤더 x-staff-token)으로 비밀번호 없이 새 30일 토큰 → {ok, token, exp}
--   누가 일부러 틀려서 계정이 잠겨도 토큰이 있는 기기는 계속 쓸 수 있게. 단 마지막 비밀번호 로그인부터 90일이 지나면
--   {ok:false, expired:true} → 비밀번호로 다시 로그인. 초기·임시 비밀번호 상태(must_change)·지운 계정·타석 PC 토큰은 갱신 불가.
create or replace function public.gpt_refresh()
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c    jsonb := public.gpt_claims();
  r    private.app_passwords%rowtype;
  v_at bigint;
  t    jsonb;
begin
  if c is null or coalesce(c ->> 'r', '') not in ('admin', 'infodesk', 'staff') then
    return json_build_object('ok', false);
  end if;
  select * into r from private.app_passwords where key = c ->> 'u';
  if r.key is null then
    perform private.gpt_audit_auth(c ->> 'u', 'refresh', 'unknown');
    return json_build_object('ok', false, 'unknown', true);
  end if;
  if r.must_change then
    perform private.gpt_audit_auth(r.key, 'refresh', 'must_change');
    return json_build_object('ok', false, 'must_change', true);
  end if;
  begin
    v_at := floor(coalesce((c ->> 'at')::numeric, (c ->> 'iat')::numeric))::bigint;
  exception when others then
    v_at := null;
  end;
  if v_at is null or v_at < floor(extract(epoch from now()))::bigint - 90 * 86400 then
    perform private.gpt_audit_auth(r.key, 'refresh', 'expired');
    return json_build_object('ok', false, 'expired', true);
  end if;
  t := private.gpt_issue_x(r.key, private.gpt_role_of(r.key), null, 2592000, v_at);
  perform private.gpt_audit_auth(r.key, 'refresh', 'ok', jsonb_build_object('n', t ->> 'n'));
  return json_build_object('ok', true, 'token', t ->> 'token', 'exp', (t ->> 'exp')::bigint);
end;
$$;

-- 7) 기록 트리거 연결 (표 규칙/정책은 건드리지 않음)
do $$
declare v_t text;
begin
  foreach v_t in array array['members', 'sessions', 'assessments', 'reports'] loop
    if to_regclass('public.' || v_t) is null then
      raise notice '표 public.% 이(가) 없어 기록 트리거를 건너뜁니다', v_t;
      continue;
    end if;
    execute format('drop trigger if exists gpt_audit on public.%I', v_t);
    execute format('create trigger gpt_audit after insert or update or delete on public.%I '
                   'for each row execute function private.gpt_audit_row()', v_t);
  end loop;
  if to_regclass('public.shot_events') is not null then
    execute 'drop trigger if exists gpt_audit_del on public.shot_events';
    execute 'create trigger gpt_audit_del after delete on public.shot_events '
            'referencing old table as gpt_old_rows for each statement execute function private.gpt_audit_del_stmt()';
  end if;
  foreach v_t in array array['members', 'assessments', 'sessions', 'reports', 'shot_events', 'active_sessions', 'bays'] loop
    if to_regclass('public.' || v_t) is null then
      continue;
    end if;
    execute format('drop trigger if exists gpt_seen on public.%I', v_t);
    execute format('create trigger gpt_seen after insert or update or delete on public.%I '
                   'for each statement execute function private.gpt_seen_stmt()', v_t);
  end loop;
  execute 'drop trigger if exists gpt_audit_pw on private.app_passwords';
  execute 'create trigger gpt_audit_pw after insert or update of hash or delete on private.app_passwords '
          'for each row execute function private.gpt_audit_pw()';
end $$;

-- 8) 권한 — private 함수는 API 로 호출 불가 / 워커 함수는 서비스 키만 / 나머지는 공개 키로 호출 가능
do $$
declare
  v_f    text;
  v_role text;
begin
  foreach v_f in array array[
      'private.gpt_b64url(bytea)', 'private.gpt_b64url_decode(text)', 'private.gpt_sign_raw(text, bytea)',
      'private.gpt_sign(jsonb)', 'private.gpt_role_of(text)', 'private.gpt_public_pws()',
      'private.gpt_hash_is_public(text)', 'private.gpt_revoke_now(text)',
      'private.gpt_issue_x(text, text, text, integer, bigint)', 'private.gpt_issue(text, text, text, integer)',
      'private.gpt_verify(text)', 'private.gpt_who()', 'private.gpt_audit_write(text, text, text, text, text, jsonb)',
      'private.gpt_audit_auth(text, text, text, jsonb)', 'private.gpt_audit_row()', 'private.gpt_audit_del_stmt()',
      'private.gpt_seen_stmt()', 'private.gpt_audit_pw()', 'private.gpt_account_key(text)',
      'private.issue_agent_token(text, integer)', 'private.revoke_tokens(text)', 'private.disable_account(text)',
      'public.gpt_worker_secret()', 'public.gpt_worker_revocations()'] loop
    execute format('revoke all on function %s from public', v_f);
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('revoke all on function %s from %I', v_f, v_role);
      end if;
    end loop;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.gpt_worker_secret() to service_role';
    execute 'grant execute on function public.gpt_worker_revocations() to service_role';
  end if;
  foreach v_f in array array[
      'public.gpt_claims()', 'public.gpt_is_staff()', 'public.gpt_is_agent()', 'public.gpt_agent_bay()',
      'public.gpt_whoami()', 'public.gpt_audit_recent(integer)'] loop
    execute format('revoke all on function %s from public', v_f);
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('grant execute on function %s to %I', v_f, v_role);
      end if;
    end loop;
  end loop;
  foreach v_f in array array['public.pw_login(text, text)', 'public.pw_change(text, text, text)', 'public.gpt_refresh()'] loop
    execute format('revoke all on function %s from public', v_f);
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then
        execute format('grant execute on function %s to %I', v_f, v_role);
      end if;
    end loop;
  end loop;
end $$;

-- API 가 새 함수를 바로 인식하도록
notify pgrst, 'reload schema';

-- 확인 표 ('정상' 이어야 함)
select '토큰 비밀값' as "항목",
       case when exists (select 1 from private.app_secrets where name = 'token_hmac' and length(value) = 32)
            then '정상' else '⚠️ 없음' end as "결과"
union all
select '로그인 때 토큰 발급 (pw_login)',
       case when pg_get_functiondef('public.pw_login(text, text)'::regprocedure) like '%gpt_issue%'
            then '정상' else '⚠️ 옛 버전 — 이 파일을 다시 실행' end
union all
select '비밀번호 변경 때 토큰 발급 (pw_change)',
       case when pg_get_functiondef('public.pw_change(text, text, text)'::regprocedure) like '%gpt_issue%'
            then '정상' else '⚠️ 옛 버전 — 이 파일을 다시 실행' end
union all
select '워커 전용 함수 (서비스 키만)',
       case when not exists (select 1 from pg_roles where rolname = 'anon') then '확인 불가 (anon 역할 없음)'
            when has_function_privilege('anon', 'public.gpt_worker_secret()', 'execute') then '⚠️ 공개 키로 호출 가능 — 확인 필요'
            else '정상' end
union all
select '비밀번호 바뀌면 예전 토큰 무효 + 공개 비밀번호 거절',
       case when exists (select 1 from pg_trigger
                          where tgrelid = 'private.app_passwords'::regclass and tgname = 'gpt_audit_pw'
                            and tgenabled <> 'D' and not tgisinternal)
            then '정상' else '⚠️ 없음 — 이 파일을 다시 실행' end
union all
select '토큰 갱신 (gpt_refresh)',
       case when to_regprocedure('public.gpt_refresh()') is not null then '정상' else '⚠️ 없음' end
union all
select '저장 기록 트리거',
       (select count(*) from pg_trigger
         where tgname in ('gpt_audit', 'gpt_audit_del', 'gpt_audit_pw') and not tgisinternal)::text || '개 연결 (정상: 6개)'
union all
select '현재 모드',
       case when (select value from private.app_settings where name = 'mode') = 'locked'
            then 'locked (잠김)' else 'open (아직 잠그지 않음 — 정상)' end
union all
select '다음 할 일',
       '타석 PC 토큰 발급: select private.issue_agent_token(''bay3'');';

-- ---------- 되돌리기(비상시에만) ----------
-- 토큰 없이 예전처럼 쓰려면: worker/supabase_passwords.sql 을 다시 실행 (pw_login·pw_change 가 토큰 없는 옛 버전으로 돌아감).
-- 단, supabase_lock.sql 로 잠근 상태라면 먼저 worker/supabase_unlock_emergency.sql 을 실행해야 합니다.
--
-- 저장 기록 트리거가 문제(저장이 느림·멈춤)를 일으킬 때만: 아래 13줄의 맨 앞 '-- ' 를 지우고 그 줄들만 실행.
-- 표의 열림·잠금(규칙)은 그대로입니다 — 기록·토큰 사용 점검만 꺼집니다. 이 파일을 다시 실행하면 다시 켜집니다.
-- drop trigger if exists gpt_audit on public.members;
-- drop trigger if exists gpt_audit on public.sessions;
-- drop trigger if exists gpt_audit on public.assessments;
-- drop trigger if exists gpt_audit on public.reports;
-- drop trigger if exists gpt_audit_del on public.shot_events;
-- drop trigger if exists gpt_seen on public.members;
-- drop trigger if exists gpt_seen on public.assessments;
-- drop trigger if exists gpt_seen on public.sessions;
-- drop trigger if exists gpt_seen on public.reports;
-- drop trigger if exists gpt_seen on public.shot_events;
-- drop trigger if exists gpt_seen on public.active_sessions;
-- drop trigger if exists gpt_seen on public.bays;
-- drop trigger if exists gpt_audit_pw on private.app_passwords;
