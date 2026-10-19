import { redirect } from "next/navigation";
import { RoundTable } from "@/components/brand";
import { PrimaryButton } from "@/components/client";
import { ErrorText, Screen, Toast, inputCls } from "@/components/ui";
import { getMe } from "@/lib/auth";
import { OPEN_REGIONS } from "@/lib/constants";
import { SIDOS } from "@/lib/regions";
import { db } from "@/lib/supabase";
import { removeWish, saveWish } from "./actions";

export const dynamic = "force-dynamic";

/** 지역 수요 조사: 지금은 서울 4곳만 열고, 나머지는 열리면 알려 달라고 남긴다 */
export default async function Wish({ searchParams }: { searchParams: Promise<{ sido?: string; area?: string; e?: string; m?: string; from?: string }> }) {
  const me = await getMe();
  const sp = await searchParams;
  if (!me) redirect(`/login?next=${encodeURIComponent(`/wish${sp.area ? `?area=${encodeURIComponent(sp.area)}` : ""}`)}`);
  const fromArea = sp.area ? SIDOS.find((s) => s.areas.includes(sp.area!)) : undefined;
  const sido = sp.sido ?? fromArea?.name ?? "서울";
  const cur = SIDOS.find((s) => s.name === sido);
  const { data: mine } = await db().from("region_demands").select("id,sido,area,notified_at,created_at").eq("user_id", me!.id).order("created_at", { ascending: false });
  const choices = (cur?.areas ?? []).filter((a) => !OPEN_REGIONS.includes(a));

  return (
    <Screen title="원하는 동네 남기기" back={sp.from === "home" ? "/" : "/rounds"}>
      <Toast msg={sp.m} />
      <div className="flex items-start gap-4 pt-4">
        <div className="flex-1">
          <h1 className="text-[26px] font-extrabold leading-[1.38]">여기서도 열어 주세요</h1>
          <p className="mt-2.5 text-[14px] leading-relaxed text-muted">
            지금은 서울 {OPEN_REGIONS.map((a) => a.split("·")[0]).join("·")}에서 먼저 모여요. 원하는 동네를 남겨 주시면 사람이 모이는 곳부터 열고, 열리면 바로 알려 드릴게요.
          </p>
        </div>
        <RoundTable size={72} filled={2} label="자리가 비어 있는 테이블" />
      </div>

      <form method="get" className="mt-6">
        {sp.from === "home" && <input type="hidden" name="from" value="home" />}
        <p className="text-[14px] font-extrabold text-ink2">시·도</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...SIDOS.map((s) => s.name), "그 밖"].map((n) => (
            <button key={n} name="sido" value={n} className={`h-11 rounded-[22px] px-4 text-[14px] ${n === sido ? "bg-accent font-extrabold text-white" : "bg-row font-semibold text-ink2"}`}>{n}</button>
          ))}
        </div>
      </form>

      <form action={saveWish} className="mt-6 space-y-5">
        <input type="hidden" name="sido" value={sido} />
        {sp.from === "home" && <input type="hidden" name="from" value="home" />}
        {choices.length > 0 && (
          <fieldset>
            <legend className="text-[14px] font-extrabold text-ink2">동네</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {choices.map((a) => (
                <label key={a} className="cursor-pointer">
                  <input type="radio" name="area" value={a} defaultChecked={a === sp.area} className="peer sr-only" />
                  <span className="flex h-11 items-center rounded-[22px] bg-row px-4 text-[14px] font-semibold text-ink2 peer-checked:bg-accent peer-checked:font-extrabold peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{a}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="block">
          <span className="text-[14px] font-extrabold text-ink2">{choices.length ? "목록에 없으면 직접 적기" : "원하는 동네"}</span>
          <input name="typed" maxLength={40} placeholder="예: 망원동, 서울숲 근처" className={`${inputCls} mt-2`} />
        </label>
        <label className="block">
          <span className="text-[14px] font-extrabold text-ink2">하고 싶은 말 <span className="font-medium text-muted">(선택)</span></span>
          <textarea name="note" maxLength={200} rows={3} placeholder="평일 저녁이면 좋겠어요" className="mt-2 w-full resize-none rounded-[14px] border border-line bg-field px-4 py-3 text-[16px] outline-none focus:border-accent focus:bg-card" />
        </label>
        <ErrorText msg={sp.e} />
        <PrimaryButton pendingText="남기는 중">열리면 알려 주세요</PrimaryButton>
      </form>

      {(mine?.length ?? 0) > 0 && (
        <section className="mt-10" aria-label="남긴 동네">
          <p className="text-[14px] font-extrabold text-ink2">남긴 동네</p>
          <ul className="mt-2 divide-y divide-line2">
            {mine!.map((w) => (
              <li key={w.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <span className="text-[15px] font-bold">{w.sido} · {w.area}</span>
                {w.notified_at ? (
                  <span className="text-[13px] font-bold text-accent">열렸어요</span>
                ) : (
                  <form action={removeWish}><input type="hidden" name="id" value={w.id} />{sp.from === "home" && <input type="hidden" name="from" value="home" />}<button className="h-11 px-2 text-[13px] text-muted underline underline-offset-4">지우기</button></form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="h-10" />
    </Screen>
  );
}
