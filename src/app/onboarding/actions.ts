"use server";

import { redirect } from "next/navigation";
import { requireMe } from "@/lib/auth";
import { INTERESTS, MBTIS, PRICE_RANGES, TRAITS } from "@/lib/constants";
import { db } from "@/lib/supabase";

const pick = (form: FormData, key: string, allowed: readonly string[]) =>
  form.getAll(key).map(String).filter((v) => allowed.includes(v));

export async function saveProfile(form: FormData) {
  const me = await requireMe();
  const back = (m: string) => redirect(`/onboarding?e=${encodeURIComponent(m)}`);

  const birthYear = Number(form.get("birth_year"));
  const gender = String(form.get("gender") ?? "");
  const job = String(form.get("job") ?? "").trim();
  const mbtiRaw = String(form.get("mbti") ?? "");
  const mbti = (MBTIS as readonly string[]).includes(mbtiRaw) ? mbtiRaw : null;
  const interests = pick(form, "interests", INTERESTS);
  const myTraits = pick(form, "my_traits", TRAITS);
  const wantedTraits = pick(form, "wanted_traits", TRAITS);
  const price = String(form.get("price_range") ?? "");
  const food = String(form.get("food_restrictions") ?? "").trim();
  const agreed = form.get("agree_privacy") === "on" && form.get("agree_policy") === "on";

  if (!(birthYear >= 1970 && birthYear <= 2007)) back("출생연도를 골라 주세요");
  if (!["M", "F"].includes(gender)) back("성별을 골라 주세요");
  if (!job) back("하는 일을 적어 주세요");
  if (interests.length < 2) back("관심사를 두 개 이상 골라 주세요");
  if (myTraits.length < 1 || wantedTraits.length < 1) back("성향을 하나 이상 골라 주세요");
  if (!(PRICE_RANGES as readonly string[]).includes(price)) back("식사 가격대를 골라 주세요");
  if (!agreed) back("개인정보 수집·이용과 운영 정책에 동의해야 신청할 수 있어요");

  const { error } = await db().from("profiles").upsert({
    user_id: me.id,
    birth_year: birthYear,
    gender,
    job,
    mbti,
    interests,
    my_traits: myTraits,
    wanted_traits: wantedTraits,
    price_range: price,
    food_restrictions: food || null,
    agreed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) back("저장하지 못했어요. 다시 시도해 주세요");
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") ? next : "/");
}
