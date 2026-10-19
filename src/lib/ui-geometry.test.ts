import { describe, expect, it } from "vitest";
import { isNavClick, placeTooltip, scrollState, trickle } from "./ui-geometry";

const rect = (left: number, top: number, width = 60, height = 20) => ({ left, top, width, height, right: left + width, bottom: top + height });
const view = { width: 390, height: 800 };

describe("풀이 말풍선 자리", () => {
  it("자리가 있으면 단어 위에 띄운다", () => {
    expect(placeTooltip(rect(100, 300), { width: 200, height: 60 }, view)).toEqual({ top: 232, left: 100, side: "top" });
  });
  it("위에 자리가 없으면 아래로 뒤집는다", () => {
    const p = placeTooltip(rect(100, 30), { width: 200, height: 60 }, view);
    expect(p.side).toBe("bottom");
    expect(p.top).toBe(58);
  });
  it("오른쪽 끝을 넘지 않게 왼쪽으로 민다", () => {
    expect(placeTooltip(rect(330, 300), { width: 200, height: 60 }, view).left).toBe(182);
  });
  it("왼쪽 끝에서는 가장자리 여백을 지킨다", () => {
    expect(placeTooltip(rect(-20, 300), { width: 200, height: 60 }, view).left).toBe(8);
  });
  it("위아래 모두 좁으면 더 넓은 쪽을 고른다", () => {
    expect(placeTooltip(rect(10, 60), { width: 100, height: 400 }, { width: 390, height: 300 }).side).toBe("bottom");
    expect(placeTooltip(rect(10, 240), { width: 100, height: 400 }, { width: 390, height: 300 }).side).toBe("top");
  });
});

describe("가로 스크롤 상자 상태", () => {
  it("넘치지 않으면 안내를 띄우지 않는다", () => {
    expect(scrollState({ scrollLeft: 0, scrollWidth: 800, clientWidth: 800 })).toEqual({ overflow: false, more: false, scrolled: false });
  });
  it("처음엔 오른쪽에 더 있다", () => {
    expect(scrollState({ scrollLeft: 0, scrollWidth: 1100, clientWidth: 800 })).toEqual({ overflow: true, more: true, scrolled: false });
  });
  it("끝까지 밀면 오른쪽 그림자를 뗀다", () => {
    expect(scrollState({ scrollLeft: 300, scrollWidth: 1100, clientWidth: 800 })).toEqual({ overflow: true, more: false, scrolled: true });
  });
});

describe("진행 막대", () => {
  it("끝나기 전에는 95%에서 멈춘다", () => {
    let p = 0;
    for (let i = 0; i < 200; i++) p = trickle(p);
    expect(p).toBe(95);
  });
  it("처음엔 빠르고 뒤로 갈수록 느리다", () => {
    expect(trickle(0) - 0).toBeGreaterThan(trickle(85) - 85);
  });
});

describe("화면 이동 링크 판단", () => {
  const cur = "https://x.app/admin/applicants?r=1";
  it("다른 화면으로 가는 링크는 켠다", () => {
    expect(isNavClick("/admin/tables", cur)).toBe(true);
    expect(isNavClick("/admin/applicants?r=2", cur)).toBe(true);
  });
  it("같은 주소·해시만 다른 링크는 켜지 않는다", () => {
    expect(isNavClick("/admin/applicants?r=1", cur)).toBe(false);
    expect(isNavClick("#top", cur)).toBe(false);
  });
  it("새 창·내려받기·보조 키·다른 사이트·API는 켜지 않는다", () => {
    expect(isNavClick("/admin/tables", cur, { target: "_blank" })).toBe(false);
    expect(isNavClick("/admin/tables", cur, { download: true })).toBe(false);
    expect(isNavClick("/admin/tables", cur, { modifier: true })).toBe(false);
    expect(isNavClick("/admin/tables", cur, { button: 1 })).toBe(false);
    expect(isNavClick("https://other.com/a", cur)).toBe(false);
    expect(isNavClick("/api/admin/export", cur)).toBe(false);
    expect(isNavClick("tel:010", cur)).toBe(false);
    expect(isNavClick(null, cur)).toBe(false);
  });
});
