// 시연용 봇 대사. 상황마다 여러 가지를 두고 사람(seed)마다 다르게 고른다. 같은 테이블에서 같은 말이 겹치지 않게 used로 거른다.
// 이모지는 쓰지 않고, 말끝을 '~요/~네요/~어요'로 섞고 'ㅎㅎ'는 가끔만 붙인다.
import { type Persona, type Tone, arrivalMinutes, hasBatchim, iyeyo, josa, rand } from "./persona";

export type Ctx = {
  /** 슬롯 동네 이름 (홍대·합정·연남) */
  region: string;
  venue: string | null;
  category: string | null;
  startMs: number;
  /** 사람(봇이 아닌 참가자) 이름 */
  humans: string[];
};

type Line = { tones?: Tone[]; f: (p: Persona, c: Ctx) => string | null };

const KST = 9 * 3600_000;
/** 19:30 → '7시 반', 19:20 → '7시 20분' */
export function clockWord(ms: number): string {
  const d = new Date(ms + KST);
  const h = d.getUTCHours() % 12 || 12;
  const m = d.getUTCMinutes();
  return m === 0 ? `${h}시` : m === 30 ? `${h}시 반` : `${h}시 ${m}분`;
}
/** 도착 시각을 5분 단위로 둥글게 (사람은 '7시 23분'이라고 안 한다) */
export function arriveWord(p: Persona, startMs: number): string {
  const at = startMs + arrivalMinutes(p) * 60_000;
  return clockWord(Math.round(at / 300_000) * 300_000);
}
export function dayWord(ms: number): string {
  return ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][new Date(ms + KST).getUTCDay()];
}
const shortRegion = (r: string) => r.split("·")[0];
/** '아메리칸 양식(버거·바비큐)' → '아메리칸 양식'. 사람은 괄호까지 읽지 않는다 */
export const categoryWord = (c: string | null) => (c ? c.replace(/\s*\(.*?\)\s*/g, " ").trim() || null : null);
const pickInterest = (p: Persona) => p.interests[0] ?? null;
const human = (p: Persona, c: Ctx, key: string) => (c.humans.length ? c.humans[Math.floor(rand(p.seed, key) * c.humans.length)] : null);
const humanFirst = (name: string | null) => (name ? (name.length >= 3 ? name.slice(1) : name) : null);
const irago = (w: string) => `${w}${hasBatchim(w) ? "이라고" : "라고"}`;

/** 말투를 입힌다: 웃음 많은 사람은 가끔 'ㅎㅎ', 짧게 말하는 사람은 느낌표를 덜 쓴다 */
export function shape(p: Persona, text: string, key: string): string {
  let s = text.trim();
  if (p.tone === "brief") s = s.replace(/!+$/, "");
  if (p.laugh && !/ㅎ|ㅠ|\?$/.test(s) && rand(p.seed, `laugh:${key}`) < (p.tone === "chatty" ? 0.4 : 0.25)) s = `${s.replace(/[!.]+$/, "")} ㅎㅎ`;
  return s;
}

/** 말투에 맞는 후보 가운데 seed 순서로 하나. 같은 테이블에서 이미 나온 말(used)은 건너뛴다 */
export function pick(pool: Line[], p: Persona, c: Ctx, key: string, used?: Set<string>): string | null {
  const ok = pool
    .map((l, i) => ({ i, l }))
    .filter(({ l }) => !l.tones || l.tones.includes(p.tone))
    .map(({ i, l }) => ({ i, s: l.f(p, c) }))
    .filter((x): x is { i: number; s: string } => Boolean(x.s))
    .sort((a, b) => rand(p.seed, `${key}:${a.i}`) - rand(p.seed, `${key}:${b.i}`));
  // 같은 틀(이름만 다른 문장)도 겹치지 않게 틀 번호로도 거른다
  const tag = (i: number) => `#${key.split(":").slice(-1)[0]}:${i}`;
  const hit = ok.find((x) => !used?.has(x.s) && !used?.has(tag(x.i))) ?? ok[0];
  if (!hit) return null;
  used?.add(hit.s);
  used?.add(tag(hit.i));
  return shape(p, hit.s, key);
}

