import { roundLabel } from "./round-label";
import { db } from "./supabase";

export async function roundsAndCurrent(r?: string) {
  const { data: rounds } = await db().from("rounds").select("id,title,status,match_at,slots(starts_at)").order("match_at");
  // label: 이름 뒤에 모임 날짜를 붙인 표기 (11월 첫째 주 저녁 (11월 6일(금)·7일(토)))
  const list = (rounds ?? []).map(({ slots, ...x }) => ({ ...x, label: roundLabel(x.title, ((slots ?? []) as { starts_at: string }[]).map((s) => s.starts_at)) }));
  const round = list.find((x) => x.id === r) ?? list.find((x) => x.status === "matched") ?? list.find((x) => x.status !== "closed") ?? list[0];
  // RoundPicker에 그대로 넘기는 선택지 (보이는 글자는 label)
  const options = list.map((x) => ({ id: x.id, title: x.label }));
  return { rounds: list, round, options };
}
