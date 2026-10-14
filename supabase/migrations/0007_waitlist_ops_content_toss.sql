-- 0007: 대기자 자동 전환(STA-07), 운영자 긴급 수정(MAT-14), 콘텐츠 관리(CON-04), 토스페이먼츠 결제(PAY)

-- 빈자리 제안: 확정 테이블에 취소석이 생기면 조건에 맞는 대기자에게 한 명씩 차례로 묻는다
create table if not exists seat_offers (
  id             uuid primary key default gen_random_uuid(),
  table_id       uuid not null references dining_tables(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending','accepted','declined','expired','void')),
  expires_at     timestamptz not null,
  responded_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (table_id, application_id)
);
create index if not exists seat_offers_pending on seat_offers(status, expires_at);
create unique index if not exists seat_offers_one_pending on seat_offers(table_id) where status = 'pending';
alter table seat_offers enable row level security;

-- 콘텐츠 노출 규칙: 테이블 유형(첫 참가 위주, 재방문 위주, 4인, 5~6인, 20대, 30대)과 우선순위
alter table conversation_contents add column if not exists table_types text[] not null default '{}';
alter table conversation_contents add column if not exists priority int not null default 0;
alter table conversation_contents add column if not exists created_at timestamptz not null default now();
alter table conversation_contents add column if not exists updated_at timestamptz not null default now();

-- 토스페이먼츠 결제 정보
alter table payments add column if not exists method text;
alter table payments add column if not exists pg_payment_key text;
alter table payments add column if not exists pg_order_id text;
alter table payments add column if not exists receipt_url text;
alter table payments add column if not exists pg_raw jsonb;
alter table payments add column if not exists refund_error text;
create unique index if not exists payments_pg_order on payments(pg_order_id) where pg_order_id is not null;

-- 유형별 기본 콘텐츠
insert into conversation_contents (kind, tags, table_types, priority, body)
select v.kind, v.tags::text[], v.types::text[], v.priority, v.body
from (values
  ('topic', '{}', '{first}', 2, '이 모임을 알게 된 계기와 신청 버튼을 누르기 직전 마음이 궁금해요'),
  ('topic', '{}', '{first}', 1, '처음 보는 사람과 금방 친해지는 나만의 방법이 있나요?'),
  ('topic', '{}', '{regular}', 2, '지난 모임에서 가장 기억에 남는 대화는 무엇이었나요?'),
  ('topic', '{}', '{small}', 1, '네 명이라 가능한 질문: 요즘 가장 고민되는 선택 하나를 나눠 볼까요?'),
  ('topic', '{}', '{large}', 1, '돌아가며 한 문장씩: 요즘 나를 웃게 하는 작은 것'),
  ('topic', '{}', '{age20s}', 0, '스무 살의 나에게 지금의 내가 해 주고 싶은 말은요?'),
  ('topic', '{}', '{age30s}', 0, '서른이 넘어 새로 좋아하게 된 것이 있나요?'),
  ('icebreaker', '{}', '{large}', 1, '공통점 찾기: 테이블 모두에게 해당하는 것 세 가지를 5분 안에 찾아보세요'),
  ('icebreaker', '{}', '{first}', 1, '오늘의 밸런스 게임: 평생 한 가지 음식만 먹기 vs 평생 외식 금지')
) as v(kind, tags, types, priority, body)
where not exists (select 1 from conversation_contents c where c.body = v.body);
