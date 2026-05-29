-- =====================================================================
-- Golf PT Collaboration — Supabase Schema
-- =====================================================================
-- 사용 방법:
--   1. Supabase 프로젝트 대시보드 → SQL Editor 열기
--   2. 아래 전체를 복사해서 붙여넣은 뒤 "Run" 클릭
--   3. config.js 에 Project URL / anon public key 입력 후 앱 새로고침
--
-- 이 앱은 내부 협업용(정P, 최T 두 사람이 공유) 입니다.
-- 기본 RLS 정책은 anon key 로 CRUD 를 모두 허용합니다.
-- 외부에 배포하거나 여러 팀이 쓰게 된다면 auth.uid() 기반 정책으로 교체하세요.
-- =====================================================================

-- ---------- 1) 회원 테이블 -----------------------------------------------
create table if not exists public.members (
  id          text        primary key,
  name        text        not null,
  color       text        not null default 'av-green',
  data        jsonb,                              -- 확장 필드 (phone/email/assignedTo/유효기간/memberType 등)
  created_at  timestamptz not null default now()
);
-- 기존 테이블에 data 컬럼이 없다면 추가 (재실행 안전)
alter table public.members add column if not exists data jsonb;

-- ---------- 2) 체형 / 기능 평가 ------------------------------------------
-- (회원 × 평가 항목) 조합을 primary key 로 사용
create table if not exists public.assessments (
  member_id   text        not null references public.members(id) on delete cascade,
  item_key    text        not null,
  result      text        default '미검사',
  note        text        default '',
  updated_at  timestamptz not null default now(),
  primary key (member_id, item_key)
);

-- ---------- 3) 세션 기록 -------------------------------------------------
create table if not exists public.sessions (
  id          text        primary key,
  member_id   text        not null references public.members(id) on delete cascade,
  date        date        not null,
  author      text        not null,                -- '정P' 또는 '최T'
  content     text        not null default '',
  supplement  text        default '',              -- 상대 담당자에게 전달할 보완점
  created_at  timestamptz not null default now()
);

-- ---------- 4) 조회 성능 인덱스 ------------------------------------------
create index if not exists idx_sessions_member       on public.sessions     (member_id, date desc);
create index if not exists idx_assessments_member    on public.assessments  (member_id);

-- ---------- 5) Row Level Security ----------------------------------------
alter table public.members     enable row level security;
alter table public.assessments enable row level security;
alter table public.sessions    enable row level security;

-- 기존 정책 제거 (재실행 시 충돌 방지)
drop policy if exists "members_all_anon"     on public.members;
drop policy if exists "assessments_all_anon" on public.assessments;
drop policy if exists "sessions_all_anon"    on public.sessions;

-- 내부 협업용 정책: anon key 로 전체 CRUD 허용
-- ※ 외부 공개용으로 쓸 경우 반드시 auth.uid() 기반으로 교체하세요.
create policy "members_all_anon"
  on public.members
  for all
  using (true)
  with check (true);

create policy "assessments_all_anon"
  on public.assessments
  for all
  using (true)
  with check (true);

create policy "sessions_all_anon"
  on public.sessions
  for all
  using (true)
  with check (true);

-- ---------- 6) 공유 리포트 -------------------------------------------------
create table if not exists public.reports (
  id          text        primary key,
  member_id   text        not null,
  member_name text        not null,
  created_by  text        not null,
  created_at  timestamptz not null default now(),
  content     jsonb       not null default '{}'
);
alter table public.reports enable row level security;
drop policy if exists "reports_all_anon" on public.reports;
create policy "reports_all_anon" on public.reports for all using (true) with check (true);

-- =====================================================================
-- 라이브 세션 (트랙맨 i/O 연동 기반) — Phase 1
-- ---------------------------------------------------------------------
-- 운영 안전 원칙:
--  · 베이(타석)는 트랙맨 PC와 1:1 물리 고정. 모든 귀속은 bay_id 기준.
--  · active_sessions.bay_id 가 PK  → "베이당 1세션" 을 DB가 강제.
--  · active_sessions.member_id UNIQUE → "회원은 동시에 한 베이만" 을 DB가 강제.
--  · 활성세션이 없는 베이의 샷은 앱에서 폐기(저장 안 함). 굿샷은 활성세션 안에서만.
-- =====================================================================

