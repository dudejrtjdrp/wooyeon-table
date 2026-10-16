# 01. 상태 흐름

신청 한 건이 처음부터 끝까지 어떤 상태를 거치는지 정리한 문서다. 매칭 엔진, 안내 자동화, 피드백, 어드민 화면이 전부 이 상태를 보고 움직인다.

근거: PRD 12장(상태값 정의), 7장(매칭 로직), 15장(예외 처리), CTO 온보딩 10쪽.

## 원칙

1. **상태는 네 갈래로 나눠 저장한다.** 신청·결제·매칭·참석을 한 값으로 합치면 "환불 중인데 다른 일정으로 이동한 사람" 같은 경우를 표현할 수 없다.
2. **상태를 바꾸는 주체는 셋뿐이다.** 참가자(user), 시스템(system), 운영자(admin). 정상 흐름은 참가자와 시스템만으로 끝난다.
3. **모든 변경은 기록한다.** 언제, 누가, 왜, 이전 값이 무엇이었는지 `status_events`에 남긴다.
4. **같은 작업을 두 번 돌려도 결과는 한 번만 생긴다.** 매칭·환불·단체방·알림은 모두 멱등 키를 쓴다.

## 단위 정리

| 단위 | 설명 |
|---|---|
| 모집 차수 `round` | 한 번의 매칭 마감을 공유하는 일정 묶음. 예: "10월 넷째 주 모집" |
| 일정 `slot` | 차수 안의 날짜·시간·지역 한 칸. 예: 10/24(금) 19:30 성수 |
| 신청 `application` | 참가자 한 명이 한 차수에 낸 신청. 가능한 일정 여러 개를 고를 수 있다 |
| 테이블 `table` | 한 일정에 묶인 4~6명 |

참가자가 날짜·지역을 여러 개 고를 수 있어서, 매칭 마감은 일정마다가 아니라 차수마다 하나로 둔다. 그래야 "금요일 성수가 안 되면 토요일 강남으로" 같은 재배치를 한 번의 매칭 안에서 처리할 수 있다.

## 1. 신청 상태 `application_status`

| 값 | 뜻 | 들어오는 조건 |
|---|---|---|
| `DRAFT` | 작성 중 | 신청서를 열었을 때 |
| `SUBMITTED` | 신청 완료 | 필수 항목을 다 채우고 동의 후 제출 |
| `CANCELED` | 신청 취소 | 참가자가 취소 (매칭 전에만) |

```
DRAFT ──제출──▶ SUBMITTED ──참가자 취소──▶ CANCELED
```

- 결제 전 취소는 그냥 `CANCELED`.
- 결제 후 매칭 전 취소는 `CANCELED` + 결제 쪽 환불 흐름으로 넘긴다. (모임 주 화요일 24:00부터 환불 불가, 매칭 마감과 같은 시각)
- 매칭 확정 후 취소는 신청 상태는 그대로 두고 **참석 상태**로 처리한다.

## 2. 결제 상태 `payment_status`

| 값 | 뜻 |
|---|---|
| `PENDING` | 결제 대기 |
| `PAID` | 결제 완료 |
| `FAILED` | 결제 실패 |
| `REFUND_AVAILABLE` | 매칭이 안 돼서 환불을 고를 수 있음 |
| `REFUND_REQUESTED` | 참가자가 환불을 고름 |
| `REFUND_PROCESSING` | 자동 환불 처리 중 |
| `REFUNDED` | 환불 완료 |
| `REFUND_FAILED` | 자동 환불 실패. 10분 간격으로 세 번까지 자동으로 다시 시도하고, 세 번째도 실패하면 운영자 확인 |

```
PENDING ──결제──▶ PAID
   │                │
   └─실패─▶ FAILED   ├─매칭 실패─▶ REFUND_AVAILABLE ─환불 선택─▶ REFUND_REQUESTED
     (재시도 가능)    │                    │                          │
                    │            일정 이동·보관 선택                 ▼
                    │            (PAID 유지)                REFUND_PROCESSING
                    │                                        │        │
                    └─매칭 전 취소(화요일 24:00 전)─▶ REFUND_REQUESTED   ▼        ▼
                                                    REFUNDED  REFUND_FAILED ─10분 뒤 재시도(3번까지)─▶ 3번째 실패만 예외 큐
```

