-- 지역을 "시·도 → 동네 묶음" 2단계로 (2026-10-16)
-- slots.region / venues.region은 동네 묶음 이름, slots.sido는 시·도.
-- 신청에는 고른 묶음·날짜와 '가까운 동네도 괜찮아요'(기본 켜짐)를 남긴다.

alter table slots add column if not exists sido text;

update slots set region = case region
  when '성수' then '성수·건대'
  when '강남' then '강남·역삼·선릉'
  when '홍대' then '홍대·합정·연남'
  when '여의도' then '여의도·영등포'
  else region end;
update venues set region = case region
  when '성수' then '성수·건대'
  when '강남' then '강남·역삼·선릉'
  when '홍대' then '홍대·합정·연남'
  when '여의도' then '여의도·영등포'
  else region end;
update slots set sido = '서울' where sido is null and region in
  ('강남·역삼·선릉','신사·압구정·청담','성수·건대','홍대·합정·연남','신촌·이대','을지로·종로·광화문','용산·이태원·한남','여의도·영등포','잠실·송파','마곡·목동');

-- 이미 들어온 신청은 체크박스를 본 적이 없으니 '끔'으로 채우고, 새 신청부터 기본 켜짐
alter table applications add column if not exists near_ok boolean not null default false;
alter table applications alter column near_ok set default true;
alter table applications add column if not exists areas text[] not null default '{}';
alter table applications add column if not exists dates text[] not null default '{}';

comment on column applications.near_ok is '가까운 동네도 괜찮아요: 고른 묶음에서 4명이 안 모이면 같은 시·도 다른 묶음으로 재배치해도 되는지';
comment on column applications.areas is '고른 동네 묶음 (또는 "서울 전체")';
comment on column applications.dates is '고른 날짜 YYYY-MM-DD (한국 시간)';

-- 이미 들어온 신청은 고른 일정에서 묶음·날짜를 채운다
update applications a set
  areas = coalesce((select array_agg(distinct s.region) from application_slots x join slots s on s.id = x.slot_id where x.application_id = a.id), '{}'),
  dates = coalesce((select array_agg(distinct to_char(s.starts_at at time zone 'Asia/Seoul', 'YYYY-MM-DD')) from application_slots x join slots s on s.id = x.slot_id where x.application_id = a.id), '{}')
where a.areas = '{}';
