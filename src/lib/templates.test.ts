import { describe, expect, it } from "vitest";
import { fmtSlot } from "./format";
import { SAMPLE_VARS, TEMPLATES, type TemplateKey, render, slotVars, venueInfo } from "./templates";

describe("알림 템플릿 (G10)", () => {
  it("날짜·시각은 fmtSlot과 같은 표기로 들어간다", () => {
    const iso = "2026-11-06T10:30:00Z";
    const m = render("confirmed", { ...slotVars(iso), region: "홍대·합정·연남" });
    expect(m.body.startsWith(`${fmtSlot(iso)} 홍대·합정·연남에서 만나요`)).toBe(true);
    expect(fmtSlot(iso)).toBe("11월 6일(금) 저녁 7:30");
  });

  it("14장 알림 중 재배치 중·환불 요청·환불 완료 템플릿이 있고, 다음에 할 일을 알려 준다", () => {
    for (const k of ["reallocating", "reallocated", "refund_requested", "refunded", "refund_retry", "refund_failed", "venue_changed"] as TemplateKey[]) {
      expect(TEMPLATES[k]).toBeTruthy();
    }
    expect(render("reallocating", SAMPLE_VARS).body).toContain("지금은 하실 일이 없어요");
    expect(render("reallocated", SAMPLE_VARS).body).toContain("다른 방법 고르기");
    expect(render("refund_requested", SAMPLE_VARS).body).toContain("9,900원");
  });

  it("예시 값으로 채우면 모든 템플릿에 빈 {자리}가 남지 않는다", () => {
    for (const k of Object.keys(TEMPLATES) as TemplateKey[]) {
      const m = render(k, SAMPLE_VARS);
      expect(`${m.title}${m.body}`).not.toMatch(/\{\w+\}/);
    }
  });

  it("확정 알림에 식당명·집합 시간·단체방 안내가 들어가고, 식당이 아직이면 언제 알려 주는지 쓴다", () => {
    const iso = "2026-11-06T10:30:00Z";
    const withVenue = render("confirmed", { ...slotVars(iso), region: "홍대·합정·연남", venue: "홍대 둥근식탁", venue_info: venueInfo("홍대 둥근식탁", "우연한식탁 2032") }).body;
    expect(withVenue).toContain("저녁 7:30 홍대·합정·연남 홍대 둥근식탁에서 만나요");
    expect(withVenue).toContain("예약명은 '우연한식탁 2032'");
    expect(withVenue).toContain("단체방");
    const noVenue = render("confirmed", { ...slotVars(iso), region: "홍대·합정·연남", venue: "", venue_info: venueInfo(null, null) }).body;
    expect(noVenue).toContain("홍대·합정·연남에서 만나요");
    expect(noVenue).toContain("식당은 정해지는 대로");
  });

  it("14장 알림 11개 시점마다 템플릿이 있다", () => {
    const need: TemplateKey[] = ["applied", "payment_pending", "paid", "reallocating", "confirmed", "alternative", "transferred", "refund_requested", "refunded", "reminder", "feedback", "next_round"];
    for (const k of need) expect(TEMPLATES[k], k).toBeTruthy();
    expect(render("applied", SAMPLE_VARS).body).toMatch(/내 신청 화면에서 취소하고 다시 신청/);
    expect(render("feedback", SAMPLE_VARS).body).toContain("신고");
  });
});
