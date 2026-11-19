-- ============================================================
--  내셔널짐 피티앤골프 — DB 잠금 (보안 마지막 단계 S1c)
--
--  잠그면: 로그인 토큰이 없는 요청은 회원·평가·일지·리포트·샷·타석 표를 읽지도 쓰지도 못합니다.
--          계속 되는 것: 직원 앱(로그인 토큰) · 타석 PC(타석 토큰, 자기 타석 샷만) · 워커(서비스 키, 고객 리포트 /r/ 링크 포함)
--
--  실행 전 준비 (하나라도 아니면 아직 실행하지 마세요)
--   1) supabase_tokens.sql 을 최신 파일로 실행했다
--   2) 모든 직원 폰·PC 의 앱이 새 버전이고, 각자 다시 로그인해 '자기 비밀번호'로 바꿨다
--   3) 직원이 아닌 사람이 계정을 가져가지 않았는지 — 아래 1단계 표의 [계정] 줄마다 '비밀번호 마지막 변경'
--      시각·IP 가 그 직원 본인이 바꾼 것인지 직접 물어 확인.
--        본인이 아니면: 앱 관리자 화면 [직원 비밀번호 초기화]로 임시 비밀번호를 정해 그 직원에게 직접 알려 주기
--        안 쓰는 계정(퇴사 등): select private.disable_account('계정 이름');
--   4) 타석 PC 마다 타석 토큰을 config.json 에 넣고 에이전트를 새 버전으로 업데이트했다
--        토큰 발급: select private.issue_agent_token('bay3');   (넣는 방법은 supabase_tokens.sql 맨 위)
--   5) 고객 리포트 링크는 report.nationalgym.kr/r/... 주소로 보낸다
--        (예전 github.io 의 report.html?id=... 링크는 잠근 뒤 열리지 않습니다)
--
--  방법 (Supabase → SQL Editor)
--   1단계: 이 파일 전체를 붙여넣고 그대로 RUN → '점검 표'만 나옵니다 (아무것도 바뀌지 않음).
--          ⚠️ 줄은 그 줄의 안내대로 한 뒤 다시 RUN.
--   2단계: ⚠️ 줄이 없고 [계정] 줄도 직원과 확인했으면, 아래 [잠금 확인] 줄의 '' 를 '잠금' 으로 바꿔서 RUN
--          → 맨 아래 표: 7개 표마다 '…_staff_all' 규칙이 '정상' 이고 모드가 '정상 (잠김)' 이면 DB 잠금 끝.
--   3단계(워커, 며칠 뒤): Cloudflare → Workers & Pages → golf-pt-storage → Logs 에서
--          "auth":"legacy" 줄이 며칠 동안 없고 "tk":"ok" 줄은 있는지 확인
--          ("tk":"ok" = 워커의 SUPABASE_SERVICE_KEY 가 맞는 키 → 고객 리포트 /r/ 도 계속 열림)
--          → Settings → Variables 에 LEGACY_KEY_OFF=1 과 REC_REQUIRE_AUTH=1 추가 → Deploy.
--          ⚠️ 3단계 전까지는 녹음·전사 백업(rec/)과 모든 영상 파일이 공개된 키로 여전히 열려 있습니다 (DB 만 잠김).
--          REC_REQUIRE_AUTH=1 은 모든 기기 앱이 녹음 복구에 토큰을 보내는 새 버전이 된 뒤에만 넣으세요.
--  · 공개된 초기 비밀번호(ng2026 등) 그대로인 계정이 있으면 [강제 잠금]으로도 잠그지 않습니다.
--  · [강제 잠금] = true: 나머지 점검(⚠️)을 건너뜀 — 꼭 지금 잠가야 할 때만. 이때도 [잠금 확인]은 '잠금' 이어야 함.
--  · 'lock timeout' 오류가 나면: 앱이 표를 쓰는 중이라 기다리다 멈춘 것 — 아무것도 바뀌지 않았으니 1분 뒤 다시 실행.
--  · 문제가 생기면: worker/supabase_unlock_emergency.sql (그 파일 맨 위 '먼저 확인' 부터 읽기).
--  · 다시 실행해도 안전합니다. 표에 있던 규칙은 이름과 상관없이 모두 지우고 새 규칙만 남깁니다.
--  · 잠근 뒤에는 supabase_schema.sql · worker/supabase_rls_readonly.sql · worker/supabase_passwords.sql 을 실행하지 마세요.
--    (앞의 둘은 규칙을 다시 엽니다. supabase_passwords.sql 을 실행했다면 바로 supabase_tokens.sql 을 다시 실행 —
--     안 하면 새로 로그인하는 기기에 토큰이 안 나와서 앱이 비어 보입니다)
-- ============================================================

