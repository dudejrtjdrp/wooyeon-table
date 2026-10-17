# 우연한 식탁

처음 만나는 4~6명을 한 테이블로 묶어 저녁을 먹게 해주는 소셜다이닝 서비스의 MVP. 신청부터 매칭, 식당·단체방 안내, 피드백까지 운영자 손 없이 돌아가는 것을 목표로 한다.

배포: https://wooyeon-table-ten.vercel.app

- 참가자 앱: [/](https://wooyeon-table-ten.vercel.app) (모바일 웹·PWA)
- 운영자 어드민: [/admin](https://wooyeon-table-ten.vercel.app/admin)
- 심사위원 안내: [/guide](https://wooyeon-table-ten.vercel.app/guide) — 시연 계정으로 바로 들어가기, 완료 조건 12단계
- 제출 체크리스트: [docs/submission.md](docs/submission.md)

## 스택

Next.js 15 (App Router) · Supabase (Postgres) · Vercel

## 문서

- [01. 상태 흐름](docs/01-state-flow.md)
- [02. 매칭 규칙](docs/02-matching-rules.md)
- [PRD 평가 기준 (파트별)](docs/prd/README.md) — 심사기준 7개 파트별 요구사항·합격 기준, 평가 에이전트는 `.claude/agents/`
- DB 스키마: `supabase/migrations/`

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # Supabase 값 채우기
npm run dev
```