// ── (a) 확정 직후 인사 ──
export const GREET: Line[] = [
  { tones: ["chatty"], f: (p) => (p.job ? `안녕하세요! ${iyeyo(p.first)} ${josa(p.job, "으로")} 일하고 있어요. 이런 모임은 처음인데 벌써 기대돼요` : null) },
  { tones: ["chatty"], f: (p, c) => (pickInterest(p) ? `반가워요 다들! 저는 ${irago(p.first)} 해요. ${pickInterest(p)} 좋아하시는 분 있으면 ${dayWord(c.startMs)}에 얘기 많이 나눠요` : null) },
  { tones: ["chatty"], f: (p) => `와 드디어 확정됐네요. 안녕하세요, ${p.job ? `${p.job} ` : ""}${p.first}입니다! 잘 부탁드려요` },
  { tones: ["chatty"], f: (p) => (pickInterest(p) ? `안녕하세요~ ${iyeyo(p.first)}. 요즘 ${pickInterest(p)}에 푹 빠져 있어서 그 얘기 나오면 신날 것 같아요` : null) },
  { tones: ["chatty", "polite"], f: (p, c) => `다들 반갑습니다! ${shortRegion(c.region)}에서 만나는 거 좋네요. 저 그 동네 자주 가요` },
  { tones: ["polite"], f: (p) => (p.job ? `안녕하세요. ${josa(p.job, "으로")} 일하는 ${p.first}입니다. 잘 부탁드려요` : null) },
  { tones: ["polite"], f: (p, c) => `처음 뵙겠습니다, ${iyeyo(p.name)}. ${dayWord(c.startMs)}에 뵐게요` },
  { tones: ["polite"], f: (p) => `안녕하세요, ${irago(p.first)} 합니다. 어떤 분들일지 궁금하네요` },
  { tones: ["polite", "brief"], f: (p) => `반갑습니다. ${iyeyo(p.first)} 낯을 조금 가리는데 금방 풀려요` },
  { tones: ["brief"], f: (p) => `안녕하세요 ${p.first}입니다` },
  { tones: ["brief"], f: () => `반갑습니다! 잘 부탁드려요` },
  { tones: ["brief"], f: (p, c) => `안녕하세요~ ${dayWord(c.startMs)}에 봬요` },
];

export const GREET_MORE: Line[] = [
  { f: (p) => (pickInterest(p) ? `혹시 ${pickInterest(p)} 좋아하시는 분 계세요?` : null) },
  { f: () => `퇴근하고 바로 가는 거라 엄청 배고픈 상태로 갈 것 같아요` },
  { f: (p, c) => `${shortRegion(c.region)} 근처는 좀 알아서 끝나고 갈 데 필요하면 말씀하세요` },
  { f: () => `다들 무슨 일 하시는지 궁금하네요. 그날 천천히 얘기해요` },
  { f: (p, c) => `${dayWord(c.startMs)}까지 열심히 버텨 볼게요` },
  { f: () => `단체방이 먼저 있으니까 확실히 덜 어색하네요` },
];

// ── (b) 하루 전 ──
export const DAY_PLAN: Line[] = [
  { f: (p, c) => `내일 뵙겠네요! 저는 퇴근하고 바로 가면 ${arriveWord(p, c.startMs)}쯤 도착할 것 같아요` },
  { f: () => `내일이네요. 저녁에 쌀쌀하다니까 다들 따뜻하게 입고 오세요` },
  { f: () => `벌써 내일이라니 일주일이 금방 갔네요` },
  { f: (p, c) => (c.venue ? `내일 ${c.venue} 가는 거 맞죠? 지도 미리 저장해 뒀어요` : null) },
  { f: (p) => (p.arrival === "early" ? `저 내일 일이 일찍 끝나서 조금 먼저 가 있을 수도 있어요` : null) },
  { f: () => `내일 회사 끝나자마자 바로 갈게요` },
];

