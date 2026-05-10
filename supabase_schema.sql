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
-- 완료! 이제 config.js 에 Project URL / anon key 를 입력하고
-- index.html 을 새로고침하면 정P 와 최T 가 동일 데이터를 공유합니다.
-- =====================================================================
