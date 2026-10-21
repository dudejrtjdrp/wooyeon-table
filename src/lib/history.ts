// 참가 이력(/my-tables) 나누기와 지난 모임 한 줄 표시 규칙. DB 없이 계산만 한다 (history.test.ts)
import { meetingEnded } from "./meeting-time";

export type HistApp = {
  id: string;
  application_status: string;
  match_status: string;
  attendance_status: string | null;
  dining_tables: { status?: string | null; slots: { starts_at: string; ends_at?: string | null; region: string } | null } | null;
};

/** 다가오는 테이블 / 지난 식탁 / 아직 매칭 중인 신청. 홈·모임 정보와 같은 '끝남' 기준(meeting-time.ts) */
export function splitHistory<T extends HistApp>(apps: T[], t: Date) {
  const tables = apps.filter((a) => a.match_status === "CONFIRMED" && a.dining_tables?.slots);
  const upcoming = tables.filter((a) => !meetingEnded(a.dining_tables, t) && !a.attendance_status?.match(/ATTENDED|NO_SHOW|CANCELED/));
  const past = tables.filter((a) => !upcoming.includes(a));
  const pending = apps.filter((a) => !tables.includes(a) && a.application_status !== "CANCELED" && !["TRANSFERRED", "NO_MATCH"].includes(a.match_status) && !a.attendance_status?.startsWith("CANCELED"));
  return { upcoming, past, pending };
}

/** 지난 식탁 한 줄: 참석했고 별점이 없으면 '별점 남기기'로 보내고, 남겼으면 '별점 남김' */
export function pastRowState(a: Pick<HistApp, "attendance_status">, reviewed: boolean): { needReview: boolean; pill: "별점 남기기" | "별점 남김" | null } {
  const needReview = a.attendance_status === "ATTENDED" && !reviewed;
  return { needReview, pill: needReview ? "별점 남기기" : reviewed ? "별점 남김" : null };
}