-- 표를 잠깐 잠그는 작업이 10초 넘게 기다려야 하면 멈춤 (앱이 멈춰 버리지 않게)
select set_config('lock_timeout', '10s', true);

do $$
declare
  v_confirm text    := '';        -- [잠금 확인] 1단계 표를 확인했으면 '' 를 '잠금' 으로 바꿔서 RUN
  v_force   boolean := false;     -- [강제 잠금] ⚠️ 점검을 건너뛸 때만 true (공개 초기 비밀번호 점검은 못 건너뜀)
  v_tables  text[]  := array['members', 'assessments', 'sessions', 'reports', 'shot_events', 'active_sessions', 'bays'];
  v_t       text;
  v_names   text[];
  v_n       text;
  v_rows    jsonb   := '[]'::jsonb;  -- 점검 표 (맨 아래 결과 표에 나옴)
  v_hard    text[]  := '{}';         -- [강제 잠금]으로도 못 건너뛰는 문제
  v_soft    text[]  := '{}';         -- [강제 잠금]으로만 건너뛸 수 있는 문제
  v_list    text;
  v_cnt     integer;
  v_last    timestamptz;
  v_who     text;
  v_state   text;
  v_change  text;
  v_judge   text;
  v_o       integer := 0;
  r         record;
begin
  -- 0) 준비 확인 (항상 — 아니면 바로 멈춤, 아무것도 바뀌지 않음)
  if to_regclass('private.app_settings') is null or to_regclass('private.app_secrets') is null
     or to_regclass('private.token_seen') is null or to_regclass('private.audit_log') is null
     or to_regprocedure('public.gpt_claims()') is null or to_regprocedure('public.gpt_is_staff()') is null
     or to_regprocedure('public.gpt_is_agent()') is null or to_regprocedure('public.gpt_agent_bay()') is null then
    raise exception '먼저 worker/supabase_tokens.sql 을 실행하세요 — 지금은 아무것도 바뀌지 않았습니다.';
  end if;
  if to_regprocedure('private.gpt_hash_is_public(text)') is null or to_regprocedure('private.disable_account(text)') is null
     or to_regprocedure('public.gpt_refresh()') is null then
    raise exception 'supabase_tokens.sql 이 옛 버전입니다 — 최신 worker/supabase_tokens.sql 을 한 번 더 실행한 뒤 이 파일을 실행하세요 (아무것도 바뀌지 않았습니다)';
  end if;
  if not exists (select 1 from private.app_secrets where name = 'token_hmac') then
    raise exception '토큰 비밀값이 없습니다 — worker/supabase_tokens.sql 을 다시 실행하세요 (아무것도 바뀌지 않았습니다)';
  end if;
  if to_regclass('private.app_passwords') is null
     or to_regprocedure('public.pw_login(text, text)') is null or to_regprocedure('public.pw_change(text, text, text)') is null then
    raise exception '로그인 함수(pw_login·pw_change)가 없습니다 (supabase_passwords.sql 의 되돌리기를 실행한 듯) — worker/supabase_passwords.sql → worker/supabase_tokens.sql 순서로 다시 실행한 뒤 이 파일을 실행하세요 (아무것도 바뀌지 않았습니다)';
  end if;
  if pg_get_functiondef('public.pw_login(text, text)'::regprocedure) not like '%gpt_issue%'
     or pg_get_functiondef('public.pw_change(text, text, text)'::regprocedure) not like '%gpt_issue%' then
    raise exception '로그인 함수가 토큰 없는 옛 버전입니다(supabase_passwords.sql 을 다시 실행한 듯) — worker/supabase_tokens.sql 을 한 번 더 실행한 뒤 이 파일을 실행하세요 (아무것도 바뀌지 않았습니다)';
  end if;
  if not exists (select 1 from private.app_passwords where key = '관리자') then
    raise exception '서버에 관리자 비밀번호가 없습니다 — worker/supabase_passwords.sql 을 먼저 확인하세요 (아무것도 바뀌지 않았습니다)';
  end if;

  -- 1) 계정마다: 공개 초기 비밀번호(못 건너뜀) · 임시 비밀번호 · 비밀번호 마지막 변경(언제·어떻게·어느 IP) · 마지막 토큰 저장
  for r in
    select p.key, p.must_change,
           (p.must_change and p.updated_at < now() - interval '14 days') as expired,
           case when p.must_change and p.updated_at < now() - interval '14 days' then false
                else private.gpt_hash_is_public(p.hash) end as pub,
           (select s.last_at from private.token_seen s where s.u = p.key) as tok_at,
           ev.op as ev_op, ev.at as ev_at, ev.info as ev_info
      from private.app_passwords p
      left join lateral (
        select a.op, a.at, a.info
          from private.audit_log a
         where a.tbl = 'auth'
           and ((a.op = 'pw_change' and a.u = p.key and a.info ->> 'why' = 'ok')
                or (a.op in ('pw_reset', 'disable', 'account_delete') and a.row_id = p.key))
         order by a.at desc, a.id desc
         limit 1) ev on true
     order by p.key
  loop
    v_o := v_o + 1;
    v_change := case r.ev_op
                  when 'pw_change' then to_char(r.ev_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') || ' 본인 변경'
                                        || case when (r.ev_info ->> 'from_initial') = 'true' then '(공개 초기값에서)' else '' end
                  when 'pw_reset' then to_char(r.ev_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI')
                                       || case when r.ev_info ->> 'why' = 'new_account' then ' 새 계정' else ' 관리자 초기화' end
                  when 'disable' then to_char(r.ev_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') || ' 막음'
                  else '기록 없음' end
                || case when r.tok_at is not null
                        then ' · 토큰 저장 ' || to_char(r.tok_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') else '' end;
    if r.pub then
      v_hard := array_append(v_hard, r.key::text);
      v_state := '⚠️ 공개 초기 비밀번호 그대로';
      v_judge := '⚠️ 못 건너뜀 — 본인이 앱에서 새 비밀번호로 바꾸거나, 관리자 [직원 비밀번호 초기화], 안 쓰면 select private.disable_account(''' || r.key || ''');';
    elsif r.ev_op = 'disable' and not r.must_change then
      v_state := '막힘 (disable_account)';
      v_judge := '정상 (로그인 불가)';
    elsif r.expired then
      v_state := '만료 (초기·임시 비밀번호 14일 지남)';
      v_judge := '정상 (로그인 불가 — 쓰려면 관리자 초기화)';
    elsif r.must_change then
      v_soft := array_append(v_soft, ('임시 비밀번호 상태 계정 ' || r.key || ' — 그 직원이 로그인해 새 비밀번호를 정하면 사라짐')::text);
      v_state := '임시 비밀번호 (본인 변경 전)';
      v_judge := '⚠️ 그 직원이 임시 비밀번호로 로그인해 새 비밀번호를 정해야 함';
    else
      v_state := '본인 비밀번호';
      v_judge := case when r.ev_op = 'pw_change' and (r.ev_info ->> 'from_initial') = 'true'
                      then '확인: 이 시각·IP 에 본인이 바꾼 게 맞는지 직원에게 직접 확인 (아니면 관리자 초기화)'
                      when r.ev_op is null and r.key <> '관리자'
                      then '확인: 변경 기록 없음 — 본인이 쓰는 계정인지 확인 (아니면 관리자 초기화·막기)'
                      else '확인: 본인이 바꾼 게 맞는지' end;
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
                'g', 5, 'o', v_o, 'k', '계정', 't', r.key, 'i', v_state, 'w', v_change,
                'c', coalesce(r.ev_info ->> 'ip', ''), 'j', v_judge));
  end loop;
  v_rows := v_rows || jsonb_build_array(jsonb_build_object('g', 4, 'o', 1, 'k', '점검', 't', '',
              'i', '공개 초기 비밀번호 그대로인 계정', 'w', '', 'c', '',
              'j', case when cardinality(v_hard) = 0 then '✅ 없음'
                        else '⚠️ ' || array_to_string(v_hard, ', ') || ' — [계정] 줄 안내대로 (못 건너뜀)' end));
  select count(*) into v_cnt from private.app_passwords p
   where p.must_change and p.updated_at >= now() - interval '14 days' and not (p.key = any (v_hard));
  v_rows := v_rows || jsonb_build_array(jsonb_build_object('g', 4, 'o', 2, 'k', '점검', 't', '',
              'i', '임시 비밀번호(관리자 초기화 후 본인 변경 전)', 'w', '', 'c', '',
              'j', case when v_cnt = 0 then '✅ 없음' else '⚠️ ' || v_cnt || '개 — [계정] 줄 참고' end));

  -- 2) 새 버전 앱이 직원 토큰으로 저장하는지 (최근 7일)
  select count(*), max(s.last_at) into v_cnt, v_last
    from private.token_seen s where s.r in ('admin', 'infodesk', 'staff') and s.last_at > now() - interval '7 days';
  if v_cnt = 0 then
    v_soft := array_append(v_soft, '최근 7일 동안 직원 로그인 토큰으로 저장된 기록이 없습니다 — 새 버전 앱에서 다시 로그인하고 일지나 회원 정보를 1건 이상 저장'::text);
  end if;
  v_rows := v_rows || jsonb_build_array(jsonb_build_object('g', 4, 'o', 3, 'k', '점검', 't', '',
              'i', '새 버전 앱의 토큰 저장 (최근 7일)', 'w', '', 'c', '',
              'j', case when v_cnt = 0 then '⚠️ 없음 — 새 버전 앱에서 로그인하고 1건 저장'
                        else '✅ 계정 ' || v_cnt || '개 (마지막 ' || to_char(v_last at time zone 'Asia/Seoul', 'MM-DD HH24:MI') || ')' end));

  -- 3) 옛 버전 앱(토큰 없이 저장) — 최근 48시간. 잠그면 그 기기는 저장도 못 하고 빈 화면이 됩니다
  if to_regclass('public.sessions') is not null and to_regclass('public.reports') is not null then
    select count(*), max(a.at),
           (select string_agg(x.nm, ', ')
              from (select distinct coalesce(s.author, rp.created_by) as nm
                      from private.audit_log a2
                      left join public.sessions s on a2.tbl = 'sessions' and s.id = a2.row_id
                      left join public.reports rp on a2.tbl = 'reports' and rp.id = a2.row_id
                     where a2.at > now() - interval '48 hours' and a2.r = 'anon'
                       and a2.tbl in ('members', 'sessions', 'assessments', 'reports', 'shot_events')
                       and coalesce(s.author, rp.created_by) is not null
                     limit 5) as x)
      into v_cnt, v_last, v_who
      from private.audit_log a
     where a.at > now() - interval '48 hours' and a.r = 'anon'
       and a.tbl in ('members', 'sessions', 'assessments', 'reports', 'shot_events');
  else
    select count(*), max(a.at), null into v_cnt, v_last, v_who
      from private.audit_log a
     where a.at > now() - interval '48 hours' and a.r = 'anon'
       and a.tbl in ('members', 'sessions', 'assessments', 'reports', 'shot_events');
  end if;
  if v_cnt > 0 then
    v_soft := array_append(v_soft, ('최근 48시간 토큰 없이 저장된 기록 ' || v_cnt || '건(마지막 '
                         || to_char(v_last at time zone 'Asia/Seoul', 'MM-DD HH24:MI')
                         || coalesce(', 작성자: ' || v_who, '') || ') — 그 기기 앱이 아직 옛 버전')::text);
  end if;
  v_rows := v_rows || jsonb_build_array(jsonb_build_object('g', 4, 'o', 4, 'k', '점검', 't', '',
              'i', '옛 버전 앱 (토큰 없이 저장, 최근 48시간)', 'w', coalesce(v_who, ''), 'c', '',
              'j', case when v_cnt = 0 then '✅ 없음'
                        else '⚠️ ' || v_cnt || '건 (마지막 ' || to_char(v_last at time zone 'Asia/Seoul', 'MM-DD HH24:MI')
                             || ') — 그 기기(작성자) 앱을 새 버전으로 바꾸고 다시 로그인. 모든 기기를 바꿨다면 이 시각 뒤로 새 기록이 없는지 보고 [강제 잠금]' end));

  -- 4) 타석 PC: 최근 30일 안에 에이전트 샷이 들어온 타석은, 가장 최근 샷이 타석 토큰으로 들어와야 함
  --    (미래 날짜로 끼워 넣은 샷은 무시. 30일 넘게 조용한 타석은 참고로만 표시)
  v_list := null;
  if to_regclass('public.shot_events') is not null then
    for r in
      select x.bay,
             (select max(e.created_at) from public.shot_events e
               where e.bay_id = x.bay and e.source = 'agent' and e.created_at <= now()) as last_shot,
             (select e.id from public.shot_events e
               where e.bay_id = x.bay and e.source = 'agent' and e.created_at <= now()
               order by e.created_at desc limit 1) as last_id,
             (select s.last_at from private.token_seen s where s.u = 'agent:' || x.bay and s.r = 'agent') as tok_at
        from (select distinct e.bay_id as bay from public.shot_events e
               where e.source = 'agent' and e.created_at <= now() and e.created_at > now() - interval '30 days') as x
       order by x.bay
    loop
      if r.tok_at is null or r.tok_at < r.last_shot - interval '2 minutes' then
        v_list := coalesce(v_list || ', ', '') || r.bay;
        v_judge := '⚠️ 가장 최근 샷이 타석 토큰 없이 들어옴 — 그 PC config.json 에 AGENT_TOKEN 을 넣고 에이전트 업데이트 → 레슨 켜고 공 1개 → 다시 RUN';
      else
        v_judge := '✅ 타석 토큰 사용 중';
      end if;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('g', 6, 'o', 0, 'k', '타석', 't', r.bay,
                  'i', '마지막 샷 ' || to_char(r.last_shot at time zone 'Asia/Seoul', 'MM-DD HH24:MI') || ' (' || r.last_id || ')',
                  'w', '토큰 저장 ' || coalesce(to_char(r.tok_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), '없음'),
                  'c', '', 'j', v_judge));
    end loop;
  end if;
  if v_list is not null then
    v_soft := array_append(v_soft, ('최근 30일 샷이 들어온 타석(' || v_list || ')의 가장 최근 샷이 타석 토큰 없이 들어왔습니다 — 그 PC 의 config.json 에 토큰(AGENT_TOKEN)을 넣고 에이전트를 업데이트한 뒤, 타석 레슨을 켜고 공을 1개 쳐서 샷이 앱에 뜨는지 확인')::text);
  end if;
  v_rows := v_rows || jsonb_build_array(jsonb_build_object('g', 4, 'o', 5, 'k', '점검', 't', '',
              'i', '타석 PC 토큰 (최근 30일 샷이 있는 타석)', 'w', '', 'c', '',
              'j', case when v_list is null then '✅ 문제 없음 — [타석] 줄 참고' else '⚠️ ' || v_list || ' — [타석] 줄 안내대로' end));
  -- 조용한 타석·잘못된 타석 토큰 (참고)
  if to_regclass('public.bays') is not null and to_regclass('public.shot_events') is not null then
    for r in
      select b.id as bay,
             (select s.last_at from private.token_seen s where s.u = 'agent:' || b.id and s.r = 'agent') as tok_at
        from public.bays b
       where not exists (select 1 from public.shot_events e
                          where e.bay_id = b.id and e.source = 'agent'
                            and e.created_at <= now() and e.created_at > now() - interval '30 days')
       order by b.id
    loop
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('g', 6, 'o', 1, 'k', '타석', 't', r.bay,
                  'i', '최근 30일 샷 없음', 'w', '토큰 저장 ' || coalesce(to_char(r.tok_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), '없음'),
                  'c', '', 'j', '참고: 이 타석 PC 를 다시 켜기 전에 타석 토큰을 넣어야 샷이 들어옴'));
    end loop;
    for r in
      select s.u, s.last_at from private.token_seen s
       where s.r = 'agent' and not exists (select 1 from public.bays b where 'agent:' || b.id = s.u)
       order by s.u
    loop
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('g', 6, 'o', 2, 'k', '타석', 't', r.u,
                  'i', 'bays 표에 없는 타석 토큰', 'w', '토큰 저장 ' || to_char(r.last_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI'),
                  'c', '', 'j', '참고: 모르는 타석이면 select private.revoke_tokens(''' || r.u || ''');'));
    end loop;
  end if;

  -- 5) 잠금을 비켜 가는 객체: 공개 키로 읽히는 뷰·구체화 뷰·외부 표, 공개 키로 부를 수 있는 SECURITY DEFINER 함수
  select string_agg(x.obj, ', ' order by x.obj) into v_list
    from (select c.oid::regclass::text || case c.relkind when 'm' then ' (구체화 뷰)' when 'f' then ' (외부 표)' else ' (뷰)' end as obj
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('v', 'm', 'f')
             and not exists (select 1 from pg_depend d
                              where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
             and not (c.relkind = 'v' and exists (select 1 from unnest(coalesce(c.reloptions, '{}'::text[])) o
                                                  where lower(o) in ('security_invoker=true', 'security_invoker=on',
                                                                     'security_invoker=1', 'security_invoker=yes')))
             and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))
          union all
          select p.proname || '(' || oidvectortypes(p.proargtypes) || ') (SECURITY DEFINER 함수)'
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
             and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
             and not exists (select 1 from pg_depend d
                              where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
             and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
             and p.proname || '(' || oidvectortypes(p.proargtypes) || ')' not in (
                   'gpt_claims()', 'gpt_is_staff()', 'gpt_is_agent()', 'gpt_agent_bay()', 'gpt_whoami()',
                   'gpt_audit_recent(integer)', 'gpt_refresh()', 'pw_login(text, text)', 'pw_change(text, text, text)',
                   'pw_admin_reset(text, text, text)')) as x;
  if v_list is not null then
    v_soft := array_append(v_soft, ('잠근 뒤에도 토큰 없이 읽힐 수 있는 객체: ' || v_list || ' — 개발자에게 이 목록을 보내세요 (뷰는 alter view … set (security_invoker = true), 함수는 공개 키 실행 권한 회수)')::text);
  end if;
  v_rows := v_rows || jsonb_build_array(jsonb_build_object('g', 4, 'o', 6, 'k', '점검', 't', '',
              'i', '잠금을 비켜 가는 뷰·함수 (public)', 'w', '', 'c', '',
              'j', case when v_list is null then '✅ 없음' else '⚠️ ' || v_list || ' — 개발자에게 알려 주세요' end));

  -- 6) 1단계(점검만) → 아무것도 바꾸지 않고 표만 보여 줌
  if btrim(coalesce(v_confirm, '')) <> '잠금' then
    perform set_config('gpt.lock_step', 'preview', true);
    perform set_config('gpt.lock_rows', v_rows::text, true);
    return;
  end if;
  if cardinality(v_hard) > 0 then
    raise exception '%', '잠그지 않았습니다 (아무것도 바뀌지 않음) — 공개된 초기 비밀번호 그대로인 계정이 있습니다: '
      || array_to_string(v_hard, ', ')
      || '. 초기 비밀번호는 공개 저장소에 적혀 있어 이대로 잠그면 누구나 그 비밀번호로 토큰을 받습니다. '
      || '본인이 앱에서 새 비밀번호로 바꾸거나, 관리자 화면 [직원 비밀번호 초기화](임시 비밀번호를 직접 알려 주기), '
      || '안 쓰는 계정은 select private.disable_account(''계정 이름''); 한 뒤 다시 실행하세요. [강제 잠금]으로도 건너뛸 수 없습니다.';
  end if;
  if cardinality(v_soft) > 0 and not v_force then
    raise exception '%', '잠그지 않았습니다 (아무것도 바뀌지 않음) — ' || array_to_string(v_soft, ' / ')
      || ' — 안내대로 한 뒤 다시 실행하세요. 꼭 지금 잠가야 하면 [강제 잠금] 줄의 false 를 true 로.';
  end if;

  -- 7) 7개 표: 기존 규칙을 이름과 상관없이 전부 지우고 → 직원 토큰 규칙 하나만
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
    execute format('create policy %I on public.%I for all to anon, authenticated '
                   'using ((select public.gpt_is_staff())) with check ((select public.gpt_is_staff()))',
                   v_t || '_staff_all', v_t);
    -- 규칙과 상관없이 표를 통째로 비우는 권한(TRUNCATE) 등 앱이 쓰지 않는 권한도 거둠
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', v_t);
  end loop;

  -- 8) 타석 PC(에이전트) 규칙: 자기 타석 샷만 읽기·추가·수정 / 활성 세션·타석 목록은 읽기만 / 삭제 불가
  if to_regclass('public.shot_events') is not null then
    execute 'create policy shot_events_agent_select on public.shot_events for select to anon, authenticated '
            'using (bay_id = (select public.gpt_agent_bay()) and (select public.gpt_is_agent()))';
    execute 'create policy shot_events_agent_insert on public.shot_events for insert to anon, authenticated '
            'with check (bay_id = (select public.gpt_agent_bay()) and (select public.gpt_is_agent()))';
    execute 'create policy shot_events_agent_update on public.shot_events for update to anon, authenticated '
            'using (bay_id = (select public.gpt_agent_bay()) and (select public.gpt_is_agent())) '
            'with check (bay_id = (select public.gpt_agent_bay()) and (select public.gpt_is_agent()))';
  end if;
  if to_regclass('public.active_sessions') is not null then
    execute 'create policy active_sessions_agent_select on public.active_sessions for select to anon, authenticated '
            'using ((select public.gpt_is_agent()))';
  end if;
  if to_regclass('public.bays') is not null then
    execute 'create policy bays_agent_select on public.bays for select to anon, authenticated '
            'using ((select public.gpt_is_agent()))';
  end if;

  -- 9) 잠금 표시 (앱이 gpt_whoami 로 확인)
  insert into private.app_settings (name, value, updated_at)
       values ('mode', 'locked', now())
  on conflict (name) do update set value = 'locked', updated_at = now();
  perform private.gpt_audit_write(session_user::text, 'sql', 'settings', 'lock', 'mode',
                                  jsonb_build_object('force', v_force, 'skipped', to_jsonb(v_soft)));
  perform set_config('gpt.lock_step', 'locked', true);
  perform set_config('gpt.lock_rows', v_rows::text, true);
end $$;

-- 결과 표: 1단계 = 점검 표 / 2단계 = 7개 표의 규칙 + 경고(⚠️) + 계정·타석 점검 + 참고
with st as (
  select coalesce(current_setting('gpt.lock_step', true), '') as step,
         coalesce(nullif(current_setting('gpt.lock_rows', true), ''), '[]')::jsonb as rows
), t(tbl, ord) as (
  values ('members', 1), ('assessments', 2), ('sessions', 3), ('reports', 4),
         ('shot_events', 5), ('active_sessions', 6), ('bays', 7)
), expected(tbl, policyname) as (
  select tbl, tbl || '_staff_all' from t
  union all values ('shot_events', 'shot_events_agent_select'), ('shot_events', 'shot_events_agent_insert'),
                   ('shot_events', 'shot_events_agent_update'), ('active_sessions', 'active_sessions_agent_select'),
                   ('bays', 'bays_agent_select')
), report as (
  select 0 as grp, 0 as ord, '안내' as "구분", '' as "표",
         case when st.step = 'locked' then 'DB 를 잠갔습니다'
              else '아직 잠그지 않았습니다 — 점검만 했고 아무것도 바뀌지 않았습니다' end as "규칙 이름",
         '' as "누구", '' as "명령",
         case when st.step = 'locked'
              then '남은 일: 며칠 뒤 워커에 LEGACY_KEY_OFF=1 · REC_REQUIRE_AUTH=1 (이 파일 맨 위 3단계)'
              else '점검 줄을 모두 해결하고 계정 줄을 직원과 확인한 뒤, 맨 위 [잠금 확인] 줄을 ''잠금'' 으로 바꿔 다시 RUN' end as "판정"
    from st
  union all
  select 1, t.ord, '규칙', p.tablename::text, p.policyname::text,
         array_to_string(p.roles, ','), p.cmd::text,
         case when exists (select 1 from expected e where e.tbl = p.tablename and e.policyname = p.policyname)
              then '정상' else '⚠️ 예상 밖 규칙 — 다시 실행하세요' end
    from st, pg_policies p join t on t.tbl = p.tablename
   where st.step = 'locked' and p.schemaname = 'public'
  union all
  select 2, t.ord, '⚠️', t.tbl, e.policyname, '', '', '⚠️ 규칙 없음 — 다시 실행하세요'
    from st, expected e join t on t.tbl = e.tbl
   where st.step = 'locked'
     and to_regclass('public.' || t.tbl) is not null
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = e.tbl and p.policyname = e.policyname)
  union all
  select 2, t.ord, '⚠️', t.tbl, '', '', '', '⚠️ RLS 꺼짐 — 다시 실행하세요'
    from st, t join pg_class c on c.oid = to_regclass('public.' || t.tbl)
   where st.step = 'locked' and not c.relrowsecurity
  union all
  select 3, 0, '모드', '', coalesce((select value from private.app_settings where name = 'mode'), '(없음)'), '', '',
         case when (select value from private.app_settings where name = 'mode') = 'locked' then '정상 (잠김)'
              when st.step = 'locked' then '⚠️ 잠김 표시 안 됨 — 다시 실행하세요'
              else '열림 (아직 잠그지 않음)' end
    from st
  union all
  select (e ->> 'g')::integer, (e ->> 'o')::integer, e ->> 'k', e ->> 't', e ->> 'i', e ->> 'w', e ->> 'c', e ->> 'j'
    from st, jsonb_array_elements(st.rows) as e
  union all
  select 7, 0, '참고', c.relname::text, '(잠금 대상 7개 표 밖)', '', '',
         case when not c.relrowsecurity then '참고: RLS 꺼짐 — 공개 키로 열려 있을 수 있음, 개발자에게 알려 주세요'
              else '참고: 규칙 ' || (select count(*) from pg_policies p
                                       where p.schemaname = 'public' and p.tablename = c.relname)::text || '개 — 개발자에게 알려 주세요' end
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and c.relname not in (select tbl from t)
     and (not c.relrowsecurity
          or exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname))
)
select "구분", "표", "규칙 이름", "누구", "명령", "판정"
  from report
 order by grp, ord, "표", "규칙 이름";
