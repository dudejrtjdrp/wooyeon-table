"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { refundPayment } from "@/lib/payments";
import { assignVenue, afterConfirm, triedVenues } from "@/lib/pipeline";
import { db } from "@/lib/supabase";

// 처리하면 예외를 닫고(누가·언제·무엇) 상태 이력에도 한 줄 남긴다. 결과는 ?m=/?e= 로 화면에 알린다.
// 처리 문구는 요청마다 따로 돌려받는다(모듈 전역에 두면 동시에 누른 두 요청의 문구가 섞인다)
async function close(id: string, adminId: string, resolution: string): Promise<string> {
  await db().from("exceptions").update({ status: "resolved", resolution, resolved_by: adminId, resolved_at: new Date().toISOString() }).eq("id", id).eq("status", "open");
  await logStatus({ entityType: "exception", entityId: id, field: "status", from: "open", to: "resolved", actor: `admin:${adminId}`, reason: resolution });
  return resolution;
}

export async function resolveException(form: FormData) {
  const back = String(form.get("back") ?? "") || "/admin/exceptions";
  const me = await requireAdminWrite(back);
  const id = String(form.get("id"));
  const action = String(form.get("action"));
  const note = String(form.get("note") ?? "").trim();
  const { data: ex } = await db().from("exceptions").select("*").eq("id", id).single();
  const go = (k: "m" | "e", msg: string) => {
    revalidatePath("/admin/exceptions");
    revalidatePath("/admin");
    redirect(`${back}${back.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(msg)}`);
  };
  if (!ex) return go("e", "이 예외를 찾지 못했어요. 이미 지워졌을 수 있어요");
  if (ex.status !== "open") return go("m", "이미 처리된 예외예요");
  let done = "";
  const actor = `admin:${me.id}`;

  if (ex.kind === "no_show" && ex.ref_type === "user") {
    // 노쇼 3회 이상: 영구 제한 검토
    const ban = action === "ban";
    await db().from("users").update(ban ? { account_status: "banned", restricted_until: null } : { account_status: "warned", restricted_until: null }).eq("id", ex.ref_id);
    await logStatus({ entityType: "user", entityId: ex.ref_id, field: "account_status", from: "restricted", to: ban ? "banned" : "warned", actor, reason: note || (ban ? "노쇼 반복으로 영구 제한" : "소명 확인, 제한 해제") });
    done = await close(id, me.id, ban ? "영구 제한" : "제한 해제");
  } else if (ex.kind === "no_show") {
    const to = action === "attended" ? "ATTENDED" : "NO_SHOW";
    // 운영자 정정은 앱 체크인이 아니라 checked_in_at을 비워 둔다. 이미 처리된 신청은 다시 바꾸지 않는다(노쇼 제재가 두 번 걸리지 않게)
    const { data: changed } = await db().from("applications").update({ attendance_status: to }).eq("id", ex.ref_id).eq("attendance_status", "SCHEDULED").select("id");
    if (changed?.length) await logStatus({ entityType: "application", entityId: ex.ref_id, field: "attendance_status", from: "SCHEDULED", to, actor, reason: note || "운영자 확인" });
    done = await close(id, me.id, !changed?.length ? "이미 처리된 신청이라 상태는 바꾸지 않음" : to === "NO_SHOW" ? "노쇼 확정" : "참석으로 정정");
    if (to === "NO_SHOW" && changed?.length) {
      const { data: app } = await db().from("applications").select("user_id").eq("id", ex.ref_id).single();
      if (app) {
        const { applyNoShowPolicy } = await import("@/lib/noshow");
        const { now } = await import("@/lib/clock");
        await applyNoShowPolicy(app.user_id, ex.ref_id, actor, await now());
      }
    }
  } else if (ex.kind === "safety") {
    const { data: rep } = await db().from("safety_reports").select("reported_id").eq("id", ex.ref_id).single();
    const level = ["warning", "restricted", "banned"].includes(action) ? action : "none";
    await db().from("safety_reports").update({ status: "reviewed", action: level, admin_note: note || null, reviewed_at: new Date().toISOString() }).eq("id", ex.ref_id);
    if (rep && level !== "none") {
      const status = level === "warning" ? "warned" : level;
      await db().from("users").update({ account_status: status }).eq("id", rep.reported_id);
      await logStatus({ entityType: "user", entityId: rep.reported_id, field: "account_status", to: status, actor, reason: note || "안전 신고 검토" });
    }
    done = await close(id, me.id, `신고 검토: ${({ none: "조치 없음", warning: "경고", restricted: "참가 제한", banned: "영구 제한" } as Record<string, string>)[level]}`);
  } else if (ex.kind === "venue_shortage" && action === "retry") {
    const ok = await assignVenue(ex.ref_id);
    if (ok) {
      await afterConfirm(ex.ref_id);
      done = await close(id, me.id, "식당 재배정");
    } else go("e", "아직 배정할 식당이 없어요. '회차·식당 재고'에서 그 일정의 테이블 수를 늘린 뒤 다시 눌러 주세요");
  } else if (ex.kind === "venue_shortage" && action === "add_and_retry") {
    // 같은 지역에서 평점 좋은 식당의 이 일정 재고를 1 늘리고 바로 배정한다 (예외 카드에서 확인 포함 2클릭)
    const { data: tb } = await db().from("dining_tables").select("slot_id,slots(region)").eq("id", ex.ref_id).maybeSingle();
    const t = tb as unknown as { slot_id: string; slots: { region: string } } | null;
    // 예약이 이미 실패한 식당과 좌석이 인원보다 적은 식당은 빼고 고른다
    const { data: vs } = t ? await db().from("venues").select("id,name,seats_per_table").eq("region", t.slots.region).eq("active", true).order("rating", { ascending: false, nullsFirst: false }) : { data: null };
    const { count: party } = await db().from("applications").select("id", { count: "exact", head: true }).eq("table_id", ex.ref_id).eq("match_status", "CONFIRMED");
    const tried = await triedVenues(ex.ref_id);
    const v = (vs ?? []).find((x) => !tried.has(x.id) && (x.seats_per_table ?? 6) >= (party ?? 0));
    if (!t || !v) go("e", "이 인원을 받을 수 있는 식당이 이 지역에 없어요. '식당 재고 열기'에서 식당을 먼저 추가해 주세요");
    else {
      const { data: cur } = await db().from("venue_slots").select("tables_available").eq("venue_id", v.id).eq("slot_id", t.slot_id).maybeSingle();
      const next = (cur?.tables_available ?? 0) + 1;
      await db().from("venue_slots").upsert({ venue_id: v.id, slot_id: t.slot_id, tables_available: next }, { onConflict: "venue_id,slot_id" });
      await logStatus({ entityType: "dining_table", entityId: ex.ref_id, field: "tables_available", from: String(cur?.tables_available ?? 0), to: String(next), actor, reason: `${v.name} 재고 1 늘림 (식당 부족 처리)` });
      if (await assignVenue(ex.ref_id)) {
        await afterConfirm(ex.ref_id);
        done = await close(id, me.id, `${v.name} 재고를 늘려 배정`);
      } else go("e", "재고를 늘렸지만 배정하지 못했어요. 인원이 그 식당 좌석보다 많은지 확인해 주세요");
    }
  } else if (ex.kind === "reservation" && action === "retry_reservation") {
    const { resetAndRetry } = await import("@/lib/reservations");
    await resetAndRetry(ex.ref_id, me.id);
    const { data: r } = await db().from("reservations").select("status").eq("table_id", ex.ref_id).maybeSingle();
    if (r?.status === "CONFIRMED") done = await close(id, me.id, "예약 다시 시도 성공");
    else go("e", "예약이 또 안 됐어요. 식당에 직접 예약한 뒤 '직접 예약함'을 눌러 주세요");
  } else if (ex.kind === "reservation" && action === "reserved") {
    const { markReservedManually } = await import("@/lib/reservations");
    await markReservedManually(ex.ref_id, note, me.id);
    await logStatus({ entityType: "exception", entityId: id, field: "status", from: "open", to: "resolved", actor, reason: `운영자가 직접 예약${note ? ` (${note})` : ""}` });
    done = "직접 예약함";
  } else if (ex.kind === "notification" && action === "resend") {
    // 알림 발송 실패: 운영자가 원인을 보고 다시 보낸다 (INF-08)
    let ok = false;
    if (ex.ref_type === "chat_room") {
      const { resendSystem } = await import("@/lib/delivery");
      ok = await resendSystem(ex.dedupe_key ?? "");
    } else if (ex.ref_type === "notification") {
      // 자동 메시지 화면과 같은 다시 보내기: 하루 전 안내는 지금 식당으로 다시 쓰고, 이유가 사라진 알림은 보내지 않는다 (lib/delivery.ts)
      const { resendNotification } = await import("@/lib/delivery");
      const r = await resendNotification(ex.ref_id, me.id);
      if (r.skipped) {
        await logStatus({ entityType: "exception", entityId: id, field: "resend", to: "보내지 않음", actor, reason: r.skipped });
        done = await close(id, me.id, `다시 보낼 필요 없음: ${r.skipped}`);
        return go("m", r.skipped);
      }
      ok = r.ok;
    }
    await logStatus({ entityType: "exception", entityId: id, field: "resend", to: ok ? "SENT" : "FAILED", actor, reason: note || "운영자가 다시 보내기" });
    if (ok) done = await close(id, me.id, "다시 보내기 성공");
    else go("e", "다시 보내지 못했어요. 사유를 확인하고 직접 연락한 뒤 '직접 연락함'을 눌러 주세요");
  } else if (ex.kind === "refund" && action === "retry_refund") {
    const { data: app } = await db().from("applications").select("id,user_id,payment_id").eq("id", ex.ref_id).single();
    // 신청이나 결제를 못 찾으면 닫지 않고 그대로 둔다. '처리했어요'라고 띄우면 환불이 된 줄 안다
    if (!app?.payment_id) return go("e", "환불할 신청이나 결제 기록을 찾지 못해 다시 요청하지 못했어요. 예외는 그대로 열어 둘게요. 결제사 관리 화면에서 직접 취소한 뒤 '직접 처리함'을 눌러 주세요");
    const r = await refundPayment(app.payment_id, app.id, actor, note || "운영자 환불 재시도");
    // 참가자 환불 완료 알림은 refundPayment가 보낸다
    if (r.ok) done = await close(id, me.id, "환불 재시도 성공");
    else go("e", `환불이 또 안 됐어요: ${r.message.replace(/\.$/, "")}. 결제사 관리 화면에서 직접 취소한 뒤 '직접 처리함'을 눌러 주세요`);
  } else if (ex.kind === "condition_conflict" && action === "move") {
    // 추천 이동: 서버가 고른 테이블로 옮긴다. moveMember가 필수 조건을 다시 확인하고, 이 예외도 함께 닫는다
    const appId = String(form.get("app_id") ?? "");
    const targetId = String(form.get("target_id") ?? "");
    if (!appId || !targetId) return go("e", "옮길 사람이나 테이블 정보가 없어요. '긴급 수정 열기'에서 직접 옮겨 주세요");
    const { moveMember } = await import("@/lib/admin-ops");
    const r = await moveMember(appId, targetId, note || `조건 충돌 해소: ${ex.reason}`, me.id, false, id);
    if (!r.ok) return go("e", `옮기지 못했어요: ${r.message}. 그 사이 테이블이 바뀌었을 수 있어요. 새로 고침하거나 '긴급 수정 열기'에서 직접 골라 주세요`);
    return go("m", r.message);
  } else {
    done = await close(id, me.id, note || "운영자 처리");
  }
  go("m", done ? `처리했어요: ${done}` : "처리했어요");
}
