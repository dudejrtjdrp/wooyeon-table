import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 서버에서만 쓴다. 브라우저는 DB에 직접 접근하지 않는다.
// Vercel의 Supabase 연동이 넣어주는 환경 변수 이름을 그대로 읽는다.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase 환경 변수(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 없습니다.");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function hasDbEnv(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
