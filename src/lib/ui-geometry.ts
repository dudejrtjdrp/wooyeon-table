// 화면 배치 계산(풀이 말풍선 자리, 표 가로 스크롤 안내, 이동 진행 막대). DOM을 읽지 않는 순수 함수만 둔다 (ui-geometry.test.ts)

export type Rect = { top: number; left: number; bottom: number; right: number; width: number; height: number };

/**
 * 풀이 말풍선 자리. 기본은 단어 위, 위에 자리가 없으면 아래로 뒤집는다.
 * 왼쪽은 단어 왼쪽에 맞추되 화면 가장자리(margin) 안으로 밀어 넣는다
 */
export function placeTooltip(
  anchor: Rect,
  tip: { width: number; height: number },
  view: { width: number; height: number },
  gap = 8,
  margin = 8,
): { top: number; left: number; side: "top" | "bottom" } {
  const roomAbove = anchor.top - gap - margin;
  const roomBelow = view.height - anchor.bottom - gap - margin;
  const side = tip.height <= roomAbove || roomAbove >= roomBelow ? "top" : "bottom";
  const top = side === "top" ? anchor.top - gap - tip.height : anchor.bottom + gap;
  const maxLeft = Math.max(margin, view.width - margin - tip.width);
  const left = Math.min(Math.max(anchor.left, margin), maxLeft);
  return { top: Math.max(margin, Math.round(top)), left: Math.round(left), side };
}

/** 가로 스크롤 상자 상태: 넘치는지, 오른쪽에 더 있는지, 이미 밀었는지 */
export function scrollState(m: { scrollLeft: number; scrollWidth: number; clientWidth: number }) {
  const overflow = m.scrollWidth - m.clientWidth > 1;
  return {
    overflow,
    more: overflow && m.scrollLeft + m.clientWidth < m.scrollWidth - 1,
    scrolled: overflow && m.scrollLeft > 1,
  };
}

/** 진행 막대 한 걸음: 처음엔 빠르게, 끝에 가까울수록 느리게. 끝나기 전에는 95%를 넘지 않는다 */
export function trickle(p: number): number {
  if (p >= 95) return 95;
  const step = p < 25 ? 10 : p < 60 ? 5 : p < 80 ? 2 : 0.5;
  return Math.min(95, p + step);
}

/**
 * 링크를 눌렀을 때 화면 이동 진행 막대를 켤지. 새 창·내려받기·다른 사이트·같은 주소(해시만 다른 것 포함)는 켜지 않는다
 */
export function isNavClick(
  href: string | null,
  current: string,
  opts: { target?: string | null; download?: boolean; modifier?: boolean; button?: number } = {},
): boolean {
  if (!href || opts.download || opts.modifier || (opts.button ?? 0) !== 0) return false;
  if (opts.target && opts.target !== "_self") return false;
  let to: URL, from: URL;
  try {
    from = new URL(current);
    to = new URL(href, from);
  } catch {
    return false;
  }
  if (to.protocol !== "http:" && to.protocol !== "https:") return false;
  if (to.origin !== from.origin) return false;
  // API(CSV 내려받기 등)는 화면이 바뀌지 않는다
  if (to.pathname.startsWith("/api/")) return false;
  return to.pathname !== from.pathname || to.search !== from.search;
}
