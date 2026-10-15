-- 매칭 실패 뒤 '자리 나면 알려 주기' (2026-10-16)
-- resolution에 'wait'를 더하고, 언제까지 기다리는지 wait_until에 남긴다.
-- 마감(고른 모임 중 가장 늦은 것의 2일 전)이 지나면 tick이 이용권으로 보관한다.

alter table applications drop constraint if exists applications_resolution_check;
alter table applications add constraint applications_resolution_check
  check (resolution in ('transfer','keep_pass','refund','wait'));
alter table applications add column if not exists wait_until timestamptz;

comment on column applications.wait_until is '자리 나면 알려 주기 마감. 지나면 이용권 보관(resolution=wait일 때만 씀)';
