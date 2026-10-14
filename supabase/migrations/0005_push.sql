-- 휴대폰 푸시 알림 (웹 푸시). 한 사람이 여러 기기를 등록할 수 있다.
create table if not exists push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);
create index if not exists push_subscriptions_user on push_subscriptions(user_id);
alter table push_subscriptions enable row level security;