export const DAY_MENU: Line[] = [
  { f: (p, c) => (c.venue && c.category ? `${c.venue} 찾아봤는데 ${c.category} 평이 꽤 좋더라고요` : null) },
  { f: () => `리뷰 보니까 다들 시키는 메뉴가 있던데 그거 하나는 꼭 먹어 봐요` },
  { f: (p, c) => (c.category ? `${c.category}${hasBatchim(c.category) ? "이라니" : "라니"} 좋네요. 저는 아무거나 잘 먹어요` : null) },
  { f: () => `사진 보니까 분위기 괜찮아 보여요. 너무 시끄럽지만 않으면 좋겠네요` },
  { f: () => `가게 사진 봤는데 테이블이 넓어 보여서 좋네요` },
];

/** 하루 전 질문과 다른 봇의 답. 짝으로 쓴다 */
export const DAY_QA: { q: string; a: (p: Persona, c: Ctx) => string }[] = [
  { q: "혹시 다들 매운 거 잘 드세요?", a: () => "저는 적당히는 먹어요. 너무 매운 건 좀 힘들어요" },
  { q: "역에서 가까운가요? 몇 번 출구로 나가면 되는지 아시는 분", a: () => "지도 보니까 역에서 걸어서 5분 정도더라고요. 모임 정보에 지도 링크 있어요" },
  { q: "도착하면 예약명 말하면 되는 거죠?", a: () => "네 위에 공지에 있는 예약명 말하면 된대요" },
  { q: "내일 술도 한잔하시나요?", a: () => "저는 한두 잔 정도는 좋아요" },
  { q: "다들 내일 몇 시쯤 오세요?", a: (p, c) => `저는 ${arriveWord(p, c.startMs)}쯤이요` },
  { q: "혹시 주차되는지 아시는 분 있나요?", a: () => "근처에 공영주차장이 있긴 한데 지하철이 편할 거예요" },
];

// ── (c) 모임 시작 ──
export const ARRIVE_EARLY: Line[] = [
  { f: () => `먼저 도착했어요. 안쪽 자리에 앉아 있을게요` },
  { f: () => `저 도착해서 자리 잡았어요! 예약명 말하니까 바로 안내해 주시네요` },
  { f: () => `일찍 와 버렸네요. 천천히 오세요` },
  { f: () => `도착했어요! 창가 쪽 테이블이에요` },
  { f: () => `저 먼저 와 있어요. 메뉴판 보면서 기다릴게요` },
];
export const ARRIVE_ON_TIME: Line[] = [
  { f: () => `저 지금 들어가요` },
  { f: () => `거의 다 왔어요! 1분이요` },
  { f: () => `도착했어요` },
  { f: () => `입구예요. 들어갈게요` },
  { f: () => `방금 도착했어요. 어디쯤 앉으셨어요?` },
];
export const LATE_WARN: Line[] = [
  { f: (p) => `죄송해요 지하철이 좀 밀려서 ${Math.max(5, arrivalMinutes(p))}분 정도 늦을 것 같아요. 먼저 시키고 계세요!` },
  { f: () => `퇴근이 늦어져서 조금 늦어요ㅠ 금방 갈게요` },
  { f: () => `버스를 잘못 타서요… 10분만 기다려 주세요` },
  { f: () => `조금 늦어요! 제 건 아무거나 시켜 주셔도 돼요` },
  { f: (p) => `${Math.max(5, arrivalMinutes(p))}분 정도 늦을 것 같아요. 죄송해요` },
];
export const LATE_ARRIVE: Line[] = [
  { f: () => `도착했어요! 늦어서 죄송해요` },
  { f: () => `다 오셨네요. 지금 들어가요` },
  { f: () => `드디어 도착했어요. 바로 들어갈게요` },
  { f: () => `저 왔어요! 기다려 주셔서 감사해요` },
  { f: () => `도착했습니다. 어디 앉으셨어요?` },
];

