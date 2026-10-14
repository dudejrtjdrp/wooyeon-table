// 소셜 로그인 제공자 설정. 세 곳 모두 Authorization Code 방식으로 서버에서 처리한다.
// 키는 Vercel 환경 변수로만 받는다. 키가 없으면 해당 버튼은 "준비 중"으로 보인다.

export type Provider = "kakao" | "naver" | "google";
export const PROVIDERS: Provider[] = ["kakao", "naver", "google"];

export interface OAuthProfile {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  phone: string | null;
  birthYear: number | null;
  gender: "M" | "F" | null;
}

interface Config {
  label: string;
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope?: string;
  extraAuthParams?: Record<string, string>;
  fetchProfile: (accessToken: string) => Promise<OAuthProfile>;
}

const json = async (r: Response) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

const normalizePhone = (p?: string | null) => {
  if (!p) return null;
  // 카카오 "+82 10-1234-5678", 네이버 "010-1234-5678"
  const d = p.replace(/[^\d+]/g, "").replace(/^\+82/, "0");
  return /^01\d{8,9}$/.test(d) ? d : null;
};

export const CONFIG: Record<Provider, Config> = {
  kakao: {
    label: "카카오",
    clientId: process.env.KAKAO_CLIENT_ID,
    clientSecret: process.env.KAKAO_CLIENT_SECRET,
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    async fetchProfile(token) {
      const d = await json(await fetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: `Bearer ${token}` } }));
      const acc = d.kakao_account ?? {};
      return {
        id: String(d.id),
        name: acc.name ?? acc.profile?.nickname ?? null,
        email: acc.email ?? null,
        avatar: acc.profile?.profile_image_url ?? null,
        phone: normalizePhone(acc.phone_number),
        birthYear: acc.birthyear ? Number(acc.birthyear) : null,
        gender: acc.gender === "male" ? "M" : acc.gender === "female" ? "F" : null,
      };
    },
  },
  naver: {
    label: "네이버",
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
    authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    async fetchProfile(token) {
      const d = await json(await fetch("https://openapi.naver.com/v1/nid/me", { headers: { Authorization: `Bearer ${token}` } }));
      const r = d.response ?? {};
      return {
        id: String(r.id),
        name: r.name ?? r.nickname ?? null,
        email: r.email ?? null,
        avatar: r.profile_image ?? null,
        phone: normalizePhone(r.mobile),
        birthYear: r.birthyear ? Number(r.birthyear) : null,
        gender: r.gender === "M" || r.gender === "F" ? r.gender : null,
      };
    },
  },
  google: {
    label: "Google",
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    // 계정이 여러 개면 매번 고르게 한다
    extraAuthParams: { prompt: "select_account" },
    async fetchProfile(token) {
      const d = await json(await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token}` } }));
      return { id: String(d.sub), name: d.name ?? null, email: d.email ?? null, avatar: d.picture ?? null, phone: null, birthYear: null, gender: null };
    },
  },
};

export const isProvider = (p: string): p is Provider => (PROVIDERS as string[]).includes(p);
export const isEnabled = (p: Provider) => Boolean(CONFIG[p].clientId && (p === "kakao" || CONFIG[p].clientSecret));
export const enabledProviders = () => Object.fromEntries(PROVIDERS.map((p) => [p, isEnabled(p)])) as Record<Provider, boolean>;

export function redirectUri(origin: string, p: Provider) {
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? origin;
  return `${base}/api/auth/${p}/callback`;
}

export function authorizeUrl(p: Provider, origin: string, state: string) {
  const c = CONFIG[p];
  const u = new URL(c.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", c.clientId!);
  u.searchParams.set("redirect_uri", redirectUri(origin, p));
  u.searchParams.set("state", state);
  if (c.scope) u.searchParams.set("scope", c.scope);
  for (const [k, v] of Object.entries(c.extraAuthParams ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

export async function exchangeCode(p: Provider, origin: string, code: string, state: string) {
  const c = CONFIG[p];
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: c.clientId!,
    redirect_uri: redirectUri(origin, p),
    code,
  });
  if (c.clientSecret) body.set("client_secret", c.clientSecret);
  if (p === "naver") body.set("state", state);
  const d = await json(
    await fetch(c.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body }),
  );
  if (!d.access_token) throw new Error(`토큰 없음: ${JSON.stringify(d).slice(0, 200)}`);
  return String(d.access_token);
}
