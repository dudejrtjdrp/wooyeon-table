// 토스페이먼츠 (API 개별 연동, 결제창 v2).
// 환경변수에 키가 있으면 그 키를 쓰고, 없으면 토스페이먼츠 개발자 문서에 공개된 테스트 키로 동작한다.
// 테스트 키라 실제 돈은 나가지 않지만 결제창·승인·취소는 토스 서버를 그대로 거친다.

// 토스페이먼츠 공식 문서 예제용 테스트 키 (누구나 쓸 수 있게 공개된 값)
const DOC_CLIENT_KEY = "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";
const DOC_SECRET_KEY = "test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R";

export function tossClientKey() {
  return process.env.TOSS_CLIENT_KEY || DOC_CLIENT_KEY;
}
function secretKey() {
  return process.env.TOSS_SECRET_KEY || DOC_SECRET_KEY;
}
/** 실서비스 키인지 (live_ 로 시작) */
export function tossLive() {
  return tossClientKey().startsWith("live_");
}

const auth = () => `Basic ${Buffer.from(`${secretKey()}:`).toString("base64")}`;

export type TossPayment = {
  paymentKey: string;
  orderId: string;
  status: string;
  method: string | null;
  totalAmount: number;
  approvedAt: string | null;
  receipt?: { url?: string } | null;
  easyPay?: { provider?: string } | null;
  card?: { number?: string } | null;
};

type TossError = { code: string; message: string };

async function call<T>(path: string, body: unknown, idemKey?: string): Promise<{ ok: true; data: T } | { ok: false; error: TossError }> {
  try {
    const res = await fetch(`https://api.tosspayments.com${path}`, {
      method: "POST",
      headers: {
        Authorization: auth(),
        "Content-Type": "application/json",
        ...(idemKey ? { "Idempotency-Key": idemKey } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: { code: json.code ?? `HTTP_${res.status}`, message: json.message ?? "결제사 응답을 읽지 못했어요" } };
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, error: { code: "NETWORK", message: (e as Error).message } };
  }
}

/** 결제 승인. 결제창에서 돌아온 paymentKey·orderId·amount를 서버에서 한 번 더 확인한 뒤 부른다 */
export function confirmToss(paymentKey: string, orderId: string, amount: number) {
  return call<TossPayment>("/v1/payments/confirm", { paymentKey, orderId, amount }, `confirm-${orderId}`);
}

/** 결제 취소(환불). 같은 건을 두 번 불러도 한 번만 취소되도록 멱등 키를 건다 */
export function cancelToss(paymentKey: string, reason: string, idemKey: string) {
  return call<TossPayment>(`/v1/payments/${paymentKey}/cancel`, { cancelReason: reason.slice(0, 200) }, idemKey);
}

/** 결제 수단 이름 (화면 표시용) */
export function methodLabel(p: Pick<TossPayment, "method" | "easyPay" | "card">) {
  if (p.easyPay?.provider) return p.easyPay.provider;
  if (p.card?.number) return `카드 ${p.card.number}`;
  return p.method ?? "카드";
}
