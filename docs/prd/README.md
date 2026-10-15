# PRD 평가 기준 (파트별)

출처: `우연한식탁_PRD.pdf`(v0.2), `우연한식탁_CTO_온보딩_오리엔테이션`, `해커톤 킥오프 슬라이드`의 심사기준.
PRD를 **심사기준 7개 항목**에 맞춰 나눴다. 파트마다 PRD 원문 요구사항, PRD가 "원하는 것"(의도), 검사 가능한 합격 기준, 검사 방법을 적었다.

| 파트 | 심사 항목 | 배점 | 문서 | 평가 에이전트 |
|---|---|---|---|---|
| 1 | 자동 매칭 | 25 | [01-auto-matching.md](01-auto-matching.md) | `prd-matching` |
| 2 | 모임 안내 | 20 | [02-gathering-guide.md](02-gathering-guide.md) | `prd-guide` |
| 3 | 피드백 반영 | 15 | [03-feedback-loop.md](03-feedback-loop.md) | `prd-feedback` |
| 4 | 운영자 어드민 | 10 | [04-admin.md](04-admin.md) | `prd-admin` |
| 5 | 참가자 경험 | 10 | [05-participant-ux.md](05-participant-ux.md) | `prd-ux` |
| 6 | 도메인 이해 | 10 | [06-domain.md](06-domain.md) | `prd-domain` |
| 7 | 프로젝트 기록 | 10 | [07-project-record.md](07-project-record.md) | `prd-record` |

공통 규칙과 채점 방식: [00-common.md](00-common.md)

## 작업할 때마다

1. 작업이 어느 파트에 닿는지 위 표에서 고른다(여러 개 가능).
2. 해당 평가 에이전트(`.claude/agents/prd-*.md`)를 돌린다. 화면을 바꿨다면 `prd-ux`는 항상 포함.
3. 점수표의 **실패·부분** 항목을 고친 뒤 다시 돌린다. 점수가 떨어진 파트가 있으면 커밋하지 않는다.
4. 결과 요약을 커밋 본문이나 Blaybus 태스크 기록에 남긴다.

PRD에 없는 것(브랜드 톤, 특정 가격·요일 등)은 PRD 요구가 아니다. 평가자는 그런 결정을 "PRD 근거 없음"으로 표시하고, 점수에 넣지 않는다.
