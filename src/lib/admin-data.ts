import { db } from "./supabase";

export async function roundsAndCurrent(r?: string) {
  const { data: rounds } = await db().from("rounds").select("id,title,status,match_at").order("match_at");
  const list = rounds ?? [];
  const round = list.find((x) => x.id === r) ?? list.find((x) => x.status === "matched") ?? list.find((x) => x.status !== "closed") ?? list[0];
  return { rounds: list, round };
}
