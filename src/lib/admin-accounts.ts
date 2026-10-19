// 운영자 계정 관리 규칙. DB를 읽지 않는 순수 함수만 둔다 (admin-accounts.test.ts)
//
// 끄기는 users.account_status를 그대로 쓴다: 운영자 계정에서 'banned'는 '꺼짐'이다.
// 로그인(login/actions.ts)과 OAuth 콜백이 이미 banned를 막고, requireAdmin이 남아 있던 세션도 끊는다. 그래서 스키마를 바꾸지 않는다.
import type { AdminLevel } from "./auth";

export const ADMIN_OFF = "banned";
export const isAdminOff = (accountStatus: string | null | undefined) => accountStatus === ADMIN_OFF;

// 헷갈리는 글자(0 O o 1 l I)는 뺀다. 56글자라 224(=56×4) 미만 바이트만 써서 고르게 뽑는다
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** 임시 비밀번호 12자. 영문과 숫자가 꼭 하나씩 들어간다. rand는 테스트용 */
export function tempPassword(len = 12, rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  for (;;) {
    let out = "";
    while (out.length < len) {
      for (const b of rand(len * 2)) {
        if (b < 224 && out.length < len) out += ALPHABET[b % ALPHABET.length];
      }
    }
    if (/[A-Za-z]/.test(out) && /\d/.test(out)) return out;
  }
}

/** 운영자 로그인 ID: 영문 소문자·숫자·. _ - 로 3~30자, 영문이나 숫자로 시작. 휴대폰 번호 모양은 참가자 아이디와 겹쳐서 받지 않는다 */
export function adminLoginIdError(id: string): string | null {
  if (!id) return "로그인 ID를 적어 주세요";
  if (/^\d+$/.test(id)) return "숫자만으로는 만들 수 없어요. 영문을 섞어 주세요";
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(id)) return "로그인 ID는 영문 소문자·숫자·. _ - 로 3~30자예요";
  if (id.startsWith("deleted:")) return "쓸 수 없는 ID예요";
  return null;
}

export function adminNameError(name: string): string | null {
  if (name.length < 2) return "이름을 두 글자 이상 적어 주세요";
  if (name.length > 20) return "이름은 20자까지 적을 수 있어요";
  return null;
}

export interface AdminRow { id: string; name: string; account_status: string; is_demo?: boolean }

/** 켜져 있는 전체 권한 운영자 수 */
export const activeFullCount = (admins: AdminRow[], levels: Record<string, AdminLevel>) =>
  admins.filter((a) => !isAdminOff(a.account_status) && levels[a.id] !== "viewer").length;

/** 끄기 전에 막을 이유. 없으면 null */
export function disableError(meId: string, target: AdminRow | undefined, admins: AdminRow[], levels: Record<string, AdminLevel>): string | null {
  if (!target) return "운영자 계정이 아니에요";
  if (target.id === meId) return "내 계정은 내가 끌 수 없어요";
  if (target.is_demo) return "심사용 시연 계정이라 끌 수 없어요";
  if (isAdminOff(target.account_status)) return "이미 꺼진 계정이에요";
  const rest = admins.map((a) => (a.id === target.id ? { ...a, account_status: ADMIN_OFF } : a));
  if (activeFullCount(rest, levels) < 1) return "켜져 있는 전체 권한 운영자가 한 명은 있어야 해요";
  return null;
}

/** 등급 바꾸기 전에 막을 이유. 자기 자신은 못 바꾸고, 켜진 전체 권한 운영자가 한 명은 남아야 한다 */
export function levelError(meId: string, target: AdminRow | undefined, admins: AdminRow[], levels: Record<string, AdminLevel>, to: AdminLevel): string | null {
  if (!target) return "운영자 계정이 아니에요";
  if (target.id === meId) return "내 등급은 내가 바꿀 수 없어요. 다른 전체 권한 운영자에게 부탁해 주세요";
  if (activeFullCount(admins, { ...levels, [target.id]: to }) < 1) return "켜져 있는 전체 권한 운영자가 한 명은 있어야 해요";
  return null;
}

/** 비밀번호 초기화 전에 막을 이유. 내 비밀번호는 여기서 바꾸지 않는다(임시 비밀번호가 화면에 남지 않게) */
export function resetError(meId: string, target: AdminRow | undefined): string | null {
  if (!target) return "운영자 계정이 아니에요";
  if (target.id === meId) return "내 비밀번호는 여기서 초기화할 수 없어요. 다른 전체 권한 운영자에게 부탁해 주세요";
  if (target.is_demo) return "심사용 시연 계정은 비밀번호를 바꿀 수 없어요";
  return null;
}