const TOPIC_HINT: [RegExp, (n: number) => string][] = [
  [/여행/, (n) => `${n}번 보니까 작년에 갔던 여행 생각나네요. 다음 여행지 추천도 받고 싶어요`],
  [/맛집|음식|먹/, () => `맛집 얘기는 자신 있어요. 오늘 끝나고 갈 만한 데도 알아요`],
  [/영화|드라마|넷플/, () => `요즘 보는 드라마가 있는데 이따 추천할게요`],
  [/운동|러닝|등산|요가|클라이밍/, () => `저 요즘 주말마다 뛰는데 같이 하실 분 있으면 좋겠어요`],
  [/책|독서/, () => `요즘 읽는 책이 있는데 마침 얘기하고 싶었어요`],
  [/일|커리어|직장|회사/, () => `일 얘기는 다들 할 말 많을 것 같아요`],
  [/음악|공연|노래/, () => `요즘 자주 듣는 노래 있는데 이따 들려 드릴게요`],
];

/** 시스템이 올린 대화 주제(번호 목록) 가운데 하나에 답한다 */
export function topicReply(p: Persona, topics: string[], key: string, used?: Set<string>): string | null {
  if (!topics.length) return null;
  const n = 1 + Math.floor(rand(p.seed, `topic:${key}`) * topics.length);
  const hint = TOPIC_HINT.find(([re]) => re.test(topics[n - 1]))?.[1](n);
  const pool: Line[] = [
    ...(hint ? [{ f: () => hint }, { f: () => hint }] : []),
    { f: (q) => (pickInterest(q) ? `${n}번 주제 좋네요. 저는 요즘 ${pickInterest(q)} 얘기면 끝도 없이 할 수 있어요` : null) },
    { f: () => `저 ${n}번부터 얘기해 보고 싶어요. 다들 어떠세요?` },
    { f: () => `아이스브레이킹 재밌겠네요. 제가 먼저 해 볼게요` },
    { f: () => `${n}번 질문 보자마자 생각난 게 있어요. 이따 얘기할게요` },
    { f: () => `오 ${n}번은 저 할 말 많아요` },
    { f: () => `대화 주제가 있으니까 확실히 덜 어색하네요` },
  ];
  return pick(pool, p, { region: "", venue: null, category: null, startMs: 0, humans: [] }, `topic:${key}:topic`, used);
}

// ── (d) 끝난 뒤 ──
export const BYE: Line[] = [
  { f: () => `오늘 정말 즐거웠어요! 다들 조심히 들어가세요` },
  { f: () => `생각보다 시간이 엄청 빨리 갔네요. 다음에 또 봬요` },
  { f: (p, c) => (c.venue ? `${c.venue} 음식도 좋고 대화도 재밌었어요. 감사합니다` : null) },
  { f: () => `오늘 처음 뵌 분들 맞나 싶을 정도로 편했어요` },
  { f: () => `잘 들어가셨나요? 오늘 고마웠어요` },
  { f: () => `즐거웠습니다. 다음 모임에서도 뵈면 좋겠어요` },
  { f: (p, c) => { const h = humanFirst(human(p, c, "bye")); return h ? `${h}님 얘기 재밌었어요. 다음에 또 들려주세요` : null; } },
];

// ── 사람 메시지에 답하기 ──
export type Intent = "greet" | "time" | "late" | "menu" | "place" | "thanks" | "arrive" | "question" | "other";

/** 키워드로 뜻을 짐작한다. 여러 개가 걸리면 앞에서부터 답할 순서 */
export function intents(text: string): Intent[] {
  const s = text.replace(/\s+/g, " ");
  const out: Intent[] = [];
  if (/안녕|반가|반갑|처음 뵙|하이/.test(s)) out.push("greet");
  if (/늦|지각|밀려|막혀/.test(s)) out.push("late");
  else if (/몇 ?시|언제 (오|도착)|도착 (예정|시간)/.test(s)) out.push("time");
  if (/메뉴|뭐 먹|음식|맛있|매운|술|와인|맥주|안주|못 먹|알레르기|배고/.test(s)) out.push("menu");
  if (/어디|입구|위치|출구|역에서|찾기|주차/.test(s)) out.push("place");
  if (/감사|고마|즐거웠|또 봬|조심히/.test(s)) out.push("thanks");
  if (/도착했|왔어요|들어가요|들어갈게/.test(s)) out.push("arrive");
  if (!out.length && /\?|까요$|나요$|세요$/.test(s.trim())) out.push("question");
  return out.length ? out : ["other"];
}

