import { describe, expect, it } from "vitest";
import { botsNeeded, chooseBots, makeBot, nextGender } from "./join";
import { arrivalMinutes, hasBatchim, iyeyo, josa, persona } from "./persona";
import { beforeAnchor, greetFirst, phaseOpen, pickNoShow, pickQa, planReplies, planTable, spreadTimes } from "./plan";
import { categoryWord, ARRIVE_EARLY, ARRIVE_ON_TIME, BYE, DAY_MENU, DAY_PLAN, DAY_QA, GREET, GREET_MORE, LATE_ARRIVE, LATE_WARN, clockWord, intents, qaTopics, replyTo, reviewFor } from "./scripts";

const P = (id: string, mbti: string | null, traits: string[] = [], name = "김서연") => persona({ id, name }, { job: "디자이너", mbti, interests: ["여행", "커피", "책"], my_traits: traits, gender: "F", birth_year: 1996 });
const start = Date.parse("2026-11-13T19:30:00+09:00");
const end = Date.parse("2026-11-13T22:00:00+09:00");
const ctx = { region: "홍대·합정·연남", venue: "연남 소반", category: "한식 주점", startMs: start, humans: ["강우진"] };

describe("persona", () => {
  it("같은 사람이면 늘 같은 성격", () => {
    expect(P("u1", "ENFP")).toEqual(P("u1", "ENFP"));
  });
  it("E·에너지 넘치는 사람은 말이 많고, I·차분한 사람은 아니다", () => {
    const loud = Array.from({ length: 20 }, (_, i) => P(`e${i}`, "ENFP", ["에너지 넘치는", "유쾌한"]).tone);
    const calm = Array.from({ length: 20 }, (_, i) => P(`i${i}`, "ISTJ", ["차분한", "진지한"]).tone);
    expect(loud.filter((t) => t === "chatty").length).toBeGreaterThan(14);
    expect(calm.filter((t) => t === "chatty").length).toBe(0);
  });
  it("도착 습관에 맞는 도착 시각", () => {
    for (let i = 0; i < 40; i++) {
      const p = P(`a${i}`, null);
      const m = arrivalMinutes(p);
      if (p.arrival === "early") expect(m).toBeLessThan(-6);
      if (p.arrival === "late") expect(m).toBeGreaterThan(5);
    }
  });
  it("받침에 맞는 조사", () => {
    expect(hasBatchim("서연")).toBe(true);
    expect(iyeyo("지우")).toBe("지우예요");
    expect(iyeyo("서연")).toBe("서연이에요");
    expect(josa("개발자", "으로")).toBe("개발자로");
    expect(josa("연구원", "으로")).toBe("연구원으로");
    expect(josa("PD", "으로")).toBe("PD로");
  });
});