-- ---------- 7) 베이(타석) 마스터 ----------------------------------------
create table if not exists public.bays (
  id      text primary key,                -- 'bay1','bay2','bay3'
  name    text not null,                   -- '1번타석','2번타석','3번룸'
  color   text not null default 'bay-blue',
  type    text not null default 'practice' -- 'practice' | 'lesson_only'
);

-- ---------- 8) 베이 PC 에이전트 (향후 로컬 에이전트 인증용) --------------
create table if not exists public.bay_agents (
  bay_id         text primary key references public.bays(id) on delete cascade,
  pc_token       text not null unique,     -- 에이전트 인증 토큰 (PC별 발급)
  agent_version  text default '',
  last_heartbeat timestamptz
);

-- ---------- 9) 활성세션 — bay_id PK = 베이당 1세션 강제 ------------------
create table if not exists public.active_sessions (
  bay_id      text primary key references public.bays(id) on delete cascade,
  member_id   text not null references public.members(id) on delete cascade,
  member_name text not null,
  author      text not null,               -- 담당 지도자
  started_at  timestamptz not null default now(),
  note        text default '',
  unique (member_id)                        -- 회원은 동시에 한 베이만
);

-- ---------- 10) 굿샷 이벤트 (영상 + 트랙맨 데이터) -----------------------
create table if not exists public.shot_events (
  id           text primary key,
  bay_id       text not null references public.bays(id),
  member_id    text not null references public.members(id) on delete cascade,
  member_name  text not null,
  author       text default '',
  ts           timestamptz not null default now(),
  data         jsonb,                       -- 클럽/볼 데이터 (목 또는 트랙맨 실측)
  video_r2_key text,                        -- R2 영상 키 (연동 시)
  source       text default 'mock',         -- 'mock' | 'agent' | 'manual'
  created_at   timestamptz not null default now()
);

-- ---------- 11) 폐기 신호 로그 (활성세션 없을 때 들어온 샷 추적) ---------
create table if not exists public.discarded_signals (
  id      text primary key,
  bay_id  text not null,
  ts      timestamptz not null default now(),
  reason  text,                             -- 'no_active_session' | 'stale_session' | 'unknown_bay'
  raw     jsonb
);

-- ---------- 12) 기존 sessions 에 bay_id 연결 (재실행 안전) ---------------
alter table public.sessions add column if not exists bay_id text;

-- ---------- 13) 인덱스 ---------------------------------------------------
create index if not exists idx_shot_member on public.shot_events (member_id, ts desc);
create index if not exists idx_shot_bay    on public.shot_events (bay_id,    ts desc);

-- ---------- 14) RLS (내부 협업용 anon 전체 허용 — 기존 정책과 동일) ------
alter table public.bays              enable row level security;
alter table public.bay_agents        enable row level security;
alter table public.active_sessions   enable row level security;
alter table public.shot_events       enable row level security;
alter table public.discarded_signals enable row level security;

drop policy if exists "bays_all_anon"              on public.bays;
drop policy if exists "bay_agents_all_anon"        on public.bay_agents;
drop policy if exists "active_sessions_all_anon"   on public.active_sessions;
drop policy if exists "shot_events_all_anon"       on public.shot_events;
drop policy if exists "discarded_signals_all_anon" on public.discarded_signals;

create policy "bays_all_anon"              on public.bays              for all using (true) with check (true);
create policy "bay_agents_all_anon"        on public.bay_agents        for all using (true) with check (true);
create policy "active_sessions_all_anon"   on public.active_sessions   for all using (true) with check (true);
create policy "shot_events_all_anon"       on public.shot_events       for all using (true) with check (true);
create policy "discarded_signals_all_anon" on public.discarded_signals for all using (true) with check (true);

-- ---------- 15) 베이 3개 시드 (재실행 안전) -----------------------------
insert into public.bays (id, name, color, type) values
  ('bay1','1번타석','bay-blue','practice'),
  ('bay2','2번타석','bay-amber','practice'),
  ('bay3','3번룸','bay-green','lesson_only')
on conflict (id) do nothing;

-- =====================================================================
-- 완료! 이제 config.js 에 Project URL / anon key 를 입력하고
-- index.html 을 새로고침하면 정P 와 최T 가 동일 데이터를 공유합니다.
-- =====================================================================
