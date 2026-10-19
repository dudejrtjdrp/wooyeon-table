// 식당 관리(/admin/venues) 목록 거르기와 식당 지우기 판단. DB를 읽지 않는 순수 함수만 둔다 (venue-list-rules.test.ts)
import type { Channel } from "./reservations";

const CHANNELS: readonly Channel[] = ["naver", "catchtable", "phone"];
/** 예약 채널을 비워 둔 식당 */
export const CHANNEL_NONE = "none";

export interface VenueFilter {
  /** 이름·주소 일부 */
  q?: string;
  /** 동네 */
  region?: string;
  /** 배정 상태: on=배정함, off=쉬는 중 */
  state?: "on" | "off";
  /** 사진: yes=있음, no=없음 */
  photo?: "yes" | "no";
  /** 예약 채널 키 또는 none(비어 있음) */
  ch?: Channel | typeof CHANNEL_NONE;
}

type SP = Record<string, string | string[] | undefined>;
const pick = (sp: SP, k: string) => {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
};

/** 주소 쿼리 → 거르기. 모르는 값은 버린다 */
export function parseVenueFilter(sp: SP): VenueFilter {
  const state = pick(sp, "state");
  const photo = pick(sp, "photo");
  const ch = pick(sp, "ch");
  return {
    q: pick(sp, "q")?.replace(/\s+/g, " ").slice(0, 40),
    region: pick(sp, "region")?.slice(0, 30),
    state: state === "on" || state === "off" ? state : undefined,
    photo: photo === "yes" || photo === "no" ? photo : undefined,
    ch: ch === CHANNEL_NONE || (CHANNELS as readonly string[]).includes(ch ?? "") ? (ch as VenueFilter["ch"]) : undefined,
  };
}

export const venueFiltered = (f: VenueFilter) => Boolean(f.q || f.region || f.state || f.photo || f.ch);

/** 거르기 → 주소 쿼리 (?q=…&region=…). 비어 있으면 빈 문자열 */
export function venueSearch(f: VenueFilter): string {
  const p = new URLSearchParams();
  for (const k of ["q", "region", "state", "photo", "ch"] as const) if (f[k]) p.set(k, f[k]!);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export type VenueListRow = { name: string; address: string | null; region: string; active: boolean; photo_url: string | null; booking_channel: string | null };

/** 검색은 띄어쓰기·대소문자를 무시하고 이름이나 주소에 들어 있으면 맞는다 */
export function filterVenues<T extends VenueListRow>(rows: T[], f: VenueFilter): T[] {
  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, "");
  const q = norm(f.q);
  return rows.filter((v) => {
    if (q && !norm(v.name).includes(q) && !norm(v.address).includes(q)) return false;
    if (f.region && v.region !== f.region) return false;
    if (f.state && v.active !== (f.state === "on")) return false;
    if (f.photo && Boolean(v.photo_url) !== (f.photo === "yes")) return false;
    if (f.ch === CHANNEL_NONE ? Boolean(v.booking_channel) : f.ch && v.booking_channel !== f.ch) return false;
    return true;
  });
}

/** 식당이 쓰인 기록 수 */
export type VenueUsage = { tables: number; reservations: number; stock: number };

/**
 * 지워도 되나. 테이블 배정·예약·일정별 재고 중 하나라도 있으면 지우지 않는다(지나간 모임의 기록이 사라지므로).
 * 그럴 땐 '배정 끄기'로 새 배정만 막는다
 */
export function canDeleteVenue(u: VenueUsage): { ok: true } | { ok: false; reason: string } {
  // 일정별 재고는 식당을 추가하면 모집 중 일정마다 자동으로 잡히는 '받을 수 있는 수'라 기록이 아니다: 지울 때 함께 지운다.
  // 실제로 쓰인 기록(배정된 테이블·예약)이 있을 때만 막는다
  const used = [u.tables && `배정된 테이블 ${u.tables}개`, u.reservations && `예약 기록 ${u.reservations}건`].filter(Boolean);
  if (!used.length) return { ok: true };
  return { ok: false, reason: `쓰인 기록이 있어 지울 수 없어요(${used.join(", ")}). 기록을 지키려면 '배정 끄기'로 새 테이블에만 배정하지 않게 해 주세요.` };
}