- 해커톤에서는 모의 결제다. "결제하기"를 누르면 `PAID`, 테스트용으로 실패를 일으키는 버튼을 어드민 시연 패널에 둔다.
- 일정 이동이나 이용권 보관을 고르면 결제는 `PAID`로 유지한다. 같은 결제가 두 번 승인되지 않게 결제 건은 신청에 묶지 않고 **이용권**에 묶는다.

## 3. 매칭 상태 `match_status`

| 값 | 뜻 |
|---|---|
| `WAITING` | 매칭 대기 (결제 완료, 마감 전) |
| `MATCHING` | 자동 매칭 실행 중 |
| `REALLOCATING` | 4명 미만이거나 조건이 안 맞아 재배치 중 |
| `CONFIRMED` | 조건 검증 통과, 자동 확정 |
| `ALTERNATIVE_OFFERED` | 매칭 실패, 일정 이동·보관·환불 선택 대기 |
| `TRANSFERRED` | 참가자가 고른 다른 차수로 이동 완료 |
| `NO_MATCH` | 대체 일정도 없어서 매칭 종료 |
| `EXCEPTION` | 자동 처리 실패, 운영자 확인 필요 |

```
                 결제 완료
                    │
                    ▼
                WAITING
                    │ 마감 시각 (스케줄러)
                    ▼
                MATCHING ─────────────────┐
                 │      │                 │ 데이터 누락·조건 충돌
          조건 충족   4명 미만·조건 미충족      ▼
                 │      ▼              EXCEPTION
                 │  REALLOCATING           (운영자)
                 │   │        │
                 │ 재배치 성공  재배치 실패
                 ▼   ▼        ▼
               CONFIRMED   ALTERNATIVE_OFFERED
                             │       │       │
                       일정 이동  이용권 보관   환불
                             ▼       ▼       ▼
                     TRANSFERRED  NO_MATCH  NO_MATCH
                    (새 신청 WAITING)  (이용권 유지) (결제는 환불 흐름)
```

- `MATCHING`과 `REALLOCATING`은 매칭 실행 중에만 잠깐 거치는 상태다. 참가자 화면에는 "어울리는 테이블을 찾고 있어요"로 묶어 보여준다.
- 일정 이동을 고르면 기존 신청은 `TRANSFERRED`로 닫고, 새 차수에 같은 이용권으로 새 신청을 `WAITING`으로 만든다. 이력이 두 줄로 남아서 추적이 쉽다.
- 대체 일정이 아예 없으면 `ALTERNATIVE_OFFERED`에서 "이용권 보관"과 "환불"만 보여준다.
- 참가자가 고르기 전까지 시스템이 대신 정하지 않는다. (PRD 7.3)

## 4. 참석 상태 `attendance_status`

매칭이 `CONFIRMED`가 된 신청에만 생긴다.

| 값 | 뜻 | 들어오는 조건 |
|---|---|---|
| `SCHEDULED` | 참석 예정 | 확정 시 자동 |
| `ATTENDED` | 참석 완료 | 앱에서 체크인 |
| `CANCELED_EARLY` | 사전 취소 | 모임 주 화요일 24:00 전 취소 |
| `CANCELED_LATE` | 늦은 취소 | 그 뒤 취소(환불 없음) |
| `NO_SHOW` | 노쇼 | 종료 시각까지 체크인 없음 → 노쇼 후보로 올리고 운영자가 확정 |

```
SCHEDULED ──체크인──▶ ATTENDED ──▶ 피드백 요청
    │
    ├─화요일 24:00 전 취소─▶ CANCELED_EARLY ─▶ 테이블 인원 재확인 (대기자 충원 or 재배치)
    ├─화요일 24:00 뒤 취소─▶ CANCELED_LATE  ─▶ 환불 없음, 이용 제한 검토 대상
    └─종료까지 체크인 없음─▶ 노쇼 후보 ─운영자 확인─▶ NO_SHOW
```

