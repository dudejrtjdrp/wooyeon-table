"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_OFF, type AdminRow, adminLoginIdError, adminNameError, disableError, isAdminOff, levelError, resetError, tempPassword } from "@/lib/admin-accounts";
import { ADMIN_LEVEL_LABEL, type AdminLevel, adminLevels, requireAdminWrite } from "@/lib/auth";
import { logStatus } from "@/lib/events";
import { db } from "@/lib/supabase";

const BACK = "/admin/settings#accounts";

/** 임시 비밀번호는 이 응답으로 한 번만 화면에 간다. 주소·DB·이력 어디에도 남기지 않는다 */
export type AccountState = { error?: string; values?: { name: string; login_id: string; level: string }; done?: { kind: "created" | "reset"; name: string; loginId: string; password: string; at: number } };

async function loadAdmins(): Promise<(AdminRow & { login_id: string })[]> {
  const { data } = await db().from("users").select("id,name,login_id,account_status,is_demo").eq("role", "admin").is("deleted_at", null);
  return (data ?? []) as (AdminRow & { login_id: string })[];
}

const go = (k: "m" | "e", msg: string) => redirect(`/admin/settings?${k}=${encodeURIComponent(msg)}#accounts`);

/** 운영자 추가: 이름·로그인 ID·등급을 받고 임시 비밀번호를 만들어 한 번만 보여 준다 */
export async function createAdmin(_prev: AccountState, form: FormData): Promise<AccountState> {
  const me = await requireAdminWrite(BACK);
  const name = String(form.get("name") ?? "").trim();
  const loginId = String(form.get("login_id") ?? "").trim().toLowerCase();
  const level: AdminLevel = form.get("level") === "viewer" ? "viewer" : "full";
  // 안 될 때는 적은 값을 돌려줘서 입력칸이 비지 않게 한다
  const values = { name, login_id: loginId, level };
  const bad = adminNameError(name) ?? adminLoginIdError(loginId);
  if (bad) return { error: bad, values };
  const { data: exists } = await db().from("users").select("id").eq("login_id", loginId).maybeSingle();
  if (exists) return { error: "이미 쓰고 있는 로그인 ID예요. 다른 ID로 정해 주세요", values };

  const password = tempPassword();
  const { data: user, error } = await db()
    .from("users")
    .insert({ login_id: loginId, name, role: "admin", phone: null, password_hash: await bcrypt.hash(password, 10) })
    .select("id")
    .single();
  if (error || !user) return { error: error?.code === "23505" ? "이미 쓰고 있는 로그인 ID예요. 다른 ID로 정해 주세요" : "계정을 만들지 못했어요. 잠시 뒤 다시 해 주세요", values };
  if (level === "viewer") {
    const levels = await adminLevels();
    await db().from("settings").upsert({ key: "admin.levels", value: { ...levels, [user.id]: "viewer" } });
  }
  await logStatus({ entityType: "user", entityId: user.id, field: "admin_account", to: "created", actor: `admin:${me.id}`, reason: `운영자 추가: ${name}(${loginId}) · ${ADMIN_LEVEL_LABEL[level]}` });
  revalidatePath("/admin/settings");
  return { done: { kind: "created", name, loginId, password, at: Date.now() } };
}

/** 비밀번호 초기화: 새 임시 비밀번호를 만들어 한 번만 보여 준다. 내 계정·시연 계정은 막는다 */
export async function resetAdminPassword(_prev: AccountState, form: FormData): Promise<AccountState> {
  const me = await requireAdminWrite(BACK);
  const uid = String(form.get("user_id") ?? "");
  const admins = await loadAdmins();
  const target = admins.find((a) => a.id === uid);
  const bad = resetError(me.id, target);
  if (bad) return { error: bad };
  const password = tempPassword();
  const { error } = await db().from("users").update({ password_hash: await bcrypt.hash(password, 10) }).eq("id", uid).eq("role", "admin");
  if (error) return { error: "비밀번호를 바꾸지 못했어요. 잠시 뒤 다시 해 주세요" };
  await logStatus({ entityType: "user", entityId: uid, field: "password_reset", to: "reset", actor: `admin:${me.id}`, reason: `운영자 비밀번호 초기화: ${target!.name}` });
  revalidatePath("/admin/settings");
  return { done: { kind: "reset", name: target!.name, loginId: target!.login_id, password, at: Date.now() } };
}

/** 끄기·다시 켜기. 끈 계정은 로그인할 수 없고, 로그인해 둔 화면도 다음 이동부터 막힌다 */
export async function setAdminActive(form: FormData) {
  const me = await requireAdminWrite(BACK);
  const uid = String(form.get("user_id") ?? "");
  const on = String(form.get("on")) === "true";
  const [admins, levels] = await Promise.all([loadAdmins(), adminLevels()]);
  const target = admins.find((a) => a.id === uid);
  if (!target) go("e", "운영자 계정이 아니에요");
  if (on) {
    if (!isAdminOff(target!.account_status)) go("m", "이미 켜져 있는 계정이에요");
  } else {
    const bad = disableError(me.id, target, admins, levels);
    if (bad) go("e", bad);
  }
  const from = target!.account_status;
  await db().from("users").update({ account_status: on ? "active" : ADMIN_OFF }).eq("id", uid).eq("role", "admin");
  await logStatus({ entityType: "user", entityId: uid, field: "admin_active", from: on ? "false" : "true", to: on ? "true" : "false", actor: `admin:${me.id}`, reason: `운영자 계정 ${on ? "다시 켬" : "끔"}: ${target!.name}${from !== "active" && from !== ADMIN_OFF ? ` (이전 상태 ${from})` : ""}` });
  revalidatePath("/admin/settings");
  go("m", on ? `${target!.name}님 계정을 다시 켰어요. 이제 로그인할 수 있어요` : `${target!.name}님 계정을 껐어요. 이제 로그인할 수 없어요`);
}

/** 운영자 권한 등급 바꾸기. 자기 자신은 못 바꾸고, 켜진 전체 권한 운영자가 한 명은 남아야 한다 */
export async function setLevel(form: FormData) {
  const me = await requireAdminWrite(BACK);
  const uid = String(form.get("user_id") ?? "");
  const to: AdminLevel = form.get("level") === "viewer" ? "viewer" : "full";
  const [admins, levels] = await Promise.all([loadAdmins(), adminLevels()]);
  const target = admins.find((a) => a.id === uid);
  const bad = levelError(me.id, target, admins, levels, to);
  if (bad) go("e", bad);
  const from: AdminLevel = levels[uid] === "viewer" ? "viewer" : "full";
  if (from === to) go("m", "바뀐 것이 없어요");
  await db().from("settings").upsert({ key: "admin.levels", value: { ...levels, [uid]: to } });
  await logStatus({ entityType: "user", entityId: uid, field: "admin_level", from, to, actor: `admin:${me.id}`, reason: `운영자 권한: ${ADMIN_LEVEL_LABEL[from]} → ${ADMIN_LEVEL_LABEL[to]}` });
  revalidatePath("/admin/settings");
  go("m", `${target!.name}님을 '${ADMIN_LEVEL_LABEL[to]}'으로 바꿨어요`);
}
