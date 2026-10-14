-- 새 일정 소식 수신 동의, 회원 탈퇴 (PRD 16장: 개인정보 삭제 요청과 탈퇴 후 보관 정책)
alter table profiles add column if not exists marketing_opt_in boolean not null default false;
alter table users add column if not exists deleted_at timestamptz;
-- 시연 계정은 다음 일정 추천 알림을 받아 볼 수 있게 동의로 둔다
update profiles set marketing_opt_in = true where user_id in (select id from users where is_demo);
