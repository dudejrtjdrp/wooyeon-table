// 어드민 차트 색. globals.css .admin-theme 토큰에서 뽑았다(SVG 속성에는 CSS 변수를 못 써서 값으로 둔다).
// 검사: dataviz validate_palette.js — 깔때기 단계 색(FUNNEL)은 --ordinal 통과(한 색상, 밝기 단조, 연한 끝 2.3:1).
// accent·danger는 한 차트에 같이 나오지 않는다(지표 방향에 따라 둘 중 하나). 낮을수록 좋은 지표는 danger + '낮을수록 좋음' 글로 함께 알린다
export const CHART = {
  surface: "#ffffff",
  /** 높을수록 좋은 지표 (--accent) */
  accent: "#1e5e45",
  /** 그 막대의 빈 칸 (--accent-soft) */
  accentTrack: "#e7f1eb",
  /** 낮을수록 좋은 지표 (--danger) */
  danger: "#c2412d",
  dangerTrack: "#f7e4e0",
  /** 강조 안 한 막대: 같은 색의 연한 단계(면 대비 2:1 넘김, 값은 표에도 있다) */
  accentDim: "#82b59a",
  dangerDim: "#e0a194",
  /** 눈금선 (--line2), 축 (--line), 글 (--muted) */
  grid: "#eef1ef",
  axis: "#e3e8e5",
  text: "#5a6a61",
  /** 막대 위에 올렸을 때 칸 배경 */
  wash: "rgba(30,94,69,0.06)",
} as const;

/** 깔때기 단계 색: 신청(가장 진함) → 후기(가장 연함). --accent 한 색상의 밝기 단계 */
export const FUNNEL = ["#123d2c", "#1e5e45", "#3a8061", "#5c9c7d", "#82b59a"] as const;
