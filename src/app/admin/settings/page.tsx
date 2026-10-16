import { Lock } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_LEVEL_LABEL, type AdminLevel, adminLevels, requireAdmin, requireAdminWrite } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { Panel, btnLight, ctl, td, th } from "@/components/admin-ui";
import { DEFAULT_SETTINGS } from "@/lib/matching/types";
import { db } from "@/lib/supabase";
import { WeightsForm } from "./weights-form";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { age: "연령대", gender: "성비", mbti: "MBTI", interests: "관심사", wanted: "희망 성향", fresh: "새로운 사람" };

async function save(form: FormData) {
  "use server";
  const me = await requireAdminWrite("/admin/settings");
  const weights = Object.fromEntries(Object.keys(DEFAULT_SETTINGS.weights).map((k) => [k, Math.max(0, Number(form.get(k) ?? 0))]));
  const min = Math.min(100, Math.max(0, Number(form.get("min_score") ?? DEFAULT_SETTINGS.minScore)));
  await db().from("settings").upsert([{ key: "matching.weights", value: weights }, { key: "matching.min_score", value: min }]);
  await logStatus({ entityType: "setting", entityId: me.id, field: "matching.weights", to: JSON.stringify({ ...weights, min }), actor: `admin:${me.id}`, reason: "매칭 가중치·최소 점수 수정" });
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?m=${encodeURIComponent("저장했어요. 다음 자동 매칭부터 이 기준으로 점수를 매겨요")}`);
}

/** 운영자 권한 등급 바꾸기. 자기 자신은 못 바꾸고, 전체 권한 운영자가 한 명은 남아야 한다 */
async function setLevel(form: FormData) {
  "use server";
  const me = await requireAdminWrite("/admin/settings#roles");
  const uid = String(form.get("user_id"));
  const to: AdminLevel = form.get("level") === "viewer" ? "viewer" : "full";
  const back = (k: "m" | "e", msg: string) => redirect(`/admin/settings?${k}=${encodeURIComponent(msg)}#roles`);
  if (uid === me.id) back("e", "내 등급은 내가 바꿀 수 없어요. 다른 전체 권한 운영자에게 부탁해 주세요");
  const { data: admins } = await db().from("users").select("id,name").eq("role", "admin");
  const target = admins?.find((a) => a.id === uid);
  if (!target) back("e", "운영자 계정이 아니에요");
  const levels = await adminLevels();
  const from = levels[uid] === "viewer" ? "viewer" : "full";
  if (from === to) back("m", "바뀐 것이 없어요");
  const next = { ...levels, [uid]: to };
  if (!(admins ?? []).some((a) => next[a.id] !== "viewer")) back("e", "전체 권한 운영자가 한 명은 있어야 해요");
  await db().from("settings").upsert({ key: "admin.levels", value: next });
  await logStatus({ entityType: "user", entityId: uid, field: "admin_level", from, to, actor: `admin:${me.id}`, reason: `운영자 권한: ${ADMIN_LEVEL_LABEL[from]} → ${ADMIN_LEVEL_LABEL[to]}` });
  revalidatePath("/admin/settings");
  back("m", `${target!.name}님을 '${ADMIN_LEVEL_LABEL[to]}'으로 바꿨어요`);
}

export default async function Settings() {
  const me = await requireAdmin();
  const [{ data }, { data: admins }, levels] = await Promise.all([
    db().from("settings").select("key,value").in("key", ["matching.weights", "matching.min_score"]),
    db().from("users").select("id,name,login_id").eq("role", "admin").is("deleted_at", null).order("created_at"),
    adminLevels(),
  ]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const w = { ...DEFAULT_SETTINGS.weights, ...(map.get("matching.weights") ?? {}) } as Record<string, number>;
  const min = Number(map.get("matching.min_score") ?? DEFAULT_SETTINGS.minScore);

  return (
    <div>
      <h1 className="text-[32px] font-bold tracking-[-0.03em] text-ink">매칭 기준</h1>
      <p className="mt-1.5 text-[15px] text-muted">다음 매칭에 적용할 선호 점수를 조정해요.</p>
      <section className="mt-6 flex flex-wrap items-center gap-4 rounded-[20px] bg-accent-soft/60 px-6 py-5">
        <Lock size={30} className="text-accent" />
        <div className="flex-1">
          <p className="text-[19px] font-bold text-ink">바꿀 수 없는 필수 조건</p>
          <p className="mt-0.5 text-[14px] text-muted">모든 매칭에 공통으로 적용되는 기본 조건이에요. 자동 재배치에서도 완화하지 않아요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["같은 일정", "4~6명", "나이 차 8살 이내", "차단·신고·비선호 제외"].map((x) => (
            <span key={x} className="rounded-full bg-card px-4 py-2 text-[14px] font-semibold text-accent">{x}</span>
          ))}
        </div>
      </section>
      <div className="mt-4">
        <WeightsForm keys={Object.keys(DEFAULT_SETTINGS.weights)} labels={LABEL} initial={w} min={min} defaults={{ ...DEFAULT_SETTINGS.weights }} defaultMin={DEFAULT_SETTINGS.minScore} readOnly={me.level !== "full"} action={save} />
      </div>

      <div id="roles" className="scroll-mt-6">
        <Panel title="운영자 권한" className="mt-6">
          <p className="text-[14px] text-muted">
            &lsquo;조회 전용&rsquo;은 모든 화면을 볼 수 있지만 환불·참가 제한·긴급 수정·시연 데이터 초기화·설정 변경은 못 해요. 버튼이 숨고, 주소로 직접 보내도 서버에서 막아요. 새 운영자는 전체 권한으로 시작해요.
          </p>
          <table className="mt-4 w-full text-[14px]">
            <thead><tr>{["운영자", "아이디", "권한", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {(admins ?? []).map((a) => {
                const lv: AdminLevel = levels[a.id] === "viewer" ? "viewer" : "full";
                return (
                  <tr key={a.id}>
                    <td className={`${td} font-semibold text-ink`}>{a.name}{a.id === me.id && <span className="ml-1.5 text-[12px] font-normal text-muted">(나)</span>}</td>
                    <td className={`${td} text-muted`}>{a.login_id}</td>
                    <td className={td}>{ADMIN_LEVEL_LABEL[lv]}</td>
                    <td className={`${td} text-right`}>
                      {me.level === "full" && a.id !== me.id && (
                        <form action={setLevel} className="inline-flex items-center gap-2">
                          <input type="hidden" name="user_id" value={a.id} />
                          <select name="level" defaultValue={lv} className={`${ctl} h-9`} aria-label={`${a.name} 권한`}>
                            <option value="full">전체 권한</option>
                            <option value="viewer">조회 전용</option>
                          </select>
                          <button className={`${btnLight} h-9`}>바꾸기</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
