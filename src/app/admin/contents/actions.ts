"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminWrite } from "@/lib/auth";
import { contentBack } from "@/lib/content-filter";
import { previewBack } from "@/lib/content-preview";
import { TABLE_TYPES } from "@/lib/contents";
import { INTERESTS } from "@/lib/constants";
import { logStatus } from "@/lib/events";
import { db } from "@/lib/supabase";

// 관심사 태그: 고른 칩(tags 여러 개)과 직접 적은 칸(쉼표 구분)을 합친다
const tagsOf = (vs: FormDataEntryValue[]) => [...new Set(vs.map(String).join(",").split(/[,\n]/).map((x) => x.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 8);
const typesOf = (form: FormData) => form.getAll("table_types").map(String).filter((x) => (TABLE_TYPES as readonly string[]).includes(x));
// 돌아갈 때 화면의 검색·거르기(폼의 back 값)와 테이블 미리 보기(pq 값)를 그대로 지킨다
const back = (k: "m" | "e", msg: string, kind?: string, form?: FormData): never => {
  const pq = form ? previewBack(String(form.get("pq") ?? ""), INTERESTS) : "";
  redirect(`/admin/contents${contentBack(form ? String(form.get("back") ?? "") : "", kind)}${pq ? `&${pq}` : ""}&${k}=${encodeURIComponent(msg)}`);
};

export async function saveContent(form: FormData) {
  const admin = await requireAdminWrite("/admin/contents");
  const id = String(form.get("id") ?? "");
  const kind = String(form.get("kind")) === "icebreaker" ? "icebreaker" : "topic";
  const body = String(form.get("body") ?? "").trim();
  if (body.length < 5) back("e", "내용을 5자 이상 적어 주세요", kind, form);
  if (body.length > 200) back("e", "내용은 200자 안으로 적어 주세요", kind, form);
  const row = {
    kind,
    body,
    tags: tagsOf(form.getAll("tags")),
    table_types: typesOf(form),
    priority: Math.max(-10, Math.min(10, Number(form.get("priority") ?? 0) || 0)),
    updated_at: new Date().toISOString(),
  };
  if (id) {
    await db().from("conversation_contents").update(row).eq("id", id);
    await logStatus({ entityType: "content", entityId: id, field: "content", to: "updated", actor: `admin:${admin.id}`, reason: body.slice(0, 40) });
  } else {
    const { data } = await db().from("conversation_contents").insert({ ...row, active: true }).select("id").single();
    if (data) await logStatus({ entityType: "content", entityId: data.id, field: "content", to: "created", actor: `admin:${admin.id}`, reason: body.slice(0, 40) });
  }
  revalidatePath("/admin/contents");
  back("m", id ? "콘텐츠를 고쳤어요" : "콘텐츠를 등록했어요", kind, form);
}

export async function toggleContent(form: FormData) {
  const admin = await requireAdminWrite("/admin/contents");
  const id = String(form.get("id"));
  const active = String(form.get("active")) === "true";
  const { data } = await db().from("conversation_contents").update({ active, updated_at: new Date().toISOString() }).eq("id", id).select("kind").single();
  await logStatus({ entityType: "content", entityId: id, field: "active", to: String(active), actor: `admin:${admin.id}`, reason: active ? "다시 노출" : "노출 중지" });
  revalidatePath("/admin/contents");
  back("m", active ? "다시 후보에 넣었어요. 다음 모임부터 뽑힐 수 있어요" : "멈췄어요. 이제 단체방에 올라가지 않아요", data?.kind, form);
}

export async function saveRules(form: FormData) {
  const admin = await requireAdminWrite("/admin/contents");
  const n = (k: string, d: number) => Number(form.get(k) ?? d) || d;
  const value = {
    topicCount: Math.max(3, Math.min(6, n("topicCount", 3))),
    icebreakerCount: Math.max(1, Math.min(3, n("icebreakerCount", 1))),
    interestWeight: Math.max(0, Math.min(30, n("interestWeight", 10))),
    typeWeight: Math.max(0, Math.min(30, n("typeWeight", 6))),
  };
  await db().from("settings").upsert({ key: "content.rules", value });
  await logStatus({ entityType: "setting", entityId: admin.id, field: "content.rules", to: JSON.stringify(value), actor: `admin:${admin.id}`, reason: "콘텐츠 노출 규칙 수정" });
  revalidatePath("/admin/contents");
  back("m", "규칙을 저장했어요. 미리 보기에도 바로 반영돼요", undefined, form);
}
