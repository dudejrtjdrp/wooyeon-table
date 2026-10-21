import { Check, Monitor } from "lucide-react";
import { notFound } from "next/navigation";
import { InstallGuide } from "@/components/pwa";
import { HideInApp } from "@/components/push-ask";
import { PushToggle } from "@/components/push-toggle";
import { LinkButton, Screen } from "@/components/ui";
import { getMe } from "@/lib/auth";
import { isDemoHuman } from "@/lib/demo-panel";
import { db } from "@/lib/supabase";
import { TOUR_NAME, TOUR_ORDER, TOUR_TEXT, tourPhoneView, tourSig } from "@/lib/tour";
import { tourHuman, tourSnapshot } from "@/lib/tour-state";
import { TourFollow } from "./follow";

export const dynamic = "force-dynamic";
// 아이폰은 홈 화면에 추가할 때 이 제목을 앱 이름으로 채운다. 투어 화면에서 추가해도 앱 이름이 '우연한 식탁'이 되게 한다
export const metadata = { title: { absolute: "우연한 식탁" } };

/**
 * 휴대폰에서 PC 투어를 따라보는 화면. 시연 참가자 계정만 볼 수 있고 일반 회원에게는 없는 화면(404).
 * 로그인 전이면 투어에 쓰는 시연 참가자로 들어가는 버튼을 보여 준다(/guide와 같은 규칙)
 */
export default async function TourFollowPage() {
  const me = await getMe();
  if (!me) {
    const h = await tourHuman();
    if (!h) notFound();
    const login = `/api/demo-login?${new URLSearchParams({ login: h.login_id, to: "/tour" }).toString()}`;
    return (
      <Screen title={`${TOUR_NAME} 따라보기`}>
        <section className="mt-2 rounded-[24px] bg-field p-6">
          <p className="text-[20px] font-bold leading-snug tracking-[-0.02em]">PC 투어를 휴대폰으로<br />같이 따라가요</p>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">시연 참가자로 들어가면, PC에서 버튼을 누를 때마다 이 화면에 같은 단계와 결과가 떠요.</p>
          <a href={login} className="mt-5 flex h-[54px] w-full items-center justify-center rounded-[14px] bg-accent text-[16px] font-bold text-accent-ink">{h.name}님으로 들어가기</a>
          <p className="mt-3 text-[13px] leading-relaxed text-ink2">직접 로그인하려면 아이디 <code className="font-semibold text-ink">{h.login_id}</code> · 비밀번호 <code className="font-semibold text-ink">demo1234</code></p>
        </section>
        <HideInApp>
          <p className="mt-6 text-[15px] font-bold">홈 화면에 추가하면 알림도 받아요</p>
          <InstallGuide />
        </HideInApp>
      </Screen>
    );
  }
  const { data: u } = await db().from("users").select("login_id,is_demo").eq("id", me.id).maybeSingle();
  if (!isDemoHuman(u)) notFound();

  const [{ cur, next, step }, h] = await Promise.all([tourSnapshot(), tourHuman()]);
  const mineCur = cur?.apps.find((a) => a.user_id === me.id) ?? null;
  const mineNext = next?.apps.find((a) => a.user_id === me.id) ?? null;
  const view = tourPhoneView(step, mineCur, mineNext);
  const steps = TOUR_ORDER.filter((k) => k !== "done");
  const idx = TOUR_ORDER.indexOf(step);
  const doneN = Math.min(idx, steps.length);
  const lastDone = idx > 0 ? TOUR_ORDER[idx - 1] : null;
  const nowTitle = step === "done" ? null : TOUR_TEXT[step as Exclude<typeof step, "done">].title;
  const other = h && h.id !== me.id;

  return (
    <Screen title={`${TOUR_NAME} 따라보기`} back="/">
      <TourFollow sig={tourSig(step, mineCur, mineNext)} />
      <section className="mt-2 rounded-[24px] bg-card p-5" aria-live="polite">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-muted"><Monitor size={15} aria-hidden="true" />PC 투어 {doneN} / {steps.length}단계</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-field"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneN / steps.length) * 100}%` }} /></div>
        {nowTitle ? (
          <p className="mt-3 text-[15px] text-ink2">PC에서 다음에 누를 차례: <b className="text-ink">{nowTitle}</b></p>
        ) : (
          <p className="mt-3 text-[15px] font-semibold text-leaf">한 바퀴를 모두 봤어요</p>
        )}
        {lastDone && lastDone !== "done" && (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted"><Check size={14} className="text-leaf" aria-hidden="true" />방금 끝난 단계: {TOUR_TEXT[lastDone].title}</p>
        )}
      </section>

      {view ? (
        <section className="mt-3 rounded-[24px] bg-accent-soft p-5">
          <p className="text-[17px] font-bold leading-snug text-ink">{view.line}</p>
          <LinkButton href={view.href} className="mt-4">{view.label}</LinkButton>
        </section>
      ) : (
        <section className="mt-3 rounded-[24px] bg-field p-5">
          <p className="text-[15px] leading-relaxed text-ink2">PC에서 &lsquo;시연 회차 만들기&rsquo;를 누르면 여기에 첫 결과가 떠요. 이 화면은 켜 두기만 하면 알아서 바뀌어요.</p>
        </section>
      )}

      {other && (
        <p className="mt-3 rounded-[16px] bg-field px-4 py-3 text-[13px] leading-relaxed text-ink2">
          투어 회차에는 {h!.name}님 계정({h!.login_id})이 자동으로 신청돼요. 결과와 알림을 이 휴대폰으로 받으려면 그 계정으로 로그인해 주세요.
        </p>
      )}

      <div className="mt-6">
        <p className="text-[15px] font-bold">알림 받기</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">매칭 결과·하루 전 안내·단체방 새 글이 이 휴대폰 알림으로 와요. 아이폰은 홈 화면에 추가한 앱에서 켜 주세요.</p>
        <div className="mt-3"><PushToggle variant="card" /></div>
      </div>
      {/* 이미 앱으로 열었으면 설치 안내는 보이지 않는다 */}
      <HideInApp>
        <div className="mt-6">
          <p className="text-[15px] font-bold">홈 화면에 추가하기</p>
          <InstallGuide />
        </div>
      </HideInApp>
    </Screen>
  );
}
