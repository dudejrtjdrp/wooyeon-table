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