describe("scripts", () => {
  it("상황마다 대사가 5개 이상", () => {
    for (const pool of [GREET, GREET_MORE, DAY_PLAN, DAY_MENU, ARRIVE_EARLY, ARRIVE_ON_TIME, LATE_WARN, LATE_ARRIVE, BYE]) expect(pool.length).toBeGreaterThanOrEqual(5);
    expect(DAY_QA.length).toBeGreaterThanOrEqual(5);
  });
  it("이모지를 쓰지 않는다", () => {
    const people = Array.from({ length: 30 }, (_, i) => P(`s${i}`, i % 2 ? "ENFP" : "INTJ", i % 3 ? ["유쾌한"] : ["차분한"]));
    const plan = people.slice(0, 5).flatMap((_, k) => planTable({ tableId: `t${k}`, bots: people.slice(k * 5, k * 5 + 5), ctx, startMs: start, endMs: end, noticeAt: start - 3 * 86400_000, noShow: null }));
    for (const m of plan) expect(m.body).not.toMatch(/\p{Extended_Pictographic}/u);
  });
  it("업종 괄호는 뺀다", () => {
    expect(categoryWord("아메리칸 양식(버거·바비큐)")).toBe("아메리칸 양식");
    expect(categoryWord(null)).toBeNull();
  });
  it("19:30은 7시 반", () => {
    expect(clockWord(start)).toBe("7시 반");
  });
  it("뜻 짐작: 인사 + 몇 시", () => {
    expect(intents("안녕하세요 다들 몇 시쯤 오세요?")).toEqual(["greet", "time"]);
    expect(intents("조금 늦을 것 같아요")).toEqual(["late"]);
    expect(intents("오늘 고마웠어요")).toEqual(["thanks"]);
    expect(intents("거기 매운 메뉴 있나요?")).toEqual(["menu"]);
    expect(intents("요즘 날씨 좋네요")).toEqual(["other"]);
  });
  it("인사+몇 시에는 인사와 도착 시각으로 답한다", () => {
    const p = P("r1", "ENFP");
    const s = replyTo(p, "안녕하세요 다들 몇 시쯤 오세요?", ctx, "m1", 0);
    expect(s).toMatch(/안녕|반가|반갑/);
    expect(s.match(/ㅎㅎ/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(s).toMatch(/\d+시/);
  });
  it("후한 사람은 점수가 높다", () => {
    const warm = persona({ id: "w", name: "이다인" }, { my_traits: ["다정한", "리액션 좋은"], mbti: "ENFJ" });
    const strict = persona({ id: "w", name: "이다인" }, { my_traits: ["솔직한", "진지한"], mbti: "ISTJ" });
    expect(reviewFor(warm, "t").mood).toBeGreaterThanOrEqual(reviewFor(strict, "t").mood);
    const r = reviewFor(warm, "t");
    for (const v of [r.mood, r.talk, r.venue, r.rejoin, r.recommend]) expect(v).toBeGreaterThanOrEqual(1), expect(v).toBeLessThanOrEqual(5);
  });
});

describe("plan", () => {
  const bots = ["b1", "b2", "b3"].map((id, i) => P(id, i ? "INFP" : "ENFP", [], ["김민준", "이서윤", "박도윤"][i]));
  const base = { tableId: "tbl", bots, ctx, startMs: start, endMs: end, noticeAt: start - 3 * 86400_000, noShow: "b3" };
  it("단계마다 메시지가 있고 키가 겹치지 않는다", () => {
    const plan = planTable(base);
    const phases = new Set(plan.map((m) => m.phase));
    for (const ph of ["hello", "daybefore", "arrive", "bye"]) expect(phases.has(ph as never)).toBe(true);
    // 모임 중엔 마주 앉아 있으니 대화 주제에 채팅으로 답하지 않는다
    expect(phases.has("topic" as never)).toBe(false);
    expect(new Set(plan.map((m) => m.key)).size).toBe(plan.length);
    // 같은 말이 겹치지 않는다 (이름만 다른 같은 틀도)
    expect(new Set(plan.map((m) => m.body)).size).toBe(plan.length);
    const greet = plan.filter((m) => m.phase === "hello" && m.key.endsWith(":1")).map((m) => m.body.replace(/민준|서윤|도윤/g, "X"));
    expect(new Set(greet).size).toBe(greet.length);
  });
  it("인사는 확정 공지 뒤, 하루 전 대화는 시작 24~23시간 전, 끝인사는 끝난 뒤", () => {
    const plan = planTable(base);
    for (const m of plan) {
      if (m.phase === "hello") expect(m.due).toBeGreaterThan(base.noticeAt);
      if (m.phase === "daybefore") expect(m.due).toBeGreaterThan(start - 24 * 3600_000), expect(m.due).toBeLessThan(start - 23 * 3600_000);
      if (m.phase === "bye") expect(m.due).toBeGreaterThanOrEqual(end);
    }
  });
  it("안 오는 사람은 모임 날 말이 없다", () => {
    const plan = planTable(base);
    expect(plan.filter((m) => m.userId === "b3" && ["arrive", "bye"].includes(m.phase))).toEqual([]);
  });
  it("같은 입력이면 같은 계획 (몇 번 돌려도 한 번만 올라가게)", () => {
    expect(planTable(base)).toEqual(planTable(base));
  });
  it("공지가 없으면 인사도 없다", () => {
    const plan = planTable({ ...base, noticeAt: null });
    expect(plan.some((m) => m.phase === "hello")).toBe(false);
  });
  it("모임 중 답장: 현장 얘기(늦음·도착·자리)에만 한 명이, 대화 주제 같은 말엔 답하지 않는다", () => {
    expect(planReplies("s1", "저는 2번 주제 좋아요! 여행 얘기 해요", bots, ctx, undefined, undefined, true)).toEqual([]);
    expect(planReplies("s2", "아이스브레이킹 누가 먼저 할래요?", bots, ctx, undefined, undefined, true)).toEqual([]);
    const late = planReplies("s3", "조금 늦을 것 같아요", bots, ctx, undefined, undefined, true);
    expect(late).toHaveLength(1);
    expect(late[0].body.length).toBeGreaterThan(0);
    const where = planReplies("s4", "안녕하세요 다들 어디 앉으셨어요?", bots, ctx, undefined, undefined, true);
    expect(where).toHaveLength(1);
    expect(where[0].body).not.toMatch(/안녕|반가/);
  });
  it("단계가 지나면 올리지 않는다", () => {
    expect(phaseOpen("hello", start + 1, start, end)).toBe(false);
    expect(phaseOpen("arrive", start + 60_000, start, end)).toBe(true);
    expect(phaseOpen("bye", end + 25 * 3600_000, start, end)).toBe(false);
  });
  it("답장: 질문엔 둘, 봇 말 순서·키가 정해진다", () => {
    const r = planReplies("m1", "안녕하세요 다들 몇 시쯤 오세요?", bots, ctx);
    expect(r).toHaveLength(2);
    expect(r[0].userId).not.toBe(r[1].userId);
    expect(r[0].delayMs).toBeLessThan(r[1].delayMs);
    expect(planReplies("m2", "네", bots.slice(0, 1), ctx)).toHaveLength(1);
    expect(planReplies("m3", "아무 말", [], ctx)).toEqual([]);
  });
  it("확정 인사를 안 한 봇은 답하기 전에 인사부터 (모임 시작 전까지만)", () => {
    const plan = planTable(base);
    const hello = plan.find((m) => m.userId === "b1" && m.key.endsWith(":hello:1"))!;
    const before = start - 2 * 86400_000;
    expect(greetFirst(plan, new Set(), "b1", before, start, end)).toEqual(hello);
    expect(greetFirst(plan, new Set([hello.key]), "b1", before, start, end)).toBeNull();
    expect(greetFirst(plan, new Set(), "b1", start + 60_000, start, end)).toBeNull();
    expect(greetFirst(planTable({ ...base, noticeAt: null }), new Set(), "b1", before, start, end)).toBeNull();
  });
  it("인사를 먼저 하는 봇은 답에서 또 인사하지 않고, 인사뿐인 말엔 따로 답하지 않는다", () => {
    const g = new Set(bots.map((b) => b.userId));
    for (const r of planReplies("m9", "안녕하세요 다들 몇 시쯤 오세요?", bots, ctx, undefined, g)) {
      expect(r.body).not.toMatch(/안녕|반가/);
      expect(r.body.length).toBeGreaterThan(0);
    }
    for (const r of planReplies("m10", "안녕하세요!", bots, ctx, undefined, g)) expect(r.body).toBe("");
  });
  it("질문 주제: 사람이 매운 걸 물었으면 봇은 매운 걸 다시 묻지 않는다", () => {
    expect([...qaTopics(["매운 거 잘 드세요?"])]).toEqual(["spicy"]);
    expect([...qaTopics(["몇 번 출구로 나가요?", "주차 되나요"])].sort()).toEqual(["parking", "way"]);
    expect(qaTopics(["오늘 날씨 좋네요"]).size).toBe(0);
    const all = new Set(DAY_QA.map((x) => x.topic));
    for (let r = 0; r < 1; r += 0.05) {
      expect(pickQa(r, new Set(["spicy"]))?.topic).not.toBe("spicy");
      expect(pickQa(r, all)).toBeNull();
    }
    // 이미 올라간 질문은 그 짝을 그대로 (답이 어긋나지 않게)
    expect(pickQa(0, new Set(["spicy"]), DAY_QA[0].q)).toBe(DAY_QA[0]);
    // 겹치지 않으면 원래 고르던 질문 그대로
    expect(pickQa(0.99, new Set(["spicy"]))).toBe(DAY_QA[DAY_QA.length - 1]);
  });
  it("계획: 사람이 물은 주제의 질문과 그 답은 빠진다", () => {
    for (let k = 0; k < 20; k++) {
      const plan = planTable({ ...base, tableId: `qa${k}`, askedTopics: new Set(["spicy"]) });
      expect(plan.some((m) => /매운/.test(m.body) && m.phase === "daybefore")).toBe(false);
    }
  });
  it("노쇼는 많아야 한 명, 봇이 둘 이상일 때만", () => {
    expect(pickNoShow("t", ["a"])).toBeNull();
    const picks = Array.from({ length: 30 }, (_, i) => pickNoShow(`t${i}`, ["a", "b", "c"]));
    expect(picks.some((x) => x === null)).toBe(true);
    expect(picks.some((x) => x !== null)).toBe(true);
    for (const x of picks) if (x) expect(["a", "b", "c"]).toContain(x);
  });
});

describe("spreadTimes", () => {
  it("몰린 메시지를 마지막 메시지와 지금 사이에 순서대로 펼친다", () => {
    const out = spreadTimes([0, 10, 20], 1_000_000, 1_300_000);
    expect(out[0]).toBeGreaterThan(1_000_000);
    expect(out[1]).toBeGreaterThan(out[0]);
    expect(out[2]).toBeLessThanOrEqual(1_300_000);
  });
  it("원래 시각이 범위 안이면 그대로", () => {
    expect(spreadTimes([1_100_000, 1_200_000], 1_000_000, 1_300_000)).toEqual([1_100_000, 1_200_000]);
  });
  it("지금을 넘지 않고, 겹치지 않는다", () => {
    const out = spreadTimes([5, 6, 7, 8], 1000, 2000);
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1]);
    expect(Math.max(...out)).toBeLessThanOrEqual(1000 + 4 * 1000);
  });
});

