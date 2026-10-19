import { TableScroll } from "@/components/table-scroll";
import { Lock } from "lucide-react";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, PageHeader, Panel, Term, btnDanger, btnLight, ctl, td, th } from "@/components/admin-ui";
import { TIP } from "@/lib/admin-glossary";
import { isAdminOff } from "@/lib/admin-accounts";
import { weightsValue } from "@/lib/audit";
import { currentWeightsValue } from "@/lib/audit-query";
import { ADMIN_LEVEL_LABEL, type AdminLevel, adminLevels, requireAdmin, requireAdminWrite } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { DEFAULT_SETTINGS } from "@/lib/matching/types";
import { db } from "@/lib/supabase";
import { ConfirmButton } from "../confirm-button";
import { setAdminActive, setLevel } from "./account-actions";
import { CreateAdminForm, ResetPasswordForm } from "./accounts";
import { fmtSlot } from "@/lib/format";
import { pastTableOf } from "@/lib/weights-preview";
import { parsePresets, weightSum } from "@/lib/weights-presets";
import { type PastRound, WeightsForm } from "./weights-form";

export const dynamic = "force-dynamic";

async function save(form: FormData) {
  "use server";
  const me = await requireAdminWrite("/admin/settings");
  const weights = Object.fromEntries(Object.keys(DEFAULT_SETTINGS.weights).map((k) => [k, Math.max(0, Math.min(100, Math.round(Number(form.get(k) ?? 0) || 0)))]));
  const min = Math.min(100, Math.max(0, Math.round(Number(form.get("min_score") ?? DEFAULT_SETTINGS.minScore) || 0)));
  // 이전 값도 남겨서 변경 이력에서 무엇이 바뀌었는지 보이고, 그 값으로 되돌릴 수 있게 한다
  const from = await currentWeightsValue();
  if (weightSum(weights) <= 0) redirect(`/admin/settings?e=${encodeURIComponent("항목 점수를 하나 이상 0보다 크게 적어 주세요")}`);
  const to = weightsValue(weights, min);
  if (from === to) redirect(`/admin/settings?m=${encodeURIComponent("바뀐 것이 없어요")}`);
  await db().from("settings").upsert([{ key: "matching.weights", value: weights }, { key: "matching.min_score", value: min }]);
  await logStatus({ entityType: "setting", entityId: me.id, field: "matching.weights", from, to, actor: `admin:${me.id}`, reason: "매칭 가중치·최소 점수 수정" });
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?m=${encodeURIComponent("저장했어요. 다음 자동 매칭부터 이 기준으로 점수를 매겨요")}`);
}

/** 미리보기용: 확정된 테이블이 있는 최근 두 회차의 테이블 점수 내역 (해제된 테이블은 뺀다). 참가자 정보는 넘기지 않는다 */
async function pastRounds(): Promise<PastRound[]> {
  const { data } = await db()
    .from("dining_tables")
    .select("id,round_id,score_detail,confirmed_at,slots(region,starts_at),rounds(title,match_at)")
    .not("confirmed_at", "is", null)
    .neq("status", "DISSOLVED")
    .order("confirmed_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as unknown as { id: string; round_id: string; score_detail: unknown; slots: { region: string; starts_at: string } | null; rounds: { title: string; match_at: string } | null }[];
  const byRound = new Map<string, { title: string; at: string; rows: typeof rows }>();
  for (const r of rows) {
    const g = byRound.get(r.round_id) ?? { title: r.rounds?.title ?? "지난 회차", at: r.rounds?.match_at ?? "", rows: [] };
    g.rows.push(r);
    byRound.set(r.round_id, g);
  }
  return [...byRound.entries()]
    .sort((a, b) => b[1].at.localeCompare(a[1].at))
    .slice(0, 2)
    .map(([id, g]) => ({
      id,
      title: g.title,
      tables: g.rows
        .sort((a, b) => (a.slots?.starts_at ?? "").localeCompare(b.slots?.starts_at ?? "") || (a.slots?.region ?? "").localeCompare(b.slots?.region ?? ""))
        .map((r) => pastTableOf(r.id, r.slots ? `${r.slots.region} · ${fmtSlot(r.slots.starts_at)}` : "테이블", r.score_detail))
        .filter((t) => t !== null),
    }))
    .filter((r) => r.tables.length > 0);
}

export default async function Settings() {
  const me = await requireAdmin();
  const [{ data }, { data: admins }, levels, rounds] = await Promise.all([
    db().from("settings").select("key,value").in("key", ["matching.weights", "matching.min_score", "matching.presets"]),
    db().from("users").select("id,name,login_id,account_status,is_demo").eq("role", "admin").is("deleted_at", null).order("created_at"),
    adminLevels(),
    pastRounds(),
  ]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const w = { ...DEFAULT_SETTINGS.weights, ...(map.get("matching.weights") ?? {}) } as Record<string, number>;
  const min = Number(map.get("matching.min_score") ?? DEFAULT_SETTINGS.minScore);
  const presets = parsePresets(map.get("matching.presets"));

  return (
    <div>
      <PageHeader
        title="매칭 기준·계정"
        desc={<>다음 자동 매칭에서 테이블 점수를 어떻게 매길지 정해요. 바꾼 기록은 <Link href="/admin/audit?kind=setting" className="font-semibold text-accent underline underline-offset-4">변경 이력</Link>에서 보고 되돌릴 수 있어요.</>}
        how={[<>템플릿을 고르거나 항목별 <Term tip={TIP.최대점수}>최대 점수</Term> 조정하기</>, <><Term tip={TIP.최소점수}>최소 점수</Term> 정하기</>, "지난 테이블 점수가 어떻게 달라지는지 확인", "'이 기준으로 저장'을 누르면 다음 자동 매칭부터 적용", ...(me.level === "full" ? ["아래에서 운영자 계정·권한 관리"] : [])]}
      />
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
        <WeightsForm initial={w} min={min} defaults={{ ...DEFAULT_SETTINGS.weights }} defaultMin={DEFAULT_SETTINGS.minScore} readOnly={me.level !== "full"} action={save} presets={presets} rounds={rounds} />
      </div>

      {/* 운영자 계정 관리는 전체 권한 운영자에게만 보인다. 서버 액션도 requireAdminWrite로 한 번 더 막는다 */}
      {me.level === "full" && (
        <div id="accounts" className="scroll-mt-6">
          <Panel title="운영자 계정" className="mt-6" action={<Link href="/admin/audit?kind=account" className="text-[14px] font-semibold text-accent underline underline-offset-4">계정 변경 이력</Link>}>
            <p className="text-[14px] leading-relaxed text-muted">
              &lsquo;조회 전용&rsquo;은 모든 화면을 볼 수 있지만 환불·참가 제한·긴급 수정·시연 데이터 초기화·설정 변경은 못 해요. 끈 계정은 로그인할 수 없어요. 내 계정은 끄거나 권한을 바꿀 수 없어요.
            </p>
            <div className="mt-4"><CreateAdminForm /></div>
            <TableScroll className="mt-4" label="운영자 계정 표">
              <table className="w-full min-w-[760px] text-[14px]">
                <thead><tr>{["운영자", "로그인 ID", "권한", "상태", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {(admins ?? []).map((a) => {
                    const lv: AdminLevel = levels[a.id] === "viewer" ? "viewer" : "full";
                    const off = isAdminOff(a.account_status);
                    const self = a.id === me.id;
                    return (
                      <tr key={a.id} className={off ? "text-muted" : undefined}>
                        <td className={`${td} font-semibold ${off ? "" : "text-ink"}`}>
                          {a.name}
                          {self && <span className="ml-1.5 text-[12px] font-normal text-muted">(나)</span>}
                          {a.is_demo && <span className="ml-1.5 text-[12px] font-normal text-muted">(시연 계정)</span>}
                        </td>
                        <td className={`${td} text-muted`}>{a.login_id}</td>
                        <td className={td}>
                          {self ? ADMIN_LEVEL_LABEL[lv] : (
                            <form action={setLevel} className="inline-flex items-center gap-2">
                              <input type="hidden" name="user_id" value={a.id} />
                              <select name="level" defaultValue={lv} className={ctl} aria-label={`${a.name} 권한`}>
                                <option value="full">전체 권한</option>
                                <option value="viewer">조회 전용</option>
                              </select>
                              <ConfirmButton confirm={`${a.name}님의 권한을 바꿔요. 조회 전용이 되면 바로 아무것도 고칠 수 없어요. 계속할까요?`} className={btnLight}>바꾸기</ConfirmButton>
                            </form>
                          )}
                        </td>
                        <td className={td}><Badge v={off ? ["꺼짐", "muted"] : ["켜짐", "leaf"]} /></td>
                        <td className={`${td} text-right`}>
                          {!self && (
                            <div className="inline-flex flex-wrap items-start justify-end gap-2">
                              {!a.is_demo && !off && <ResetPasswordForm userId={a.id} name={a.name} />}
                              {!a.is_demo && (
                                <form action={setAdminActive}>
                                  <input type="hidden" name="user_id" value={a.id} />
                                  <input type="hidden" name="on" value={off ? "true" : "false"} />
                                  {off ? (
                                    <ConfirmButton confirm={`${a.name}님 계정을 다시 켤까요? 바로 로그인할 수 있게 돼요.`} className={btnLight}>다시 켜기</ConfirmButton>
                                  ) : (
                                    <ConfirmButton confirm={`${a.name}님 계정을 끌까요? 바로 로그인할 수 없고, 열어 둔 화면도 다음 이동부터 막혀요.`} className={btnDanger}>끄기</ConfirmButton>
                                  )}
                                </form>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </Panel>
        </div>
      )}
    </div>
  );
}
