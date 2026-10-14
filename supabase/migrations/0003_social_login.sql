-- 소셜 로그인(카카오·네이버·구글)
-- 한 사람이 여러 제공자로 들어올 수 있게 연결 정보는 따로 둔다.
alter table users alter column password_hash drop not null;
alter table users add column if not exists email text;
alter table users add column if not exists avatar_url text;
alter table users add column if not exists last_login_at timestamptz;

create table if not exists user_identities (
  provider          text not null check (provider in ('kakao','naver','google')),
  provider_user_id  text not null,
  user_id           uuid not null references users(id) on delete cascade,
  email             text,
  created_at        timestamptz not null default now(),
  last_login_at     timestamptz not null default now(),
  primary key (provider, provider_user_id)
);
create index if not exists user_identities_user on user_identities(user_id);
alter table user_identities enable row level security;

-- PASS 본인인증(PortOne). CI 원문은 저장하지 않고 해시만 둬서 중복 가입만 막는다.
alter table users add column if not exists identity_verified_at timestamptz;
alter table users add column if not exists ci_hash text;
alter table users add column if not exists birth_date date;
alter table users add column if not exists verified_gender text check (verified_gender in ('M','F'));
create unique index if not exists users_ci_hash_key on users(ci_hash) where ci_hash is not null;