const REPLY: Record<Intent, Line[]> = {
  greet: [
    { f: () => `안녕하세요! 반가워요` },
    { f: (p, c) => { const h = humanFirst(c.humans[0] ?? null); return h ? `안녕하세요 ${h}님~` : null; } },
    { f: (p, c) => { const h = humanFirst(c.humans[0] ?? null); return h ? `반갑습니다 ${h}님!` : null; } },
    { f: (p, c) => `안녕하세요. ${dayWord(c.startMs)}에 봬요!` },
    { f: (p, c) => { const h = humanFirst(c.humans[0] ?? null); return h ? `오 반가워요 ${h}님` : null; } },
  ],
  time: [
    { f: (p, c) => (p.arrival === "early" ? `저는 조금 일찍 가서 ${arriveWord(p, c.startMs)}쯤 도착할 것 같아요` : null) },
    { f: (p, c) => (p.arrival === "onTime" ? `저는 ${arriveWord(p, c.startMs)}쯤이요. 시간 맞춰 갈게요` : null) },
    { f: (p, c) => (p.arrival === "late" ? `저는 퇴근이 늦어서 ${arriveWord(p, c.startMs)}쯤 될 것 같아요` : null) },
    { f: (p, c) => `저는 ${clockWord(c.startMs)} 전에는 도착해요` },
    { f: (p, c) => `${arriveWord(p, c.startMs)}쯤 갈 것 같아요` },
  ],
  late: [
    { f: () => `괜찮아요 천천히 오세요!` },
    { f: () => `조심히 오세요. 먼저 메뉴 보고 있을게요` },
    { f: () => `급하게 안 오셔도 돼요` },
    { f: () => `네네 저희 먼저 시켜 놓을게요` },
    { f: () => `괜찮아요~ 오시면 같이 건배해요` },
  ],
  menu: [
    { f: () => `저는 아무거나 다 잘 먹어요` },
    { f: () => `메뉴는 가서 같이 골라요!` },
    { f: (p, c) => (c.category ? `리뷰 보니까 ${c.category} 메뉴가 다 맛있대요` : null) },
    { f: () => `저 매운 거 좋아해요` },
    { f: () => `저는 술은 한두 잔 정도만요` },
  ],
  place: [
    { f: () => `모임 정보에 지도 링크 있어요. 역에서 멀지 않더라고요` },
    { f: () => `도착해서 예약명 말하면 된대요` },
    { f: () => `저도 처음 가 보는데 지도 보니까 찾기 쉬워 보여요` },
    { f: () => `입구 찾기 어려우면 여기 말씀해 주세요!` },
    { f: () => `제가 먼저 가면 자리 알려 드릴게요` },
  ],
  thanks: [
    { f: () => `저도요! 감사해요` },
    { f: (p, c) => { const h = humanFirst(c.humans[0] ?? null); return h ? `오늘 즐거웠어요 ${h}님` : null; } },
    { f: () => `저도 고마웠어요. 다음에 또 봬요` },
    { f: () => `조심히 들어가세요!` },
    { f: () => `감사합니다. 덕분에 재밌었어요` },
  ],
  arrive: [
    { f: () => `오 도착하셨군요! 저도 곧 가요` },
    { f: () => `저희 안쪽에 있어요!` },
    { f: () => `빨리 오셨네요` },
    { f: () => `저도 거의 다 왔어요` },
    { f: () => `들어오시면 손 흔들게요` },
  ],
  question: [
    { f: () => `음 저도 잘은 모르겠어요. 아시는 분 계세요?` },
    { f: () => `좋은 질문이네요. 저는 괜찮아요` },
    { f: () => `저는 다 좋아요!` },
    { f: () => `저도 궁금했어요` },
    { f: () => `그건 가서 같이 정해요!` },
  ],
  other: [
    { f: (p, c) => { const h = humanFirst(c.humans[0] ?? null); return h ? `오 그렇군요! ${h}님은 요즘 뭐에 빠져 계세요?` : null; } },
    { f: () => `맞아요. 저도 그렇게 생각해요` },
    { f: () => `완전 공감해요. 그날 더 얘기해요` },
    { f: () => `오 좋네요. 그럼 그날 그 얘기 해 주세요!` },
    { f: () => `재밌네요. 다른 분들은 어떠세요?` },
    { f: () => `그쵸. 저도 비슷해요` },
  ],
};

