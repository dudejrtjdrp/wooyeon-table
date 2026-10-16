-- 운영사 Q&A 반영 (2026-10-16, docs/prd/08-qna.md)
-- 1) 이용권: 1회권 + 멤버십 1·3·6개월 (예전 'subscription'은 시연 데이터용으로 남김)
-- 2) 운영 안 하는 지역의 수요 조사
-- 3) 식당 평점·예약 채널과 예약 기록 (네이버 예약·캐치테이블 연동 구조)
-- 4) 노쇼 단계 제한

alter table passes drop constraint if exists passes_pass_type_check;
alter table passes add constraint passes_pass_type_check check (pass_type in ('single','subscription','m1','m3','m6'));
alter table payments drop constraint if exists payments_pass_type_check;
alter table payments add constraint payments_pass_type_check check (pass_type in ('single','subscription','m1','m3','m6'));

create table if not exists region_demands (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  sido        text not null,
  area        text,
  note        text,
  notified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists region_demands_area on region_demands(sido, area);
alter table region_demands enable row level security;
comment on table region_demands is '아직 열지 않은 지역에서 열리면 알려 달라고 남긴 수요. 그 동네에 일정이 열리면 알림을 보내고 notified_at을 채운다';

alter table venues add column if not exists rating numeric(2,1);
alter table venues add column if not exists review_count int;
alter table venues add column if not exists booking_channel text check (booking_channel in ('naver','catchtable','phone'));
alter table venues add column if not exists booking_url text;
alter table venues add column if not exists phone text;
comment on column venues.rating is '리뷰 평점(5점 만점). 배정 때 4.3 이상을 먼저 고른다';
comment on column venues.booking_channel is '예약 채널: naver(네이버 예약) / catchtable / phone';

create table if not exists reservations (
  id               uuid primary key default gen_random_uuid(),
  table_id         uuid not null unique references dining_tables(id) on delete cascade,
  venue_id         uuid not null references venues(id),
  channel          text not null check (channel in ('naver','catchtable','phone')),
  status           text not null default 'REQUESTED' check (status in ('REQUESTED','CONFIRMED','FAILED','CANCELED')),
  party_size       int not null,
  reserved_for     timestamptz not null,
  reservation_name text not null,
  external_ref     text,
  deep_link        text,
  attempts         int not null default 0,
  last_error       text,
  mode             text not null default 'mock' check (mode in ('mock','live','manual')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table reservations enable row level security;
comment on table reservations is '식당 예약. 채널별 어댑터가 요청을 보내고(지금은 모의), 3번 실패하면 예외 큐로. 운영자가 직접 확정하면 mode=manual';

alter table exceptions drop constraint if exists exceptions_kind_check;
alter table exceptions add constraint exceptions_kind_check check (kind in (
  'payment','refund','data_missing','condition_conflict','venue_shortage','notification','no_show','safety','reservation'));

alter table users add column if not exists restricted_until timestamptz;
comment on column users.restricted_until is '노쇼 등으로 신청이 막힌 기한. 지나면 다시 신청할 수 있다';

-- 시연용 식당: 기존 식당에 평점·예약 채널을 채우고, 새로 여는 잠실·을지로에도 둘씩 둔다 (가상 식당, 평점은 시연용 가정값)
update venues set rating = 4.5, review_count = 312, booking_channel = 'naver'      where rating is null and name like '%나무식탁%';
update venues set rating = 4.4, review_count = 188, booking_channel = 'catchtable' where rating is null and name like '%작은부엌%';
update venues set rating = 4.3, review_count = 141, booking_channel = 'naver'      where rating is null and region like '강남%';
update venues set rating = 4.6, review_count = 420, booking_channel = 'catchtable' where rating is null and region like '홍대%';
update venues set rating = 4.2, review_count = 97,  booking_channel = 'phone'      where rating is null and region like '여의도%';
insert into venues (name, region, address, price_range, seats_per_table, rating, review_count, booking_channel)
select * from (values
  ('잠실 호숫가 식탁', '잠실·송파', '서울 송파구 잠실동 (시연용 가상 주소)', '2만 원대', 6, 4.5, 256, 'naver'),
  ('송리단길 저녁집', '잠실·송파', '서울 송파구 송파동 (시연용 가상 주소)', '3만 원대', 6, 4.4, 173, 'catchtable'),
  ('을지로 골목부엌', '을지로·종로·광화문', '서울 중구 을지로3가 (시연용 가상 주소)', '2만 원대', 6, 4.6, 389, 'catchtable'),
  ('종로 한옥식탁', '을지로·종로·광화문', '서울 종로구 익선동 (시연용 가상 주소)', '3만 원대', 6, 4.3, 122, 'naver')
) as v(name, region, address, price_range, seats_per_table, rating, review_count, booking_channel)
where not exists (select 1 from venues x where x.name = v.name);

-- 운영 데이터를 새 정책에 맞춘다
-- (1) 아직 결제 전인 1회권 결제 대기 건은 새 가격(9,900원)으로
update payments set amount = 9900 where status in ('PENDING','FAILED') and pass_type = 'single' and amount <> 9900;
-- (2) 모집 중인 회차의 신청·매칭 마감을 '모임 주 화요일 24:00'으로 (아직 안 지난 경우만)
update rounds r set apply_deadline = c.cut, match_at = c.cut
from (
  select round_id,
         min(((date_trunc('day', starts_at at time zone 'Asia/Seoul')
               - ((((extract(dow from starts_at at time zone 'Asia/Seoul'))::int - 3 + 7) % 7) * interval '1 day'))
              ) at time zone 'Asia/Seoul') as cut
  from slots group by round_id
) c
where r.id = c.round_id and r.status = 'open' and c.cut > now();
-- (3) 모집 중인 회차에 운영 지역(잠실·을지로)도 연다. 같은 날짜·시간으로
insert into slots (round_id, region, sido, starts_at, ends_at, max_tables)
select distinct s.round_id, reg.region, '서울', s.starts_at, s.ends_at, s.max_tables
from slots s
join rounds r on r.id = s.round_id and r.status = 'open'
cross join (values ('잠실·송파'), ('을지로·종로·광화문')) as reg(region)
where not exists (select 1 from slots x where x.round_id = s.round_id and x.region = reg.region and x.starts_at = s.starts_at);
insert into venue_slots (venue_id, slot_id, tables_available)
select v.id, s.id, 2
from slots s join rounds r on r.id = s.round_id and r.status = 'open'
join venues v on v.region = s.region and v.active
where not exists (select 1 from venue_slots x where x.venue_id = v.id and x.slot_id = s.id);
