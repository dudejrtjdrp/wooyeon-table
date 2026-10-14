-- 이용권 종류를 결제 건에 저장
alter table payments add column if not exists pass_type text check (pass_type in ('single','subscription'));

-- 매칭 설정 (docs/02-matching-rules.md 3장)
insert into settings (key, value) values
  ('matching.weights', '{"age":25,"gender":22,"mbti":18,"interests":15,"wanted":12,"fresh":8}'),
  ('matching.min_score', '55')
on conflict (key) do nothing;

-- 시연 계정 (비밀번호는 README의 심사 안내 참고)
insert into users (login_id, password_hash, name, phone, role, is_demo) values
  ('admin', '$2b$10$DFeVhePCXGov7ejh83alCuk6nChB/nNv2aglvn2yteAwmIGPH0I7u', '운영자', null, 'admin', true),
  ('01000000001', '$2b$10$LRMg6ceZsVYf8kLyw0BOj.dWNLUIZmuYQQcoekB8HgUvYtoLm3V0C', '김우연', '01000000001', 'user', true)
on conflict (login_id) do nothing;

insert into profiles (user_id, birth_year, gender, job, mbti, interests, my_traits, wanted_traits, price_range, agreed_at)
select id, 1997, 'F', '마케터', 'ENFP', '{맛집 탐방,여행,전시·미술}', '{유쾌한,리액션 좋은}', '{차분한,다정한}', '2만 원대', now()
from users where login_id = '01000000001'
on conflict (user_id) do nothing;

-- 모집 차수와 일정 (심사 기간에도 신청할 수 있게 세 차수를 연다)
with r as (
  insert into rounds (title, apply_deadline, match_at) values
    ('10월 넷째 주 저녁', '2026-10-21T12:00:00+09:00', '2026-10-21T12:00:00+09:00'),
    ('10월 다섯째 주 저녁', '2026-10-28T12:00:00+09:00', '2026-10-28T12:00:00+09:00'),
    ('11월 첫째 주 저녁', '2026-11-04T12:00:00+09:00', '2026-11-04T12:00:00+09:00')
  returning id, title
)
insert into slots (round_id, region, starts_at, ends_at, max_tables)
select r.id, reg.region, d.starts_at, d.starts_at + interval '2 hours 30 minutes', 4
from r
join (values
  ('10월 넷째 주 저녁', '2026-10-23T19:30:00+09:00'::timestamptz),
  ('10월 넷째 주 저녁', '2026-10-24T19:00:00+09:00'::timestamptz),
  ('10월 다섯째 주 저녁', '2026-10-30T19:30:00+09:00'::timestamptz),
  ('10월 다섯째 주 저녁', '2026-10-31T19:00:00+09:00'::timestamptz),
  ('11월 첫째 주 저녁', '2026-11-06T19:30:00+09:00'::timestamptz),
  ('11월 첫째 주 저녁', '2026-11-07T19:00:00+09:00'::timestamptz)
) as d(title, starts_at) on d.title = r.title
cross join (values ('성수'), ('강남'), ('홍대'), ('여의도')) as reg(region);

-- 제휴 식당 (시연용 가상 식당)
insert into venues (name, region, address, map_url, price_range, seats_per_table) values
  ('성수 나무식탁', '성수', '서울 성동구 성수동 (시연용 가상 주소)', null, '2만 원대', 6),
  ('성수 작은부엌', '성수', '서울 성동구 성수동 (시연용 가상 주소)', null, '3만 원대', 6),
  ('강남 오늘의밥상', '강남', '서울 강남구 역삼동 (시연용 가상 주소)', null, '2만 원대', 6),
  ('강남 저녁마당', '강남', '서울 강남구 논현동 (시연용 가상 주소)', null, '3만 원대', 6),
  ('홍대 골목주방', '홍대', '서울 마포구 서교동 (시연용 가상 주소)', null, '1만 원대', 6),
  ('홍대 둥근식탁', '홍대', '서울 마포구 동교동 (시연용 가상 주소)', null, '2만 원대', 6),
  ('여의도 강변식당', '여의도', '서울 영등포구 여의도동 (시연용 가상 주소)', null, '3만 원대', 6),
  ('여의도 점심말고저녁', '여의도', '서울 영등포구 여의도동 (시연용 가상 주소)', null, '2만 원대', 6);

insert into venue_slots (venue_id, slot_id, tables_available)
select v.id, s.id, 2 from venues v join slots s on s.region = v.region;

-- 대화 콘텐츠
insert into conversation_contents (kind, tags, body) values
  ('icebreaker', '{}', '이름 대신 오늘 불리고 싶은 별명으로 자기소개하기'),
  ('icebreaker', '{}', '두 개의 진실과 하나의 거짓말: 나에 대한 문장 셋 중 거짓을 맞혀 보세요'),
  ('icebreaker', '{}', '오른쪽 사람의 첫인상을 한 단어로 말해 주기'),
  ('topic', '{}', '요즘 가장 자주 듣는 노래나 보고 있는 콘텐츠는 뭐예요?'),
  ('topic', '{}', '올해 안에 꼭 해 보고 싶은 일 하나만 꼽는다면요?'),
  ('topic', '{맛집 탐방}', '지금까지 먹어 본 것 중 다시 가고 싶은 한 끼를 소개해 주세요'),
  ('topic', '{여행}', '가장 기억에 남는 여행지와 그 이유가 궁금해요'),
  ('topic', '{운동}', '꾸준히 하고 있는 운동이 있나요? 시작한 계기도요'),
  ('topic', '{영화·드라마}', '인생 영화나 드라마 하나만 추천한다면?'),
  ('topic', '{음악·공연}', '최근에 다녀온 공연이나 가고 싶은 공연이 있나요?'),
  ('topic', '{책}', '요즘 읽는 책, 혹은 누군가에게 꼭 권하고 싶은 책은요?'),
  ('topic', '{전시·미술}', '기억에 남는 전시가 있다면 어떤 점이 좋았는지 들려주세요'),
  ('topic', '{와인·술}', '나만 아는 술집이나 좋아하는 술 한 잔을 소개해 주세요'),
  ('topic', '{게임}', '밤새 했던 게임이 있나요? 지금 하고 있는 게임도 좋아요'),
  ('topic', '{사진}', '휴대폰 사진첩에서 가장 아끼는 사진 한 장을 보여 주세요'),
  ('topic', '{커리어}', '지금 하는 일을 고르게 된 계기가 궁금해요'),
  ('topic', '{반려동물}', '함께 사는 반려동물 자랑, 또는 키우고 싶은 동물 이야기');
