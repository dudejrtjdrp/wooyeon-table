-- 우연한 식탁 MVP 초기 스키마
-- 근거: docs/01-state-flow.md, PRD 12~13장
-- 원칙: 상태는 네 갈래로 분리, 모든 상태 변경은 status_events에 기록, 자동 작업은 dedupe_key로 중복 방지

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- 사용자와 프로필
-- ─────────────────────────────────────────────
create table users (
  id            uuid primary key default gen_random_uuid(),
  role          text not null default 'user' check (role in ('user','admin')),
  login_id      text not null unique,
  password_hash text not null,
  name          text not null,
  phone         text,
  account_status text not null default 'active'
                check (account_status in ('active','warned','restricted','banned')),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);

create table profiles (
  user_id         uuid primary key references users(id) on delete cascade,
  birth_year      int  not null check (birth_year between 1950 and 2010),
  gender          text not null check (gender in ('M','F')),
  job             text,
  mbti            text check (mbti ~ '^[EI][NS][TF][JP]$'),
  interests       text[] not null default '{}',
  my_traits       text[] not null default '{}',   -- 본인 성향
  wanted_traits   text[] not null default '{}',   -- 만나고 싶은 사람의 성향
  price_range     text,                           -- 희망 식사 가격대
  food_restrictions text,                         -- 못 먹는 음식·알레르기
  agreed_at       timestamptz,                    -- 개인정보·운영 정책 동의
  updated_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 모집 차수와 일정
-- ─────────────────────────────────────────────
create table rounds (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  apply_deadline timestamptz not null,           -- 신청 마감
  match_at       timestamptz not null,           -- 자동 매칭 실행 시각
  status         text not null default 'open'
                 check (status in ('open','matching','matched','closed')),
  created_at     timestamptz not null default now()
);

create table slots (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references rounds(id) on delete cascade,
  region      text not null,                     -- 성수, 강남, 홍대, 여의도 ...
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  max_tables  int not null default 4,
  created_at  timestamptz not null default now()
);
create index on slots(round_id);

-- ─────────────────────────────────────────────
-- 결제와 이용권 (모의 결제)
-- 결제 건은 이용권에 묶는다. 일정 이동 시 같은 결제를 그대로 쓰므로 중복 승인이 생기지 않는다.
-- ─────────────────────────────────────────────
create table passes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  pass_type     text not null check (pass_type in ('single','subscription')),
  total_count   int  not null,
  remaining     int  not null,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  pass_id         uuid references passes(id),
  amount          int  not null,
  provider        text not null default 'mock',
  status          text not null default 'PENDING' check (status in (
                    'PENDING','PAID','FAILED','REFUND_AVAILABLE','REFUND_REQUESTED',
                    'REFUND_PROCESSING','REFUNDED','REFUND_FAILED')),
  idempotency_key text unique,
  paid_at         timestamptz,
  refunded_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 신청 (네 갈래 상태를 각각 저장)
-- ─────────────────────────────────────────────
create table applications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  round_id           uuid not null references rounds(id) on delete cascade,
  payment_id         uuid references payments(id),
  application_status text not null default 'DRAFT'
                     check (application_status in ('DRAFT','SUBMITTED','CANCELED')),
  payment_status     text not null default 'PENDING' check (payment_status in (
                       'PENDING','PAID','FAILED','REFUND_AVAILABLE','REFUND_REQUESTED',
                       'REFUND_PROCESSING','REFUNDED','REFUND_FAILED')),
  match_status       text not null default 'WAITING' check (match_status in (
                       'WAITING','MATCHING','REALLOCATING','CONFIRMED',
                       'ALTERNATIVE_OFFERED','TRANSFERRED','NO_MATCH','EXCEPTION')),
  attendance_status  text check (attendance_status in (
                       'SCHEDULED','ATTENDED','CANCELED_EARLY','CANCELED_LATE','NO_SHOW')),
  table_id           uuid,                        -- 확정된 테이블 (아래에서 FK 추가)
  realloc_count      int  not null default 0,     -- 자동 재배치 횟수
  match_reason       text,                        -- 참가자에게 보여줄 처리 설명
  transferred_from   uuid references applications(id),
  resolution         text check (resolution in ('transfer','keep_pass','refund')),
  submitted_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (user_id, round_id)
);
create index on applications(round_id, match_status);

-- 참가 가능한 일정 (날짜·지역 복수 선택)
create table application_slots (
  application_id uuid not null references applications(id) on delete cascade,
  slot_id        uuid not null references slots(id) on delete cascade,
  primary key (application_id, slot_id)
);

-- ─────────────────────────────────────────────
-- 매칭 실행과 테이블
-- ─────────────────────────────────────────────
create table match_runs (
  id                uuid primary key default gen_random_uuid(),
  round_id          uuid not null references rounds(id) on delete cascade,
  algorithm_version text not null,
  status            text not null default 'running'
                    check (status in ('running','done','failed')),
  candidate_count   int,
  summary           jsonb not null default '{}'::jsonb,  -- 생성·분리·병합·재배치·확정·실패 건수
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  unique (round_id)                                   -- 한 차수에 매칭은 한 번만 (재실행해도 중복 없음)
);

create table venues (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  region        text not null,
  address       text not null,
  map_url       text,
  price_range   text,
  seats_per_table int not null default 6,
  active        boolean not null default true
);

-- 일정별 식당 수용 가능 테이블 수 (식당 재고)
create table venue_slots (
  venue_id    uuid not null references venues(id) on delete cascade,
  slot_id     uuid not null references slots(id) on delete cascade,
  tables_available int not null default 1,
  primary key (venue_id, slot_id)
);

