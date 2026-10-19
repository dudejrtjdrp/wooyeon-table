// 식당 사진이 실제 매장 사진인지, AI로 만든 분위기 사진인지. 시연용으로 넣은 AI 사진은 public/venues/ai-*.jpg에 있다
// 실제 매장 사진처럼 보이지 않게 화면에 한 줄 표시를 붙이는 데 쓴다 (scripts/apply-real-venues.mjs 참고)
export const isAiPhoto = (url: string | null | undefined) => !!url && /^\/venues\/ai-[\w-]+\.(jpe?g|png|webp)(\?|$)/.test(url);
export const AI_PHOTO_NOTE = "AI로 만든 분위기 사진이에요";
