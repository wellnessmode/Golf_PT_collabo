-- ===========================================================================
-- 내셔널짐 전자계약서 시스템 스키마
-- ===========================================================================
--
--  ⚠️  중요: 반드시 "별도 신규 Supabase 프로젝트"에 실행하세요.
--      - 기존 golf_pt_collabo (members/assessments/sessions/reports) 프로젝트
--        ❌ 에 적용 금지
--      - 다른 운영 중인 프로젝트 ❌ 에 적용 금지
--      - 본 시스템 전용 신규 프로젝트만 사용
--
--  사용 방법:
--    1) https://supabase.com → New project
--       (이름 예: "nationalgym-contract")
--    2) Project Settings → API 에서 URL / anon key 메모
--    3) 본 파일을 SQL Editor 에 전체 복사하여 실행
--    4) Authentication → Users 에서 관리자 계정 추가
--    5) 같은 폴더의 config.js 에 URL / anon key 입력
-- ===========================================================================

-- 안전 가드: 기존 골프PT콜라보 프로젝트에 잘못 적용하는 것을 방지
-- (members 테이블이 존재하는 프로젝트라면 즉시 중단)
do $guard$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'members'
  ) then
    raise exception
      '이 프로젝트에는 골프PT콜라보 데이터(members 테이블)이 이미 존재합니다. '
      '전자계약서 시스템은 반드시 별도 신규 Supabase 프로젝트에 적용하세요. '
      '(만약 의도적으로 같은 프로젝트에 적용하려면 이 가드 블록을 삭제 후 재실행)';
  end if;
end;
$guard$;

-- 0) 확장 (gen_random_uuid)
create extension if not exists pgcrypto;

-- 1) 약관 템플릿 ----------------------------------------------------------
create table if not exists public.contract_templates (
  id              uuid primary key default gen_random_uuid(),
  contract_type   text not null check (contract_type in ('pt','golf','combo','custom')),
  version         text not null,
  title           text not null,
  body_html       text not null,
  agreements_json jsonb not null default '[]'::jsonb,
  is_active       boolean not null default true,
  effective_from  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (contract_type, version)
);

-- 2) 계약 인스턴스 --------------------------------------------------------
create table if not exists public.contracts (
  id                     uuid primary key default gen_random_uuid(),
  template_id            uuid not null references public.contract_templates(id),
  branch                 text,
  member_name            text not null,
  member_phone           text not null,
  member_birth           date,
  member_address         text,
  member_email           text,
  business_name          text not null,
  business_owner         text not null,
  business_registration  text,
  items_json             jsonb not null,
  total_amount           integer not null,
  payment_method         text,
  contract_period_start  date,
  contract_period_end    date,
  locker_no              text,
  locker_months          integer,
  notes                  text,
  sign_token             text not null unique,
  status                 text not null default 'pending'
                          check (status in ('pending','sent','viewed','signed','expired','canceled')),
  expires_at             timestamptz not null,
  created_by             uuid references auth.users(id),
  created_at             timestamptz not null default now(),
  sent_at                timestamptz,
  viewed_at              timestamptz,
  signed_at              timestamptz
);

create index if not exists contracts_token_idx   on public.contracts(sign_token);
create index if not exists contracts_status_idx  on public.contracts(status);
create index if not exists contracts_phone_idx   on public.contracts(member_phone);
create index if not exists contracts_created_idx on public.contracts(created_at desc);
create index if not exists contracts_branch_idx  on public.contracts(branch);

-- 3) 서명 (계약당 1개) ----------------------------------------------------
create table if not exists public.contract_signatures (
  contract_id            uuid primary key references public.contracts(id) on delete cascade,
  signature_data_url     text not null,
  agreed_items           jsonb not null,
  contract_html_snapshot text not null,
  signer_ip              text,
  signer_user_agent      text,
  signed_at              timestamptz not null default now(),
  pdf_storage_path       text
);

