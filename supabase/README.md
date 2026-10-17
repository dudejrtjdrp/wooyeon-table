# DB 마이그레이션

Supabase는 Vercel Storage 연동으로 만들었다(서울 리전, 무료 플랜). 접속 정보는 Vercel 환경 변수에 자동으로 들어간다.

## 적용 방법

Vercel 대시보드 → Storage → wooyeon-table → Query에서 실행한다. 이 화면은 한 번에 한 문장만 받기 때문에 파일 전체를 아래처럼 감싸서 넣는다.

```sql
do $mig$ begin execute $q$
-- 여기에 migrations/000N_*.sql 내용
$q$; end $mig$;
```

| 파일 | 적용일 |
|---|---|
| 0001_init.sql | 2026-10-14 |
| 0002_seed.sql | 2026-10-15 |
| 0003_social_login.sql | 2026-10-15 |
| 0004_phone_verification.sql | 2026-10-15 |
| 0005_push.sql | 2026-10-15 |
| 0006_withdraw_consent.sql | 2026-10-15 |
| 0007_waitlist_ops_content_toss.sql | 2026-10-15 |
| 0008_area_bundles.sql | 2026-10-16 |
| 0009_wait_choice.sql | 2026-10-16 |
| 0010_qna_policies.sql | 2026-10-16 |
| 0011_domain_views.sql | 2026-10-17 |

2026-10-17 0011과 함께 시연 데이터를 정리했다: 단체방에 남은 옛 환불 문구(모임 2일 전) 12건을 화요일 자정 마감 문구로, 시연·테스트 계정의 1회권 결제 29,000원 72건을 9,900원으로 고쳤다.