- 당일 취소와 단체방 퇴장은 막는다. (PRD 환불 규정)
- 확정 후 취소로 테이블이 4명 미만이 되면 테이블 쪽 처리로 넘긴다. (아래 5번)

## 5. 테이블 상태 `table_status`

PRD에는 따로 없지만 매칭 엔진과 안내 자동화에 필요해서 둔다.

| 값 | 뜻 |
|---|---|
| `DRAFT` | 매칭 중 임시 조합 |
| `CONFIRMED` | 자동 확정 |
| `VENUE_ASSIGNED` | 식당 배정 완료 |
| `READY` | 단체방 개설과 첫 공지 완료 |
| `IN_PROGRESS` | 모임 진행 중 (시작 시각 도달) |
| `DONE` | 모임 종료 |
| `DISSOLVED` | 해체 (재배치로 흩어짐) |

```
DRAFT ─검증 통과─▶ CONFIRMED ─식당 배정─▶ VENUE_ASSIGNED ─단체방·공지─▶ READY
  │                   │ 식당 없음                                   │ 시작 시각
  │                   ▼                                           ▼
  │      같은 지역 다른 식당 → 모두 안 되면 예외 큐          IN_PROGRESS ─종료─▶ DONE
  └─4명 미만─▶ DISSOLVED
```

## 6. 해커톤 완료 시나리오와 상태

PRD 18장 12단계를 상태 변화로 옮기면 이렇다. 데모와 테스트는 이 표를 기준으로 확인한다.

| 단계 | 상태 변화 |
|---|---|
| 1. 신청 | `application: DRAFT → SUBMITTED`, `payment: PENDING → PAID`, `match: WAITING` |
| 2. 마감 시각 매칭 실행 | `match: WAITING → MATCHING` |
| 3. 4~6인 테이블 생성 | `table: DRAFT` |
| 4. 재배치 | `match: MATCHING → REALLOCATING`, `table: DRAFT → DISSOLVED` |
| 5. 자동 확정 | `match → CONFIRMED`, `table → CONFIRMED`, `attendance: SCHEDULED` |
| 6. 식당·단체방 | `table → VENUE_ASSIGNED → READY` |
| 7. 단체방 확인 | 참가자 화면 |
| 8. 실패자 처리 | `match → ALTERNATIVE_OFFERED → TRANSFERRED` 또는 `payment → REFUND_REQUESTED → REFUNDED` |
| 9. 리마인드·콘텐츠 | 알림 발송 기록, `table → IN_PROGRESS` |
| 10. 체크인·피드백 | `attendance → ATTENDED`, 피드백 저장 |
| 11. 다음 매칭 반영 | 이전 만남·비선호 관계가 다음 차수 매칭에 반영 |
| 12. 예외만 운영자에게 | `EXCEPTION`, `REFUND_FAILED`, 식당 부족, 노쇼 후보만 예외 큐에 표시 |

## 7. 상태 변경 기록 `status_events`

모든 상태 변경은 아래 형태로 한 줄씩 남긴다.

| 필드 | 예시 |
|---|---|
| 대상 | `application:123`, `table:45` |
| 갈래 | `match_status` |
| 이전 값 → 새 값 | `REALLOCATING → CONFIRMED` |
| 주체 | `system`, `user:12`, `admin:1` |
| 이유 | `재배치 2회차, 같은 날짜 다른 지역 테이블로 이동` |
| 관련 실행 | `match_run:7` |
| 시각 | `2026-10-24T18:00:00+09:00` |

참가자 화면의 "왜 이렇게 됐는지" 설명과 어드민의 매칭 모니터가 이 기록을 그대로 읽어서 보여준다.

## 8. Attendance·MatchResolution을 별도 테이블로 두지 않은 이유

PRD 13장은 `Attendance`와 `MatchResolution`을 엔티티로 적었다. 우리는 이 둘을 `applications`의 컬럼으로 두었다. 상태를 합친 게 아니라, 갈래별 컬럼은 그대로 나누고 담는 행만 신청 한 줄로 모았다.

