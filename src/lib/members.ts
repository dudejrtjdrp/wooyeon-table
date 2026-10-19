// 운영자 회원 찾기에서 쓰는 순수 함수. DB를 보지 않는다.

export type MemberQuery =
  | { kind: "empty" }
  | { kind: "phone4"; digits: string }
  | { kind: "phone"; digits: string }
  | { kind: "text"; text: string };

/**
 * 검색어를 읽는다. 숫자 4자리면 연락처 뒤 4자리, 숫자 10~11자리(하이픈 허용)면 연락처 전체,
 * 그 밖은 이름·로그인 ID로 찾는다. 두 글자보다 짧은 글자는 너무 많이 걸려서 받지 않는다.
 */
export function parseMemberQuery(raw: string | null | undefined): MemberQuery {
  const q = (raw ?? "").trim();
  if (!q) return { kind: "empty" };
  const digits = q.replace(/[\s-]/g, "");
  if (/^\d{4}$/.test(digits)) return { kind: "phone4", digits };
  if (/^\d{10,11}$/.test(digits)) return { kind: "phone", digits };
  if (q.length < 2) return { kind: "empty" };
  return { kind: "text", text: q.slice(0, 40) };
}

/** ilike에 넣을 때 %·_·\ 가 와일드카드로 읽히지 않게 막는다 */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** 연락처는 가운데를 가린다: 01012345678 → 010-****-5678 */
export function maskPhone(ph: string | null | undefined): string {
  if (!ph) return "-";
  const d = ph.replace(/\D/g, "");
  const m = d.match(/^(\d{3})(\d{3,4})(\d{4})$/);
  return m ? `${m[1]}-****-${m[3]}` : "****";
}

/** 어드민 안쪽 경로만 돌아갈 곳으로 받는다 */
export function adminBack(v: unknown, fallback: string): string {
  const s = String(v ?? "");
  return s.startsWith("/admin/") && !s.startsWith("//") && !s.includes("\\") ? s : fallback;
}