create table dining_tables (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references rounds(id) on delete cascade,
  slot_id       uuid not null references slots(id),
  match_run_id  uuid references match_runs(id),
  status        text not null default 'DRAFT' check (status in (
                  'DRAFT','CONFIRMED','VENUE_ASSIGNED','READY','IN_PROGRESS','DONE','DISSOLVED')),
  score         numeric,
  score_detail  jsonb not null default '{}'::jsonb,   -- 조건별 평가 결과
  explanation   jsonb not null default '{}'::jsonb,   -- 매칭 근거 (참가자·운영자용)
  venue_id      uuid references venues(id),
  reservation_name text,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index on dining_tables(round_id, status);

alter table applications
  add constraint applications_table_fk foreign key (table_id) references dining_tables(id);

-- ─────────────────────────────────────────────
-- 단체방과 알림
-- ─────────────────────────────────────────────
create table chat_rooms (
  id         uuid primary key default gen_random_uuid(),
  table_id   uuid not null unique references dining_tables(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references chat_rooms(id) on delete cascade,
  sender_id   uuid references users(id),               -- null이면 시스템 메시지
  kind        text not null default 'user' check (kind in ('user','system')),
  body        text not null,
  meta        jsonb not null default '{}'::jsonb,
  dedupe_key  text unique,                              -- 시스템 공지 중복 방지
  created_at  timestamptz not null default now()
);
create index on chat_messages(room_id, created_at);

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  template     text not null,
  title        text not null,
  body         text not null,
  link         text,
  scheduled_at timestamptz not null default now(),
  sent_at      timestamptz,
  read_at      timestamptz,
  status       text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts     int  not null default 0,
  last_error   text,
  dedupe_key   text unique,
  created_at   timestamptz not null default now()
);
create index on notifications(user_id, created_at desc);
create index on notifications(status, scheduled_at);

-- ─────────────────────────────────────────────
-- 대화 콘텐츠
-- ─────────────────────────────────────────────
create table conversation_contents (
  id     uuid primary key default gen_random_uuid(),
  kind   text not null check (kind in ('topic','icebreaker')),
  tags   text[] not null default '{}',   -- 관심사·성향 태그. 비어 있으면 공통 콘텐츠
  body   text not null,
  active boolean not null default true
);

-- ─────────────────────────────────────────────
-- 피드백, 사람별 선호, 안전
-- ─────────────────────────────────────────────
create table feedbacks (
  application_id uuid primary key references applications(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  table_id       uuid not null references dining_tables(id),
  mood_score     int check (mood_score between 1 and 5),
  talk_score     int check (talk_score between 1 and 5),
  venue_score    int check (venue_score between 1 and 5),
  rejoin_intent  int check (rejoin_intent between 1 and 5),
  recommend_intent int check (recommend_intent between 1 and 5),
  comment        text,
  created_at     timestamptz not null default now()
);

-- 다시 만나고 싶은 사람 / 다시 만나고 싶지 않은 사람 (비공개)
create table person_prefs (
  from_user  uuid not null references users(id) on delete cascade,
  to_user    uuid not null references users(id) on delete cascade,
  table_id   uuid not null references dining_tables(id) on delete cascade,
  pref       text not null check (pref in ('again','avoid')),
  created_at timestamptz not null default now(),
  primary key (from_user, to_user, table_id)
);

create table blocks (
  blocker_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table safety_reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references users(id) on delete cascade,
  reported_id  uuid not null references users(id) on delete cascade,
  table_id     uuid references dining_tables(id),
  reason       text not null,
  detail       text,
  status       text not null default 'open' check (status in ('open','reviewed')),
  action       text check (action in ('none','warning','restricted','banned')),
  admin_note   text,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 예외 큐와 상태 변경 기록
-- ─────────────────────────────────────────────
create table exceptions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in (
                'payment','refund','data_missing','condition_conflict',
                'venue_shortage','notification','no_show','safety')),
  ref_type    text not null,     -- application, dining_table, notification, safety_report ...
  ref_id      uuid not null,
  reason      text not null,
  status      text not null default 'open' check (status in ('open','resolved')),
  resolution  text,
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  dedupe_key  text unique,
  created_at  timestamptz not null default now()
);
create index on exceptions(status, created_at desc);

create table status_events (
  id           bigserial primary key,
  entity_type  text not null,    -- application, payment, dining_table ...
  entity_id    uuid not null,
  field        text not null,    -- match_status, payment_status ...
  from_value   text,
  to_value     text not null,
  actor        text not null,    -- system / user:<id> / admin:<id>
  reason       text,
  match_run_id uuid references match_runs(id),
  created_at   timestamptz not null default now()
);
create index on status_events(entity_type, entity_id, created_at);

-- ─────────────────────────────────────────────
-- 설정과 시연용 가상 시각
-- ─────────────────────────────────────────────
create table settings (
  key   text primary key,
  value jsonb not null
);

-- 시연용: 서버가 보는 "지금"을 앞당긴다. 실제 운영에서는 0.
create table app_clock (
  id             int primary key default 1 check (id = 1),
  offset_seconds bigint not null default 0
);
insert into app_clock (id, offset_seconds) values (1, 0);

-- 이전에 같은 테이블에서 만난 사람 (DONE 테이블 기준)
create view encounters as
select distinct a1.user_id as user_id, a2.user_id as met_user_id
from applications a1
join applications a2 on a1.table_id = a2.table_id and a1.user_id <> a2.user_id
join dining_tables t on t.id = a1.table_id
where t.status = 'DONE'
  and a1.attendance_status = 'ATTENDED'
  and a2.attendance_status = 'ATTENDED';

-- 서버(service role)만 접근한다. 브라우저에서 직접 DB를 읽지 않으므로 RLS는 모두 켜고 정책은 두지 않는다.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