| PRD 엔티티 | 우리 저장 위치 | 핵심 필드 |
|---|---|---|
| Attendance | `applications.attendance_status` | `SCHEDULED / ATTENDED / CANCELED_EARLY / CANCELED_LATE / NO_SHOW` (PRD 12장 값 그대로) |
| MatchResolution | `applications.resolution`, `wait_until`, `match_reason`, `realloc_count`, `transferred_from` | 고른 방법(이동·보관·환불·기다리기), 기다리기 마감, 사유, 자동 재배치 횟수, 옮겨 온 원래 신청 |

**이렇게 둔 이유**

1. **한 신청에 한 번씩만 생긴다.** 참석은 확정된 신청 한 건당 하나, 매칭 실패 뒤 고르는 방법도 실패한 신청 한 건당 하나다. 1:1 관계를 따로 떼면 조인만 늘고, 행이 없을 때(아직 확정 전, 아직 안 고름)를 따로 처리해야 한다.
2. **같은 행을 조건부로 바꿔야 중복이 안 생긴다.** 참석 취소는 `attendance_status = 'SCHEDULED'`일 때만, 빈자리 합류·보관은 `match_status = 'ALTERNATIVE_OFFERED'`일 때만 바꾼다. 매칭 상태·결제 상태·참석 상태·선택이 한 행에 있으니 `update ... where` 한 번으로 "두 번 눌러도 한 번만"이 지켜진다(멱등성). 테이블이 둘이면 트랜잭션이나 잠금이 따로 필요하다.
3. **화면과 엔진이 같은 한 줄을 읽는다.** 참가자 상태 문구(`lib/status.ts`), 어드민 목록, 매칭 러너, tick이 모두 신청 한 줄만 보고 판단한다.
4. **이력은 `status_events`에 따로 남는다.** 컬럼에는 지금 값만 있고, 언제·누가·왜·이전 값은 상태 기록에 한 줄씩 남긴다. 여러 번 바뀐 이력이 필요한 곳(예: 재배치를 두 번 거절)도 여기서 본다. 일정 이동은 기존 신청을 `TRANSFERRED`로 닫고 새 신청을 만들어(`transferred_from`) 두 줄로 남긴다.

**별도 테이블로 뺄 때:** 한 신청에 참석 기록이 여러 번 생기거나(여러 회차를 묶은 상품), 매칭 실패 뒤 여러 단계 협상(제안 → 역제안)이 필요해지면 그때 `attendances`·`match_resolutions`로 나눈다. 빈자리 제안처럼 이미 여러 건이 생기는 것은 처음부터 `seat_offers` 테이블로 따로 두었다.

### 이름을 PRD와 맞춘 뷰 (마이그레이션 0011, 아직 적용 전)

저장은 위처럼 신청 한 줄에 두고, PRD 13장 이름으로 바로 조회할 수 있게 `applications` 위에 읽기 전용 뷰를 둔다. 뷰는 원본을 그대로 비추기만 해서 값이 두 곳에 갈라질 일이 없다.

| 뷰 | 한 줄 | 주요 컬럼 |
|---|---|---|
| `attendances` | 참석 상태가 있는(확정된 적 있는) 신청 한 건 | `application_id`, `user_id`, `table_id`, `slot_id`, `starts_at`·`ends_at`, `attendance_status`, `checked_in_at`, `no_show_candidate`(끝났는데 체크인 없음, 확정은 운영자), `feedback_submitted` |
| `match_resolutions` | 매칭 실패 안내를 받은 신청 한 건 | `application_id`, `match_status`, `payment_status`, `resolution`(이동·보관·환불·기다리기, 비면 아직 안 고름), `wait_until`, `failed_reason`, `failed_at`(status_events에서 처음 실패한 시각), `transferred_to`(옮겨 간 새 신청) |

함께 `applications.checked_in_at`(체크인 시각, 비어도 됨)을 더한다. 지금은 체크인 시각을 `status_events`(attendance_status → ATTENDED)에서 읽고, 0011을 적용할 때 이미 체크인한 신청은 그 기록에서 시각을 옮겨 채운다. 적용 전이라 지금 코드는 이 컬럼과 뷰를 쓰지 않는다. 적용한 뒤 체크인 액션이 `checked_in_at`을 같이 채우도록 바꾼다.