-- 4) 감사 로그 -----------------------------------------------------------
create table if not exists public.contract_audit_log (
  id          bigserial primary key,
  contract_id uuid references public.contracts(id) on delete cascade,
  event_type  text not null,
  event_data  jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_contract_idx on public.contract_audit_log(contract_id);

-- ===========================================================================
-- RLS 설정 — 인증 관리자만 직접 접근 가능, 비인증 접근은 RPC 만 허용
-- ===========================================================================
alter table public.contract_templates  enable row level security;
alter table public.contracts           enable row level security;
alter table public.contract_signatures enable row level security;
alter table public.contract_audit_log  enable row level security;

drop policy if exists "auth all contracts"  on public.contracts;
drop policy if exists "auth all templates"  on public.contract_templates;
drop policy if exists "auth all signatures" on public.contract_signatures;
drop policy if exists "auth all audit"      on public.contract_audit_log;

create policy "auth all contracts"  on public.contracts           for all to authenticated using (true) with check (true);
create policy "auth all templates"  on public.contract_templates  for all to authenticated using (true) with check (true);
create policy "auth all signatures" on public.contract_signatures for all to authenticated using (true) with check (true);
create policy "auth all audit"      on public.contract_audit_log  for all to authenticated using (true) with check (true);

-- ===========================================================================
-- RPC: 회원이 토큰으로 계약 + 약관을 조회 (서명 화면용)
-- ===========================================================================
create or replace function public.get_contract_for_signing(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_contract public.contracts%rowtype;
  v_template public.contract_templates%rowtype;
begin
  select * into v_contract
  from public.contracts
  where sign_token = p_token
    and status in ('pending','sent','viewed')
    and expires_at > now();
  if not found then
    return json_build_object('error', 'invalid_or_expired');
  end if;

  if v_contract.viewed_at is null then
    update public.contracts
       set status = case when status = 'pending' then 'viewed'
                         when status = 'sent'    then 'viewed'
                         else status end,
           viewed_at = now()
     where id = v_contract.id;
    insert into public.contract_audit_log(contract_id, event_type)
    values (v_contract.id, 'link_viewed');
    v_contract.status := 'viewed';
    v_contract.viewed_at := now();
  end if;

  select * into v_template
  from public.contract_templates
  where id = v_contract.template_id;

  return json_build_object(
    'contract', row_to_json(v_contract),
    'template', row_to_json(v_template)
  );
end;
$func$;
grant execute on function public.get_contract_for_signing(text) to anon, authenticated;

-- ===========================================================================
-- RPC: 회원이 서명 제출
-- ===========================================================================
create or replace function public.submit_signature(
  p_token                 text,
  p_signature_data_url    text,
  p_agreed_items          jsonb,
  p_contract_html_snapshot text,
  p_signer_user_agent     text
)
returns json
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_id uuid;
begin
  select id into v_id
  from public.contracts
  where sign_token = p_token
    and status in ('pending','sent','viewed')
    and expires_at > now()
  for update;

  if v_id is null then
    return json_build_object('error','invalid_or_expired');
  end if;

  insert into public.contract_signatures(
    contract_id, signature_data_url, agreed_items,
    contract_html_snapshot, signer_user_agent
  ) values (
    v_id, p_signature_data_url, p_agreed_items,
    p_contract_html_snapshot, p_signer_user_agent
  )
  on conflict (contract_id) do update set
    signature_data_url     = excluded.signature_data_url,
    agreed_items           = excluded.agreed_items,
    contract_html_snapshot = excluded.contract_html_snapshot,
    signer_user_agent      = excluded.signer_user_agent,
    signed_at              = now();

  update public.contracts
     set status = 'signed',
         signed_at = now()
   where id = v_id;

  insert into public.contract_audit_log(contract_id, event_type, user_agent)
  values (v_id, 'signed', p_signer_user_agent);

  return json_build_object('ok', true, 'contract_id', v_id);
end;
$func$;
grant execute on function public.submit_signature(text,text,jsonb,text,text) to anon, authenticated;

-- ===========================================================================
-- RPC: 서명 완료 계약 조회 (회원은 토큰, 관리자는 인증으로)
-- ===========================================================================
create or replace function public.get_signed_contract(p_id uuid, p_token text default null)
returns json
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_contract  public.contracts%rowtype;
  v_template  public.contract_templates%rowtype;
  v_sig       public.contract_signatures%rowtype;
  v_authed    boolean := auth.uid() is not null;
begin
  select * into v_contract from public.contracts where id = p_id;
  if not found then
    return json_build_object('error', 'not_found');
  end if;

  if not v_authed then
    if p_token is null or p_token <> v_contract.sign_token then
      return json_build_object('error', 'unauthorized');
    end if;
  end if;

  select * into v_template from public.contract_templates where id = v_contract.template_id;
  select * into v_sig      from public.contract_signatures where contract_id = p_id;

  return json_build_object(
    'contract',  row_to_json(v_contract),
    'template',  row_to_json(v_template),
    'signature', case when v_sig.contract_id is null then null else row_to_json(v_sig) end
  );
end;
$func$;
grant execute on function public.get_signed_contract(uuid, text) to anon, authenticated;

-- ===========================================================================
-- 만료 처리 — Supabase Cron 또는 수동 실행
--   select public.expire_old_contracts();
-- ===========================================================================
create or replace function public.expire_old_contracts()
returns integer
language plpgsql
security definer
set search_path = public
as $func$
declare v_count int;
begin
  update public.contracts
     set status = 'expired'
   where status in ('pending','sent','viewed')
     and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$func$;
grant execute on function public.expire_old_contracts() to authenticated;

-- ===========================================================================
-- 시드 약관 — 첨부 .pptx (250725, 260428) 두 버전 반영
-- ===========================================================================

-- (1) PT + 골프 통합 (2026-04-28 최신)
insert into public.contract_templates (contract_type, version, title, body_html, agreements_json)
values ('combo', '2026-04-28', '내셔널짐 PT & 골프 이용 계약서',
$tpl$
<p><b>NATIONAL GYM PT &amp; GOLF</b> 이용 약관입니다. 본 계약은 내셔널짐(개인사업자, 이하 "센터")과 회원 사이에 체결됩니다.</p>

<h3>1. 회원 준수 사항</h3>
<ol>
<li>이용권은 명시된 유효기간 · 예약 일자 · 시간 내에서만 사용 가능합니다.</li>
<li>유효기간은 첫 사용일 기준으로 산정되며, 별도의 홀딩 요청 없이 기간 만료 시 자동 소멸됩니다.</li>
<li>질병 · 개인사정 등으로 인한 미사용분은 별도 보장되지 않습니다.</li>
<li>예약 변경은 최소 12시간 전까지 가능하며, 당일 취소 또는 무단 결석 시 해당 레슨은 진행된 것으로 간주합니다.</li>
<li>운영시간 및 휴무일은 센터 공지에 따릅니다.</li>
<li>레슨 패키지에 포함된 30분 연습 이용은 레슨 진행 당일에만 사용 가능하며, 당일 미사용 시 별도 적립 · 이월이 불가합니다.</li>
<li>담당 트레이너 / 프로의 사정으로 레슨이 불가능할 시 담당자가 변경될 수 있으며, 이는 환불의 사유가 되지 않습니다.</li>
<li>(골프) 레슨 단품권은 단독으로 이용하실 수 없으며, 반드시 타석 이용권을 보유하셔야 레슨 진행 및 센터 입장이 가능합니다.</li>
<li>센터의 제반 시설 이용 중 발생한 불가항력적 사유, 사전 통보되지 않은 개인 사유(질병 포함), 또는 회원의 귀책사유로 인한 이용 불가에 대해서는 센터가 책임을 지지 않습니다.</li>
<li>시설물 및 대여 물품에 대하여 고의 · 과실로 인한 훼손 · 파손 시 해당 회원이 모든 책임을 집니다.</li>
<li>센터 물품의 무단 반출 또는 훼손이 확인될 경우, 해당 물품의 시가 및 이에 준하는 손해액(최소 시가의 2배)을 배상하여야 하며, 센터는 회원 자격을 제한하거나 해지할 수 있습니다.</li>
<li>귀중품은 반드시 안내데스크에 보관하여야 하며, 보관하지 않은 물품의 분실 · 멸실 · 훼손에 대한 책임은 회원 본인에게 있습니다.</li>
<li>골프 사물함 이용기간 만료 후 남아 있는 물품은 센터에서 회수하여 7일간 보관하며, 보관기간 경과 후에는 임의 처분(폐기 포함)할 수 있습니다. 골프 사물함 이용료는 1개월 기준 상단 2만원, 하단 3만원이며, 환불 시 공제 대상에 포함되지 않습니다. (헬스 사물함은 1개월 1만원이며, 환불 시 공제되지 않습니다.)</li>
<li>본 센터의 골프 타석은 안전상의 이유로 회원 1인 단독 이용을 원칙으로 하며, 등록되지 않은 인원(동반자 등)의 타석 사용은 금지됩니다. 이를 위반 시 즉시 이용 제한 또는 회원 자격 제한 등의 제재가 적용될 수 있습니다.</li>
<li>회원의 안전 및 원활한 센터 이용을 위해 본 약관과 운영규정을 위반하거나 전염병 · 풍기문란 · 사고 및 영업에 방해를 끼치는 모든 행위로 질서 유지에 지장을 초래한 경우 회원의 권리를 제한 · 박탈합니다.</li>
</ol>

<h3>2. 유효기간 및 홀딩 규정</h3>
<table>
<thead><tr><th>구분</th><th>이용 시간</th><th>유효기간</th><th>홀딩 규정</th></tr></thead>
<tbody>
<tr><td rowspan="2">골프 레슨</td><td rowspan="2">25분 / 50분</td><td>8회 — 2개월</td><td>2개월권 — 14일</td></tr>
<tr><td>20회 · 30회 — 4개월</td><td>4개월권 — 28일</td></tr>
<tr><td rowspan="3">골프 타석</td><td rowspan="3">1회 55분</td><td>1개월</td><td>1개월권 — 7일</td></tr>
<tr><td>3개월</td><td>3개월권 — 21일</td></tr>
<tr><td>6개월</td><td>6개월권 — 35일</td></tr>
<tr><td rowspan="3">PT</td><td rowspan="3">1회 50분</td><td>10회 — 40일</td><td>10회 — 7일</td></tr>
<tr><td>20회 — 80일</td><td>20회 — 21일</td></tr>
<tr><td>30회 — 120일</td><td>30회 — 30일</td></tr>
</tbody>
</table>
<p>유효기간 내 홀딩 가능 횟수: 10회권 1회, 20회 · 30회권은 2회. (1개월권은 1회, 그 외 이용권은 2회)</p>

<h3>3. 환불 및 양도, 업그레이드</h3>
<ol>
<li>최초 등록 후 3회 이용 시점까지 업그레이드 신청이 가능하며, 차액을 납부하여 변경할 수 있습니다.</li>
<li>원칙상 환불은 불가하나 불가피한 사유가 발생한 경우 증빙 서류 제출 및 센터 승인을 통해 소비자 피해 보상 규정에 따라 환불 처리됩니다.</li>
<li><b>환불 공제금액</b>: 결제금액 − 위약금 10% − 카드 수수료 5% − 사은품 및 서비스 공제
  <ul>
    <li>(타석 이용권) 등록일부터 해지일까지의 날짜 × 1회 이용료 35,000원</li>
    <li>(레슨 / PT 이용권) 1회 정상가 × 이용횟수</li>
  </ul>
</li>
<li>양도는 30일 이상 잔여기간이 남아있을 때에 한하여 1회만 가능하며 양도수수료는 5만원이 발생됩니다. 단, 1회 양도 이후 환불 / 재양도 / 휴회 적용이 불가합니다. (본 센터에서는 양도를 주선하거나 소개하지 않습니다.)</li>
</ol>

<h3>4. 개인정보의 처리</h3>
<ul>
<li><b>수집 항목</b>: 이름, 휴대폰번호, 생년월일, 주소, 결제정보</li>
<li><b>이용 목적</b>: 회원 관리, 서비스 제공, 예약 · 결제 처리, 안전사고 대응</li>
<li><b>보유 기간</b>: 회원 자격 유지기간 및 관계법령에 따른 보존기간 (전자상거래법 5년 등)</li>
<li><b>제3자 제공</b>: 결제대행사 · 세무 신고를 위한 최소 정보 외 제공하지 않음</li>
</ul>
<p style="color:#666;font-size:12px">본 약관 시행일: 2026년 4월 28일</p>
$tpl$,
$ag$[
{"key":"terms","label":"위 PT & 골프 이용 약관 전문에 동의합니다.","required":true},
{"key":"refund","label":"환불 및 양도 규정(위약금 10%, 카드수수료 5%, 회당 정상가 공제 등)을 충분히 이해하였으며 이에 동의합니다.","required":true},
{"key":"privacy","label":"서비스 제공·회원관리를 위한 개인정보(이름·연락처·생년월일·주소) 수집·이용에 동의합니다.","required":true},
{"key":"health","label":"본인의 건강상태(질환·부상 등)에 대해 사실대로 고지하였으며, 운동 중 발생할 수 있는 위험을 인지하고 있음을 확인합니다.","required":true},
{"key":"single_use","label":"(골프) 골프 타석은 회원 1인 단독 이용이 원칙임을 확인합니다.","required":false},
{"key":"locker","label":"사물함 이용료 및 만료 후 보관·폐기 규정을 확인하였습니다.","required":false},
{"key":"marketing","label":"(선택) 마케팅·이벤트·프로모션 정보 수신에 동의합니다.","required":false}
]$ag$::jsonb)
on conflict (contract_type, version) do nothing;

-- (2) PT 단독 (2025-07-25 버전 기반)
insert into public.contract_templates (contract_type, version, title, body_html, agreements_json)
values ('pt', '2025-07-25', '내셔널짐 PT 이용 계약서',
$tpl$
<p>본 계약은 내셔널짐(개인사업자, 이하 "센터")과 회원 사이의 PT(퍼스널 트레이닝) 이용에 관한 사항을 규정합니다.</p>

<h3>1. 회원 준수사항</h3>
<ol>
<li>내셔널짐 회원은 레슨 유효기간 및 예약 일자 · 시간을 엄수하여 기간 내 사용하여야 합니다. 운영시간 및 휴무일은 센터 공지에 따릅니다.</li>
<li>예약 변경은 최소 12시간 전까지 가능하며, 당일 취소 또는 무단 결석 시 해당 레슨은 진행된 것으로 간주합니다.</li>
<li>센터의 제반시설 이용 중 발생한 불가항력적 사유, 센터 측에 사전 통보되지 않은 질병, 본인의 과실 또는 귀책 사유로 인한 사고 시 본 센터는 책임을 지지 않습니다.</li>
<li>귀중품은 안내 데스크에 보관하여야 하며, 보관하지 않은 개인 물품의 분실 · 멸실 · 훼손에 대해서는 회원 본인이 책임을 집니다.</li>
<li>개인 사물함 이용기간이 만료된 후에도 남아있는 물품은 센터 측에서 회수 후 7일간 보관하며 이후에는 임의 폐기할 수 있습니다. 개인 사물함 비용은 1개월당 1만원이며, 환불 시 공제되지 않습니다.</li>
<li>회원의 안전 및 원활한 센터 이용을 위해 본 약관과 운영규정을 위반하거나 전염병 · 풍기문란 · 사고 및 영업에 방해를 끼치는 모든 행위로 질서 유지에 지장을 초래한 경우 회원의 권리를 제한 · 박탈합니다.</li>
<li>시설물 및 대여 물품을 고의 또는 부주의로 훼손 · 파손했을 경우 해당 회원이 모든 책임을 집니다.</li>
<li>센터 물품의 무단 반출 또는 훼손이 확인될 경우, 해당 물품의 시가 및 이에 준하는 손해액(최소 시가의 2배)을 배상하여야 하며, 센터는 회원 자격을 제한하거나 해지할 수 있습니다.</li>
<li>센터 혹은 담당 트레이너의 사정으로 레슨이 불가능할 시 다른 트레이너로 변경될 수 있으며, 이는 환불의 사유에 해당하지 않습니다.</li>
</ol>

<h3>2. 유효기간 및 개인 운동 기간</h3>
<table>
<thead><tr><th>레슨 횟수</th><th>유효기간</th></tr></thead>
<tbody>
<tr><td>10회</td><td>40일</td></tr>
<tr><td>20회</td><td>80일</td></tr>
<tr><td>30회</td><td>120일</td></tr>
</tbody>
</table>

<h3>3. 홀딩 기간</h3>
<ul>
<li>이용권 홀딩 기간은 최대 10회 7일, 20회 21일, 30회 30일입니다.</li>
<li>유효기간 내 10회는 1회, 20회 및 30회는 2회에 한 해 홀딩 요청이 가능합니다.</li>
</ul>

<h3>4. 환불 및 양도</h3>
<ul>
<li>원칙상 환불은 불가하나 불가피한 사유가 발생한 경우 증빙 서류 제출 및 센터 승인을 통해 소비자 피해 보상 규정에 따라 환불 처리됩니다.</li>
<li><b>환불 공제금액</b>: 결제금액 − 위약금 10% − 카드 수수료 5% − (1회 정상가 × 이용횟수) − 사은품 및 서비스 공제</li>
<li>양도는 30일 이상 잔여기간이 남아있을 때에 한하여 1회만 가능하며 양도수수료는 5만원이 발생됩니다. (단, 1회 양도 이후 환불 / 재양도 / 휴회 적용 불가)</li>
<li>본 센터에서는 양도를 주선하거나 소개하지 않습니다.</li>
</ul>

<h3>5. 개인정보 처리</h3>
<p>수집 항목: 이름 · 휴대폰 · 생년월일 · 주소 · 결제정보 / 이용 목적: 회원관리 · 서비스 제공 · 예약 처리 / 보유 기간: 회원 자격 유지기간 및 관계법령 보존기간.</p>

<p style="color:#666;font-size:12px">본 약관 시행일: 2025년 7월 25일</p>
$tpl$,
$ag$[
{"key":"terms","label":"위 PT 이용 약관 전문에 동의합니다.","required":true},
{"key":"refund","label":"환불 및 양도 규정을 충분히 이해하였으며 이에 동의합니다.","required":true},
{"key":"privacy","label":"서비스 제공·회원관리를 위한 개인정보 수집·이용에 동의합니다.","required":true},
{"key":"health","label":"본인의 건강상태에 대해 사실대로 고지하였음을 확인합니다.","required":true},
{"key":"marketing","label":"(선택) 마케팅 및 이벤트 정보 수신에 동의합니다.","required":false}
]$ag$::jsonb)
on conflict (contract_type, version) do nothing;

-- (3) 골프 단독 (2026-04-28) — combo 본문 재사용, 동의항목만 골프 위주
insert into public.contract_templates (contract_type, version, title, body_html, agreements_json)
values ('golf', '2026-04-28', '내셔널짐 골프 레슨 및 이용권 계약서',
(select body_html from public.contract_templates where contract_type='combo' and version='2026-04-28'),
$ag$[
{"key":"terms","label":"위 골프 레슨 및 이용권 약관 전문에 동의합니다.","required":true},
{"key":"refund","label":"환불 및 양도 규정(타석 1회 이용료 35,000원 공제 등)을 충분히 이해하였으며 이에 동의합니다.","required":true},
{"key":"privacy","label":"서비스 제공·회원관리를 위한 개인정보 수집·이용에 동의합니다.","required":true},
{"key":"single_use","label":"골프 타석은 회원 1인 단독 이용이 원칙임을 확인합니다.","required":true},
{"key":"locker","label":"골프 사물함 이용료(상단 2만원/하단 3만원) 및 보관·폐기 규정을 확인하였습니다.","required":false},
{"key":"marketing","label":"(선택) 마케팅 및 이벤트 정보 수신에 동의합니다.","required":false}
]$ag$::jsonb)
on conflict (contract_type, version) do nothing;

-- ===========================================================================
-- 끝
-- 적용 후 Authentication > Users 메뉴에서 관리자 계정을 추가하세요.
-- ===========================================================================
