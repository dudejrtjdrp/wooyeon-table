-- 휴대폰 문자 인증. PASS 본인인증(사업자 등록 필요)이 열리기 전까지 이 방식으로 번호를 확인한다.
alter table users add column if not exists phone_verified_at timestamptz;

create table if not exists phone_verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  phone       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  verified_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists phone_verifications_user on phone_verifications(user_id, created_at desc);
create index if not exists phone_verifications_phone on phone_verifications(phone, created_at desc);
alter table phone_verifications enable row level security;

-- 시연·테스트 계정은 번호가 가상이라 인증된 것으로 둔다
update users set phone_verified_at = now() where phone_verified_at is null and phone is not null and (is_demo or login_id like 'test-%');
