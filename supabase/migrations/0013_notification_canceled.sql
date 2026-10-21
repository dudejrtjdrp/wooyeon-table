-- 예약 알림 취소를 지우지 않고 남긴다 (운영자 취소·상황 변경 자동 정리). 2026-10-21
-- 적용 전에는 코드가 'canceled' 대신 행을 지우고 status_events에만 남긴다(lib/scheduled.ts cancelScheduled).
alter table notifications drop constraint if exists notifications_status_check;
alter table notifications add constraint notifications_status_check check (status in ('pending','sent','failed','canceled'));
