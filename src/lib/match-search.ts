/** 매칭 모니터 검색: CS 문의가 오면 이름·예약명·식당으로 테이블을 바로 찾는다 */

/** 공백·대소문자를 무시하고 비교한다 ("우연한식탁 ABC5" = "우연한 식탁 abc5") */
export function norm(s: string | null | undefined) {
  return (s ?? "").replace(/\s+/g, "").toLowerCase();
}

/** 검색어가 비어 있으면 false (아무것도 펼치지 않는다) */
export function hits(q: string | null | undefined, ...fields: (string | null | undefined)[]) {
  const k = norm(q);
  if (!k) return false;
  return fields.some((f) => norm(f).includes(k));
}

export type SearchableTable = { names: string[]; reservationName: string | null; venueName: string | null; region?: string | null };

/** 테이블이 검색어에 걸리는가 (참가자 이름·예약명·식당 이름·동네) */
export function tableHits(q: string | null | undefined, t: SearchableTable) {
  return hits(q, ...t.names, t.reservationName, t.venueName, t.region);
}
