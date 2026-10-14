// 내 기기로 시험 알림 한 통 보내기 (설치·권한이 제대로 됐는지 바로 확인)
import { NextResponse } from "next/server";
import { pushToUsers } from "@/lib/push";
import { getSession } from "@/lib/session";

export async function POST() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  const sent = await pushToUsers([s.uid], { title: "알림이 잘 와요", body: "매칭 결과와 모임 안내를 이렇게 보내드릴게요.", url: "/notifications", tag: "test" });
  return NextResponse.json({ sent });
}