describe("join", () => {
  const me = { birth_year: 1997, gender: "M" as const, interests: ["커리어", "맛집 탐방"], price_range: "2만 원대" };
  it("최소 인원까지만 채운다. 여러 일정을 고른 사람·나이가 먼 사람은 덜 센다", () => {
    expect(botsNeeded(1997, [])).toBe(3);
    expect(botsNeeded(1997, [{ birth_year: 1996, slots: 1 }, { birth_year: 1998, slots: 1 }])).toBe(1);
    // 여러 일정을 고른 세 명은 덜 세지만, 다 남아도 6명을 넘지 않게 둘만
    expect(botsNeeded(1997, [1, 2, 3].map(() => ({ birth_year: 1995, slots: 4 })))).toBe(2);
    expect(botsNeeded(1997, [1].map(() => ({ birth_year: 1995, slots: 4 })))).toBe(3);
    expect(botsNeeded(1997, [1, 2, 3, 4].map(() => ({ birth_year: 1996, slots: 1 })))).toBe(0);
    expect(botsNeeded(1997, [{ birth_year: 1985, slots: 1 }])).toBe(3);
  });
  it("성비를 맞춘다", () => {
    expect(nextGender(["M"])).toBe("F");
    expect(nextGender(["M", "F"])).toBe("M");
  });
  it("나이가 먼 봇은 고르지 않고, 관심사가 겹치고 성별이 맞는 봇부터", () => {
    const c = (id: string, by: number, g: "M" | "F", interests: string[]) => ({ userId: id, profile: { birth_year: by, gender: g, interests, price_range: null } });
    const got = chooseBots(me, [c("old", 1985, "F", ["커리어"]), c("f1", 1998, "F", ["맛집 탐방", "여행"]), c("f2", 1996, "F", ["게임"]), c("m1", 1997, "M", ["커리어"])], 3, ["M"], "s");
    expect(got.map((x) => x.userId)).not.toContain("old");
    expect(got[0].userId).toBe("f1");
    expect(got).toHaveLength(3);
  });
  it("새 봇은 나이 ±3, 관심사 1~2개 겹침", () => {
    for (let i = 0; i < 20; i++) {
      const b = makeBot(me, i % 2 ? "F" : "M", `s${i}`);
      expect(Math.abs(b.profile.birth_year - me.birth_year)).toBeLessThanOrEqual(3);
      const o = b.profile.interests.filter((x) => me.interests.includes(x)).length;
      expect(o).toBeGreaterThanOrEqual(1);
      expect(o).toBeLessThanOrEqual(2);
      expect(b.profile.interests).toHaveLength(3);
      expect(b.name).toHaveLength(3);
    }
  });
});

describe("시작 전 봇 말은 대화 주제 공지 앞에", () => {
  it("공지 바로 앞이 좁아도 모두 공지보다 앞, 순서대로", () => {
    const anchor = 1_000_000;
    // 앞 메시지가 공지 0.5초 전이고, 끼워 넣을 말이 3개
    const at = beforeAnchor([anchor + 5000, anchor + 9000, anchor + 2000], anchor - 500, anchor);
    expect(at).toHaveLength(3);
    for (const x of at) expect(x).toBeLessThan(anchor);
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1]);
  });
  it("여유가 있으면 원래 시각을 지킨다", () => {
    const anchor = 10_000_000;
    expect(beforeAnchor([anchor - 600_000], anchor - 3_600_000, anchor)[0]).toBe(anchor - 600_000);
  });
});