/** 사람이 쓴 메시지에 이 봇이 할 답. 뜻이 둘 걸리면(인사+몇 시) 두 문장을 잇는다. 두 번째 봇(rank 1)은 한 문장만 */
export function replyTo(p: Persona, text: string, c: Ctx, key: string, rank: number, used?: Set<string>): string {
  const it = intents(text);
  const parts: string[] = [];
  const take = rank === 0 ? it.slice(0, 2) : [it.find((x) => x !== "greet") ?? it[0]];
  for (const i of take) {
    const s = pick(REPLY[i], p, c, `reply:${key}:${i}`, used);
    if (s) parts.push(s);
  }
  if (!parts.length) parts.push(pick(REPLY.other, p, c, `reply:${key}:other`, used) ?? "네 좋아요");
  // 인사 + 대답은 한 줄로 잇는다 ('안녕하세요! 반가워요 저는 7시쯤이요'가 아니라 문장마다 끊어서)
  // 'ㅎㅎ'는 한 메시지에 한 번만(마지막 문장에만)
  const clean = parts.map((x, i) => (i < parts.length - 1 ? x.replace(/ ㅎㅎ$/, "") : x));
  return clean.map((x, i) => (i < clean.length - 1 && !/[!?.~]$/.test(x) ? `${x}.` : x)).join(" ");
}

// ── 후기 ──
export type Review = { mood: number; talk: number; venue: number; rejoin: number; recommend: number; comment: string; again: boolean };

const COMMENT_GOOD = ["대화가 끊기지 않아서 좋았어요", "처음 만난 사이 같지 않게 편했어요", "식당도 사람도 다 좋았어요", "다음에도 이런 조합이면 또 오고 싶어요", "대화 주제 덕분에 어색할 틈이 없었어요"];
const COMMENT_OK = ["무난하게 즐거웠어요", "음식은 좋았는데 조금 시끄러웠어요", "처음엔 어색했는데 갈수록 괜찮았어요", "자리가 조금 좁았지만 대화는 좋았어요", "시간이 조금 짧게 느껴졌어요"];

/** 성격에 맞는 점수. 후한 사람은 4~5점, 깐깐한 사람은 3~4점 쪽 */
export function reviewFor(p: Persona, key: string): Review {
  const s = (k: string) => Math.max(2, Math.min(5, Math.round(3 + p.warmth * 2 + (rand(p.seed, `${key}:${k}`) - 0.5) * 1.2)));
  const mood = s("mood");
  const good = mood >= 4;
  const pool = good ? COMMENT_GOOD : COMMENT_OK;
  return {
    mood,
    talk: s("talk"),
    venue: s("venue"),
    rejoin: s("rejoin"),
    recommend: s("recommend"),
    comment: p.tone === "brief" && rand(p.seed, `${key}:c`) < 0.4 ? "좋았어요" : pool[Math.floor(rand(p.seed, `${key}:cm`) * pool.length)],
    again: good && rand(p.seed, `${key}:again`) < 0.35 + p.warmth * 0.4,
  };
}
