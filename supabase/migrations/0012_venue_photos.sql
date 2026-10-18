-- 식당 사진과 업종 (2026-10-18, 성효님 요청: 사진은 업로드로, 식당 데이터는 엑셀로도 넣기)
-- 사진은 Supabase 저장소 버킷 대신 DB 테이블에 둔다: 운영 쪽에 버킷을 새로 만들 필요가 없고 로컬 시뮬레이션 DB에서도 똑같이 돈다.
-- 어드민에서 올릴 때 브라우저가 긴 변 1280px JPEG로 줄여서 보내므로 한 장이 수백 KB를 넘지 않는다.

-- 1) 식당 표시용 칼럼
alter table venues add column if not exists photo_url text;   -- /api/venue-photo/<id>?v=... 또는 엑셀로 넣은 외부 이미지 주소
alter table venues add column if not exists category text;    -- 업종 한 줄 (예: 한식 주점, 이탈리안)
comment on column venues.photo_url is '참가자 화면에 보이는 대표 사진. 어드민 업로드면 /api/venue-photo/<venue_id>?v=<저장 시각>';
comment on column venues.category is '업종 한 줄. 참가자 테이블 화면에 식당 이름 아래 보인다';

-- 2) 업로드한 사진 원본 (base64)
create table if not exists venue_photos (
  venue_id   uuid primary key references venues(id) on delete cascade,
  mime       text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  data       text not null,          -- base64
  bytes      int not null,
  updated_at timestamptz not null default now()
);
alter table venue_photos enable row level security;  -- 다른 테이블처럼 앱 서버(service role)만 읽고 쓴다
comment on table venue_photos is '어드민에서 올린 식당 대표 사진. 공개 라우트 /api/venue-photo/<venue_id>가 꺼내 준다';

-- 3) 같은 동네에 같은 이름의 식당은 하나만 (엑셀 업로드가 이 기준으로 고친다/추가한다)
create unique index if not exists venues_region_name_key on venues(region, name);
