-- PRD 13장 엔티티 중 Attendance·MatchResolution을 이름 그대로 볼 수 있게 한다 (도메인 D2, 2026-10-16)
-- 상태값은 지금처럼 applications 한 줄에 컬럼을 나눠 둔다(신청·결제·매칭·참석 상태가 서로 다른 컬럼, docs/01-state-flow.md).
-- 참석과 매칭 실패 뒤 선택은 신청 한 건에 하나씩만 생기므로 테이블을 따로 만들지 않고 applications 위의 뷰로 둔다.
-- 따로 테이블을 두면 같은 값을 두 곳에 써야 하고, 한쪽만 바뀌는 충돌이 생긴다.
--
-- 운영 DB에 2026-10-17 적용했다. 앱 체크인(tables/[id]/actions.ts)과 시연용 자동 체크인(admin/demo-actions.ts)이 checked_in_at을 함께 채운다.
-- 0011 적용 뒤 운영자가 노쇼 후보를 '참석으로 정정'한 경우는 앱 체크인이 아니므로 checked_in_at이 비어 있다(감사 로그에 운영자 정정으로 남는다). 적용 전 기록은 아래 백필에서 모두 채웠다.

-- 1) 체크인 시각. 지금은 status_events(field=attendance_status, to=ATTENDED)의 created_at으로 알 수 있고, 앞으로는 이 컬럼에 바로 남긴다
alter table applications add column if not exists checked_in_at timestamptz;
comment on column applications.checked_in_at is '앱 체크인 시각(FDB-01). 비어 있으면 아직 체크인 안 함. 적용 전 기록은 status_events에서 채울 수 있다';

-- 적용 전에 이미 체크인한 신청은 감사 로그에서 시각을 옮겨 둔다 (여러 번 돌려도 같은 결과)
update applications a
set checked_in_at = e.first_at
from (
  select entity_id, min(created_at) as first_at
  from status_events
  where entity_type = 'application' and field = 'attendance_status' and to_value = 'ATTENDED'
  group by entity_id
) e
where a.id = e.entity_id and a.checked_in_at is null and a.attendance_status = 'ATTENDED';

-- 2) Attendance: 확정된 신청의 참석 기록 (PRD 12장 attendance_status, 13장 Attendance)
create or replace view attendances with (security_invoker = on) as
select
  a.id                as application_id,
  a.user_id,
  a.round_id,
  a.table_id,
  t.slot_id,
  s.starts_at,
  s.ends_at,
  a.attendance_status,
  a.checked_in_at,
  -- 끝났는데 체크인이 없으면 노쇼 '후보' (확정은 운영자, FDB-01)
  (a.attendance_status = 'SCHEDULED' and s.ends_at < now()) as no_show_candidate,
  exists (select 1 from feedbacks f where f.application_id = a.id) as feedback_submitted
from applications a
left join dining_tables t on t.id = a.table_id
left join slots s on s.id = t.slot_id
where a.attendance_status is not null;
comment on view attendances is 'PRD 13장 Attendance. applications의 참석 상태를 신청 한 건당 한 줄로 보여 준다(뷰, 원본은 applications)';

-- 3) MatchResolution: 매칭 실패 뒤 참가자가 고른 길 (PRD 7.4 5~6단계, 13장 MatchResolution)
create or replace view match_resolutions with (security_invoker = on) as
select
  a.id                as application_id,
  a.user_id,
  a.round_id,
  a.match_status,
  a.payment_status,
  a.resolution,                         -- transfer / keep_pass / refund / wait, 비어 있으면 아직 안 고름
  a.wait_until,
  a.match_reason      as failed_reason,
  (select min(e.created_at) from status_events e
    where e.entity_type = 'application' and e.entity_id = a.id
      and e.field = 'match_status' and e.to_value = 'ALTERNATIVE_OFFERED') as failed_at,
  (select n.id from applications n where n.transferred_from = a.id order by n.created_at limit 1) as transferred_to
from applications a
where a.match_status in ('ALTERNATIVE_OFFERED', 'TRANSFERRED') or a.resolution is not null;
comment on view match_resolutions is 'PRD 13장 MatchResolution. 매칭 실패 안내를 받은 신청과 그 뒤 선택(이동·보관·환불·기다리기)을 보여 준다(뷰, 원본은 applications)';
