import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/supabase";
import { demoLogin } from "./actions";
import { withRo } from "@/lib/format";

export const dynamic = "force-dynamic";

type DemoApp = { id: string; table_id: string | null; users: { login_id: string; name: string } };

/** 시연 참가자 가운데 지금 그 상태인 사람 한 명 (매칭 전이면 없음) */
async function pickDemo(status: "CONFIRMED" | "ALTERNATIVE_OFFERED"): Promise<DemoApp | null> {
  let q = db()
    .from("applications")
    .select("id,table_id,users!inner(login_id,name,is_demo)")
    .eq("users.is_demo", true)
    .eq("match_status", status)
    .neq("application_status", "CANCELED");
  q = status === "CONFIRMED" ? q.not("table_id", "is", null) : q.is("resolution", null);
  const { data } = await q.order("submitted_at", { ascending: false }).limit(1);
  return ((data ?? [])[0] as unknown as DemoApp | undefined) ?? null;
}

/** 결제까지 마치고 매칭을 기다리는 시연 참가자 한 명 */
async function pickWaiting(): Promise<DemoApp | null> {
  const { data } = await db()
    .from("applications")
    .select("id,table_id,users!inner(login_id,name,is_demo)")
    .eq("users.is_demo", true)
    .eq("match_status", "WAITING")
    .eq("payment_status", "PAID")
    .neq("application_status", "CANCELED")
    .order("submitted_at", { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as unknown as DemoApp | undefined) ?? null;
}

/** 한눈에 보는 흐름: 누가 하는지(참가자·자동)와 함께 */
const FLOW: { who: "참가자" | "자동"; title: string; body: string }[] = [
  { who: "참가자", title: "날짜·동네 고르고 결제", body: "여러 날짜, 여러 동네를 한 번에 골라요." },
  { who: "자동", title: "마감에 4~6명 테이블", body: "나이 차 8살 안, 성비·관심사·성향을 보고, 안 맞으면 다른 테이블로 옮겨요." },
  { who: "자동", title: "확정 · 식당 · 단체방", body: "운영자 승인 없이 확정되고, 식당 배정과 단체방 첫 공지까지 바로 나가요." },
  { who: "자동", title: "하루 전 알림 · 대화 주제", body: "리마인드가 가고, 모임 시작에 맞춰 대화 주제가 올라와요." },
  { who: "참가자", title: "체크인 · 후기", body: "만족도와 사람별 선호(다시 만나고 싶어요/다시는 싫어요)를 남겨요." },
  { who: "자동", title: "다음 매칭에 반영", body: "같이 앉았던 사람, 다시는 싫다는 사람은 다음엔 다른 테이블로." },
];

const chip = "inline-flex min-h-11 items-center rounded-xl px-3.5 text-[14px] font-semibold";

/** 시연 계정으로 바로 들어가 그 화면을 연다 */
function As({ login, to, children, admin }: { login?: string; to: string; children: ReactNode; admin?: boolean }) {
  if (!login) return null;
  return (
    <form action={demoLogin}>
      <input type="hidden" name="login_id" value={login} />
      <input type="hidden" name="to" value={to} />
      <button className={`${chip} ${admin ? "bg-ink text-white" : "bg-accent text-white"}`}>{children}</button>
    </form>
  );
}

function Step({ n, who, title, children, actions }: { n: number; who: string; title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <li className="flex gap-4 border-t border-line py-6 first:border-t-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[14px] font-extrabold text-accent-text">{n}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-muted">{who}</p>
        <h3 className="mt-0.5 text-[16px] font-bold leading-snug">{title}</h3>
        <div className="mt-2 space-y-1 text-[14px] leading-relaxed text-ink2">{children}</div>
        {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </li>
  );
}

export default async function Guide() {
  const [{ data: demo }, ok, fail, waiting] = await Promise.all([
    db().from("users").select("login_id,name,role").eq("is_demo", true).order("role").order("login_id").limit(12),
    pickDemo("CONFIRMED"),
    pickDemo("ALTERNATIVE_OFFERED"),
    pickWaiting(),
  ]);
  const admin = (demo ?? []).find((u) => u.role === "admin");
  const users = (demo ?? []).filter((u) => u.role === "user");
  const main = users.find((u) => !u.login_id.startsWith("test-")) ?? users[0];
  const A = admin?.login_id;
  const panel = <As admin login={A} to="/admin">운영자로 · 시연 패널 열기</As>;
  const afterDeadline = <p className="text-[13px] text-muted">이 버튼은 4단계까지 마친 뒤 이 페이지를 새로고침하면 생겨요.</p>;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-sm font-medium text-accent">심사위원 안내</p>
      <h1 className="mt-2 text-[22px] font-bold leading-snug sm:text-[26px]">처음 만나는 4~6명을 한 테이블에 앉히고<br className="hidden sm:block" /> 다음 모임까지 자동으로 이어요</h1>
      <p className="mt-3 leading-relaxed text-muted">
        참가자는 고르고 결제하고 와서 먹기만 해요. 그 사이는 시스템이 하고, 운영자는 <b className="text-ink">자동으로 끝내지 못한 예외만</b> 봐요.
      </p>

      <section className="mt-8" aria-labelledby="flow-title">
        <h2 id="flow-title" className="text-[17px] font-bold">한눈에 보는 흐름</h2>
        <ol className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {FLOW.map((f, i) => (
            <li key={f.title} className="relative rounded-[16px] bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">{i + 1}</span>
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${f.who === "자동" ? "bg-leaf-soft text-leaf" : "bg-accent-soft text-accent-text"}`}>{f.who}</span>
              </div>
              <p className="mt-2 text-[15px] font-bold">{f.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{f.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 rounded-[14px] bg-field px-4 py-3 text-[13px] leading-relaxed text-ink2">
          6에서 다시 1로 돌아가요. 만남과 후기가 쌓일수록 다음 테이블이 더 잘 맞아요. 운영자 화면에는 결제 오류·식당 부족·풀리지 않은 조건 충돌·신고 같은 <b>예외만</b> 올라와요.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="tour-title">
        <h2 id="tour-title" className="text-[17px] font-bold">3분 둘러보기</h2>
        <p className="mt-1 text-[14px] text-muted">버튼을 누르면 그 상태인 참가자로 바로 들어가요. 비밀번호는 필요 없어요. 참가자 화면은 휴대폰 크기(390px)로 보시면 좋아요.</p>
        <ol className="mt-4 space-y-2.5">
          {[
            { n: 1, who: "신청하고 기다리는 사람", see: "홈 첫 화면에 신청·결제·매칭 상태와 결과 발표 시각이 보여요.", btn: waiting && <As login={waiting.users.login_id} to="/">{withRo(waiting.users.name)} 들어가기</As> },
            { n: 2, who: "테이블이 확정된 사람", see: "같이 앉는 이유, 식당과 찾아가는 길, 단체방의 첫 공지·리마인드·대화 주제가 보여요.", btn: ok && <><As login={ok.users.login_id} to={`/tables/${ok.table_id}`}>{withRo(ok.users.name)} · 테이블</As><As login={ok.users.login_id} to={`/tables/${ok.table_id}/chat`}>단체방</As></> },
            { n: 3, who: "테이블에 못 든 사람", see: "이유와 함께 빈자리 합류·다른 일정·보관·환불을 한 화면에서 골라요. 옮기면 결제는 그대로예요.", btn: fail && <As login={fail.users.login_id} to={`/applications/${fail.id}/resolve`}>{withRo(fail.users.name)} 들어가기</As> },
            { n: 4, who: "운영자", see: "오늘 처리할 일과 예외만 보여요. 자동 매칭 모니터에서 테이블마다 묶인 이유와 재배치 기록을 볼 수 있어요.", btn: A && <><As admin login={A} to="/admin">운영자로 · 오늘 처리할 일</As><As admin login={A} to="/admin/matching">자동 매칭 모니터</As></> },
          ].map((x) => (
            <li key={x.n} className="rounded-[16px] border border-line bg-card p-4">
              <p className="text-[15px] font-bold"><span className="mr-1.5 text-accent">{x.n}</span>{x.who}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-ink2">{x.see}</p>
              <div className="mt-3 flex flex-wrap gap-2">{x.btn || <span className="text-[13px] text-muted">지금은 이 상태인 시연 참가자가 없어요. 아래 12단계를 따라 하면 생겨요.</span>}</div>
            </li>
          ))}
        </ol>
      </section>

      <h2 className="mt-12 text-[17px] font-bold">완료 조건 12단계 자세히</h2>
      <p className="mt-1 text-[14px] leading-relaxed text-muted">
        PRD 18장 해커톤 완료 조건을 번호 그대로 옮겼어요. 단계마다 <b className="text-ink">어느 계정으로 · 어느 화면에서 · 어느 버튼</b>을 누르는지 적었어요.
        마감 시각을 기다리지 않도록 운영자 어드민 홈 아래에 <b className="text-ink">심사용 시연 패널</b>(①~④)을 두었어요.
      </p>

      <section className="mt-8 rounded-[20px] bg-field p-5">
        <h2 className="text-[16px] font-semibold">시연 계정 바로 들어가기</h2>
        <p className="mt-1 text-[13px] text-muted">비밀번호 없이 들어가요. 계정을 바꿀 때도 이 페이지로 돌아와 누르면 돼요.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {admin && (
            <form action={demoLogin}>
              <input type="hidden" name="login_id" value={admin.login_id} />
              <button className="min-h-11 w-full rounded-xl bg-ink px-4 py-3 text-left text-white">
                <span className="block text-[15px] font-semibold">운영자 어드민</span>
                <span className="block text-[12px] opacity-80">아이디 {admin.login_id}</span>
              </button>
            </form>
          )}
          {users.map((u) => (
            <form key={u.login_id} action={demoLogin}>
              <input type="hidden" name="login_id" value={u.login_id} />
              <button className="min-h-11 w-full rounded-xl border border-line bg-card px-4 py-3 text-left">
                <span className="block text-[15px] font-semibold">참가자 {u.name}</span>
                <span className="block text-[12px] text-muted">{u.login_id}</span>
              </button>
            </form>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-muted">
          직접 로그인하려면 테스트 계정 비밀번호를 쓰세요. 참가자 <code>demo1234</code>, 운영자 <code>admin1234</code>
        </p>
      </section>

      <ol className="mt-8">
        <Step n={1} who="참가자 + 운영자" title="서로 다른 프로필의 참가자들이 날짜·지역을 고르고 신청한다"
          actions={<><As login={main?.login_id} to="/rounds">{withRo(`참가자 ${main?.name ?? ""}`)} · 일정 보기</As>{panel}</>}>
          <p>참가자로 들어가 일정 탭에서 날짜를 누르고 → 날짜·동네를 고른 뒤 → <b>모의 결제</b>까지 해요.</p>
          <p>여러 명이 필요하니 운영자 시연 패널 <b>① 테스트 참가자 만들기 → 만들기</b>를 눌러요. 나이·성별·성향이 제각각인 참가자가 결제까지 마친 상태로 들어가요.</p>
        </Step>

        <Step n={2} who="운영자" title="매칭 마감 시각에 결제 완료자만 대상으로 자동 매칭이 돈다"
          actions={<>{panel}<As admin login={A} to="/admin/matching">자동 매칭 모니터</As></>}>
          <p>시연 패널 <b>② 시각 옮기기 → 매칭 마감 직후</b>를 눌러요. 시각이 마감 뒤로 넘어가면서 자동 매칭이 바로 돌아요. 운영자가 누르는 &lsquo;매칭 실행&rsquo; 버튼은 따로 없어요.</p>
          <p>결제를 안 한 신청은 대상에서 빠져요(1단계에서 결제 전에 멈춘 신청으로 확인할 수 있어요).</p>
        </Step>

        <Step n={3} who="운영자" title="필수 조건과 우선순위에 따라 4~6인 테이블이 생긴다"
          actions={<As admin login={A} to="/admin/matching">자동 매칭 모니터</As>}>
          <p><b>자동 매칭 모니터</b>에서 테이블마다 인원(4~6명)과 묶인 이유(연령대·성비·관심사·성향)를 봐요.</p>
        </Step>

        <Step n={4} who="운영자" title="4명 미만·조건 미충족 조합을 풀고 다른 테이블로 자동 재배치한다"
          actions={<As admin login={A} to="/admin/matching">자동 매칭 모니터</As>}>
          <p>같은 화면의 <b>재배치</b> 표시와 <b>테이블에 못 든 사람</b> 목록을 봐요. ①에서 일부러 한 동네에 몰거나 나이 차를 크게 넣어 재배치·실패가 생겨요.</p>
        </Step>

        <Step n={5} who="운영자" title="검증을 통과한 테이블은 운영자 승인 없이 자동 확정된다"
          actions={<As admin login={A} to="/admin/tables">테이블·단체방</As>}>
          <p><b>테이블·단체방</b>에서 상태가 이미 확정이에요. 승인 버튼을 누를 필요가 없어요.</p>
        </Step>

        <Step n={6} who="운영자" title="지역·시간·인원에 맞는 식당이 배정되고 앱 단체방이 생긴다"
          actions={<As admin login={A} to="/admin/tables">테이블·단체방</As>}>
          <p>같은 화면에서 테이블마다 배정된 식당과 단체방이 붙어 있어요. 식당이 모자라면 그 건만 예외 처리함으로 가요(12단계).</p>
        </Step>

        <Step n={7} who="참가자 (확정된 사람)" title="참가자가 단체방에서 매칭 결과·식당·큐레이션·행사 안내를 본다"
          actions={ok ? <><As login={ok.users.login_id} to={`/tables/${ok.table_id}`}>확정된 참가자 {withRo(ok.users.name)} · 테이블</As><As login={ok.users.login_id} to={`/tables/${ok.table_id}/chat`}>단체방</As></> : afterDeadline}>
          <p>확정된 참가자로 들어가면 홈에 <b>테이블과 단체방 보기</b>가 떠요. 테이블 화면에서 함께 묶인 이유와 식당을, 단체방에서 안내 공지를 확인해요.</p>
        </Step>

        <Step n={8} who="참가자 (매칭 못 된 사람)" title="매칭 못 된 참가자에게 다른 일정을 추천하고, 이동·환불 선택이 자동 처리된다"
          actions={fail ? <><As login={fail.users.login_id} to={`/applications/${fail.id}/resolve`}>{withRo(`매칭 못 된 참가자 ${fail.users.name}`)} · 다음 방법 고르기</As><As admin login={A} to="/admin/payments">운영자로 · 결제·환불</As></> : afterDeadline}>
          <p>매칭 못 된 참가자로 들어가면 홈에 <b>다음 방법 고르기</b>가 떠요. 빈자리 합류 → 다른 일정(고른 동네부터 추천) → 기다리기 → 보관 → 환불 순서로 보여요. <b>다른 일정으로 옮기기</b>를 고르면 결제를 그대로 둔 채 새 일정의 매칭 대기로, <b>환불</b>을 고르면 바로 환불 처리로 넘어가요.</p>
          <p>운영자 <b>결제·환불</b> 화면에서 환불 기록이 운영자 손 없이 생긴 것을 확인해요.</p>
        </Step>

        <Step n={9} who="운영자 → 참가자" title="행사 전 리마인드와 행사 중 대화 콘텐츠가 자동으로 올라온다"
          actions={<>{panel}{ok && <As login={ok.users.login_id} to={`/tables/${ok.table_id}/chat`}>확정된 참가자로 · 단체방</As>}<As admin login={A} to="/admin/messages">운영자로 · 자동 메시지</As></>}>
          <p>시연 패널 <b>② 모임 하루 전</b>을 누르면 리마인드가, <b>② 모임 시작</b>을 누르면 대화 주제가 단체방에 자동으로 올라와요.</p>
          <p>확정된 참가자의 단체방과 알림, 운영자 <b>자동 메시지 → 발송 이력</b>에서 확인해요.</p>
        </Step>

        <Step n={10} who="참가자" title="행사 뒤 참가자가 체크인과 만족도·사람별 선호를 남긴다"
          actions={<>{ok && <As login={ok.users.login_id} to={`/tables/${ok.table_id}/feedback`}>확정된 참가자로 · 후기 남기기</As>}{panel}</>}>
          <p>시연 패널 <b>② 모임 끝난 뒤</b>를 누른 다음, 확정된 참가자로 <b>오늘 모임 후기 남기기</b>에서 체크인·만족도·사람별 선호(다시 만나고 싶어요/다시는 싫어요)를 남겨요.</p>
          <p>나머지 테스트 참가자는 시연 패널 <b>③ 체크인·후기 채우기 → 채우기</b>로 한 번에 채워요.</p>
        </Step>

        <Step n={11} who="운영자" title="다음 매칭에서 이전 만남과 피드백이 반영된 것을 확인한다"
          actions={<>{panel}<As admin login={A} to="/admin/matching">자동 매칭 모니터</As><As admin login={A} to="/admin/feedback">피드백·안전</As></>}>
          <p>시연 패널 <b>④ 다음 차수에 다시 신청시키기</b>를 누르고, 그 차수를 고른 상태에서 <b>② 매칭 마감 직후</b>를 눌러요.</p>
          <p>자동 매칭 모니터에서 지난번에 같이 앉았거나 &lsquo;다시는 싫어요&rsquo;를 남긴 사람끼리 다른 테이블로 나뉜 것(&lsquo;차단·비선호 충돌 없음&rsquo;)을 확인해요.</p>
        </Step>

        <Step n={12} who="운영자" title="정상 흐름은 운영자 손 없이 끝나고, 해결 안 된 예외만 운영자 화면에 남는다"
          actions={<><As admin login={A} to="/admin/exceptions">운영자로 · 예외 처리함</As><As admin login={A} to="/admin">오늘 처리할 일</As></>}>
          <p>1~11단계 동안 운영자가 누른 건 시연 패널(시각 옮기기·테스트 참가자)뿐이에요. <b>예외 처리함</b>에는 결제 오류·식당 부족·풀리지 않은 조건 충돌·신고처럼 자동으로 끝내지 못한 건만 올라와요.</p>
        </Step>
      </ol>

      <p className="mt-6 text-[13px] leading-relaxed text-muted">
        시연 패널의 &lsquo;이 회차 시연 데이터 초기화&rsquo;는 신청·테이블·후기를 지워요. 처음부터 다시 보고 싶을 때만 눌러 주세요.
      </p>

      <p className="mt-8 flex flex-wrap items-center gap-x-2 text-[14px]">
        <Link href="/" className="inline-flex h-11 items-center underline underline-offset-4">참가자 앱으로</Link>
        <span className="text-muted">·</span>
        <Link href="/admin" className="inline-flex h-11 items-center underline underline-offset-4">어드민으로</Link>
      </p>
    </main>
  );
}
