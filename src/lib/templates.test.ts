import { describe, expect, it } from "vitest";
import { fmtSlot } from "./format";
import { QUIET_TEMPLATES, SAMPLE_VARS, TEMPLATES, type TemplateKey, render, reservationLine, slotVars } from "./templates";

describe("알림 템플릿 (G10)", () => {
  it("날짜·시각은 fmtSlot과 같은 표기로 들어간다", () => {
    const iso = "2026-11-06T10:30:00Z";
    const m = render("confirmed", { ...slotVars(iso), region: "홍대·합정·연남" });
    expect(m.body.startsWith(`${fmtSlot(iso)} · 홍대·합정·연남`)).toBe(true);
    expect(fmtSlot(iso)).toBe("11월 6일(금) 저녁 7:30");
  });

  it("14장 알림 중 재배치 중·환불 요청·환불 완료 템플릿이 있고, 다음에 할 일을 알려 준다", () => {
    for (const k of ["reallocating", "reallocated", "refund_requested", "refunded", "refund_retry", "refund_failed", "venue_changed"] as TemplateKey[]) {
      expect(TEMPLATES[k]).toBeTruthy();
    }
    expect(render("reallocating", SAMPLE_VARS).body).toContain("알려 드릴게요");
    expect(render("reallocated", SAMPLE_VARS).body).toContain("홍대·합정·연남");
    expect(render("refund_requested", SAMPLE_VARS).body).toContain("9,900원");
    // 참가자가 할 일이 없는 안내는 휴대폰 푸시 없이 알림함에만
    for (const k of ["reallocating", "refund_requested", "refund_retry", "applied", "paid"]) expect(QUIET_TEMPLATES.has(k), k).toBe(true);
    for (const k of ["confirmed", "alternative", "reminder", "reallocated", "refunded", "feedback"]) expect(QUIET_TEMPLATES.has(k), k).toBe(false);
  });

  it("예시 값으로 채우면 모든 템플릿에 빈 {자리}가 남지 않는다", () => {
    for (const k of Object.keys(TEMPLATES) as TemplateKey[]) {
      const m = render(k, SAMPLE_VARS);
      expect(`${m.title}${m.body}`).not.toMatch(/\{\w+\}/);
    }
  });

  it("확정 알림은 한 줄로 날짜·시각·동네·식당만 쓴다 (자세한 건 눌러서 모임 정보에서)", () => {
    const iso = "2026-11-06T10:30:00Z";
    expect(render("confirmed", { ...slotVars(iso), region: "홍대·합정·연남", venue: "홍대 둥근식탁" }).body).toBe("11월 6일(금) 저녁 7:30 · 홍대·합정·연남 홍대 둥근식탁");
    expect(render("confirmed", { ...slotVars(iso), region: "홍대·합정·연남", venue: "" }).body).toBe("11월 6일(금) 저녁 7:30 · 홍대·합정·연남");
  });

  it("알림 본문은 모두 한 줄 요약이다 (예시 값으로 45자 이하)", () => {
    for (const k of Object.keys(TEMPLATES) as TemplateKey[]) {
      if (k === "reminder_chat") continue; // 단체방 공지는 자세히 둔다
      const b = render(k, SAMPLE_VARS).body;
      expect(b.length, `${k}: ${b}`).toBeLessThanOrEqual(45);
      expect(b, k).not.toContain("\n");
    }
  });

  it("14장 알림 11개 시점마다 템플릿이 있다", () => {
    const need: TemplateKey[] = ["applied", "payment_pending", "paid", "reallocating", "confirmed", "alternative", "transferred", "refund_requested", "refunded", "reminder", "feedback", "next_round"];
    for (const k of need) expect(TEMPLATES[k], k).toBeTruthy();
    expect(render("applied", SAMPLE_VARS).body).toContain("결제");
    expect(render("feedback", SAMPLE_VARS).body).toContain("후기");
  });

  it("하루 전 푸시에 시각·식당·예약명이 들어가고(INF-07), 식당이 없으면 모임 정보로 안내한다", () => {
    expect(render("reminder", SAMPLE_VARS).body).toBe("저녁 7:30 · 홍대 둥근식탁 · 예약명 '우연한식탁 2032'");
    expect(render("reminder", { ...SAMPLE_VARS, venue: "식당은 모임 정보에서", reservation: "" }).body).toBe("저녁 7:30 · 식당은 모임 정보에서");
    expect(render("reminder", SAMPLE_VARS).title).toContain("당일 취소");
  });

  it("단체방 하루 전 공지: 식당이 없으면 빈 예약명 대신 테이블 화면을 안내한다", () => {
    const base = { ...SAMPLE_VARS, region: "홍대·합정·연남" };
    expect(render("reminder_chat", { ...base, reservation_line: reservationLine("우연한식탁 2032") }).body).toContain("홍대 둥근식탁에서 만나요. 예약명은 '우연한식탁 2032'이에요.");
    const none = render("reminder_chat", { ...base, venue: "", reservation: "", reservation_line: reservationLine(null) }).body;
    expect(none).toContain("홍대·합정·연남에서 만나요. 식당과 예약명은 모임 정보에서 확인해 주세요.");
    expect(none).not.toContain("''");
  });
});
